-- Restore authoritative lineup management for Team, Referee and Regia.
begin;

create or replace function public.confirm_match_lineup(
  p_match_id uuid,p_team_id uuid,p_set_number integer,p_player_1_id uuid,p_player_2_id uuid
) returns setof public.match_lineups language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare v_profile public.profiles;v_match public.matches;v_roster uuid[];v_bench uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_set_number not in (1,2) then raise exception 'invalid lineup phase'; end if;
  if p_player_1_id=p_player_2_id then raise exception 'players must be distinct'; end if;
  select * into v_match from public.matches where id=p_match_id for update;
  if not found then raise exception 'match not found'; end if;
  select * into v_profile from public.profiles where id=auth.uid() for share;
  if not found or not (
    (v_profile.role='team'::public.app_role and v_profile.tournament_id=v_match.tournament_id and v_profile.team_id=p_team_id)
    or (v_profile.role='referee'::public.app_role and v_profile.tournament_id=v_match.tournament_id and public.can_referee_access_court(v_profile.id,v_match.tournament_id,v_match.court_id))
    or (v_profile.role='admin'::public.app_role and public.is_admin_for(v_match.tournament_id))
  ) then raise exception 'not authorized'; end if;
  if p_team_id not in(v_match.team_a_id,v_match.team_b_id) then raise exception 'not authorized'; end if;
  if (p_set_number=1 and (v_match.set_1_started_at is not null or v_match.status not in ('scheduled','ready')))
    or (p_set_number=2 and (v_match.set_1_ended_at is null or v_match.set_2_started_at is not null or v_match.status<>'set_break'))
    or v_match.status='completed'::public.match_status then raise exception 'lineup phase already started'; end if;
  select array_agg(id order by id) into v_roster from public.players where team_id=p_team_id and tournament_id=v_match.tournament_id;
  if cardinality(v_roster)<>3 then raise exception 'team roster must contain exactly three players'; end if;
  if not p_player_1_id=any(v_roster) or not p_player_2_id=any(v_roster) then raise exception 'player does not belong to team roster'; end if;
  if exists(select 1 from public.match_lineups ml where ml.match_id=p_match_id and ml.team_id=p_team_id and ml.set_number in(1,2) and ml.set_number<>p_set_number
    and least(ml.active_player_1_id,ml.active_player_2_id)=least(p_player_1_id,p_player_2_id)
    and greatest(ml.active_player_1_id,ml.active_player_2_id)=greatest(p_player_1_id,p_player_2_id)) then raise exception 'pair already used in this match'; end if;
  select id into v_bench from unnest(v_roster) roster(id) where id not in(p_player_1_id,p_player_2_id);
  insert into public.match_lineups(match_id,team_id,set_number,active_player_1_id,active_player_2_id,bench_player_id,confirmed_at)
  values(p_match_id,p_team_id,p_set_number,p_player_1_id,p_player_2_id,v_bench,clock_timestamp())
  on conflict(match_id,team_id,set_number) do update set active_player_1_id=excluded.active_player_1_id,
    active_player_2_id=excluded.active_player_2_id,bench_player_id=excluded.bench_player_id,confirmed_at=excluded.confirmed_at;
  delete from public.match_lineups where match_id=p_match_id and team_id=p_team_id and set_number=3;
  return query select * from public.match_lineups where match_id=p_match_id and team_id=p_team_id order by set_number;
end; $$;

