-- Persist turn card assignment and centralized/referee set orchestration.
begin;

create type public.set_control_mode as enum ('centralized', 'referee');

alter table public.tournaments
  add column set_control_mode public.set_control_mode not null default 'centralized';

alter table public.rounds
  add column opened_at timestamptz;

create or replace function public.live_admin_authorized(p_tournament_id uuid)
returns boolean language plpgsql volatile security definer
set search_path = pg_catalog, pg_temp as $$
begin
  if auth.uid() is null then return false; end if;
  perform p.id from public.profiles p
  join public.tournament_admins ta on ta.user_id = p.id
  where p.id = auth.uid() and p.role = 'admin'::public.app_role
    and ta.tournament_id = p_tournament_id
  for share of p, ta;
  return found;
end;
$$;

create or replace function public.match_lineup_ready(p_match_id uuid, p_set_number integer)
returns boolean language sql stable security definer
set search_path = pg_catalog, pg_temp as $$
  select exists (
    select 1 from public.matches m
    where m.id = p_match_id
      and exists (select 1 from public.match_lineups ml where ml.match_id = m.id and ml.team_id = m.team_a_id and ml.set_number = p_set_number)
      and exists (select 1 from public.match_lineups ml where ml.match_id = m.id and ml.team_id = m.team_b_id and ml.set_number = p_set_number)
  )
$$;

create or replace function public.set_tournament_set_control_mode(
  p_tournament_id uuid,
  p_mode public.set_control_mode
)
returns public.tournaments language plpgsql security definer
set search_path = pg_catalog, pg_temp as $$
declare v_tournament public.tournaments;
begin
  if not public.live_admin_authorized(p_tournament_id) then raise exception 'not authorized'; end if;
  select * into v_tournament from public.tournaments where id = p_tournament_id for update;
  if not found then raise exception 'tournament not found'; end if;
  if exists (select 1 from public.rounds where tournament_id = p_tournament_id and opened_at is not null)
     or exists (select 1 from public.matches where tournament_id = p_tournament_id and status not in ('scheduled','ready')) then
    raise exception 'set control mode is locked after turn opening';
  end if;
  update public.tournaments set set_control_mode = p_mode, updated_at = now()
  where id = p_tournament_id returning * into v_tournament;
  return v_tournament;
end;
$$;

create or replace function public.assign_round_cards(
  p_round_id uuid,
  p_cards_per_team integer default 3,
  p_redraw boolean default false
)
returns setof public.match_cards language plpgsql security definer
set search_path = pg_catalog, pg_temp as $$
declare
  v_round public.rounds;
  v_match public.matches;
  v_team_id uuid;
  v_available_count bigint;
  v_inserted integer;
begin
  select * into v_round from public.rounds where id = p_round_id for update;
  if not found then raise exception 'round not found'; end if;
  if not public.live_admin_authorized(v_round.tournament_id) then raise exception 'not authorized'; end if;
  if p_cards_per_team is null or p_cards_per_team < 1 or p_cards_per_team > 10 then raise exception 'invalid card count'; end if;

  perform m.id from public.matches m where m.round_id = p_round_id order by m.id for update;
  if not exists (select 1 from public.matches where round_id = p_round_id) then raise exception 'round has no matches'; end if;
  if v_round.opened_at is not null or exists (
    select 1 from public.matches where round_id = p_round_id
      and (status not in ('scheduled','ready') or started_at is not null)
  ) then raise exception 'cards cannot be assigned after turn start'; end if;

  if exists (select 1 from public.match_cards mc join public.matches m on m.id = mc.match_id where m.round_id = p_round_id) then
    if not p_redraw then raise exception 'cards already assigned'; end if;
    if exists (select 1 from public.match_cards mc join public.matches m on m.id = mc.match_id
      where m.round_id = p_round_id and mc.status <> 'available'::public.card_status) then
      raise exception 'used cards cannot be redrawn';
    end if;
    delete from public.match_cards mc using public.matches m where mc.match_id = m.id and m.round_id = p_round_id;
  end if;

  select count(*) into v_available_count
  from public.card_definitions cd
  left join public.tournament_card_activation tca
    on tca.tournament_id = v_round.tournament_id and tca.card_definition_id = cd.id
  where (cd.tournament_id is null or cd.tournament_id = v_round.tournament_id)
    and cd.archived_at is null and coalesce(tca.enabled, cd.enabled);
  if v_available_count < p_cards_per_team then raise exception 'not enough enabled card definitions'; end if;

  for v_match in select * from public.matches where round_id = p_round_id order by id loop
    foreach v_team_id in array array[v_match.team_a_id, v_match.team_b_id] loop
      insert into public.match_cards(match_id, team_id, card_definition_id)
      select v_match.id, v_team_id, available.id
      from (
        select cd.id from public.card_definitions cd
        left join public.tournament_card_activation tca
          on tca.tournament_id = v_round.tournament_id and tca.card_definition_id = cd.id
        where (cd.tournament_id is null or cd.tournament_id = v_round.tournament_id)
          and cd.archived_at is null and coalesce(tca.enabled, cd.enabled)
        order by random() limit p_cards_per_team
      ) available;
      get diagnostics v_inserted = row_count;
      if v_inserted <> p_cards_per_team then raise exception 'incomplete card draw'; end if;
    end loop;
  end loop;
  return query select mc.* from public.match_cards mc join public.matches m on m.id = mc.match_id
    where m.round_id = p_round_id order by m.court_id, mc.team_id, mc.created_at;
