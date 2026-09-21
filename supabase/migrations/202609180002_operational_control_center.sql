-- Persist Regia operational policy and enforce it on live RPCs.
begin;

alter table public.tournaments
  add column referee_can_manage_score boolean not null default true,
  add column referee_can_validate_cards boolean not null default true,
  add column referee_can_report_event_winner boolean not null default true,
  add column cards_enabled boolean not null default true,
  add column dice_enabled boolean not null default true,
  add column special_events_enabled boolean not null default true;

create table public.global_event_winner_reports (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  global_event_id uuid not null references public.global_events(id) on delete cascade,
  match_id uuid not null references public.matches(id) on delete cascade,
  player_id uuid not null references public.players(id),
  team_id uuid not null references public.teams(id),
  reported_by uuid not null references public.profiles(id),
  status text not null default 'pending' check(status in ('pending','accepted','rejected')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id),
  unique(global_event_id,reported_by,player_id)
);
alter table public.global_event_winner_reports enable row level security;
create policy global_event_winner_reports_read on public.global_event_winner_reports for select to authenticated using (
  exists(select 1 from public.profiles p where p.id=auth.uid() and (
    (p.role='admin'::public.app_role and exists(select 1 from public.tournament_admins ta where ta.user_id=p.id and ta.tournament_id=global_event_winner_reports.tournament_id))
    or (p.role='referee'::public.app_role and p.id=global_event_winner_reports.reported_by)
  ))
);

create or replace function public.set_tournament_operational_settings(
  p_tournament_id uuid,p_referee_can_manage_score boolean,p_referee_can_validate_cards boolean,
  p_referee_can_report_event_winner boolean,p_cards_enabled boolean,p_dice_enabled boolean,p_special_events_enabled boolean
) returns public.tournaments language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare v_current public.tournaments; v_result public.tournaments; v_active boolean;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  perform p.id from public.profiles p join public.tournament_admins ta on ta.user_id=p.id
  where p.id=auth.uid() and p.role='admin'::public.app_role and ta.tournament_id=p_tournament_id for share of p,ta;
  if not found then raise exception 'not authorized'; end if;
  select t.* into v_current from public.tournaments t where t.id=p_tournament_id for update;
  if not found then raise exception 'tournament not found'; end if;
  select exists(select 1 from public.matches m where m.tournament_id=p_tournament_id and m.status in ('set_1','set_2','super_tiebreak')) into v_active;
  if v_active and (v_current.cards_enabled is distinct from p_cards_enabled or v_current.dice_enabled is distinct from p_dice_enabled
    or v_current.referee_can_validate_cards is distinct from p_referee_can_validate_cards) then
    raise exception 'mechanic settings are locked during an active set';
  end if;
  update public.tournaments set referee_can_manage_score=p_referee_can_manage_score,
    referee_can_validate_cards=p_referee_can_validate_cards,referee_can_report_event_winner=p_referee_can_report_event_winner,
    cards_enabled=p_cards_enabled,dice_enabled=p_dice_enabled,special_events_enabled=p_special_events_enabled,updated_at=clock_timestamp()
  where id=p_tournament_id returning * into v_result;
  return v_result;
end; $$;

create or replace function public.enforce_cards_enabled_on_assignment()
returns trigger language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
begin
  if not exists(select 1 from public.matches m join public.tournaments t on t.id=m.tournament_id where m.id=new.match_id and t.cards_enabled) then
    raise exception 'cards are disabled';
  end if;
  return new;
end; $$;
create trigger match_cards_require_enabled before insert on public.match_cards for each row execute function public.enforce_cards_enabled_on_assignment();

create or replace function public.live_score_authorized(p_match public.matches)
returns boolean language sql volatile security definer set search_path=pg_catalog,pg_temp as $$
  select exists(select 1 from public.profiles p join public.tournaments t on t.id=p_match.tournament_id where p.id=auth.uid() and (
    (p.role='referee'::public.app_role and t.referee_can_manage_score and p.tournament_id=p_match.tournament_id and exists(select 1 from public.referee_court_assignments rca where rca.referee_user_id=p.id and rca.tournament_id=p_match.tournament_id and rca.court_id=p_match.court_id))
    or (p.role='admin'::public.app_role and exists(select 1 from public.tournament_admins ta where ta.user_id=p.id and ta.tournament_id=p_match.tournament_id))
  ))
