-- Complete the authoritative round lifecycle, timed sets and audited result recovery.
begin;

alter table public.tournaments
  add column default_set_duration_minutes integer not null default 15
    check (default_set_duration_minutes between 1 and 180);

alter table public.rounds
  add column set_duration_minutes integer check (set_duration_minutes between 1 and 180),
  add column completion_total_matches integer not null default 0,
  add column completion_completed_matches integer not null default 0,
  add column completion_ready boolean not null default false,
  add column completion_blockers jsonb not null default '[]'::jsonb;

alter table public.matches
  add column active_set_duration_minutes integer check (active_set_duration_minutes between 1 and 180),
  add column set_1_result_submitted_at timestamptz,
  add column set_2_result_submitted_at timestamptz;

create or replace function public.effective_round_set_duration(p_round_id uuid)
returns integer language sql stable security definer set search_path=pg_catalog,pg_temp as $$
  select coalesce(r.set_duration_minutes,t.default_set_duration_minutes)
  from public.rounds r join public.tournaments t on t.id=r.tournament_id
  where r.id=p_round_id
$$;

create or replace function public.round_completion_readiness(p_round_id uuid)
returns jsonb language sql stable security definer set search_path=pg_catalog,pg_temp as $$
with source as (
  select m.*,
    (select (me.payload->>'games_a')::integer from public.match_events me
      where me.match_id=m.id and me.type='SET_ENDED'::public.match_event_type
        and (me.payload->>'set_number')::integer=1 order by me.created_at desc,me.id desc limit 1) set1_a,
    (select (me.payload->>'games_b')::integer from public.match_events me
      where me.match_id=m.id and me.type='SET_ENDED'::public.match_event_type
        and (me.payload->>'set_number')::integer=1 order by me.created_at desc,me.id desc limit 1) set1_b,
    (select (me.payload->>'games_a')::integer from public.match_events me
      where me.match_id=m.id and me.type='SET_ENDED'::public.match_event_type
        and (me.payload->>'set_number')::integer=2 order by me.created_at desc,me.id desc limit 1) set2_a,
    (select (me.payload->>'games_b')::integer from public.match_events me
      where me.match_id=m.id and me.type='SET_ENDED'::public.match_event_type
        and (me.payload->>'set_number')::integer=2 order by me.created_at desc,me.id desc limit 1) set2_b
  from public.matches m where m.round_id=p_round_id
), evaluated as (
  select s.*,
    case
      when s.set_1_ended_at is null or s.set1_a is null then 'Risultato Set 1 da completare'
      when s.set_1_result_submitted_at is null then 'Risultato Set 1 da inviare alla Regia'
      when s.set_2_ended_at is null or s.set2_a is null then 'Risultato Set 2 da completare'
      when s.set_2_result_submitted_at is null then 'Risultato Set 2 da inviare alla Regia'
      when ((s.set1_a>s.set1_b and s.set2_b>s.set2_a) or (s.set1_b>s.set1_a and s.set2_a>s.set2_b))
        and (s.super_tiebreak_team_a is null or s.super_tiebreak_team_b is null or s.super_tiebreak_team_a=s.super_tiebreak_team_b)
        then 'Super Tie-Break da completare'
      when s.result_confirmed_at is null or s.status<>'completed'::public.match_status then 'Risultato finale da confermare'
      else null
    end blocker
  from source s
), totals as (
  select count(*)::integer total,
    count(*) filter(where blocker is null)::integer completed,
    coalesce(jsonb_agg(jsonb_build_object('match_id',id,'court_id',court_id,'reason',blocker)
      order by court_id,id) filter(where blocker is not null),'[]'::jsonb) blockers
  from evaluated
)
select jsonb_build_object('round_id',p_round_id,'total_matches',total,'completed_matches',completed,
  'ready',total>0 and total=completed,'blockers',blockers) from totals
$$;

create or replace function public.sync_round_completion(p_round_id uuid)
returns public.rounds language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare v_readiness jsonb;v_round public.rounds;
begin
  select public.round_completion_readiness(p_round_id) into v_readiness;
  update public.rounds set
    completion_total_matches=(v_readiness->>'total_matches')::integer,
    completion_completed_matches=(v_readiness->>'completed_matches')::integer,
    completion_ready=(v_readiness->>'ready')::boolean,
    completion_blockers=v_readiness->'blockers',
    status=case
      when (v_readiness->>'ready')::boolean then 'completed'::public.round_status
      when status='completed'::public.round_status then 'set_2'::public.round_status
      else status
    end
  where id=p_round_id returning * into v_round;
  if not found then raise exception 'round not found'; end if;
  return v_round;
