-- Persist Team-confirmed match lineups and expose match rosters to participants.
begin;

alter table public.match_lineups
  add column if not exists confirmed_at timestamptz;

update public.match_lineups
set confirmed_at = created_at
where confirmed_at is null;

alter table public.match_lineups
  alter column confirmed_at set default now(),
  alter column confirmed_at set not null;

create or replace function public.can_read_match_roster(p_team_id uuid, p_tournament_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.tournament_id = p_tournament_id
      and (
        p.role in ('admin'::public.app_role, 'main_display'::public.app_role)
        or (p.role = 'team'::public.app_role and (
          p.team_id = p_team_id or exists (
            select 1 from public.matches m where m.tournament_id = p_tournament_id
              and p.team_id in (m.team_a_id, m.team_b_id)
              and p_team_id in (m.team_a_id, m.team_b_id)
          )
        ))
        or (p.role in ('referee'::public.app_role, 'court_display'::public.app_role) and exists (
          select 1 from public.matches m where m.tournament_id = p_tournament_id
            and m.court_id = p.court_id and p_team_id in (m.team_a_id, m.team_b_id)
        ))
      )
  )
$$;

revoke execute on function public.can_read_match_roster(uuid, uuid) from public;
grant execute on function public.can_read_match_roster(uuid, uuid) to authenticated;

drop policy if exists teams_read on public.teams;
drop policy if exists teams_match_participant_read on public.teams;
create policy teams_read on public.teams for select to authenticated
using (public.can_read_match_roster(id, tournament_id));

drop policy if exists players_read on public.players;
drop policy if exists players_match_participant_read on public.players;
create policy players_read on public.players for select to authenticated
using (public.can_read_match_roster(team_id, tournament_id));

create or replace function public.confirm_match_lineup(
  p_match_id uuid,
  p_team_id uuid,
  p_set_number integer,
  p_player_1_id uuid,
  p_player_2_id uuid
)
returns setof public.match_lineups
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_profile public.profiles%rowtype;
  v_match public.matches%rowtype;
  v_roster uuid[];
  v_bench_id uuid;
  v_remaining_1 uuid;
  v_remaining_2 uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_set_number not in (1, 2) then raise exception 'invalid lineup phase'; end if;
  if p_player_1_id = p_player_2_id then raise exception 'players must be distinct'; end if;

  select p.* into v_profile from public.profiles p
  where p.id = auth.uid() for share;
  if not found or v_profile.role <> 'team'::public.app_role or v_profile.team_id <> p_team_id then
    raise exception 'not authorized';
  end if;

  select m.* into v_match from public.matches m where m.id = p_match_id for update;
  if not found then raise exception 'match not found'; end if;
  if v_profile.tournament_id <> v_match.tournament_id
     or p_team_id not in (v_match.team_a_id, v_match.team_b_id) then
    raise exception 'not authorized';
  end if;
  if (p_set_number = 1 and v_match.set_1_started_at is not null)
     or (p_set_number = 2 and v_match.set_2_started_at is not null)
     or v_match.status = 'completed'::public.match_status then
    raise exception 'lineup phase already started';
  end if;

  select array_agg(pl.id order by pl.id) into v_roster
  from public.players pl
  where pl.team_id = p_team_id and pl.tournament_id = v_match.tournament_id;
  if cardinality(v_roster) <> 3 then raise exception 'team roster must contain exactly three players'; end if;
  if not (p_player_1_id = any(v_roster)) or not (p_player_2_id = any(v_roster)) then
    raise exception 'player does not belong to team roster';
  end if;
  select id into v_bench_id from unnest(v_roster) as roster(id)
  where id not in (p_player_1_id, p_player_2_id);

  if exists (
    select 1 from public.match_lineups ml
    where ml.match_id = p_match_id and ml.team_id = p_team_id
      and ml.set_number in (1, 2) and ml.set_number <> p_set_number
      and least(ml.active_player_1_id, ml.active_player_2_id) = least(p_player_1_id, p_player_2_id)
      and greatest(ml.active_player_1_id, ml.active_player_2_id) = greatest(p_player_1_id, p_player_2_id)
  ) then raise exception 'pair already used in this match'; end if;

  insert into public.match_lineups (
    match_id, team_id, set_number, active_player_1_id, active_player_2_id, bench_player_id, confirmed_at
  ) values (p_match_id, p_team_id, p_set_number, p_player_1_id, p_player_2_id, v_bench_id, now())
  on conflict (match_id, team_id, set_number) do update set
    active_player_1_id = excluded.active_player_1_id,
    active_player_2_id = excluded.active_player_2_id,
    bench_player_id = excluded.bench_player_id,
    confirmed_at = excluded.confirmed_at;

  if exists (select 1 from public.match_lineups where match_id = p_match_id and team_id = p_team_id and set_number = 1)
     and exists (select 1 from public.match_lineups where match_id = p_match_id and team_id = p_team_id and set_number = 2) then
    select a.id, b.id into v_remaining_1, v_remaining_2
    from unnest(v_roster) with ordinality a(id, position)
    join unnest(v_roster) with ordinality b(id, position) on a.position < b.position
    where not exists (
      select 1 from public.match_lineups ml
      where ml.match_id = p_match_id and ml.team_id = p_team_id and ml.set_number in (1, 2)
        and least(ml.active_player_1_id, ml.active_player_2_id) = least(a.id, b.id)
        and greatest(ml.active_player_1_id, ml.active_player_2_id) = greatest(a.id, b.id)
    )
    limit 1;
    if v_remaining_1 is null then raise exception 'no unique super tie-break pair remains'; end if;
    select id into v_bench_id from unnest(v_roster) as roster(id)
    where id not in (v_remaining_1, v_remaining_2);
    insert into public.match_lineups (
      match_id, team_id, set_number, active_player_1_id, active_player_2_id, bench_player_id, confirmed_at
    ) values (p_match_id, p_team_id, 3, v_remaining_1, v_remaining_2, v_bench_id, now())
    on conflict (match_id, team_id, set_number) do update set
      active_player_1_id = excluded.active_player_1_id,
      active_player_2_id = excluded.active_player_2_id,
      bench_player_id = excluded.bench_player_id,
      confirmed_at = excluded.confirmed_at;
  else
    delete from public.match_lineups where match_id = p_match_id and team_id = p_team_id and set_number = 3;
  end if;

  return query select ml.* from public.match_lineups ml
  where ml.match_id = p_match_id and ml.team_id = p_team_id order by ml.set_number;
end;
$$;

revoke execute on function public.confirm_match_lineup(uuid, uuid, integer, uuid, uuid) from public;
grant execute on function public.confirm_match_lineup(uuid, uuid, integer, uuid, uuid) to authenticated;

commit;
