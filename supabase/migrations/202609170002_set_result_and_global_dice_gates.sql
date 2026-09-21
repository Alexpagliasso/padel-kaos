-- Gate set progression on persisted results and the single Admin-controlled round dice roll.
begin;

alter table public.rounds add column if not exists dice_rolled_at timestamptz;

create or replace function public.has_valid_completed_set_result(p_match_id uuid, p_set_number integer)
returns boolean language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select exists (
    select 1 from public.match_events me
    where me.match_id=p_match_id and me.type='SET_ENDED'::public.match_event_type
      and (me.payload->>'set_number') ~ '^[12]$'
      and (me.payload->>'set_number')::integer=p_set_number
      and (me.payload->>'games_a') ~ '^[0-9]+$'
      and (me.payload->>'games_b') ~ '^[0-9]+$'
  )
$$;

create or replace function public.persist_completed_set_result(
  p_match public.matches, p_set_number integer, p_games_a integer, p_games_b integer, p_actor uuid
) returns void language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
begin
  update public.match_events me set payload=jsonb_build_object(
    'set_number',p_set_number,'games_a',p_games_a,'games_b',p_games_b
  ), actor_user_id=p_actor, created_at=clock_timestamp()
  where me.id=(select existing.id from public.match_events existing
    where existing.match_id=p_match.id and existing.type='SET_ENDED'::public.match_event_type
      and (existing.payload->>'set_number')::integer=p_set_number
    order by existing.created_at desc,existing.id desc limit 1);
  if not found then
    insert into public.match_events(tournament_id,round_id,match_id,type,payload,actor_user_id)
    values(p_match.tournament_id,p_match.round_id,p_match.id,'SET_ENDED'::public.match_event_type,
      jsonb_build_object('set_number',p_set_number,'games_a',p_games_a,'games_b',p_games_b),p_actor);
  end if;
end; $$;

create or replace function public.recalculate_match_set_wins(p_match_id uuid)
returns void language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare v_a integer; v_b integer;
begin
  select count(*) filter(where (me.payload->>'games_a')::integer>(me.payload->>'games_b')::integer),
         count(*) filter(where (me.payload->>'games_b')::integer>(me.payload->>'games_a')::integer)
  into v_a,v_b from public.match_events me
  where me.match_id=p_match_id and me.type='SET_ENDED'::public.match_event_type
    and (me.payload->>'set_number') ~ '^[12]$'
    and (me.payload->>'games_a') ~ '^[0-9]+$' and (me.payload->>'games_b') ~ '^[0-9]+$';
  update public.matches set sets_a=coalesce(v_a,0),sets_b=coalesce(v_b,0),updated_at=clock_timestamp()
  where id=p_match_id;
end; $$;

create or replace function public.persist_timed_set_score_transition()
returns trigger language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare v_set integer;
begin
  if old.status='set_1'::public.match_status and new.status='set_break'::public.match_status then v_set:=1;
  elsif old.status='set_2'::public.match_status and new.status in ('super_tiebreak'::public.match_status,'completed'::public.match_status) then v_set:=2;
  elsif old.status='set_break'::public.match_status and new.status='set_2'::public.match_status then
    new.games_a:=0; new.games_b:=0; return new;
  else return new;
  end if;
  perform public.persist_completed_set_result(old,v_set,old.games_a,old.games_b,auth.uid());
  select count(*) filter(where (me.payload->>'games_a')::integer>(me.payload->>'games_b')::integer),
         count(*) filter(where (me.payload->>'games_b')::integer>(me.payload->>'games_a')::integer)
  into new.sets_a,new.sets_b from public.match_events me
  where me.match_id=old.id and me.type='SET_ENDED'::public.match_event_type
    and (me.payload->>'set_number') ~ '^[12]$'
    and (me.payload->>'games_a') ~ '^[0-9]+$' and (me.payload->>'games_b') ~ '^[0-9]+$';
  return new;
end; $$;

