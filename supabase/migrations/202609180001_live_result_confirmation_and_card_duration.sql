-- Finalize referee results, expose only the played pending card, and normalize timed-card units.
begin;

alter table public.matches
  add column if not exists result_confirmed_at timestamptz,
  add column if not exists result_confirmed_by uuid references public.profiles(id);

-- The Admin UI has always labelled duration_value as minutes. Earlier RPCs
-- interpreted that stored integer as seconds, so normalize existing timed cards.
update public.card_definitions
set duration_value = duration_value * 60, updated_at = clock_timestamp()
where duration_type = 'timed'::public.card_duration_type
  and duration_value is not null;

create or replace function public.set_match_super_tiebreak_score(
  p_match_id uuid,p_score_a integer,p_score_b integer
) returns public.matches language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare v_match public.matches;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_score_a is null or p_score_b is null or p_score_a<0 or p_score_b<0 or p_score_a>99 or p_score_b>99 then raise exception 'invalid super tie-break score'; end if;
  select m.* into v_match from public.matches m where m.id=p_match_id for update;
  if not found then raise exception 'match not found'; end if;
  if v_match.status<>'super_tiebreak'::public.match_status or v_match.result_confirmed_at is not null then raise exception 'super tie-break is not editable'; end if;
  perform p.id from public.profiles p where p.id=auth.uid() and (
    (p.role='referee'::public.app_role and p.tournament_id=v_match.tournament_id and exists(select 1 from public.referee_court_assignments rca where rca.referee_user_id=p.id and rca.tournament_id=v_match.tournament_id and rca.court_id=v_match.court_id))
    or (p.role='admin'::public.app_role and exists(select 1 from public.tournament_admins ta where ta.user_id=p.id and ta.tournament_id=v_match.tournament_id))
  ) for share;
  if not found then raise exception 'not authorized for court'; end if;
  update public.matches set super_tiebreak_team_a=p_score_a,super_tiebreak_team_b=p_score_b,score_updated_at=clock_timestamp(),score_updated_by=auth.uid(),score_update_source='manual',updated_at=clock_timestamp()
  where id=p_match_id returning * into v_match;
  insert into public.match_events(tournament_id,round_id,match_id,type,payload,actor_user_id)
  values(v_match.tournament_id,v_match.round_id,v_match.id,'SCORE_CORRECTED'::public.match_event_type,jsonb_build_object('score_type','super_tiebreak','score_a',p_score_a,'score_b',p_score_b),auth.uid());
  return v_match;
end; $$;

create or replace function public.confirm_match_final_result(p_match_id uuid)
returns public.matches language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare v_match public.matches; v_a integer; v_b integer;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select m.* into v_match from public.matches m where m.id=p_match_id for update;
  if not found then raise exception 'match not found'; end if;
  perform p.id from public.profiles p where p.id=auth.uid() and (
    (p.role='referee'::public.app_role and p.tournament_id=v_match.tournament_id and exists(select 1 from public.referee_court_assignments rca where rca.referee_user_id=p.id and rca.tournament_id=v_match.tournament_id and rca.court_id=v_match.court_id))
    or (p.role='admin'::public.app_role and exists(select 1 from public.tournament_admins ta where ta.user_id=p.id and ta.tournament_id=v_match.tournament_id))
  ) for share;
  if not found then raise exception 'not authorized for court'; end if;
  if v_match.result_confirmed_at is not null then raise exception 'result already confirmed'; end if;
  if v_match.set_1_ended_at is null or v_match.set_2_ended_at is null
     or not public.has_valid_completed_set_result(v_match.id,1)
     or not public.has_valid_completed_set_result(v_match.id,2) then raise exception 'completed set results are missing'; end if;
  select count(*) filter(where (me.payload->>'games_a')::int>(me.payload->>'games_b')::int),
         count(*) filter(where (me.payload->>'games_b')::int>(me.payload->>'games_a')::int)
  into v_a,v_b from public.match_events me where me.match_id=v_match.id and me.type='SET_ENDED'::public.match_event_type
    and (me.payload->>'set_number') ~ '^[12]$' and (me.payload->>'games_a') ~ '^[0-9]+$' and (me.payload->>'games_b') ~ '^[0-9]+$';
  if v_a=v_b and (v_match.super_tiebreak_team_a is null or v_match.super_tiebreak_team_b is null or v_match.super_tiebreak_team_a=v_match.super_tiebreak_team_b) then
    raise exception 'valid super tie-break result is required';
  end if;
  update public.matches set status='completed'::public.match_status,completed_at=clock_timestamp(),
    result_confirmed_at=clock_timestamp(),result_confirmed_by=auth.uid(),updated_at=clock_timestamp()
  where id=v_match.id returning * into v_match;
  insert into public.match_events(tournament_id,round_id,match_id,type,payload,actor_user_id)
  values(v_match.tournament_id,v_match.round_id,v_match.id,'MATCH_ENDED'::public.match_event_type,
    jsonb_build_object('result_confirmed_at',v_match.result_confirmed_at,'sets_a',v_match.sets_a,'sets_b',v_match.sets_b,'super_tiebreak_a',v_match.super_tiebreak_team_a,'super_tiebreak_b',v_match.super_tiebreak_team_b),auth.uid());
  return v_match;
