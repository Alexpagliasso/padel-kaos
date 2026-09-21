-- Enforce exact round card hands and expose played-card notifications without exposing private hands.
begin;

alter table public.tournaments
  add column display_card_notifications_enabled boolean not null default true;

alter table public.rounds
  add column cards_per_team integer not null default 3 check (cards_per_team between 1 and 10),
  add column card_total_teams integer not null default 0,
  add column card_ready_teams integer not null default 0,
  add column card_readiness_ready boolean not null default false,
  add column card_readiness_blockers jsonb not null default '[]'::jsonb;

create or replace function public.round_card_readiness(p_round_id uuid)
returns jsonb language sql stable security definer set search_path=pg_catalog,pg_temp as $$
with context as (
  select r.id,r.cards_per_team,t.cards_enabled
  from public.rounds r join public.tournaments t on t.id=r.tournament_id
  where r.id=p_round_id
), expected as (
  select m.id match_id,m.court_id,m.team_a_id team_id from public.matches m where m.round_id=p_round_id
  union all
  select m.id,m.court_id,m.team_b_id from public.matches m where m.round_id=p_round_id
), evaluated as (
  select e.*,c.cards_per_team,
    (select count(*)::integer from public.match_cards mc where mc.match_id=e.match_id and mc.team_id=e.team_id) assigned_cards
  from expected e cross join context c
), totals as (
  select count(*)::integer total_teams,
    count(*) filter(where assigned_cards=cards_per_team)::integer ready_teams,
    coalesce(jsonb_agg(jsonb_build_object('match_id',match_id,'court_id',court_id,'team_id',team_id,
      'expected_cards',cards_per_team,'assigned_cards',assigned_cards) order by court_id,match_id,team_id)
      filter(where assigned_cards<>cards_per_team),'[]'::jsonb) blockers
  from evaluated
)
select jsonb_build_object(
  'round_id',p_round_id,
  'required',coalesce(c.cards_enabled,false),
  'cards_per_team',coalesce(c.cards_per_team,3),
  'total_teams',coalesce(t.total_teams,0),
  'ready_teams',coalesce(t.ready_teams,0),
  'ready',case when not coalesce(c.cards_enabled,false) then true else coalesce(t.total_teams,0)>0 and t.total_teams=t.ready_teams end,
  'blockers',coalesce(t.blockers,'[]'::jsonb)
) from context c cross join totals t
$$;

create or replace function public.sync_round_card_readiness(p_round_id uuid)
returns public.rounds language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare v_readiness jsonb;v_round public.rounds;
begin
  select public.round_card_readiness(p_round_id) into v_readiness;
  if v_readiness is null then return null; end if;
  update public.rounds set
    card_total_teams=(v_readiness->>'total_teams')::integer,
    card_ready_teams=(v_readiness->>'ready_teams')::integer,
    card_readiness_ready=(v_readiness->>'ready')::boolean,
    card_readiness_blockers=v_readiness->'blockers'
  where id=p_round_id returning * into v_round;
  return v_round;
end; $$;

create or replace function public.assert_round_cards_ready(p_round_id uuid)
returns void language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare v_readiness jsonb;
begin
  select public.round_card_readiness(p_round_id) into v_readiness;
  if v_readiness is null then raise exception 'round not found'; end if;
  if not (v_readiness->>'ready')::boolean then
    raise exception 'round cards incomplete: %',v_readiness::text using detail=v_readiness::text;
  end if;
end; $$;

create or replace function public.sync_match_card_round_readiness()
returns trigger language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare v_round_id uuid;
begin
  if tg_op='DELETE' then
    select m.round_id into v_round_id from public.matches m where m.id=old.match_id;
  else
    select m.round_id into v_round_id from public.matches m where m.id=new.match_id;
  end if;
  if v_round_id is not null then perform public.sync_round_card_readiness(v_round_id); end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end; $$;

create trigger match_cards_sync_round_readiness
after insert or delete or update of match_id,team_id on public.match_cards
for each row execute function public.sync_match_card_round_readiness();

create or replace function public.sync_match_round_card_readiness()
returns trigger language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
begin
  if tg_op<>'DELETE' then perform public.sync_round_card_readiness(new.round_id); end if;
  if tg_op<>'INSERT' and (tg_op='DELETE' or old.round_id is distinct from new.round_id) then perform public.sync_round_card_readiness(old.round_id); end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end; $$;