end; $$;

create or replace function public.assert_previous_rounds_complete(p_round_id uuid)
returns void language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare v_round public.rounds;v_previous record;v_readiness jsonb;
begin
  select * into v_round from public.rounds where id=p_round_id;
  if not found then raise exception 'round not found'; end if;
  for v_previous in select id from public.rounds where tournament_id=v_round.tournament_id and sequence<v_round.sequence order by sequence loop
    perform public.sync_round_completion(v_previous.id);
    select public.round_completion_readiness(v_previous.id) into v_readiness;
    if not (v_readiness->>'ready')::boolean then
      raise exception 'previous round incomplete: %',v_readiness::text;
    end if;
  end loop;
end; $$;

create or replace function public.set_tournament_default_set_duration(p_tournament_id uuid,p_minutes integer)
returns public.tournaments language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare v_result public.tournaments;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_minutes is null or p_minutes not between 1 and 180 then raise exception 'invalid set duration'; end if;
  if not public.live_admin_authorized(p_tournament_id) then raise exception 'not authorized'; end if;
  if exists(select 1 from public.matches m join public.rounds r on r.id=m.round_id
    where m.tournament_id=p_tournament_id and r.set_duration_minutes is null and m.status in ('set_1','set_2')) then
    raise exception 'set duration is locked during an active set';
  end if;
  update public.tournaments set default_set_duration_minutes=p_minutes,updated_at=clock_timestamp()
  where id=p_tournament_id returning * into v_result;
  return v_result;
end; $$;

create or replace function public.set_round_set_duration(p_round_id uuid,p_minutes integer)
returns public.rounds language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare v_round public.rounds;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_minutes is not null and p_minutes not between 1 and 180 then raise exception 'invalid set duration'; end if;
  select * into v_round from public.rounds where id=p_round_id for update;
  if not found then raise exception 'round not found'; end if;
  if not public.live_admin_authorized(v_round.tournament_id) then raise exception 'not authorized'; end if;
  if exists(select 1 from public.matches where round_id=p_round_id and status in ('set_1','set_2')) then
    raise exception 'set duration is locked during an active set';
  end if;
  update public.rounds set set_duration_minutes=p_minutes where id=p_round_id returning * into v_round;
  return v_round;
end; $$;

create or replace function public.reconcile_match_after_set_results(p_match_id uuid,p_revoke_confirmation boolean default false)
returns public.matches language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare v_match public.matches;v_a integer;v_b integer;
begin
  perform public.recalculate_match_set_wins(p_match_id);
  select * into v_match from public.matches where id=p_match_id for update;
  select count(*) filter(where (me.payload->>'games_a')::integer>(me.payload->>'games_b')::integer),
         count(*) filter(where (me.payload->>'games_b')::integer>(me.payload->>'games_a')::integer)
    into v_a,v_b from public.match_events me
    where me.match_id=p_match_id and me.type='SET_ENDED'::public.match_event_type
      and (me.payload->>'set_number') ~ '^[12]$';
  if public.has_valid_completed_set_result(p_match_id,1) and public.has_valid_completed_set_result(p_match_id,2) then
    update public.matches set
      status=case when v_a=v_b then 'super_tiebreak'::public.match_status else 'completed'::public.match_status end,
      current_set=case when v_a=v_b then 3 else 2 end,
      super_tiebreak_team_a=case when v_a=v_b then super_tiebreak_team_a else null end,
      super_tiebreak_team_b=case when v_a=v_b then super_tiebreak_team_b else null end,
      completed_at=case when v_a=v_b or p_revoke_confirmation then null else completed_at end,
      result_confirmed_at=case when p_revoke_confirmation then null else result_confirmed_at end,
      result_confirmed_by=case when p_revoke_confirmation then null else result_confirmed_by end,
      updated_at=clock_timestamp()
    where id=p_match_id returning * into v_match;
  end if;
  return v_match;
end; $$;