end; $$;

drop policy if exists match_cards_read_private on public.match_cards;
create policy match_cards_read_private on public.match_cards for select to authenticated using (exists (
  select 1 from public.matches m join public.profiles p on p.id=auth.uid()
  where m.id=match_cards.match_id and (
    (p.role='admin'::public.app_role and exists(select 1 from public.tournament_admins ta where ta.user_id=p.id and ta.tournament_id=m.tournament_id))
    or (p.role='team'::public.app_role and p.tournament_id=m.tournament_id and (p.team_id=match_cards.team_id or (p.team_id in(m.team_a_id,m.team_b_id) and match_cards.status in ('pending'::public.card_status,'active'::public.card_status))))
    or (p.role='referee'::public.app_role and p.tournament_id=m.tournament_id and public.can_referee_access_court(p.id,m.tournament_id,m.court_id) and match_cards.status<>'available'::public.card_status)
    or (p.role='court_display'::public.app_role and p.tournament_id=m.tournament_id and p.court_id=m.court_id and match_cards.status='active'::public.card_status)
    or (p.role='main_display'::public.app_role and p.tournament_id=m.tournament_id and match_cards.status='active'::public.card_status)
  )
));

drop policy if exists match_events_read on public.match_events;
create policy match_events_read on public.match_events for select to authenticated using (exists (
  select 1 from public.matches m join public.profiles p on p.id=auth.uid()
  where m.id=match_events.match_id and (
    (p.role='admin'::public.app_role and exists(select 1 from public.tournament_admins ta where ta.user_id=p.id and ta.tournament_id=m.tournament_id))
    or (p.role='main_display'::public.app_role and p.tournament_id=m.tournament_id)
    or (p.role='team'::public.app_role and p.tournament_id=m.tournament_id and p.team_id in(m.team_a_id,m.team_b_id))
    or (p.role='referee'::public.app_role and p.tournament_id=m.tournament_id and public.can_referee_access_court(p.id,m.tournament_id,m.court_id))
    or (p.role='court_display'::public.app_role and p.tournament_id=m.tournament_id and p.court_id=m.court_id)
  )
));

revoke execute on function public.set_match_super_tiebreak_score(uuid,integer,integer) from public,anon;
revoke execute on function public.confirm_match_final_result(uuid) from public,anon;
grant execute on function public.set_match_super_tiebreak_score(uuid,integer,integer) to authenticated;
grant execute on function public.confirm_match_final_result(uuid) to authenticated;

do $$ begin
  if exists(select 1 from pg_catalog.pg_publication where pubname='supabase_realtime') then
    if not exists(select 1 from pg_catalog.pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='rounds') then alter publication supabase_realtime add table public.rounds; end if;
    if not exists(select 1 from pg_catalog.pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='match_events') then alter publication supabase_realtime add table public.match_events; end if;
    if not exists(select 1 from pg_catalog.pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='match_lineups') then alter publication supabase_realtime add table public.match_lineups; end if;
  end if;
end $$;
commit;