$$;

create or replace function public.increment_match_set_game(p_match_id uuid,p_team_id uuid)
returns public.matches language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare v_match public.matches;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select m.* into v_match from public.matches m where m.id=p_match_id for update;
  if not found then raise exception 'match not found'; end if;
  if not public.live_score_authorized(v_match) then raise exception 'score management is disabled or not authorized'; end if;
  if v_match.status not in ('set_1','set_2') then raise exception 'set is not active'; end if;
  if p_team_id not in(v_match.team_a_id,v_match.team_b_id) then raise exception 'team is not in match'; end if;
  update public.matches set games_a=games_a+case when p_team_id=team_a_id then 1 else 0 end,
    games_b=games_b+case when p_team_id=team_b_id then 1 else 0 end,score_updated_at=clock_timestamp(),score_updated_by=auth.uid(),score_update_source='game',updated_at=clock_timestamp()
  where id=p_match_id returning * into v_match;
  insert into public.match_events(tournament_id,round_id,match_id,type,payload,actor_user_id) values(v_match.tournament_id,v_match.round_id,v_match.id,'GAME_WON',jsonb_build_object('team_id',p_team_id,'set_number',v_match.current_set,'games_a',v_match.games_a,'games_b',v_match.games_b),auth.uid());
  return v_match;
end; $$;

create or replace function public.set_match_set_score(p_match_id uuid,p_games_a integer,p_games_b integer)
returns public.matches language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare v_match public.matches; v_old_a integer; v_old_b integer;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_games_a is null or p_games_b is null or p_games_a<0 or p_games_b<0 or p_games_a>99 or p_games_b>99 then raise exception 'invalid game score'; end if;
  select m.* into v_match from public.matches m where m.id=p_match_id for update;
  if not found then raise exception 'match not found'; end if;
  if not public.live_score_authorized(v_match) then raise exception 'score management is disabled or not authorized'; end if;
  if v_match.status not in ('set_1','set_2') then raise exception 'set is not active'; end if;
  v_old_a:=v_match.games_a;v_old_b:=v_match.games_b;
  update public.matches set games_a=p_games_a,games_b=p_games_b,score_updated_at=clock_timestamp(),score_updated_by=auth.uid(),score_update_source='manual',updated_at=clock_timestamp() where id=p_match_id returning * into v_match;
  insert into public.match_events(tournament_id,round_id,match_id,type,payload,actor_user_id) values(v_match.tournament_id,v_match.round_id,v_match.id,'SCORE_CORRECTED',jsonb_build_object('set_number',v_match.current_set,'from_a',v_old_a,'from_b',v_old_b,'games_a',p_games_a,'games_b',p_games_b,'source','manual'),auth.uid());
  return v_match;
end; $$;

create or replace function public.roll_global_dice_for_round(p_round_id uuid)
returns public.rounds language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare v_round public.rounds; v_rule public.dice_rules;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select r.* into v_round from public.rounds r join public.tournaments t on t.id=r.tournament_id
  where r.id=p_round_id and t.dice_enabled for update of r,t;
  if not found then raise exception 'global dice is disabled or round not found'; end if;
  perform p.id from public.profiles p join public.tournament_admins ta on ta.user_id=p.id
  where p.id=auth.uid() and p.role='admin'::public.app_role and ta.tournament_id=v_round.tournament_id for share of p,ta;
  if not found then raise exception 'not authorized'; end if;
  perform m.id from public.matches m where m.round_id=p_round_id order by m.id for update;
  if not found then raise exception 'round has no matches'; end if;
  if v_round.dice_result is not null then raise exception 'global dice already rolled'; end if;
  if exists(select 1 from public.matches m where m.round_id=p_round_id and
    (m.status<>'set_break'::public.match_status or m.set_1_ended_at is null or not public.has_valid_completed_set_result(m.id,1))) then
    raise exception 'set 1 results are incomplete';
  end if;
  select dr.* into v_rule from public.dice_rules dr where dr.tournament_id=v_round.tournament_id and dr.enabled
    and dr.product_code in ('one_vs_one','three_vs_three','deflated_balls','tennis_balls','single_serve','no_glass') order by random() limit 1;
  if not found then raise exception 'authoritative dice faces are not configured'; end if;
  update public.rounds set dice_result=v_rule.dice_value,dice_rule_id=v_rule.id,dice_rolled_at=clock_timestamp(),dice_started_at=null,dice_ends_at=null
  where id=p_round_id returning * into v_round;
  return v_round;