create or replace function public.set_completed_match_set_result(
  p_match_id uuid,p_set_number integer,p_games_a integer,p_games_b integer
) returns public.matches language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare v_match public.matches;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_set_number not in (1,2) or p_games_a is null or p_games_b is null
     or p_games_a<0 or p_games_b<0 or p_games_a>99 or p_games_b>99 then raise exception 'invalid completed set result'; end if;
  select m.* into v_match from public.matches m where m.id=p_match_id for update;
  if not found then raise exception 'match not found'; end if;
  perform p.id from public.profiles p join public.tournament_admins ta on ta.user_id=p.id
  where p.id=auth.uid() and p.role='admin'::public.app_role and ta.tournament_id=v_match.tournament_id
  for share of p,ta;
  if not found then raise exception 'not authorized'; end if;
  if (p_set_number=1 and v_match.set_1_ended_at is null) or (p_set_number=2 and v_match.set_2_ended_at is null) then
    raise exception 'set is not completed';
  end if;
  perform me.id from public.match_events me where me.match_id=p_match_id order by me.id for update;
  perform public.persist_completed_set_result(v_match,p_set_number,p_games_a,p_games_b,auth.uid());
  perform public.recalculate_match_set_wins(p_match_id);
  select m.* into v_match from public.matches m where m.id=p_match_id;
  return v_match;
end; $$;

create or replace function public.roll_global_dice_for_round(p_round_id uuid)
returns public.rounds language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare v_round public.rounds; v_rule public.dice_rules;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select r.* into v_round from public.rounds r where r.id=p_round_id for update;
  if not found then raise exception 'round not found'; end if;
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
  select dr.* into v_rule from public.dice_rules dr
  where dr.tournament_id=v_round.tournament_id and dr.enabled order by random() limit 1;
  if not found then raise exception 'no enabled dice rules'; end if;
  update public.rounds set dice_result=v_rule.dice_value,dice_rule_id=v_rule.id,dice_rolled_at=clock_timestamp(),
    dice_started_at=null,dice_ends_at=null where id=p_round_id returning * into v_round;
  return v_round;
end; $$;

create or replace function public.apply_match_set_action(p_match_id uuid,p_action text,p_now timestamptz)
returns public.matches language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare v_match public.matches; v_round public.rounds; v_set1_a int; v_set1_b int;
begin
  select m.* into v_match from public.matches m where m.id=p_match_id for update;
  if not found then raise exception 'match not found'; end if;
  select r.* into v_round from public.rounds r where r.id=v_match.round_id for share;
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
    if v_round.dice_result is null or v_round.dice_rule_id is null then raise exception 'global dice must be rolled before set 2'; end if;
    if not public.match_lineup_ready(v_match.id,2) then raise exception 'lineup missing for set 2 on court %',v_match.court_id; end if;
    update public.matches set status='set_2',current_set=2,set_2_started_at=p_now,updated_at=p_now where id=v_match.id returning * into v_match;
  elsif p_action='end_set_2' then
    if v_match.status<>'set_2' or v_match.set_2_ended_at is not null then raise exception 'invalid or duplicate set transition'; end if;
    select (me.payload->>'games_a')::int,(me.payload->>'games_b')::int into v_set1_a,v_set1_b
    from public.match_events me where me.match_id=v_match.id and me.type='SET_ENDED'::public.match_event_type
      and (me.payload->>'set_number')::int=1 order by me.created_at desc limit 1;
    if v_set1_a is null then raise exception 'missing final result for set 1'; end if;
    update public.matches set status=case
      when (v_set1_a>v_set1_b and games_b>games_a) or (v_set1_b>v_set1_a and games_a>games_b)
        then 'super_tiebreak'::public.match_status else 'completed'::public.match_status end,
      current_set=case when (v_set1_a>v_set1_b and games_b>games_a) or (v_set1_b>v_set1_a and games_a>games_b) then 3 else 2 end,
      set_2_ended_at=p_now,completed_at=case when (v_set1_a>v_set1_b and games_b>games_a) or (v_set1_b>v_set1_a and games_a>games_b) then completed_at else p_now end,
      updated_at=p_now where id=v_match.id returning * into v_match;
    if not public.has_valid_completed_set_result(v_match.id,2) then raise exception 'missing final result for set 2'; end if;
  else raise exception 'invalid set action'; end if;
  return v_match;
end; $$;