create trigger matches_sync_round_card_readiness
after insert or delete or update of round_id,team_a_id,team_b_id on public.matches
for each row execute function public.sync_match_round_card_readiness();

create or replace function public.sync_tournament_round_card_readiness()
returns trigger language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare v_round record;
begin
  if old.cards_enabled is distinct from new.cards_enabled then
    for v_round in select id from public.rounds where tournament_id=new.id loop
      perform public.sync_round_card_readiness(v_round.id);
    end loop;
  end if;
  return new;
end; $$;

create trigger tournaments_sync_round_card_readiness
after update of cards_enabled on public.tournaments
for each row execute function public.sync_tournament_round_card_readiness();

create or replace function public.assign_round_cards(
  p_round_id uuid,p_cards_per_team integer default 3,p_redraw boolean default false
) returns setof public.match_cards language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare v_round public.rounds;v_match public.matches;v_team_id uuid;v_available_count bigint;v_inserted integer;
begin
  select * into v_round from public.rounds where id=p_round_id for update;
  if not found then raise exception 'round not found'; end if;
  if not public.live_admin_authorized(v_round.tournament_id) then raise exception 'not authorized'; end if;
  if p_cards_per_team is null or p_cards_per_team<1 or p_cards_per_team>10 then raise exception 'invalid card count'; end if;
  perform m.id from public.matches m where m.round_id=p_round_id order by m.id for update;
  if not found then raise exception 'round has no matches'; end if;
  if v_round.opened_at is not null or exists(select 1 from public.matches where round_id=p_round_id and (status not in ('scheduled','ready') or started_at is not null)) then raise exception 'cards cannot be assigned after turn start'; end if;
  if exists(select 1 from public.match_cards mc join public.matches m on m.id=mc.match_id where m.round_id=p_round_id) then
    if not p_redraw then raise exception 'cards already assigned'; end if;
    if exists(select 1 from public.match_cards mc join public.matches m on m.id=mc.match_id where m.round_id=p_round_id and mc.status<>'available'::public.card_status) then raise exception 'used cards cannot be redrawn'; end if;
  end if;
  select count(*) into v_available_count from public.card_definitions cd
  left join public.tournament_card_activation tca on tca.tournament_id=v_round.tournament_id and tca.card_definition_id=cd.id
  where (cd.tournament_id is null or cd.tournament_id=v_round.tournament_id) and cd.archived_at is null and coalesce(tca.enabled,cd.enabled);
  if v_available_count<p_cards_per_team then raise exception 'not enough enabled card definitions'; end if;
  update public.rounds set cards_per_team=p_cards_per_team where id=p_round_id;
  if p_redraw then delete from public.match_cards mc using public.matches m where mc.match_id=m.id and m.round_id=p_round_id; end if;
  for v_match in select * from public.matches where round_id=p_round_id order by id loop
    foreach v_team_id in array array[v_match.team_a_id,v_match.team_b_id] loop
      insert into public.match_cards(match_id,team_id,card_definition_id)
      select v_match.id,v_team_id,available.id from (
        select cd.id from public.card_definitions cd
        left join public.tournament_card_activation tca on tca.tournament_id=v_round.tournament_id and tca.card_definition_id=cd.id
        where (cd.tournament_id is null or cd.tournament_id=v_round.tournament_id) and cd.archived_at is null and coalesce(tca.enabled,cd.enabled)
        order by random() limit p_cards_per_team
      ) available;
      get diagnostics v_inserted=row_count;
      if v_inserted<>p_cards_per_team then raise exception 'incomplete card draw'; end if;
    end loop;
  end loop;
  perform public.sync_round_card_readiness(p_round_id);
  return query select mc.* from public.match_cards mc join public.matches m on m.id=mc.match_id where m.round_id=p_round_id order by m.court_id,mc.team_id,mc.created_at;
end; $$;