create or replace function public.create_super_tiebreak_lineups_when_required()
returns trigger language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare v_team uuid;v_roster uuid[];v_pair uuid[];v_bench uuid;
begin
  if old.status is distinct from new.status and new.status='super_tiebreak'::public.match_status then
    foreach v_team in array array[new.team_a_id,new.team_b_id] loop
      select array_agg(id order by id) into v_roster from public.players where team_id=v_team and tournament_id=new.tournament_id;
      if cardinality(v_roster)<>3 then raise exception 'team roster must contain exactly three players'; end if;
      select array[a.id,b.id] into v_pair from unnest(v_roster) with ordinality a(id,n)
      join unnest(v_roster) with ordinality b(id,n) on a.n<b.n where not exists(select 1 from public.match_lineups ml
        where ml.match_id=new.id and ml.team_id=v_team and ml.set_number in(1,2)
        and least(ml.active_player_1_id,ml.active_player_2_id)=least(a.id,b.id)
        and greatest(ml.active_player_1_id,ml.active_player_2_id)=greatest(a.id,b.id)) limit 1;
      if cardinality(v_pair)<>2 then raise exception 'no unique super tie-break pair remains'; end if;
      select id into v_bench from unnest(v_roster) roster(id) where id<>all(v_pair);
      insert into public.match_lineups(match_id,team_id,set_number,active_player_1_id,active_player_2_id,bench_player_id,confirmed_at)
      values(new.id,v_team,3,v_pair[1],v_pair[2],v_bench,clock_timestamp()) on conflict(match_id,team_id,set_number) do nothing;
    end loop;
  end if;
  return new;
end; $$;
drop trigger if exists matches_create_super_tiebreak_lineups on public.matches;
create trigger matches_create_super_tiebreak_lineups after update of status on public.matches
for each row execute function public.create_super_tiebreak_lineups_when_required();

create or replace function public.generate_missing_round_lineups(p_round_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare v_round public.rounds;v_match public.matches;v_team uuid;v_set integer;v_roster uuid[];v_pair uuid[];
  v_generated integer:=0;v_skipped jsonb:='[]'::jsonb;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select * into v_round from public.rounds where id=p_round_id for update;
  if not found then raise exception 'round not found'; end if;
  if not public.live_admin_authorized(v_round.tournament_id) then raise exception 'not authorized'; end if;
  perform id from public.matches where round_id=p_round_id order by id for update;
  for v_match in select * from public.matches where round_id=p_round_id order by court_id,id loop
    v_set:=case when v_match.set_1_started_at is null and v_match.status in('scheduled','ready') then 1
      when v_match.set_1_ended_at is not null and v_match.set_2_started_at is null and v_match.status='set_break' then 2 else null end;
    if v_set is null then continue; end if;
    foreach v_team in array array[v_match.team_a_id,v_match.team_b_id] loop
      if exists(select 1 from public.match_lineups where match_id=v_match.id and team_id=v_team and set_number=v_set) then continue; end if;
      select array_agg(id order by id) into v_roster from public.players where team_id=v_team and tournament_id=v_round.tournament_id;
      if cardinality(v_roster)<>3 then v_skipped:=v_skipped||jsonb_build_array(jsonb_build_object('matchId',v_match.id,'teamId',v_team,'setNumber',v_set,'reason','La rosa deve contenere esattamente tre giocatori'));continue;end if;
      select array[a.id,b.id] into v_pair from unnest(v_roster) with ordinality a(id,n) join unnest(v_roster) with ordinality b(id,n) on a.n<b.n
      where not exists(select 1 from public.match_lineups ml where ml.match_id=v_match.id and ml.team_id=v_team and ml.set_number in(1,2)
        and least(ml.active_player_1_id,ml.active_player_2_id)=least(a.id,b.id) and greatest(ml.active_player_1_id,ml.active_player_2_id)=greatest(a.id,b.id)) order by a.n,b.n limit 1;
      if cardinality(v_pair)<>2 then v_skipped:=v_skipped||jsonb_build_array(jsonb_build_object('matchId',v_match.id,'teamId',v_team,'setNumber',v_set,'reason','Nessuna coppia valida disponibile'));continue;end if;
      perform public.confirm_match_lineup(v_match.id,v_team,v_set,v_pair[1],v_pair[2]);v_generated:=v_generated+1;
    end loop;
  end loop;
  return jsonb_build_object('roundId',p_round_id,'generated',v_generated,'skipped',v_skipped);
end; $$;

revoke execute on function public.confirm_match_lineup(uuid,uuid,integer,uuid,uuid) from public,anon;
grant execute on function public.confirm_match_lineup(uuid,uuid,integer,uuid,uuid) to authenticated;
revoke execute on function public.generate_missing_round_lineups(uuid) from public,anon;
grant execute on function public.generate_missing_round_lineups(uuid) to authenticated;
revoke execute on function public.create_super_tiebreak_lineups_when_required() from public,anon,authenticated;
commit;