create or replace function public.control_round_set(p_round_id uuid,p_action text)
returns setof public.matches language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare v_round public.rounds; v_mode public.set_control_mode; v_match public.matches; v_now timestamptz:=clock_timestamp();
begin
  select r.* into v_round from public.rounds r join public.tournaments t on t.id=r.tournament_id where r.id=p_round_id for update of r,t;
  if not found then raise exception 'round not found'; end if;
  select t.set_control_mode into v_mode from public.tournaments t where t.id=v_round.tournament_id;
  if not public.live_admin_authorized(v_round.tournament_id) then raise exception 'not authorized'; end if;
  if v_mode<>'centralized'::public.set_control_mode then raise exception 'centralized control mode is not active'; end if;
  perform m.id from public.matches m where m.round_id=p_round_id order by m.id for update;
  if not found then raise exception 'round has no matches'; end if;
  if p_action='start_set_2' then
    if exists(select 1 from public.matches m where m.round_id=p_round_id and
      (m.set_1_ended_at is null or not public.has_valid_completed_set_result(m.id,1))) then raise exception 'set 1 results are incomplete'; end if;
    if v_round.dice_result is null then raise exception 'global dice must be rolled before set 2'; end if;
  end if;
  if p_action in ('start_set_1','start_set_2') and exists(select 1 from public.matches m where m.round_id=p_round_id
    and not public.match_lineup_ready(m.id,case when p_action='start_set_1' then 1 else 2 end)) then raise exception 'one or more match lineups are missing'; end if;
  for v_match in select * from public.matches where round_id=p_round_id order by id loop perform public.apply_match_set_action(v_match.id,p_action,v_now); end loop;
  if p_action='start_set_2' then
    update public.rounds set dice_started_at=v_now,dice_ends_at=v_now+make_interval(secs=>300) where id=p_round_id;
  end if;
  update public.rounds set opened_at=coalesce(opened_at,v_now),status=case p_action when 'start_set_1' then 'set_1'::public.round_status when 'end_set_1' then 'set_break'::public.round_status when 'start_set_2' then 'set_2'::public.round_status else status end where id=p_round_id;
  return query select * from public.matches where round_id=p_round_id order by court_id,id;
end; $$;

create or replace function public.request_match_card_use(p_match_card_id uuid)
returns public.match_cards language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare v_card public.match_cards; v_match public.matches; v_definition public.card_definitions;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select mc.* into v_card from public.match_cards mc where mc.id=p_match_card_id for update;
  if not found then raise exception 'card not found'; end if;
  if v_card.status<>'available'::public.card_status then raise exception 'card not available'; end if;
  select m.* into v_match from public.matches m where m.id=v_card.match_id for share;
  select cd.* into v_definition from public.card_definitions cd where cd.id=v_card.card_definition_id;
  if v_match.status not in ('set_1','set_2','super_tiebreak') then raise exception 'match is not live'; end if;
  perform p.id from public.profiles p where p.id=auth.uid() and p.tournament_id=v_match.tournament_id and p.role='team'::public.app_role and p.team_id=v_card.team_id for share;
  if not found or v_card.team_id not in (v_match.team_a_id,v_match.team_b_id) then raise exception 'not authorized'; end if;
  if v_match.status='set_2'::public.match_status and v_match.set_2_started_at is not null
     and statement_timestamp()<v_match.set_2_started_at+make_interval(secs=>300) then raise exception 'cards blocked during global dice effect'; end if;
  if exists(select 1 from public.match_cards mc join public.card_definitions cd on cd.id=mc.card_definition_id where mc.match_id=v_match.id and mc.team_id=v_card.team_id and mc.status in ('pending','active') and mc.id<>v_card.id and cd.duration_type<>'instant') then raise exception 'team already has active persistent card'; end if;
  update public.match_cards set status='pending',used_in_set=v_match.current_set where id=v_card.id returning * into v_card;
  insert into public.card_usages(match_card_id,match_id,team_id,requested_by,payload) values(v_card.id,v_card.match_id,v_card.team_id,auth.uid(),jsonb_build_object('requested_at',clock_timestamp()));
  insert into public.match_events(tournament_id,round_id,match_id,type,payload,actor_user_id) values(v_match.tournament_id,v_match.round_id,v_match.id,'CARD_PLAYED',jsonb_build_object('match_card_id',v_card.id,'card_definition_id',v_card.card_definition_id,'team_id',v_card.team_id),auth.uid());
  return v_card;
end; $$;

revoke execute on function public.has_valid_completed_set_result(uuid,integer) from public;
revoke execute on function public.persist_completed_set_result(public.matches,integer,integer,integer,uuid) from public;
revoke execute on function public.recalculate_match_set_wins(uuid) from public;
revoke execute on function public.set_completed_match_set_result(uuid,integer,integer,integer) from public,anon;
revoke execute on function public.roll_global_dice_for_round(uuid) from public,anon;
grant execute on function public.set_completed_match_set_result(uuid,integer,integer,integer) to authenticated;
grant execute on function public.roll_global_dice_for_round(uuid) to authenticated;

commit;