create or replace function public.save_completed_match_set_result(
  p_match_id uuid,p_set_number integer,p_games_a integer,p_games_b integer
) returns public.matches language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare v_match public.matches;v_old_a integer;v_old_b integer;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_set_number not in (1,2) or p_games_a is null or p_games_b is null or p_games_a<0 or p_games_b<0 or p_games_a>99 or p_games_b>99 then raise exception 'invalid completed set result'; end if;
  select * into v_match from public.matches where id=p_match_id for update;
  if not found then raise exception 'match not found'; end if;
  if v_match.result_confirmed_at is not null then raise exception 'confirmed result requires admin correction'; end if;
  if (p_set_number=1 and v_match.set_1_ended_at is null) or (p_set_number=2 and v_match.set_2_ended_at is null) then raise exception 'set is not completed'; end if;
  if (p_set_number=1 and v_match.set_1_result_submitted_at is not null) or (p_set_number=2 and v_match.set_2_result_submitted_at is not null) then raise exception 'set result already submitted'; end if;
  perform p.id from public.profiles p where p.id=auth.uid() and (
    (p.role='referee'::public.app_role and p.tournament_id=v_match.tournament_id and exists(select 1 from public.referee_court_assignments rca where rca.referee_user_id=p.id and rca.tournament_id=v_match.tournament_id and rca.court_id=v_match.court_id))
    or (p.role='admin'::public.app_role and exists(select 1 from public.tournament_admins ta where ta.user_id=p.id and ta.tournament_id=v_match.tournament_id))
  ) for share;
  if not found then raise exception 'not authorized for court'; end if;
  select (me.payload->>'games_a')::integer,(me.payload->>'games_b')::integer into v_old_a,v_old_b from public.match_events me
    where me.match_id=p_match_id and me.type='SET_ENDED'::public.match_event_type and (me.payload->>'set_number')::integer=p_set_number
    order by me.created_at desc,me.id desc limit 1;
  perform public.persist_completed_set_result(v_match,p_set_number,p_games_a,p_games_b,auth.uid());
  select public.reconcile_match_after_set_results(p_match_id,false) into v_match;
  insert into public.match_events(tournament_id,round_id,match_id,type,payload,actor_user_id)
  values(v_match.tournament_id,v_match.round_id,v_match.id,'SCORE_CORRECTED'::public.match_event_type,
    jsonb_build_object('score_type','set','set_number',p_set_number,'from_a',v_old_a,'from_b',v_old_b,'games_a',p_games_a,'games_b',p_games_b,'before_submission',true),auth.uid());
  perform public.sync_round_completion(v_match.round_id);
  return v_match;
end; $$;

create or replace function public.submit_completed_match_set_result(p_match_id uuid,p_set_number integer)
returns public.matches language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare v_match public.matches;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_set_number not in (1,2) then raise exception 'invalid set number'; end if;
  select * into v_match from public.matches where id=p_match_id for update;
  if not found then raise exception 'match not found'; end if;
  perform p.id from public.profiles p where p.id=auth.uid() and (
    (p.role='referee'::public.app_role and p.tournament_id=v_match.tournament_id and exists(select 1 from public.referee_court_assignments rca where rca.referee_user_id=p.id and rca.tournament_id=v_match.tournament_id and rca.court_id=v_match.court_id))
    or (p.role='admin'::public.app_role and exists(select 1 from public.tournament_admins ta where ta.user_id=p.id and ta.tournament_id=v_match.tournament_id))
  ) for share;
  if not found then raise exception 'not authorized for court'; end if;
  if not public.has_valid_completed_set_result(p_match_id,p_set_number) then raise exception 'completed set result is missing'; end if;
  update public.matches set
    set_1_result_submitted_at=case when p_set_number=1 then coalesce(set_1_result_submitted_at,clock_timestamp()) else set_1_result_submitted_at end,
    set_2_result_submitted_at=case when p_set_number=2 then coalesce(set_2_result_submitted_at,clock_timestamp()) else set_2_result_submitted_at end,
    updated_at=clock_timestamp() where id=p_match_id returning * into v_match;
  perform public.sync_round_completion(v_match.round_id);
  return v_match;
end; $$;