end; $$;

create or replace function public.apply_match_set_action(p_match_id uuid,p_action text,p_now timestamptz)
returns public.matches language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare v_match public.matches;v_round public.rounds;v_dice_enabled boolean;v_set1_a integer;v_set1_b integer;
begin
  select m.* into v_match from public.matches m where m.id=p_match_id for update;
  if not found then raise exception 'match not found'; end if;
  select r.* into v_round from public.rounds r join public.tournaments t on t.id=r.tournament_id where r.id=v_match.round_id for share of r,t;
  select t.dice_enabled into v_dice_enabled from public.tournaments t where t.id=v_match.tournament_id;
  if p_action='start_set_1' then
    if v_match.status not in ('scheduled','ready') or v_match.set_1_started_at is not null then raise exception 'invalid or duplicate set transition'; end if;
    if not public.match_lineup_ready(v_match.id,1) then raise exception 'lineup missing for set 1 on court %',v_match.court_id; end if;
    update public.matches set status='set_1',current_set=1,started_at=coalesce(started_at,p_now),set_1_started_at=p_now,updated_at=p_now where id=v_match.id returning * into v_match;
  elsif p_action='end_set_1' then
    if v_match.status<>'set_1' or v_match.set_1_ended_at is not null then raise exception 'invalid or duplicate set transition'; end if;
    update public.matches set status='set_break',current_set=2,set_1_ended_at=p_now,updated_at=p_now where id=v_match.id returning * into v_match;
  elsif p_action='start_set_2' then
    if v_match.status<>'set_break' or v_match.set_2_started_at is not null then raise exception 'invalid or duplicate set transition'; end if;
    if v_match.set_1_ended_at is null or not public.has_valid_completed_set_result(v_match.id,1) then raise exception 'missing final result for set 1'; end if;
    if v_dice_enabled and (v_round.dice_result is null or v_round.dice_rule_id is null) then raise exception 'global dice must be rolled before set 2'; end if;
    if not public.match_lineup_ready(v_match.id,2) then raise exception 'lineup missing for set 2 on court %',v_match.court_id; end if;
    update public.matches set status='set_2',current_set=2,set_2_started_at=p_now,updated_at=p_now where id=v_match.id returning * into v_match;
  elsif p_action='end_set_2' then
    if v_match.status<>'set_2' or v_match.set_2_ended_at is not null then raise exception 'invalid or duplicate set transition'; end if;
    select (me.payload->>'games_a')::integer,(me.payload->>'games_b')::integer into v_set1_a,v_set1_b from public.match_events me
    where me.match_id=v_match.id and me.type='SET_ENDED'::public.match_event_type and (me.payload->>'set_number')::integer=1 order by me.created_at desc limit 1;
    if v_set1_a is null then raise exception 'missing final result for set 1'; end if;
    update public.matches set status=case when (v_set1_a>v_set1_b and games_b>games_a) or (v_set1_b>v_set1_a and games_a>games_b) then 'super_tiebreak'::public.match_status else 'completed'::public.match_status end,
      current_set=case when (v_set1_a>v_set1_b and games_b>games_a) or (v_set1_b>v_set1_a and games_a>games_b) then 3 else 2 end,set_2_ended_at=p_now,
      completed_at=case when (v_set1_a>v_set1_b and games_b>games_a) or (v_set1_b>v_set1_a and games_a>games_b) then completed_at else p_now end,updated_at=p_now where id=v_match.id returning * into v_match;
    if not public.has_valid_completed_set_result(v_match.id,2) then raise exception 'missing final result for set 2'; end if;
  else raise exception 'invalid set action'; end if;
  return v_match;