end;
$$;

create or replace function public.open_round_for_referees(p_round_id uuid)
returns public.rounds language plpgsql security definer
set search_path = pg_catalog, pg_temp as $$
declare v_round public.rounds; v_mode public.set_control_mode;
begin
  select r.* into v_round
  from public.rounds r join public.tournaments t on t.id = r.tournament_id
  where r.id = p_round_id for update of r, t;
  if not found then raise exception 'round not found'; end if;
  select t.set_control_mode into v_mode
  from public.tournaments t where t.id = v_round.tournament_id;
  if not public.live_admin_authorized(v_round.tournament_id) then raise exception 'not authorized'; end if;
  if v_mode <> 'referee'::public.set_control_mode then raise exception 'referee control mode is not active'; end if;
  if v_round.opened_at is not null then raise exception 'round already opened'; end if;
  if exists (select 1 from public.matches where round_id = p_round_id and status not in ('scheduled','ready')) then
    raise exception 'round already started';
  end if;
  update public.rounds set opened_at = clock_timestamp() where id = p_round_id returning * into v_round;
  return v_round;
end;
$$;

create or replace function public.apply_match_set_action(
  p_match_id uuid, p_action text, p_now timestamptz
)
returns public.matches language plpgsql security definer
set search_path = pg_catalog, pg_temp as $$
declare v_match public.matches;
begin
  select * into v_match from public.matches where id = p_match_id for update;
  if not found then raise exception 'match not found'; end if;
  if p_action = 'start_set_1' then
    if v_match.status not in ('scheduled','ready') or v_match.set_1_started_at is not null then raise exception 'invalid or duplicate set transition'; end if;
    if not public.match_lineup_ready(v_match.id, 1) then raise exception 'lineup missing for set 1 on court %', v_match.court_id; end if;
    update public.matches set status='set_1', current_set=1, started_at=coalesce(started_at,p_now), set_1_started_at=p_now, updated_at=p_now where id=v_match.id returning * into v_match;
  elsif p_action = 'end_set_1' then
    if v_match.status <> 'set_1' or v_match.set_1_ended_at is not null then raise exception 'invalid or duplicate set transition'; end if;
    update public.matches set status='set_break', current_set=2, set_1_ended_at=p_now, updated_at=p_now where id=v_match.id returning * into v_match;
  elsif p_action = 'start_set_2' then
    if v_match.status <> 'set_break' or v_match.set_2_started_at is not null then raise exception 'invalid or duplicate set transition'; end if;
    if not public.match_lineup_ready(v_match.id, 2) then raise exception 'lineup missing for set 2 on court %', v_match.court_id; end if;
    update public.matches set status='set_2', current_set=2, set_2_started_at=p_now, updated_at=p_now where id=v_match.id returning * into v_match;
  elsif p_action = 'end_set_2' then
    if v_match.status <> 'set_2' or v_match.set_2_ended_at is not null then raise exception 'invalid or duplicate set transition'; end if;
    update public.matches set status='super_tiebreak', current_set=3, set_2_ended_at=p_now, updated_at=p_now where id=v_match.id returning * into v_match;
  else raise exception 'invalid set action';
  end if;
  return v_match;
end;
$$;