create or replace function public.admin_correct_match_result(
  p_match_id uuid,p_set_number integer,p_score_a integer,p_score_b integer
) returns public.matches language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare v_match public.matches;v_was_confirmed boolean;v_old_a integer;v_old_b integer;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_set_number not in (1,2,3) or p_score_a is null or p_score_b is null or p_score_a<0 or p_score_b<0 or p_score_a>99 or p_score_b>99 or p_score_a=p_score_b then raise exception 'invalid corrected result'; end if;
  select * into v_match from public.matches where id=p_match_id for update;
  if not found then raise exception 'match not found'; end if;
  if not public.live_admin_authorized(v_match.tournament_id) then raise exception 'not authorized'; end if;
  v_was_confirmed:=v_match.result_confirmed_at is not null;
  if p_set_number in (1,2) then
    select (me.payload->>'games_a')::integer,(me.payload->>'games_b')::integer into v_old_a,v_old_b from public.match_events me
      where me.match_id=p_match_id and me.type='SET_ENDED'::public.match_event_type and (me.payload->>'set_number')::integer=p_set_number
      order by me.created_at desc,me.id desc limit 1;
    perform public.persist_completed_set_result(v_match,p_set_number,p_score_a,p_score_b,auth.uid());
    update public.matches set
      set_1_ended_at=case when p_set_number=1 then coalesce(set_1_ended_at,clock_timestamp()) else set_1_ended_at end,
      set_2_ended_at=case when p_set_number=2 then coalesce(set_2_ended_at,clock_timestamp()) else set_2_ended_at end,
      set_1_result_submitted_at=case when p_set_number=1 then clock_timestamp() else set_1_result_submitted_at end,
      set_2_result_submitted_at=case when p_set_number=2 then clock_timestamp() else set_2_result_submitted_at end
    where id=p_match_id;
    select public.reconcile_match_after_set_results(p_match_id,true) into v_match;
  else
    v_old_a:=v_match.super_tiebreak_team_a;v_old_b:=v_match.super_tiebreak_team_b;
    if not public.has_valid_completed_set_result(p_match_id,1) or not public.has_valid_completed_set_result(p_match_id,2) then raise exception 'normal set results are missing'; end if;
    perform public.recalculate_match_set_wins(p_match_id);
    select * into v_match from public.matches where id=p_match_id;
    if v_match.sets_a<>v_match.sets_b then raise exception 'super tie-break is not required'; end if;
    update public.matches set super_tiebreak_team_a=p_score_a,super_tiebreak_team_b=p_score_b,status='super_tiebreak',current_set=3,
      completed_at=null,result_confirmed_at=null,result_confirmed_by=null,updated_at=clock_timestamp()
    where id=p_match_id returning * into v_match;
  end if;
  insert into public.match_events(tournament_id,round_id,match_id,type,payload,actor_user_id)
  values(v_match.tournament_id,v_match.round_id,v_match.id,'SCORE_CORRECTED'::public.match_event_type,
    jsonb_build_object('score_type',case when p_set_number=3 then 'super_tiebreak' else 'set' end,'set_number',p_set_number,
      'from_a',v_old_a,'from_b',v_old_b,'score_a',p_score_a,'score_b',p_score_b,'admin_correction',true,'revoked_final_confirmation',v_was_confirmed),auth.uid());
  perform public.sync_round_completion(v_match.round_id);
  select * into v_match from public.matches where id=p_match_id;
  return v_match;
end; $$;