end; $$;

create or replace function public.control_round_set(p_round_id uuid,p_action text)
returns setof public.matches language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare v_round public.rounds;v_mode public.set_control_mode;v_dice_enabled boolean;v_match public.matches;v_now timestamptz:=clock_timestamp();
begin
  select r.* into v_round from public.rounds r join public.tournaments t on t.id=r.tournament_id where r.id=p_round_id for update of r,t;
  if not found then raise exception 'round not found'; end if;
  select t.set_control_mode,t.dice_enabled into v_mode,v_dice_enabled from public.tournaments t where t.id=v_round.tournament_id;
  if not public.live_admin_authorized(v_round.tournament_id) then raise exception 'not authorized'; end if;
  if v_mode<>'centralized'::public.set_control_mode then raise exception 'centralized control mode is not active'; end if;
  perform m.id from public.matches m where m.round_id=p_round_id order by m.id for update;
  if not found then raise exception 'round has no matches'; end if;
  if p_action='start_set_2' and exists(select 1 from public.matches m where m.round_id=p_round_id and (m.set_1_ended_at is null or not public.has_valid_completed_set_result(m.id,1))) then raise exception 'set 1 results are incomplete'; end if;
  if p_action='start_set_2' and v_dice_enabled and v_round.dice_result is null then raise exception 'global dice must be rolled before set 2'; end if;
  if p_action in ('start_set_1','start_set_2') and exists(select 1 from public.matches m where m.round_id=p_round_id and not public.match_lineup_ready(m.id,case when p_action='start_set_1' then 1 else 2 end)) then raise exception 'one or more match lineups are missing'; end if;
  for v_match in select * from public.matches where round_id=p_round_id order by id loop perform public.apply_match_set_action(v_match.id,p_action,v_now); end loop;
  if p_action='start_set_2' and v_dice_enabled then update public.rounds set dice_started_at=v_now,dice_ends_at=v_now+make_interval(secs=>300) where id=p_round_id; end if;
  update public.rounds set opened_at=coalesce(opened_at,v_now),status=case p_action when 'start_set_1' then 'set_1'::public.round_status when 'end_set_1' then 'set_break'::public.round_status when 'start_set_2' then 'set_2'::public.round_status else status end where id=p_round_id;
  return query select * from public.matches where round_id=p_round_id order by court_id,id;
end; $$;