create or replace function public.control_round_set(p_round_id uuid, p_action text)
returns setof public.matches language plpgsql security definer
set search_path = pg_catalog, pg_temp as $$
declare v_round public.rounds; v_mode public.set_control_mode; v_match public.matches; v_now timestamptz := clock_timestamp();
begin
  select r.* into v_round from public.rounds r
  join public.tournaments t on t.id=r.tournament_id where r.id=p_round_id for update of r,t;
  if not found then raise exception 'round not found'; end if;
  select t.set_control_mode into v_mode
  from public.tournaments t where t.id=v_round.tournament_id;
  if not public.live_admin_authorized(v_round.tournament_id) then raise exception 'not authorized'; end if;
  if v_mode <> 'centralized'::public.set_control_mode then raise exception 'centralized control mode is not active'; end if;
  perform id from public.matches where round_id=p_round_id order by id for update;
  if not exists(select 1 from public.matches where round_id=p_round_id) then raise exception 'round has no matches'; end if;
  if p_action in ('start_set_1','start_set_2') and exists (
    select 1 from public.matches m where m.round_id=p_round_id
      and not public.match_lineup_ready(m.id, case when p_action='start_set_1' then 1 else 2 end)
  ) then raise exception 'one or more match lineups are missing'; end if;
  for v_match in select * from public.matches where round_id=p_round_id order by id loop
    perform public.apply_match_set_action(v_match.id,p_action,v_now);
  end loop;
  update public.rounds set opened_at=coalesce(opened_at,v_now), status=case p_action
    when 'start_set_1' then 'set_1'::public.round_status when 'end_set_1' then 'set_break'::public.round_status
    when 'start_set_2' then 'set_2'::public.round_status else status end where id=p_round_id;
  return query select * from public.matches where round_id=p_round_id order by court_id,id;
end;
$$;

create or replace function public.control_referee_match_set(p_match_id uuid, p_action text)
returns public.matches language plpgsql security definer
set search_path = pg_catalog, pg_temp as $$
declare v_match public.matches; v_mode public.set_control_mode; v_opened timestamptz;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select m.* into v_match
  from public.matches m join public.tournaments t on t.id=m.tournament_id join public.rounds r on r.id=m.round_id
  where m.id=p_match_id for update of m,r,t;
  if not found then raise exception 'match not found'; end if;
  select t.set_control_mode, r.opened_at into v_mode, v_opened
  from public.tournaments t join public.rounds r on r.tournament_id=t.id
  where t.id=v_match.tournament_id and r.id=v_match.round_id;
  if v_mode <> 'referee'::public.set_control_mode or v_opened is null then raise exception 'round is not open for referee control'; end if;
  perform p.id from public.profiles p join public.referee_court_assignments rca on rca.referee_user_id=p.id
    where p.id=auth.uid() and p.role='referee'::public.app_role and rca.tournament_id=v_match.tournament_id and rca.court_id=v_match.court_id
    for share of p, rca;
  if not found then raise exception 'not authorized'; end if;
  return public.apply_match_set_action(v_match.id,p_action,clock_timestamp());
end;
$$;

revoke execute on function public.live_admin_authorized(uuid) from public;
revoke execute on function public.match_lineup_ready(uuid,integer) from public;
revoke execute on function public.apply_match_set_action(uuid,text,timestamptz) from public;
revoke execute on function public.set_tournament_set_control_mode(uuid,public.set_control_mode) from public,anon;
revoke execute on function public.assign_round_cards(uuid,integer,boolean) from public,anon;
revoke execute on function public.open_round_for_referees(uuid) from public,anon;
revoke execute on function public.control_round_set(uuid,text) from public,anon;
revoke execute on function public.control_referee_match_set(uuid,text) from public,anon;
grant execute on function public.set_tournament_set_control_mode(uuid,public.set_control_mode) to authenticated;
grant execute on function public.assign_round_cards(uuid,integer,boolean) to authenticated;
grant execute on function public.open_round_for_referees(uuid) to authenticated;
grant execute on function public.control_round_set(uuid,text) to authenticated;
grant execute on function public.control_referee_match_set(uuid,text) to authenticated;

-- Legacy lifecycle endpoints do not enforce the selected orchestration mode.
revoke execute on function public.draw_match_cards(uuid) from authenticated;
revoke execute on function public.start_match(uuid) from authenticated;
revoke execute on function public.end_set(uuid) from authenticated;
revoke execute on function public.start_second_set(uuid) from authenticated;

commit;