create or replace function public.set_completed_match_set_result(
  p_match_id uuid,p_set_number integer,p_games_a integer,p_games_b integer
) returns public.matches language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
begin
  if p_set_number not in (1,2) then raise exception 'invalid completed set result'; end if;
  return public.admin_correct_match_result(p_match_id,p_set_number,p_games_a,p_games_b);
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
    if v_match.status not in ('scheduled','ready') or v_match.set_1_started_at is not null then raise exception 'invalid or duplicate set transition'; end if;
    if not public.match_lineup_ready(v_match.id,1) then raise exception 'lineup missing for set 1 on court %',v_match.court_id; end if;
    update public.matches set status='set_1',current_set=1,started_at=coalesce(started_at,p_now),set_1_started_at=p_now,
      active_set_duration_minutes=v_duration,set_1_result_submitted_at=null,updated_at=p_now where id=v_match.id returning * into v_match;
  elsif p_action='end_set_1' then
    if v_match.status<>'set_1' or v_match.set_1_ended_at is not null then raise exception 'invalid or duplicate set transition'; end if;
    update public.matches set status='set_break',current_set=2,set_1_ended_at=p_now,active_set_duration_minutes=null,updated_at=p_now where id=v_match.id returning * into v_match;
  elsif p_action='start_set_2' then
    if v_match.status<>'set_break' or v_match.set_2_started_at is not null then raise exception 'invalid or duplicate set transition'; end if;
    if v_match.set_1_result_submitted_at is null or not public.has_valid_completed_set_result(v_match.id,1) then raise exception 'set 1 result is not submitted'; end if;
    if v_dice_enabled and (v_round.dice_result is null or v_round.dice_rule_id is null) then raise exception 'global dice must be rolled before set 2'; end if;
    if not public.match_lineup_ready(v_match.id,2) then raise exception 'lineup missing for set 2 on court %',v_match.court_id; end if;
    update public.matches set status='set_2',current_set=2,set_2_started_at=p_now,active_set_duration_minutes=v_duration,
      set_2_result_submitted_at=null,updated_at=p_now where id=v_match.id returning * into v_match;
  elsif p_action='end_set_2' then
    if v_match.status<>'set_2' or v_match.set_2_ended_at is not null then raise exception 'invalid or duplicate set transition'; end if;
    select (me.payload->>'games_a')::integer,(me.payload->>'games_b')::integer into v_set1_a,v_set1_b from public.match_events me
      where me.match_id=v_match.id and me.type='SET_ENDED'::public.match_event_type and (me.payload->>'set_number')::integer=1 order by me.created_at desc,me.id desc limit 1;
    if v_set1_a is null then raise exception 'missing final result for set 1'; end if;
    update public.matches set status=case when (v_set1_a>v_set1_b and games_b>games_a) or (v_set1_b>v_set1_a and games_a>games_b) then 'super_tiebreak'::public.match_status else 'completed'::public.match_status end,
      current_set=case when (v_set1_a>v_set1_b and games_b>games_a) or (v_set1_b>v_set1_a and games_a>games_b) then 3 else 2 end,
      set_2_ended_at=p_now,active_set_duration_minutes=null,completed_at=null,updated_at=p_now where id=v_match.id returning * into v_match;
  else raise exception 'invalid set action'; end if;
  perform public.sync_round_completion(v_match.round_id);
  return v_match;
end; $$;

create or replace function public.expire_timed_match_set(p_match_id uuid)
returns public.matches language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare v_match public.matches;v_deadline timestamptz;v_action text;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select * into v_match from public.matches where id=p_match_id for update;
  if not found then raise exception 'match not found'; end if;
  if v_match.status not in ('set_1','set_2') then return v_match; end if;
  perform p.id from public.profiles p where p.id=auth.uid() and (
    (p.role='admin'::public.app_role and exists(select 1 from public.tournament_admins ta where ta.user_id=p.id and ta.tournament_id=v_match.tournament_id))
    or (p.role='referee'::public.app_role and p.tournament_id=v_match.tournament_id and exists(select 1 from public.referee_court_assignments rca where rca.referee_user_id=p.id and rca.tournament_id=v_match.tournament_id and rca.court_id=v_match.court_id))
    or (p.role='court_display'::public.app_role and p.tournament_id=v_match.tournament_id and p.court_id=v_match.court_id)
    or (p.role='main_display'::public.app_role and p.tournament_id=v_match.tournament_id)
  ) for share;
  if not found then raise exception 'not authorized'; end if;
  v_deadline:=case when v_match.status='set_1' then v_match.set_1_started_at else v_match.set_2_started_at end
    +make_interval(mins=>coalesce(v_match.active_set_duration_minutes,public.effective_round_set_duration(v_match.round_id)));
  if statement_timestamp()<v_deadline then raise exception 'set deadline has not elapsed'; end if;
  v_action:=case when v_match.status='set_1' then 'end_set_1' else 'end_set_2' end;
  return public.apply_match_set_action(v_match.id,v_action,v_deadline);
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
  if v_round.opened_at is not null then raise exception 'round already opened'; end if;
  if exists(select 1 from public.matches where round_id=p_round_id and status not in ('scheduled','ready')) then raise exception 'round already started'; end if;
  update public.rounds set opened_at=clock_timestamp() where id=p_round_id returning * into v_round;
  return v_round;
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
  if p_action='start_set_1' then perform public.assert_previous_rounds_complete(p_round_id); end if;
  perform m.id from public.matches m where m.round_id=p_round_id order by m.id for update;
  if not found then raise exception 'round has no matches'; end if;
  if p_action='start_set_2' and exists(select 1 from public.matches m where m.round_id=p_round_id and (m.set_1_result_submitted_at is null or not public.has_valid_completed_set_result(m.id,1))) then raise exception 'set 1 results are incomplete'; end if;
  if p_action='start_set_2' and v_dice_enabled and v_round.dice_result is null then raise exception 'global dice must be rolled before set 2'; end if;
  if p_action in ('start_set_1','start_set_2') and exists(select 1 from public.matches m where m.round_id=p_round_id and not public.match_lineup_ready(m.id,case when p_action='start_set_1' then 1 else 2 end)) then raise exception 'one or more match lineups are missing'; end if;
  for v_match in select * from public.matches where round_id=p_round_id order by id loop perform public.apply_match_set_action(v_match.id,p_action,v_now); end loop;
  if p_action='start_set_2' and v_dice_enabled then update public.rounds set dice_started_at=v_now,dice_ends_at=v_now+make_interval(secs=>300) where id=p_round_id; end if;
  update public.rounds set opened_at=coalesce(opened_at,v_now),status=case p_action when 'start_set_1' then 'set_1'::public.round_status when 'end_set_1' then 'set_break'::public.round_status when 'start_set_2' then 'set_2'::public.round_status else status end where id=p_round_id;
  return query select * from public.matches where round_id=p_round_id order by court_id,id;
