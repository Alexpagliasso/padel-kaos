-- Repair composite result assignment and support live referee court ownership.
begin;

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
  select * into v_match from public.reconcile_match_after_set_results(p_match_id,false);
  insert into public.match_events(tournament_id,round_id,match_id,type,payload,actor_user_id)
  values(v_match.tournament_id,v_match.round_id,v_match.id,'SCORE_CORRECTED'::public.match_event_type,
    jsonb_build_object('score_type','set','set_number',p_set_number,'from_a',v_old_a,'from_b',v_old_b,'games_a',p_games_a,'games_b',p_games_b,'before_submission',true),auth.uid());
  perform public.sync_round_completion(v_match.round_id);
  return v_match;
end; $$;

-- A referee can temporarily have no court. Keep the legacy primary court as
-- metadata while assignments remain the authorization source of truth.
alter table public.profiles drop constraint display_or_referee_court_scope;
alter table public.profiles add constraint display_or_referee_court_scope
  check (role <> 'court_display'::public.app_role or court_id is not null);

-- Provisioning still creates the first assignment from a new profile. Later
-- changes to profiles.court_id must not silently restore a removed assignment.
drop trigger profiles_sync_referee_primary_court on public.profiles;
create trigger profiles_sync_referee_primary_court
after insert on public.profiles for each row
execute function public.sync_referee_primary_court_assignment();

update public.profiles p set court_id = (
  select rca.court_id from public.referee_court_assignments rca
  where rca.referee_user_id = p.id order by rca.created_at, rca.court_id limit 1
), updated_at = clock_timestamp()
where p.role = 'referee'::public.app_role and p.court_id is distinct from (
  select rca.court_id from public.referee_court_assignments rca
  where rca.referee_user_id = p.id order by rca.created_at, rca.court_id limit 1
);

create or replace function public.set_referee_court_assignment(
  p_tournament_id uuid, p_court_id uuid, p_referee_user_id uuid default null
) returns setof public.referee_court_assignments
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare v_previous_referee uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  perform t.id from public.tournaments t where t.id = p_tournament_id for update;
  if not found then raise exception 'tournament not found'; end if;
  if not public.live_admin_authorized(p_tournament_id) then raise exception 'not authorized'; end if;
  perform c.id from public.courts c where c.id = p_court_id and c.tournament_id = p_tournament_id for share;
  if not found then raise exception 'court does not belong to tournament'; end if;
  if p_referee_user_id is not null then
    perform p.id from public.profiles p where p.id = p_referee_user_id
      and p.tournament_id = p_tournament_id and p.role = 'referee'::public.app_role for share;
    if not found then raise exception 'referee does not belong to tournament'; end if;
  end if;

  select rca.referee_user_id into v_previous_referee
  from public.referee_court_assignments rca
  where rca.tournament_id = p_tournament_id and rca.court_id = p_court_id for update;
  if v_previous_referee is not distinct from p_referee_user_id then
    return query select * from public.referee_court_assignments
      where tournament_id = p_tournament_id and court_id = p_court_id;
    return;
  end if;

  delete from public.referee_court_assignments
  where tournament_id = p_tournament_id and court_id = p_court_id;
  if p_referee_user_id is not null then
    insert into public.referee_court_assignments(tournament_id, referee_user_id, court_id)
    values (p_tournament_id, p_referee_user_id, p_court_id);
  end if;

  if v_previous_referee is not null then
    update public.profiles p set court_id = (
      select rca.court_id from public.referee_court_assignments rca
      where rca.referee_user_id = v_previous_referee
      order by rca.created_at, rca.court_id limit 1
    ), updated_at = clock_timestamp() where p.id = v_previous_referee;
  end if;
  if p_referee_user_id is not null then
    update public.profiles p set court_id = (
      select rca.court_id from public.referee_court_assignments rca
      where rca.referee_user_id = p_referee_user_id
      order by rca.created_at, rca.court_id limit 1
    ), updated_at = clock_timestamp() where p.id = p_referee_user_id;
  end if;
  return query select * from public.referee_court_assignments
    where tournament_id = p_tournament_id and court_id = p_court_id;
