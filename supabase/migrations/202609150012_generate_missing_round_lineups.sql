-- Atomically generate only the required, missing lineups for a tournament round.
begin;

create or replace function public.generate_missing_round_lineups(p_round_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_round public.rounds;
  v_match public.matches;
  v_team_id uuid;
  v_set_number integer;
  v_roster uuid[];
  v_pair uuid[];
  v_bench_id uuid;
  v_remaining uuid[];
  v_generated integer := 0;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;

  select r.* into v_round from public.rounds r where r.id = p_round_id for update;
  if not found then raise exception 'round not found'; end if;

  perform p.id
  from public.profiles p
  join public.tournament_admins ta on ta.user_id = p.id
  where p.id = auth.uid()
    and p.role = 'admin'::public.app_role
    and ta.tournament_id = v_round.tournament_id
  for share of p, ta;
  if not found then raise exception 'not authorized'; end if;

  perform m.id from public.matches m
  where m.round_id = p_round_id and m.tournament_id = v_round.tournament_id
  order by m.id for update;
  if not found then raise exception 'round has no matches'; end if;

  perform ml.id from public.match_lineups ml
  join public.matches m on m.id = ml.match_id
  where m.round_id = p_round_id and m.tournament_id = v_round.tournament_id
  order by ml.id for update of ml;

  for v_match in
    select m.* from public.matches m
    where m.round_id = p_round_id and m.tournament_id = v_round.tournament_id
    order by m.id
  loop
    v_set_number := case
      when v_match.set_1_started_at is null and v_match.status in ('scheduled', 'ready') then 1
      when v_match.set_1_ended_at is not null and v_match.set_2_started_at is null
        and v_match.status = 'set_break'::public.match_status then 2
      else null
    end;
    if v_set_number is null then continue; end if;

    foreach v_team_id in array array[v_match.team_a_id, v_match.team_b_id] loop
      if exists (
        select 1 from public.match_lineups ml
        where ml.match_id = v_match.id and ml.team_id = v_team_id and ml.set_number = v_set_number
      ) then continue; end if;

      select array_agg(pl.id order by pl.id) into v_roster
      from public.players pl
      where pl.team_id = v_team_id and pl.tournament_id = v_round.tournament_id;
      if cardinality(v_roster) <> 3 then
        raise exception 'team roster must contain exactly three players: %', v_team_id;
      end if;

      select array[pair.player_1_id, pair.player_2_id] into v_pair
      from (
        select a.id as player_1_id, b.id as player_2_id
        from unnest(v_roster) with ordinality a(id, position)
        join unnest(v_roster) with ordinality b(id, position) on a.position < b.position
        where not exists (
          select 1 from public.match_lineups used
          where used.match_id = v_match.id and used.team_id = v_team_id
            and used.set_number in (1, 2)
            and least(used.active_player_1_id, used.active_player_2_id) = least(a.id, b.id)
            and greatest(used.active_player_1_id, used.active_player_2_id) = greatest(a.id, b.id)
        )
        order by random()
        limit 1
      ) pair;
      if cardinality(v_pair) <> 2 then raise exception 'no unique lineup pair remains'; end if;
      select roster.id into v_bench_id from unnest(v_roster) roster(id)
      where roster.id <> all(v_pair);

      insert into public.match_lineups (
        match_id, team_id, set_number, active_player_1_id, active_player_2_id, bench_player_id, confirmed_at
      ) values (v_match.id, v_team_id, v_set_number, v_pair[1], v_pair[2], v_bench_id, now());
      v_generated := v_generated + 1;

      if v_set_number = 2 then
        select array[pair.player_1_id, pair.player_2_id] into v_remaining
        from (
          select a.id as player_1_id, b.id as player_2_id
          from unnest(v_roster) with ordinality a(id, position)
          join unnest(v_roster) with ordinality b(id, position) on a.position < b.position
          where not exists (
            select 1 from public.match_lineups used
            where used.match_id = v_match.id and used.team_id = v_team_id and used.set_number in (1, 2)
              and least(used.active_player_1_id, used.active_player_2_id) = least(a.id, b.id)
              and greatest(used.active_player_1_id, used.active_player_2_id) = greatest(a.id, b.id)
          ) limit 1
        ) pair;
        if cardinality(v_remaining) <> 2 then raise exception 'no unique super tie-break pair remains'; end if;
        select roster.id into v_bench_id from unnest(v_roster) roster(id)
        where roster.id <> all(v_remaining);
        insert into public.match_lineups (
          match_id, team_id, set_number, active_player_1_id, active_player_2_id, bench_player_id, confirmed_at
        ) values (v_match.id, v_team_id, 3, v_remaining[1], v_remaining[2], v_bench_id, now());
      end if;
    end loop;
  end loop;

  return jsonb_build_object('roundId', p_round_id, 'generated', v_generated);
end;
$$;

revoke execute on function public.generate_missing_round_lineups(uuid) from public, anon;
grant execute on function public.generate_missing_round_lineups(uuid) to authenticated;

commit;