end; $$;

create or replace function public.admin_control_match_set(p_match_id uuid,p_action text)
returns public.matches language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare v_match public.matches;
begin
  select * into v_match from public.matches where id=p_match_id for update;
  if not found then raise exception 'match not found'; end if;
  if not public.live_admin_authorized(v_match.tournament_id) then raise exception 'not authorized'; end if;
  if p_action='start_set_1' then perform public.assert_previous_rounds_complete(v_match.round_id); end if;
  return public.apply_match_set_action(p_match_id,p_action,clock_timestamp());
end; $$;

create or replace function public.control_referee_match_set(p_match_id uuid,p_action text)
returns public.matches language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare v_match public.matches;v_mode public.set_control_mode;v_opened timestamptz;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select m.* into v_match from public.matches m join public.tournaments t on t.id=m.tournament_id join public.rounds r on r.id=m.round_id
    where m.id=p_match_id for update of m,r,t;
  if not found then raise exception 'match not found'; end if;
  select t.set_control_mode,r.opened_at into v_mode,v_opened from public.tournaments t join public.rounds r on r.tournament_id=t.id
    where t.id=v_match.tournament_id and r.id=v_match.round_id;
  if v_mode<>'referee'::public.set_control_mode or v_opened is null then raise exception 'round is not open for referee control'; end if;
  perform p.id from public.profiles p join public.referee_court_assignments rca on rca.referee_user_id=p.id
    where p.id=auth.uid() and p.role='referee'::public.app_role and rca.tournament_id=v_match.tournament_id and rca.court_id=v_match.court_id for share of p,rca;
  if not found then raise exception 'not authorized'; end if;
  select public.apply_match_set_action(v_match.id,p_action,clock_timestamp()) into v_match;
  update public.rounds set status=case
    when p_action='start_set_1' then 'set_1'::public.round_status
    when p_action='end_set_1' and not exists(select 1 from public.matches m where m.round_id=v_match.round_id and m.status='set_1') then 'set_break'::public.round_status
    when p_action='start_set_2' then 'set_2'::public.round_status
    else status end where id=v_match.round_id and status<>'completed'::public.round_status;
  return v_match;
end; $$;