create or replace function public.open_round_for_referees(p_round_id uuid)
returns public.rounds language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare v_round public.rounds;v_mode public.set_control_mode;
begin
  select r.* into v_round from public.rounds r join public.tournaments t on t.id=r.tournament_id where r.id=p_round_id for update of r,t;
  if not found then raise exception 'round not found'; end if;
  select set_control_mode into v_mode from public.tournaments where id=v_round.tournament_id;
  if not public.live_admin_authorized(v_round.tournament_id) then raise exception 'not authorized'; end if;
  if v_mode<>'referee'::public.set_control_mode then raise exception 'referee control mode is not active'; end if;
  perform public.assert_previous_rounds_complete(p_round_id);
  perform public.assert_round_cards_ready(p_round_id);
  if v_round.opened_at is not null then raise exception 'round already opened'; end if;
  if exists(select 1 from public.matches where round_id=p_round_id and status not in ('scheduled','ready')) then raise exception 'round already started'; end if;
  update public.rounds set opened_at=clock_timestamp() where id=p_round_id returning * into v_round;
  return v_round;
end; $$;

create or replace function public.apply_match_set_action(p_match_id uuid,p_action text,p_now timestamptz)
returns public.matches language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare v_match public.matches;v_round public.rounds;v_dice_enabled boolean;v_duration integer;v_set1_a integer;v_set1_b integer;
begin
  select * into v_match from public.matches where id=p_match_id for update;
  if not found then raise exception 'match not found'; end if;
  select r.* into v_round from public.rounds r join public.tournaments t on t.id=r.tournament_id where r.id=v_match.round_id for share of r,t;
  select t.dice_enabled into v_dice_enabled from public.tournaments t where t.id=v_match.tournament_id;
  v_duration:=public.effective_round_set_duration(v_match.round_id);
  if p_action='start_set_1' then
    perform public.assert_round_cards_ready(v_match.round_id);
    if v_match.status not in ('scheduled','ready') or v_match.set_1_started_at is not null then raise exception 'invalid or duplicate set transition'; end if;
    if not public.match_lineup_ready(v_match.id,1) then raise exception 'lineup missing for set 1 on court %',v_match.court_id; end if;
    update public.matches set status='set_1',current_set=1,started_at=coalesce(started_at,p_now),set_1_started_at=p_now,active_set_duration_minutes=v_duration,set_1_result_submitted_at=null,updated_at=p_now where id=v_match.id returning * into v_match;
  elsif p_action='end_set_1' then
    if v_match.status<>'set_1' or v_match.set_1_ended_at is not null then raise exception 'invalid or duplicate set transition'; end if;
    update public.matches set status='set_break',current_set=2,set_1_ended_at=p_now,active_set_duration_minutes=null,updated_at=p_now where id=v_match.id returning * into v_match;
  elsif p_action='start_set_2' then
    if v_match.status<>'set_break' or v_match.set_2_started_at is not null then raise exception 'invalid or duplicate set transition'; end if;
    if v_match.set_1_result_submitted_at is null or not public.has_valid_completed_set_result(v_match.id,1) then raise exception 'set 1 result is not submitted'; end if;
    if v_dice_enabled and (v_round.dice_result is null or v_round.dice_rule_id is null) then raise exception 'global dice must be rolled before set 2'; end if;
    if not public.match_lineup_ready(v_match.id,2) then raise exception 'lineup missing for set 2 on court %',v_match.court_id; end if;
    update public.matches set status='set_2',current_set=2,set_2_started_at=p_now,active_set_duration_minutes=v_duration,set_2_result_submitted_at=null,updated_at=p_now where id=v_match.id returning * into v_match;
  elsif p_action='end_set_2' then
    if v_match.status<>'set_2' or v_match.set_2_ended_at is not null then raise exception 'invalid or duplicate set transition'; end if;
    select (me.payload->>'games_a')::integer,(me.payload->>'games_b')::integer into v_set1_a,v_set1_b from public.match_events me where me.match_id=v_match.id and me.type='SET_ENDED'::public.match_event_type and (me.payload->>'set_number')::integer=1 order by me.created_at desc,me.id desc limit 1;
    if v_set1_a is null then raise exception 'missing final result for set 1'; end if;
    update public.matches set status=case when (v_set1_a>v_set1_b and games_b>games_a) or (v_set1_b>v_set1_a and games_a>games_b) then 'super_tiebreak'::public.match_status else 'completed'::public.match_status end,current_set=case when (v_set1_a>v_set1_b and games_b>games_a) or (v_set1_b>v_set1_a and games_a>games_b) then 3 else 2 end,set_2_ended_at=p_now,active_set_duration_minutes=null,completed_at=null,updated_at=p_now where id=v_match.id returning * into v_match;
  else raise exception 'invalid set action'; end if;
  perform public.sync_round_completion(v_match.round_id);
  return v_match;