end; $$;

-- Keep the existing bulk endpoint usable in setup and during live operations.
-- It delegates each court transfer to the same canonical court-scoped mutation.
create or replace function public.replace_referee_court_assignments(
  p_referee_user_id uuid, p_court_ids uuid[]
) returns setof public.referee_court_assignments
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare v_tournament_id uuid; v_court_id uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select p.tournament_id into v_tournament_id from public.profiles p
  where p.id = p_referee_user_id and p.role = 'referee'::public.app_role;
  if not found then raise exception 'referee not found'; end if;
  perform t.id from public.tournaments t where t.id = v_tournament_id for update;
  if not public.live_admin_authorized(v_tournament_id) then raise exception 'not authorized'; end if;
  if p_court_ids is null or cardinality(p_court_ids) <>
    (select count(distinct id) from unnest(p_court_ids) ids(id)) then
    raise exception 'invalid or duplicate court list';
  end if;
  if exists (select 1 from unnest(p_court_ids) ids(id) where id is null or not exists (
    select 1 from public.courts c where c.id = ids.id and c.tournament_id = v_tournament_id
  )) then raise exception 'court does not belong to tournament'; end if;

  delete from public.referee_court_assignments rca
  where rca.referee_user_id = p_referee_user_id and rca.tournament_id = v_tournament_id
    and rca.court_id <> all(p_court_ids);
  update public.profiles p set court_id = (
    select rca.court_id from public.referee_court_assignments rca
    where rca.referee_user_id = p_referee_user_id
    order by rca.created_at, rca.court_id limit 1
  ), updated_at = clock_timestamp() where p.id = p_referee_user_id;
  for v_court_id in select id from unnest(p_court_ids) ids(id) order by id loop
    perform public.set_referee_court_assignment(v_tournament_id, v_court_id, p_referee_user_id);
  end loop;
  return query select * from public.referee_court_assignments
    where referee_user_id = p_referee_user_id order by court_id;
end; $$;

-- 202609210001 restored these legacy helpers with a primary-court check.
-- Read and mutation permissions must both follow the assignment table.
create or replace function public.can_read_match(p_match_id uuid)
returns boolean language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select exists (
    select 1 from public.matches m join public.profiles p on p.id = auth.uid()
    where m.id = p_match_id and (
      (p.role = 'admin'::public.app_role and public.is_admin_for(m.tournament_id))
      or (p.tournament_id = m.tournament_id and (
        p.role = 'main_display'::public.app_role
        or (p.role = 'referee'::public.app_role and public.can_referee_access_court(p.id, m.tournament_id, m.court_id))
        or (p.role = 'court_display'::public.app_role and p.court_id = m.court_id)
        or (p.role = 'team'::public.app_role and p.team_id in (m.team_a_id, m.team_b_id))
      ))
    )
  )
$$;

create or replace function public.can_manage_match(p_match_id uuid)
returns boolean language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select exists (
    select 1 from public.matches m join public.profiles p on p.id = auth.uid()
    where m.id = p_match_id and (
      (p.role = 'admin'::public.app_role and public.is_admin_for(m.tournament_id))
      or (p.role = 'referee'::public.app_role and p.tournament_id = m.tournament_id
        and public.can_referee_access_court(p.id, m.tournament_id, m.court_id))
    )
  )
$$;

do $$ begin
  if exists (select 1 from pg_catalog.pg_publication where pubname = 'supabase_realtime')
    and not exists (select 1 from pg_catalog.pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public'
        and tablename = 'referee_court_assignments') then
    alter publication supabase_realtime add table public.referee_court_assignments;
  end if;
end $$;

revoke execute on function public.set_referee_court_assignment(uuid, uuid, uuid) from public, anon;
grant execute on function public.set_referee_court_assignment(uuid, uuid, uuid) to authenticated;
revoke execute on function public.replace_referee_court_assignments(uuid, uuid[]) from public, anon;
grant execute on function public.replace_referee_court_assignments(uuid, uuid[]) to authenticated;

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
    select * into v_match from public.reconcile_match_after_set_results(p_match_id,true);
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

commit;
