-- Use the canonical tournament-admin authorization once for Regia batch generation.
begin;
create or replace function public.generate_missing_round_lineups_for_set(p_round_id uuid,p_set_number integer)
returns jsonb language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare v_round public.rounds;v_match public.matches;v_team uuid;v_roster uuid[];v_pair uuid[];v_generated integer:=0;v_remaining integer;v_skipped jsonb:='[]'::jsonb;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_set_number not in(1,2) then raise exception 'invalid lineup phase'; end if;
  select * into v_round from public.rounds where id=p_round_id for update;
  if not found then raise exception 'round not found'; end if;
  if not public.is_admin_for(v_round.tournament_id) then raise exception 'not authorized'; end if;
  perform id from public.matches where round_id=p_round_id order by id for update;
  if not found then raise exception 'round has no matches'; end if;
  if p_set_number=1 and exists(select 1 from public.matches where round_id=p_round_id and (set_1_started_at is not null or status not in('scheduled','ready'))) then raise exception 'lineup phase already started'; end if;
  if p_set_number=2 and exists(select 1 from public.matches where round_id=p_round_id and (set_1_ended_at is null or set_2_started_at is not null or status<>'set_break')) then raise exception 'lineup phase already started'; end if;
  for v_match in select * from public.matches where round_id=p_round_id order by court_id,id loop
    foreach v_team in array array[v_match.team_a_id,v_match.team_b_id] loop
      if exists(select 1 from public.match_lineups where match_id=v_match.id and team_id=v_team and set_number=p_set_number) then continue; end if;
      select array_agg(id order by id) into v_roster from public.players where team_id=v_team and tournament_id=v_round.tournament_id;
      if cardinality(v_roster)<>3 then v_skipped:=v_skipped||jsonb_build_array(jsonb_build_object('matchId',v_match.id,'teamId',v_team,'setNumber',p_set_number,'reason','La rosa deve contenere esattamente tre giocatori'));continue;end if;
      select array[a.id,b.id] into v_pair from unnest(v_roster) with ordinality a(id,n) join unnest(v_roster) with ordinality b(id,n) on a.n<b.n
      where not exists(select 1 from public.match_lineups ml where ml.match_id=v_match.id and ml.team_id=v_team and ml.set_number in(1,2)
        and least(ml.active_player_1_id,ml.active_player_2_id)=least(a.id,b.id) and greatest(ml.active_player_1_id,ml.active_player_2_id)=greatest(a.id,b.id)) order by a.n,b.n limit 1;
      if cardinality(v_pair)<>2 then v_skipped:=v_skipped||jsonb_build_array(jsonb_build_object('matchId',v_match.id,'teamId',v_team,'setNumber',p_set_number,'reason','Nessuna coppia valida disponibile'));continue;end if;
      insert into public.match_lineups(match_id,team_id,set_number,active_player_1_id,active_player_2_id,bench_player_id,confirmed_at)
      select v_match.id,v_team,p_set_number,v_pair[1],v_pair[2],roster.id,clock_timestamp()
      from unnest(v_roster) roster(id) where roster.id<>all(v_pair)
      on conflict(match_id,team_id,set_number) do nothing;
      if found then v_generated:=v_generated+1; end if;
    end loop;
  end loop;
  select count(*) into v_remaining from public.matches m cross join lateral unnest(array[m.team_a_id,m.team_b_id]) team(id)
  where m.round_id=p_round_id and not exists(select 1 from public.match_lineups ml where ml.match_id=m.id and ml.team_id=team.id and ml.set_number=p_set_number and ml.confirmed_at is not null);
  return jsonb_build_object('roundId',p_round_id,'setNumber',p_set_number,'generated',v_generated,'remaining',v_remaining,'complete',v_remaining=0,'skipped',v_skipped);
end; $$;
revoke execute on function public.generate_missing_round_lineups_for_set(uuid,integer) from public,anon;
grant execute on function public.generate_missing_round_lineups_for_set(uuid,integer) to authenticated;
commit;