create or replace function public.request_match_card_use(p_match_card_id uuid)
returns public.match_cards language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare v_card public.match_cards;v_match public.matches;v_definition public.card_definitions;v_validate boolean;v_now timestamptz:=clock_timestamp();
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select mc.* into v_card from public.match_cards mc where mc.id=p_match_card_id for update;
  if not found then raise exception 'card not found'; end if;
  if v_card.status<>'available'::public.card_status then raise exception 'card not available'; end if;
  select m.* into v_match from public.matches m where m.id=v_card.match_id for share;
  select cd.* into v_definition from public.card_definitions cd where cd.id=v_card.card_definition_id;
  select t.referee_can_validate_cards into v_validate from public.tournaments t where t.id=v_match.tournament_id and t.cards_enabled for share;
  if not found then raise exception 'cards are disabled'; end if;
  if v_match.status not in ('set_1','set_2','super_tiebreak') then raise exception 'match is not live'; end if;
  perform p.id from public.profiles p where p.id=auth.uid() and p.tournament_id=v_match.tournament_id and p.role='team'::public.app_role and p.team_id=v_card.team_id for share;
  if not found or v_card.team_id not in(v_match.team_a_id,v_match.team_b_id) then raise exception 'not authorized'; end if;
  if v_match.status='set_2'::public.match_status and v_match.set_2_started_at is not null and statement_timestamp()<v_match.set_2_started_at+make_interval(secs=>300)
     and exists(select 1 from public.tournaments t where t.id=v_match.tournament_id and t.dice_enabled) then raise exception 'cards blocked during global dice effect'; end if;
  if exists(select 1 from public.match_cards mc join public.card_definitions cd on cd.id=mc.card_definition_id where mc.match_id=v_match.id and mc.team_id=v_card.team_id and mc.status in ('pending','active') and mc.id<>v_card.id and cd.duration_type<>'instant') then raise exception 'team already has active persistent card'; end if;
  if not v_validate and (lower(v_definition.name)='il prescelto' or v_definition.slug='il-prescelto') then raise exception 'card requires referee validation'; end if;
  update public.match_cards set status=case when v_validate then 'pending'::public.card_status when v_definition.duration_type='instant'::public.card_duration_type then 'used'::public.card_status else 'active'::public.card_status end,
    used_in_set=v_match.current_set,activated_at=case when v_validate then activated_at else v_now end,
    expires_at=case when not v_validate and v_definition.duration_type='timed'::public.card_duration_type then v_now+make_interval(secs=>v_definition.duration_value) else null end,
    remaining_games=case when not v_validate and v_definition.duration_type='games'::public.card_duration_type then v_definition.duration_value else null end
  where id=v_card.id returning * into v_card;
  insert into public.card_usages(match_card_id,match_id,team_id,requested_by,confirmed_at,resolved_at,payload)
  values(v_card.id,v_card.match_id,v_card.team_id,auth.uid(),case when v_validate then null else v_now end,
    case when not v_validate and v_definition.duration_type='instant'::public.card_duration_type then v_now else null end,
    jsonb_build_object('requested_at',v_now,'auto_accepted',not v_validate));
  insert into public.match_events(tournament_id,round_id,match_id,type,payload,actor_user_id)
  values(v_match.tournament_id,v_match.round_id,v_match.id,'CARD_PLAYED',jsonb_build_object('match_card_id',v_card.id,'card_definition_id',v_card.card_definition_id,'team_id',v_card.team_id),auth.uid());
  if not v_validate then insert into public.match_events(tournament_id,round_id,match_id,type,payload,actor_user_id)
    values(v_match.tournament_id,v_match.round_id,v_match.id,'CARD_ACTIVATED',jsonb_build_object('match_card_id',v_card.id,'team_id',v_card.team_id,'activated_at',v_now,'expires_at',v_card.expires_at,'auto_accepted',true),auth.uid()); end if;
  return v_card;
end; $$;

create or replace function public.activate_por_tres_for_tournament(p_tournament_id uuid,p_prize text)
returns public.global_events language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare v_event public.global_events;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  perform p.id from public.profiles p join public.tournament_admins ta on ta.user_id=p.id join public.tournaments t on t.id=ta.tournament_id
  where p.id=auth.uid() and p.role='admin'::public.app_role and ta.tournament_id=p_tournament_id and t.special_events_enabled for share of p,ta,t;
  if not found then raise exception 'special events are disabled or not authorized'; end if;
  if exists(select 1 from public.global_events ge where ge.tournament_id=p_tournament_id and ge.status='active') then raise exception 'a global event is already active'; end if;
  insert into public.global_events(tournament_id,type,title,description,status,prize,started_at)
  values(p_tournament_id,'por_tres','Por Tres','Il primo giocatore che realizza un punto vincente da fuori campo viene segnalato alla Regia.','active',nullif(btrim(p_prize),''),clock_timestamp()) returning * into v_event;
  return v_event;
end; $$;

