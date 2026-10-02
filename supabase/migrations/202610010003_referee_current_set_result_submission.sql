-- Let a court submit the result of its current expired set without advancing
-- the round. Global status transitions remain owned by control_round_set.
begin;

create or replace function public.submit_current_match_set_result(
  p_match_id uuid,p_set_number integer,p_games_a integer,p_games_b integer
) returns public.matches language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare v_match public.matches;v_deadline timestamptz;v_now timestamptz:=clock_timestamp();
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_set_number not in (1,2) or p_games_a is null or p_games_b is null
    or p_games_a<0 or p_games_b<0 or p_games_a>99 or p_games_b>99 or p_games_a=p_games_b then
    raise exception 'invalid completed set result';
  end if;
  select * into v_match from public.matches where id=p_match_id for update;
  if not found then raise exception 'match not found'; end if;
  perform p.id from public.profiles p where p.id=auth.uid() and (
    (p.role='referee'::public.app_role and p.tournament_id=v_match.tournament_id and
      public.can_referee_access_court(p.id,v_match.tournament_id,v_match.court_id))
    or (p.role='admin'::public.app_role and public.is_admin_for(v_match.tournament_id))
  ) for share;
  if not found then raise exception 'not authorized for court'; end if;
  if (p_set_number=1 and v_match.set_1_result_submitted_at is not null)
    or (p_set_number=2 and v_match.set_2_result_submitted_at is not null) then
    return v_match;
  end if;
  if (p_set_number=1 and v_match.set_1_started_at is null)
    or (p_set_number=2 and v_match.set_2_started_at is null) then raise exception 'set has not started'; end if;
  if (p_set_number=1 and v_match.current_set<>1)
    or (p_set_number=2 and v_match.current_set<>2) then raise exception 'set is not the current phase'; end if;
  v_deadline:=case when p_set_number=1 then v_match.set_1_started_at else v_match.set_2_started_at end
    +make_interval(mins=>coalesce(v_match.active_set_duration_minutes,public.effective_round_set_duration(v_match.round_id)));
  if (p_set_number=1 and v_match.set_1_ended_at is null and statement_timestamp()<v_deadline)
    or (p_set_number=2 and v_match.set_2_ended_at is null and statement_timestamp()<v_deadline) then
    raise exception 'set deadline has not elapsed';
  end if;
  perform public.persist_completed_set_result(v_match,p_set_number,p_games_a,p_games_b,auth.uid());
  update public.matches set games_a=p_games_a,games_b=p_games_b,
    set_1_ended_at=case when p_set_number=1 then coalesce(set_1_ended_at,v_deadline) else set_1_ended_at end,
    set_2_ended_at=case when p_set_number=2 then coalesce(set_2_ended_at,v_deadline) else set_2_ended_at end,
    set_1_result_submitted_at=case when p_set_number=1 then v_now else set_1_result_submitted_at end,
    set_2_result_submitted_at=case when p_set_number=2 then v_now else set_2_result_submitted_at end,
    updated_at=v_now where id=p_match_id returning * into v_match;
  perform public.recalculate_match_set_wins(p_match_id);
  perform public.sync_round_completion(v_match.round_id);
  select * into v_match from public.matches where id=p_match_id;
  return v_match;
end; $$;

revoke execute on function public.submit_current_match_set_result(uuid,integer,integer,integer) from public,anon;
grant execute on function public.submit_current_match_set_result(uuid,integer,integer,integer) to authenticated;

commit;