end; $$;

create or replace function public.set_display_card_notifications(p_tournament_id uuid,p_enabled boolean)
returns public.tournaments language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare v_tournament public.tournaments;
begin
  if p_enabled is null then raise exception 'invalid display card notification setting'; end if;
  if not public.live_admin_authorized(p_tournament_id) then raise exception 'not authorized'; end if;
  update public.tournaments set display_card_notifications_enabled=p_enabled,updated_at=clock_timestamp() where id=p_tournament_id returning * into v_tournament;
  if not found then raise exception 'tournament not found'; end if;
  return v_tournament;
end; $$;

create or replace function public.request_match_card_use(p_match_card_id uuid)
returns public.match_cards language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare v_card public.match_cards;v_match public.matches;v_definition public.card_definitions;v_validate boolean;v_requires_validation boolean;v_now timestamptz:=clock_timestamp();v_usage_id uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select mc.* into v_card from public.match_cards mc where mc.id=p_match_card_id for update;
  if not found then raise exception 'card not found'; end if;
  if v_card.status<>'available'::public.card_status then raise exception 'card not available'; end if;
  select m.* into v_match from public.matches m where m.id=v_card.match_id for share;
  select cd.* into v_definition from public.card_definitions cd where cd.id=v_card.card_definition_id;
  select t.referee_can_validate_cards into v_validate from public.tournaments t where t.id=v_match.tournament_id and t.cards_enabled for share;
  if not found then raise exception 'cards are disabled'; end if;
  v_requires_validation:=v_validate or lower(v_definition.name)='il prescelto' or v_definition.slug='il-prescelto';
  if v_match.status not in ('set_1','set_2','super_tiebreak') then raise exception 'match is not live'; end if;
  perform p.id from public.profiles p where p.id=auth.uid() and p.tournament_id=v_match.tournament_id and p.role='team'::public.app_role and p.team_id=v_card.team_id for share;
  if not found or v_card.team_id not in(v_match.team_a_id,v_match.team_b_id) then raise exception 'not authorized'; end if;
  if v_match.status='set_2'::public.match_status and v_match.set_2_started_at is not null and statement_timestamp()<v_match.set_2_started_at+make_interval(secs=>300) and exists(select 1 from public.tournaments t where t.id=v_match.tournament_id and t.dice_enabled) then raise exception 'cards blocked during global dice effect'; end if;
  if exists(select 1 from public.match_cards mc join public.card_definitions cd on cd.id=mc.card_definition_id where mc.match_id=v_match.id and mc.team_id=v_card.team_id and mc.status in ('pending','active') and mc.id<>v_card.id and cd.duration_type<>'instant') then raise exception 'team already has active persistent card'; end if;
  update public.match_cards set status=case when v_requires_validation then 'pending'::public.card_status when v_definition.duration_type='instant'::public.card_duration_type then 'used'::public.card_status else 'active'::public.card_status end,used_in_set=v_match.current_set,activated_at=case when v_requires_validation then activated_at else v_now end,expires_at=case when not v_requires_validation and v_definition.duration_type='timed'::public.card_duration_type then v_now+make_interval(secs=>v_definition.duration_value) else null end,remaining_games=case when not v_requires_validation and v_definition.duration_type='games'::public.card_duration_type then v_definition.duration_value else null end where id=v_card.id returning * into v_card;
  insert into public.card_usages(match_card_id,match_id,team_id,requested_by,confirmed_at,resolved_at,payload)
  values(v_card.id,v_card.match_id,v_card.team_id,auth.uid(),case when v_requires_validation then null else v_now end,case when not v_requires_validation and v_definition.duration_type='instant'::public.card_duration_type then v_now else null end,jsonb_build_object('requested_at',v_now,'auto_accepted',not v_requires_validation,'requires_referee_validation',v_requires_validation)) returning id into v_usage_id;
  insert into public.match_events(tournament_id,round_id,match_id,type,payload,actor_user_id)
  values(v_match.tournament_id,v_match.round_id,v_match.id,'CARD_PLAYED',jsonb_build_object('card_usage_id',v_usage_id,'match_card_id',v_card.id,'card_definition_id',v_card.card_definition_id,'team_id',v_card.team_id,'requested_at',v_now,'requires_referee_validation',v_requires_validation),auth.uid());
  if not v_requires_validation then insert into public.match_events(tournament_id,round_id,match_id,type,payload,actor_user_id) values(v_match.tournament_id,v_match.round_id,v_match.id,'CARD_ACTIVATED',jsonb_build_object('match_card_id',v_card.id,'team_id',v_card.team_id,'activated_at',v_now,'expires_at',v_card.expires_at,'auto_accepted',true),auth.uid()); end if;
  return v_card;
