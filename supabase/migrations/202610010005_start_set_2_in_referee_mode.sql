-- Let Regia start Set 2 round-wide after the guided-flow prerequisites are met,
-- also when individual courts controlled Set 1.
begin;

create or replace function public.control_round_set(p_round_id uuid,p_action text)
returns setof public.matches language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare v_round public.rounds;v_mode public.set_control_mode;v_dice_enabled boolean;v_match public.matches;v_now timestamptz:=clock_timestamp();
begin
  select r.* into v_round from public.rounds r join public.tournaments t on t.id=r.tournament_id where r.id=p_round_id for update of r,t;
  if not found then raise exception 'round not found'; end if;
  select t.set_control_mode,t.dice_enabled into v_mode,v_dice_enabled from public.tournaments t where t.id=v_round.tournament_id;
  if not public.live_admin_authorized(v_round.tournament_id) then raise exception 'not authorized'; end if;
  if v_mode<>'centralized'::public.set_control_mode and p_action<>'start_set_2' then raise exception 'centralized control mode is not active'; end if;
  if p_action='start_set_1' then perform public.assert_previous_rounds_complete(p_round_id); end if;
  perform m.id from public.matches m where m.round_id=p_round_id order by m.id for update;
  if not found then raise exception 'round has no matches'; end if;
  if p_action='start_set_2' and exists(select 1 from public.matches m where m.round_id=p_round_id and
    (m.status<>'set_break'::public.match_status or m.set_1_result_submitted_at is null
      or not public.has_valid_completed_set_result(m.id,1))) then
    raise exception 'set 1 results are incomplete';
  end if;
  if p_action='start_set_2' and v_dice_enabled and (v_round.dice_result is null or v_round.dice_rule_id is null) then
    raise exception 'global dice must be rolled before set 2';
  end if;
  if p_action in ('start_set_1','start_set_2') and exists(select 1 from public.matches m where m.round_id=p_round_id
    and not public.match_lineup_ready(m.id,case when p_action='start_set_1' then 1 else 2 end)) then
    raise exception 'one or more match lineups are missing';
  end if;
  for v_match in select * from public.matches where round_id=p_round_id order by id loop
    perform public.apply_match_set_action(v_match.id,p_action,v_now);
  end loop;
  if p_action='start_set_2' and v_dice_enabled then
    update public.rounds set dice_started_at=v_now,dice_ends_at=v_now+make_interval(secs=>300) where id=p_round_id;
  end if;
  update public.rounds set opened_at=coalesce(opened_at,v_now),status=case p_action
    when 'start_set_1' then 'set_1'::public.round_status
    when 'end_set_1' then 'set_break'::public.round_status
    when 'start_set_2' then 'set_2'::public.round_status else status end
  where id=p_round_id;
  return query select * from public.matches where round_id=p_round_id order by court_id,id;
end; $$;

commit;