create or replace function public.confirm_match_final_result(p_match_id uuid)
returns public.matches language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare v_match public.matches;v_a integer;v_b integer;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select * into v_match from public.matches where id=p_match_id for update;
  if not found then raise exception 'match not found'; end if;
  perform p.id from public.profiles p where p.id=auth.uid() and (
    (p.role='referee'::public.app_role and p.tournament_id=v_match.tournament_id and exists(select 1 from public.referee_court_assignments rca where rca.referee_user_id=p.id and rca.tournament_id=v_match.tournament_id and rca.court_id=v_match.court_id))
    or (p.role='admin'::public.app_role and exists(select 1 from public.tournament_admins ta where ta.user_id=p.id and ta.tournament_id=v_match.tournament_id))
  ) for share;
  if not found then raise exception 'not authorized for court'; end if;
  if v_match.result_confirmed_at is not null then raise exception 'result already confirmed'; end if;
  if v_match.set_1_result_submitted_at is null or v_match.set_2_result_submitted_at is null or not public.has_valid_completed_set_result(v_match.id,1) or not public.has_valid_completed_set_result(v_match.id,2) then raise exception 'completed set results are missing or not submitted'; end if;
  perform public.recalculate_match_set_wins(v_match.id);
  select * into v_match from public.matches where id=p_match_id;
  v_a:=v_match.sets_a;v_b:=v_match.sets_b;
  if v_a=v_b and (v_match.super_tiebreak_team_a is null or v_match.super_tiebreak_team_b is null or v_match.super_tiebreak_team_a=v_match.super_tiebreak_team_b) then raise exception 'valid super tie-break result is required'; end if;
  update public.matches set status='completed',completed_at=clock_timestamp(),result_confirmed_at=clock_timestamp(),result_confirmed_by=auth.uid(),updated_at=clock_timestamp() where id=p_match_id returning * into v_match;
  insert into public.match_events(tournament_id,round_id,match_id,type,payload,actor_user_id)
  values(v_match.tournament_id,v_match.round_id,v_match.id,'MATCH_ENDED'::public.match_event_type,
    jsonb_build_object('result_confirmed_at',v_match.result_confirmed_at,'sets_a',v_match.sets_a,'sets_b',v_match.sets_b,'super_tiebreak_a',v_match.super_tiebreak_team_a,'super_tiebreak_b',v_match.super_tiebreak_team_b),auth.uid());
  perform public.sync_round_completion(v_match.round_id);
  return v_match;
end; $$;

update public.matches m set
  set_1_result_submitted_at=coalesce(m.set_1_result_submitted_at,m.set_1_ended_at),
  set_2_result_submitted_at=coalesce(m.set_2_result_submitted_at,m.set_2_ended_at)
where (m.set_1_ended_at is not null and exists(select 1 from public.match_events me where me.match_id=m.id and me.type='SET_ENDED'::public.match_event_type and (me.payload->>'set_number')::integer=1))
   or (m.set_2_ended_at is not null and exists(select 1 from public.match_events me where me.match_id=m.id and me.type='SET_ENDED'::public.match_event_type and (me.payload->>'set_number')::integer=2));

do $$ declare r record; begin for r in select id from public.rounds loop perform public.sync_round_completion(r.id); end loop; end $$;

revoke execute on function public.effective_round_set_duration(uuid) from public;
revoke execute on function public.round_completion_readiness(uuid) from public,anon;
revoke execute on function public.sync_round_completion(uuid) from public;
revoke execute on function public.assert_previous_rounds_complete(uuid) from public;
revoke execute on function public.reconcile_match_after_set_results(uuid,boolean) from public;
revoke execute on function public.set_tournament_default_set_duration(uuid,integer) from public,anon;
revoke execute on function public.set_round_set_duration(uuid,integer) from public,anon;
revoke execute on function public.save_completed_match_set_result(uuid,integer,integer,integer) from public,anon;
revoke execute on function public.submit_completed_match_set_result(uuid,integer) from public,anon;
revoke execute on function public.admin_correct_match_result(uuid,integer,integer,integer) from public,anon;
revoke execute on function public.expire_timed_match_set(uuid) from public,anon;
revoke execute on function public.admin_control_match_set(uuid,text) from public,anon;
grant execute on function public.set_tournament_default_set_duration(uuid,integer) to authenticated;
grant execute on function public.set_round_set_duration(uuid,integer) to authenticated;
grant execute on function public.save_completed_match_set_result(uuid,integer,integer,integer) to authenticated;
grant execute on function public.submit_completed_match_set_result(uuid,integer) to authenticated;
grant execute on function public.admin_correct_match_result(uuid,integer,integer,integer) to authenticated;
grant execute on function public.expire_timed_match_set(uuid) to authenticated;
grant execute on function public.admin_control_match_set(uuid,text) to authenticated;

commit;