end; $$;

with expected as (
  select m.round_id,m.id match_id,m.team_a_id team_id from public.matches m
  union all select m.round_id,m.id,m.team_b_id from public.matches m
), hand_counts as (
  select e.round_id,e.match_id,e.team_id,count(mc.id)::integer hand_size
  from expected e left join public.match_cards mc on mc.match_id=e.match_id and mc.team_id=e.team_id
  group by e.round_id,e.match_id,e.team_id
), uniform_hands as (
  select round_id,min(hand_size) hand_size from hand_counts group by round_id
  having min(hand_size)=max(hand_size) and min(hand_size) between 1 and 10
)
update public.rounds r set cards_per_team=u.hand_size from uniform_hands u where u.round_id=r.id;

drop policy if exists match_cards_read_private on public.match_cards;
create policy match_cards_read_private on public.match_cards for select to authenticated using (exists (
  select 1 from public.matches m join public.tournaments t on t.id=m.tournament_id join public.profiles p on p.id=auth.uid() and p.tournament_id=m.tournament_id
  where m.id=match_cards.match_id and (
    (p.role='admin'::public.app_role and exists(select 1 from public.tournament_admins ta where ta.user_id=p.id and ta.tournament_id=m.tournament_id))
    or (p.role='team'::public.app_role and (p.team_id=match_cards.team_id or (p.team_id in(m.team_a_id,m.team_b_id) and match_cards.status in ('pending'::public.card_status,'active'::public.card_status))))
    or (p.role='referee'::public.app_role and public.can_referee_access_court(p.id,m.tournament_id,m.court_id) and match_cards.status<>'available'::public.card_status)
    or (p.role='court_display'::public.app_role and p.court_id=m.court_id and (match_cards.status='active'::public.card_status or (t.display_card_notifications_enabled and match_cards.status='pending'::public.card_status)))
    or (p.role='main_display'::public.app_role and (match_cards.status='active'::public.card_status or (t.display_card_notifications_enabled and match_cards.status='pending'::public.card_status)))
  )
));

drop policy if exists match_events_read on public.match_events;
create policy match_events_read on public.match_events for select to authenticated using (exists (
  select 1 from public.matches m join public.tournaments t on t.id=m.tournament_id join public.profiles p on p.id=auth.uid() and p.tournament_id=m.tournament_id
  where m.id=match_events.match_id and (
    (p.role='admin'::public.app_role and exists(select 1 from public.tournament_admins ta where ta.user_id=p.id and ta.tournament_id=m.tournament_id))
    or (p.role='team'::public.app_role and p.team_id in(m.team_a_id,m.team_b_id))
    or (p.role='referee'::public.app_role and public.can_referee_access_court(p.id,m.tournament_id,m.court_id))
    or (p.role='court_display'::public.app_role and p.court_id=m.court_id and (match_events.type<>'CARD_PLAYED'::public.match_event_type or t.display_card_notifications_enabled))
    or (p.role='main_display'::public.app_role and (match_events.type<>'CARD_PLAYED'::public.match_event_type or t.display_card_notifications_enabled))
  )
));

do $$ declare r record; begin for r in select id from public.rounds loop perform public.sync_round_card_readiness(r.id); end loop; end $$;

revoke execute on function public.round_card_readiness(uuid) from public,anon;
revoke execute on function public.sync_round_card_readiness(uuid) from public;
revoke execute on function public.assert_round_cards_ready(uuid) from public;
revoke execute on function public.sync_match_card_round_readiness() from public;
revoke execute on function public.sync_match_round_card_readiness() from public;
revoke execute on function public.sync_tournament_round_card_readiness() from public;
revoke execute on function public.set_display_card_notifications(uuid,boolean) from public,anon;
grant execute on function public.set_display_card_notifications(uuid,boolean) to authenticated;

commit;
