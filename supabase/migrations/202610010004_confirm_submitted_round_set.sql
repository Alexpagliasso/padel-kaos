-- Advance a whole round after every court submitted its canonical set result.
-- Submission closes the court result; this RPC owns only the global phase change.
begin;

create or replace function public.confirm_submitted_round_set(
  p_round_id uuid,p_set_number integer
) returns setof public.matches language plpgsql security definer
set search_path=pg_catalog,pg_temp as $$
declare v_round public.rounds;v_match public.matches;v_now timestamptz:=clock_timestamp();
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_set_number not in (1,2) then raise exception 'invalid set number'; end if;
  select * into v_round from public.rounds where id=p_round_id for update;
  if not found then raise exception 'round not found'; end if;
  if not public.live_admin_authorized(v_round.tournament_id) then raise exception 'not authorized'; end if;
  perform m.id from public.matches m where m.round_id=p_round_id order by m.id for update;
  if not found then raise exception 'round has no matches'; end if;

  if p_set_number=1 then
    if exists(select 1 from public.matches m where m.round_id=p_round_id and
      (m.set_1_result_submitted_at is null or not public.has_valid_completed_set_result(m.id,1))) then
      raise exception 'set 1 results are incomplete';
    end if;
    if exists(select 1 from public.matches m where m.round_id=p_round_id and m.set_2_started_at is not null) then
      raise exception 'round already advanced past set 1';
    end if;
    update public.matches set status='set_break'::public.match_status,current_set=2,
      active_set_duration_minutes=null,updated_at=v_now
    where round_id=p_round_id and status='set_1'::public.match_status;
    update public.rounds set status='set_break'::public.round_status where id=p_round_id;
  else
    if exists(select 1 from public.matches m where m.round_id=p_round_id and
      (m.set_2_result_submitted_at is null or not public.has_valid_completed_set_result(m.id,2))) then
      raise exception 'set 2 results are incomplete';
    end if;
    for v_match in select * from public.matches where round_id=p_round_id order by id loop
      perform public.recalculate_match_set_wins(v_match.id);
      update public.matches set
        status=case when sets_a=sets_b then 'super_tiebreak'::public.match_status else 'completed'::public.match_status end,
        current_set=case when sets_a=sets_b then 3 else 2 end,
        active_set_duration_minutes=null,
        completed_at=case when sets_a=sets_b then null else coalesce(completed_at,v_now) end,
        updated_at=v_now
      where id=v_match.id;
    end loop;
    perform public.sync_round_completion(p_round_id);
  end if;
  return query select * from public.matches where round_id=p_round_id order by court_id,id;
end; $$;

revoke execute on function public.confirm_submitted_round_set(uuid,integer) from public,anon;
grant execute on function public.confirm_submitted_round_set(uuid,integer) to authenticated;

commit;