create or replace function public.report_global_event_winner(p_match_id uuid,p_player_id uuid)
returns public.global_event_winner_reports language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare v_match public.matches;v_event public.global_events;v_team uuid;v_report public.global_event_winner_reports;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select m.* into v_match from public.matches m where m.id=p_match_id for share;
  if not found then raise exception 'match not found'; end if;
  perform p.id from public.profiles p join public.tournaments t on t.id=v_match.tournament_id where p.id=auth.uid() and p.role='referee' and p.tournament_id=v_match.tournament_id and t.special_events_enabled and t.referee_can_report_event_winner
    and exists(select 1 from public.referee_court_assignments rca where rca.referee_user_id=p.id and rca.tournament_id=v_match.tournament_id and rca.court_id=v_match.court_id) for share of p,t;
  if not found then raise exception 'event reporting is disabled or not authorized'; end if;
  select pl.team_id into v_team from public.players pl where pl.id=p_player_id and pl.tournament_id=v_match.tournament_id and pl.team_id in(v_match.team_a_id,v_match.team_b_id);
  if not found or not exists(select 1 from public.match_lineups ml where ml.match_id=p_match_id and ml.team_id=v_team and ml.set_number=v_match.current_set and p_player_id in(ml.active_player_1_id,ml.active_player_2_id)) then raise exception 'player is not in the active lineup'; end if;
  select ge.* into v_event from public.global_events ge where ge.tournament_id=v_match.tournament_id and ge.status='active' order by ge.started_at desc limit 1 for share;
  if not found then raise exception 'no active global event'; end if;
  insert into public.global_event_winner_reports(tournament_id,global_event_id,match_id,player_id,team_id,reported_by)
  values(v_match.tournament_id,v_event.id,p_match_id,p_player_id,v_team,auth.uid()) returning * into v_report;
  return v_report;
end; $$;

create or replace function public.resolve_global_event_winner_report(p_report_id uuid)
returns public.global_events language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare v_report public.global_event_winner_reports;v_event public.global_events;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select r.* into v_report from public.global_event_winner_reports r where r.id=p_report_id for update;
  if not found then raise exception 'report not found'; end if;
  perform p.id from public.profiles p join public.tournament_admins ta on ta.user_id=p.id where p.id=auth.uid() and p.role='admin' and ta.tournament_id=v_report.tournament_id for share of p,ta;
  if not found then raise exception 'not authorized'; end if;
  select ge.* into v_event from public.global_events ge where ge.id=v_report.global_event_id for update;
  if v_event.status<>'active' or v_event.winner_player_id is not null then raise exception 'global event already has a winner'; end if;
  insert into public.global_event_winners(global_event_id,player_id,team_id,match_id,awarded_by) values(v_event.id,v_report.player_id,v_report.team_id,v_report.match_id,auth.uid());
  update public.global_events set status='completed',completed_at=clock_timestamp(),winner_player_id=v_report.player_id,winner_team_id=v_report.team_id where id=v_event.id returning * into v_event;
  update public.global_event_winner_reports set status=case when id=v_report.id then 'accepted' else 'rejected' end,resolved_at=clock_timestamp(),resolved_by=auth.uid() where global_event_id=v_event.id and status='pending';
  return v_event;
end; $$;

revoke execute on function public.live_score_authorized(public.matches) from public;
revoke execute on function public.enforce_cards_enabled_on_assignment() from public;
revoke execute on function public.set_tournament_operational_settings(uuid,boolean,boolean,boolean,boolean,boolean,boolean) from public,anon;
revoke execute on function public.report_global_event_winner(uuid,uuid) from public,anon;
revoke execute on function public.resolve_global_event_winner_report(uuid) from public,anon;
revoke execute on function public.claim_global_event_winner(uuid,uuid) from authenticated;
revoke execute on function public.activate_por_tres(text) from authenticated;
revoke execute on function public.activate_por_tres_for_tournament(uuid,text) from public,anon;
grant execute on function public.set_tournament_operational_settings(uuid,boolean,boolean,boolean,boolean,boolean,boolean) to authenticated;
grant execute on function public.report_global_event_winner(uuid,uuid) to authenticated;
grant execute on function public.resolve_global_event_winner_report(uuid) to authenticated;
grant execute on function public.activate_por_tres_for_tournament(uuid,text) to authenticated;

do $$ begin if exists(select 1 from pg_catalog.pg_publication where pubname='supabase_realtime') then
  if not exists(select 1 from pg_catalog.pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='tournaments') then alter publication supabase_realtime add table public.tournaments; end if;
  if not exists(select 1 from pg_catalog.pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='global_events') then alter publication supabase_realtime add table public.global_events; end if;
  if not exists(select 1 from pg_catalog.pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='global_event_winner_reports') then alter publication supabase_realtime add table public.global_event_winner_reports; end if;
end if;end $$;
commit;
