-- Add semantic live-event facts to the existing match/tournament event channels.
-- Canonical tables remain the source of truth; these rows only drive audit and presentation.
begin;

alter type public.match_event_type add value if not exists 'ROUND_STARTED';
alter type public.match_event_type add value if not exists 'SET_1_STARTED';
alter type public.match_event_type add value if not exists 'SET_2_STARTED';
alter type public.match_event_type add value if not exists 'TIME_EXPIRED';
alter type public.match_event_type add value if not exists 'SET_RESULT_SUBMITTED';
alter type public.match_event_type add value if not exists 'SUPER_TIEBREAK_REQUIRED';
alter type public.match_event_type add value if not exists 'CARD_REJECTED';
alter type public.match_event_type add value if not exists 'ROUND_COMPLETED';

commit;
begin;

create or replace function public.emit_match_lifecycle_events()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,pg_temp
as $$
declare
  v_result jsonb;
begin
  if old.set_1_started_at is null and new.set_1_started_at is not null then
    insert into public.match_events(tournament_id,round_id,match_id,type,payload,actor_user_id,created_at)
    values(new.tournament_id,new.round_id,new.id,'SET_1_STARTED'::public.match_event_type,
      jsonb_build_object('set_number',1,'started_at',new.set_1_started_at),auth.uid(),new.set_1_started_at);
  end if;

  if old.set_2_started_at is null and new.set_2_started_at is not null then
    insert into public.match_events(tournament_id,round_id,match_id,type,payload,actor_user_id,created_at)
    values(new.tournament_id,new.round_id,new.id,'SET_2_STARTED'::public.match_event_type,
      jsonb_build_object('set_number',2,'started_at',new.set_2_started_at),auth.uid(),new.set_2_started_at);
  end if;

  if old.set_1_result_submitted_at is null and new.set_1_result_submitted_at is not null then
    select jsonb_build_object('set_number',1,'games_a',me.payload->'games_a','games_b',me.payload->'games_b','submitted_at',new.set_1_result_submitted_at)
      into v_result from public.match_events me
      where me.match_id=new.id and me.type='SET_ENDED'::public.match_event_type and me.payload->>'set_number'='1'
      order by me.created_at desc,me.id desc limit 1;
    insert into public.match_events(tournament_id,round_id,match_id,type,payload,actor_user_id,created_at)
    values(new.tournament_id,new.round_id,new.id,'SET_RESULT_SUBMITTED'::public.match_event_type,
      coalesce(v_result,jsonb_build_object('set_number',1,'submitted_at',new.set_1_result_submitted_at)),auth.uid(),new.set_1_result_submitted_at);
  end if;

  if old.set_2_result_submitted_at is null and new.set_2_result_submitted_at is not null then
    select jsonb_build_object('set_number',2,'games_a',me.payload->'games_a','games_b',me.payload->'games_b','submitted_at',new.set_2_result_submitted_at)
      into v_result from public.match_events me
      where me.match_id=new.id and me.type='SET_ENDED'::public.match_event_type and me.payload->>'set_number'='2'
      order by me.created_at desc,me.id desc limit 1;
    insert into public.match_events(tournament_id,round_id,match_id,type,payload,actor_user_id,created_at)
    values(new.tournament_id,new.round_id,new.id,'SET_RESULT_SUBMITTED'::public.match_event_type,
      coalesce(v_result,jsonb_build_object('set_number',2,'submitted_at',new.set_2_result_submitted_at)),auth.uid(),new.set_2_result_submitted_at);
  end if;

  if old.status is distinct from new.status and new.status='super_tiebreak'::public.match_status then
    insert into public.match_events(tournament_id,round_id,match_id,type,payload,actor_user_id)
    values(new.tournament_id,new.round_id,new.id,'SUPER_TIEBREAK_REQUIRED'::public.match_event_type,
      jsonb_build_object('sets_a',new.sets_a,'sets_b',new.sets_b),auth.uid());
  end if;
  return new;
end;
$$;

create trigger matches_emit_live_lifecycle_events
after update of status,set_1_started_at,set_2_started_at,set_1_result_submitted_at,set_2_result_submitted_at on public.matches
for each row execute function public.emit_match_lifecycle_events();

create or replace function public.emit_round_lifecycle_events()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,pg_temp
as $$
begin
  if (old.opened_at is null and new.opened_at is not null)
     or (old.status='scheduled'::public.round_status and new.status='set_1'::public.round_status) then
    if not exists(select 1 from public.tournament_events te where te.round_id=new.id and te.type='ROUND_STARTED'::public.match_event_type) then
      insert into public.tournament_events(tournament_id,round_id,type,payload,actor_user_id,created_at)
      values(new.tournament_id,new.id,'ROUND_STARTED'::public.match_event_type,
        jsonb_build_object('round_id',new.id,'sequence',new.sequence),auth.uid(),coalesce(new.opened_at,clock_timestamp()));
    end if;
  end if;
  if old.status is distinct from new.status and new.status='completed'::public.round_status then
    insert into public.tournament_events(tournament_id,round_id,type,payload,actor_user_id)
    values(new.tournament_id,new.id,'ROUND_COMPLETED'::public.match_event_type,
      jsonb_build_object('round_id',new.id,'sequence',new.sequence,'completed_matches',new.completion_completed_matches),auth.uid());
  end if;
  return new;
