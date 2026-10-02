-- Enforce the round-wide phase boundary for lineups, set starts and normal results.
begin;

create or replace function public.assert_match_round_phase(
  p_match_id uuid,p_target_set integer
) returns void language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare v_match public.matches;v_round public.rounds;v_dice_enabled boolean;
begin
  select * into v_match from public.matches where id=p_match_id;
  if not found then raise exception 'match not found'; end if;
  if p_target_set not in (2,3) then return; end if;
  select * into v_round from public.rounds where id=v_match.round_id;
  select dice_enabled into v_dice_enabled from public.tournaments where id=v_match.tournament_id;
  if exists(select 1 from public.matches sibling where sibling.round_id=v_match.round_id
    and (sibling.set_1_ended_at is null or sibling.set_1_result_submitted_at is null
      or not public.has_valid_completed_set_result(sibling.id,1))) then
    raise exception 'round is still in set 1';
  end if;
  if p_target_set=2 and v_dice_enabled and (v_round.dice_result is null or v_round.dice_rule_id is null) then
    raise exception 'global dice must be rolled before set 2';
  end if;
  if p_target_set=3 and exists(select 1 from public.matches sibling where sibling.round_id=v_match.round_id
    and (sibling.set_2_ended_at is null or sibling.set_2_result_submitted_at is null
      or not public.has_valid_completed_set_result(sibling.id,2))) then
    raise exception 'round is still in set 2';
  end if;
end; $$;

create or replace function public.guard_match_round_phase_update()
returns trigger language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
begin
  if old.set_2_started_at is null and new.set_2_started_at is not null then
    perform public.assert_match_round_phase(new.id,2);
  end if;
  if old.set_2_result_submitted_at is null and new.set_2_result_submitted_at is not null then
    perform public.assert_match_round_phase(new.id,2);
  end if;
  return new;
end; $$;

create trigger matches_guard_round_global_phase
before update of set_2_started_at,set_2_result_submitted_at on public.matches
for each row execute function public.guard_match_round_phase_update();

create or replace function public.guard_lineup_round_phase()
returns trigger language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
begin
  if new.set_number in (2,3) then perform public.assert_match_round_phase(new.match_id,new.set_number); end if;
  return new;
end; $$;

create trigger match_lineups_guard_round_global_phase
before insert or update of set_number on public.match_lineups
for each row execute function public.guard_lineup_round_phase();

revoke execute on function public.assert_match_round_phase(uuid,integer) from public,anon,authenticated;
revoke execute on function public.guard_match_round_phase_update() from public,anon,authenticated;
revoke execute on function public.guard_lineup_round_phase() from public,anon,authenticated;
commit;