end;
$$;

create trigger rounds_emit_live_lifecycle_events
after update of opened_at,status on public.rounds
for each row execute function public.emit_round_lifecycle_events();

create or replace function public.expire_timed_match_set(p_match_id uuid)
returns public.matches language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare v_match public.matches;v_deadline timestamptz;v_action text;v_set integer;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select * into v_match from public.matches where id=p_match_id for update;
  if not found then raise exception 'match not found'; end if;
  if v_match.status not in ('set_1','set_2') then return v_match; end if;
  perform p.id from public.profiles p where p.id=auth.uid() and (
    (p.role='admin'::public.app_role and exists(select 1 from public.tournament_admins ta where ta.user_id=p.id and ta.tournament_id=v_match.tournament_id))
    or (p.role='referee'::public.app_role and p.tournament_id=v_match.tournament_id and exists(select 1 from public.referee_court_assignments rca where rca.referee_user_id=p.id and rca.tournament_id=v_match.tournament_id and rca.court_id=v_match.court_id))
    or (p.role='court_display'::public.app_role and p.tournament_id=v_match.tournament_id and p.court_id=v_match.court_id)
    or (p.role='main_display'::public.app_role and p.tournament_id=v_match.tournament_id)
  ) for share;
  if not found then raise exception 'not authorized'; end if;
  v_set:=case when v_match.status='set_1' then 1 else 2 end;
  v_deadline:=case when v_set=1 then v_match.set_1_started_at else v_match.set_2_started_at end
    +make_interval(mins=>coalesce(v_match.active_set_duration_minutes,public.effective_round_set_duration(v_match.round_id)));
  if statement_timestamp()<v_deadline then raise exception 'set deadline has not elapsed'; end if;
  v_action:=case when v_set=1 then 'end_set_1' else 'end_set_2' end;
  select public.apply_match_set_action(v_match.id,v_action,v_deadline) into v_match;
  insert into public.match_events(tournament_id,round_id,match_id,type,payload,actor_user_id,created_at)
  values(v_match.tournament_id,v_match.round_id,v_match.id,'TIME_EXPIRED'::public.match_event_type,
    jsonb_build_object('set_number',v_set,'expired_at',v_deadline),auth.uid(),v_deadline);
  return v_match;
end;
$$;

create or replace function public.reject_match_card_use(p_match_card_id uuid)
returns public.match_cards language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare v_card public.match_cards;v_match public.matches;v_now timestamptz:=clock_timestamp();v_usage_id uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select mc.* into v_card from public.match_cards mc where mc.id=p_match_card_id for update;
  if not found or v_card.status<>'pending'::public.card_status then raise exception 'card is not pending'; end if;
  select m.* into v_match from public.matches m where m.id=v_card.match_id;
  perform p.id from public.profiles p where p.id=auth.uid() and (
    (p.role='referee'::public.app_role and p.tournament_id=v_match.tournament_id and exists(select 1 from public.referee_court_assignments rca where rca.referee_user_id=p.id and rca.tournament_id=v_match.tournament_id and rca.court_id=v_match.court_id))
    or (p.role='admin'::public.app_role and exists(select 1 from public.tournament_admins ta where ta.user_id=p.id and ta.tournament_id=v_match.tournament_id))
  ) for share;
  if not found then raise exception 'not authorized for court'; end if;
  update public.match_cards set status='cancelled'::public.card_status where id=v_card.id returning * into v_card;
  update public.card_usages set rejected_at=v_now,resolved_at=v_now,payload=payload||jsonb_build_object('rejected_at',v_now)
    where id=(select cu.id from public.card_usages cu where cu.match_card_id=v_card.id and cu.resolved_at is null order by cu.created_at desc limit 1)
    returning id into v_usage_id;
  insert into public.match_events(tournament_id,round_id,match_id,type,payload,actor_user_id,created_at)
  values(v_match.tournament_id,v_match.round_id,v_match.id,'CARD_REJECTED'::public.match_event_type,
    jsonb_build_object('card_usage_id',v_usage_id,'match_card_id',v_card.id,'team_id',v_card.team_id),auth.uid(),v_now);
  return v_card;
end;
$$;

do $$ begin
  if exists(select 1 from pg_catalog.pg_publication where pubname='supabase_realtime')
     and not exists(select 1 from pg_catalog.pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='tournament_events') then
    alter publication supabase_realtime add table public.tournament_events;
  end if;
end $$;

revoke execute on function public.emit_match_lifecycle_events() from public;
revoke execute on function public.emit_round_lifecycle_events() from public;
revoke execute on function public.expire_timed_match_set(uuid) from public,anon;
revoke execute on function public.reject_match_card_use(uuid) from public,anon;
grant execute on function public.expire_timed_match_set(uuid) to authenticated;
grant execute on function public.reject_match_card_use(uuid) to authenticated;

commit;
