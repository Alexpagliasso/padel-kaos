-- Atomic referee scoring and Team-to-referee card request lifecycle.
begin;

alter table public.matches
  add column score_updated_at timestamptz,
  add column score_updated_by uuid references public.profiles(id),
  add column score_update_source text
    check (score_update_source is null or score_update_source in ('game', 'manual'));

alter table public.card_usages
  add column confirmed_at timestamptz,
  add column rejected_at timestamptz;

-- Preserve the final timed-set score on the explicit lifecycle transition,
-- then clear only the current-game counters when Set 2 actually starts.
create or replace function public.persist_timed_set_score_transition()
returns trigger language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare v_set integer;
begin
  if old.status='set_1'::public.match_status and new.status='set_break'::public.match_status then v_set:=1;
  elsif old.status='set_2'::public.match_status and new.status='super_tiebreak'::public.match_status then v_set:=2;
  elsif old.status='set_break'::public.match_status and new.status='set_2'::public.match_status then
    new.games_a:=0; new.games_b:=0; return new;
  else return new;
  end if;
  if old.games_a>old.games_b then new.sets_a:=old.sets_a+1;
  elsif old.games_b>old.games_a then new.sets_b:=old.sets_b+1;
  end if;
  insert into public.match_events(tournament_id,round_id,match_id,type,payload,actor_user_id)
  values(old.tournament_id,old.round_id,old.id,'SET_ENDED'::public.match_event_type,
    jsonb_build_object('set_number',v_set,'games_a',old.games_a,'games_b',old.games_b),auth.uid());
  return new;
end; $$;
create trigger matches_persist_timed_set_score
before update of status on public.matches for each row execute function public.persist_timed_set_score_transition();

create or replace function public.increment_match_set_game(p_match_id uuid, p_team_id uuid)
returns public.matches
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare v_match public.matches;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select m.* into v_match from public.matches m where m.id=p_match_id for update;
  if not found then raise exception 'match not found'; end if;
  if v_match.status not in ('set_1'::public.match_status,'set_2'::public.match_status) then
    raise exception 'set is not active';
  end if;
  if p_team_id not in (v_match.team_a_id,v_match.team_b_id) then raise exception 'team is not in match'; end if;
  perform p.id from public.profiles p
  where p.id=auth.uid() and (
    (p.role='referee'::public.app_role and p.tournament_id=v_match.tournament_id and exists (
      select 1 from public.referee_court_assignments rca where rca.referee_user_id=p.id
        and rca.tournament_id=v_match.tournament_id and rca.court_id=v_match.court_id
    )) or (p.role='admin'::public.app_role and exists (
      select 1 from public.tournament_admins ta where ta.user_id=p.id and ta.tournament_id=v_match.tournament_id
    ))
  ) for share;
  if not found then raise exception 'not authorized for court'; end if;
  update public.matches set
    games_a=games_a+case when p_team_id=team_a_id then 1 else 0 end,
    games_b=games_b+case when p_team_id=team_b_id then 1 else 0 end,
    score_updated_at=clock_timestamp(), score_updated_by=auth.uid(), score_update_source='game', updated_at=clock_timestamp()
  where id=p_match_id returning * into v_match;
  insert into public.match_events(tournament_id,round_id,match_id,type,payload,actor_user_id)
  values(v_match.tournament_id,v_match.round_id,v_match.id,'GAME_WON'::public.match_event_type,
    jsonb_build_object('team_id',p_team_id,'set_number',v_match.current_set,'games_a',v_match.games_a,'games_b',v_match.games_b),auth.uid());
  return v_match;
end; $$;

create or replace function public.set_match_set_score(p_match_id uuid, p_games_a integer, p_games_b integer)
returns public.matches
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare v_match public.matches; v_old_a integer; v_old_b integer;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_games_a is null or p_games_b is null or p_games_a<0 or p_games_b<0 or p_games_a>99 or p_games_b>99 then
    raise exception 'invalid game score';
  end if;
  select m.* into v_match from public.matches m where m.id=p_match_id for update;
  if not found then raise exception 'match not found'; end if;
  if v_match.status not in ('set_1'::public.match_status,'set_2'::public.match_status) then raise exception 'set is not active'; end if;
  perform p.id from public.profiles p where p.id=auth.uid() and (
    (p.role='referee'::public.app_role and p.tournament_id=v_match.tournament_id and exists (select 1 from public.referee_court_assignments rca
      where rca.referee_user_id=p.id and rca.tournament_id=v_match.tournament_id and rca.court_id=v_match.court_id))
    or (p.role='admin'::public.app_role and exists (select 1 from public.tournament_admins ta
      where ta.user_id=p.id and ta.tournament_id=v_match.tournament_id))
  ) for share;
  if not found then raise exception 'not authorized for court'; end if;
  v_old_a:=v_match.games_a; v_old_b:=v_match.games_b;
  update public.matches set games_a=p_games_a,games_b=p_games_b,score_updated_at=clock_timestamp(),
    score_updated_by=auth.uid(),score_update_source='manual',updated_at=clock_timestamp()
  where id=p_match_id returning * into v_match;
  insert into public.match_events(tournament_id,round_id,match_id,type,payload,actor_user_id)
  values(v_match.tournament_id,v_match.round_id,v_match.id,'SCORE_CORRECTED'::public.match_event_type,
    jsonb_build_object('set_number',v_match.current_set,'from_a',v_old_a,'from_b',v_old_b,'games_a',p_games_a,'games_b',p_games_b,'source','manual'),auth.uid());
  return v_match;
end; $$;

create or replace function public.request_match_card_use(p_match_card_id uuid)
returns public.match_cards
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare v_card public.match_cards; v_match public.matches; v_definition public.card_definitions;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select mc.* into v_card from public.match_cards mc where mc.id=p_match_card_id for update;
  if not found then raise exception 'card not found'; end if;
  if v_card.status<>'available'::public.card_status then raise exception 'card not available'; end if;
  select m.* into v_match from public.matches m where m.id=v_card.match_id for share;
  select cd.* into v_definition from public.card_definitions cd where cd.id=v_card.card_definition_id;
  if v_match.status not in ('set_1'::public.match_status,'set_2'::public.match_status,'super_tiebreak'::public.match_status) then
    raise exception 'match is not live';
  end if;
  perform p.id from public.profiles p where p.id=auth.uid() and p.tournament_id=v_match.tournament_id
    and p.role='team'::public.app_role and p.team_id=v_card.team_id for share;
  if not found or v_card.team_id not in (v_match.team_a_id,v_match.team_b_id) then raise exception 'not authorized'; end if;
  if exists(select 1 from public.rounds r where r.id=v_match.round_id and r.dice_started_at is not null
    and r.dice_ends_at is not null and statement_timestamp()>=r.dice_started_at and statement_timestamp()<r.dice_ends_at) then
    raise exception 'cards blocked during global dice effect';
  end if;
  if exists(select 1 from public.match_cards mc join public.card_definitions cd on cd.id=mc.card_definition_id
    where mc.match_id=v_match.id and mc.team_id=v_card.team_id and mc.status in ('pending'::public.card_status,'active'::public.card_status)
      and mc.id<>v_card.id and cd.duration_type<>'instant'::public.card_duration_type) then
    raise exception 'team already has active persistent card';
  end if;
  update public.match_cards set status='pending'::public.card_status,used_in_set=v_match.current_set where id=v_card.id returning * into v_card;
  insert into public.card_usages(match_card_id,match_id,team_id,requested_by,payload)
    values(v_card.id,v_card.match_id,v_card.team_id,auth.uid(),jsonb_build_object('requested_at',clock_timestamp()));
  insert into public.match_events(tournament_id,round_id,match_id,type,payload,actor_user_id)
    values(v_match.tournament_id,v_match.round_id,v_match.id,'CARD_PLAYED'::public.match_event_type,
      jsonb_build_object('match_card_id',v_card.id,'card_definition_id',v_card.card_definition_id,'team_id',v_card.team_id),auth.uid());
  return v_card;
end; $$;

create or replace function public.confirm_match_card_use(p_match_card_id uuid, p_selected_player_id uuid default null)
returns public.match_cards
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare v_card public.match_cards; v_match public.matches; v_definition public.card_definitions; v_now timestamptz:=clock_timestamp();
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select mc.* into v_card from public.match_cards mc where mc.id=p_match_card_id for update;
  if not found or v_card.status<>'pending'::public.card_status then raise exception 'card is not pending'; end if;
  select m.* into v_match from public.matches m where m.id=v_card.match_id for share;
  select cd.* into v_definition from public.card_definitions cd where cd.id=v_card.card_definition_id;
  perform p.id from public.profiles p where p.id=auth.uid() and (
    (p.role='referee'::public.app_role and p.tournament_id=v_match.tournament_id and exists(select 1 from public.referee_court_assignments rca
      where rca.referee_user_id=p.id and rca.tournament_id=v_match.tournament_id and rca.court_id=v_match.court_id))
    or (p.role='admin'::public.app_role and exists(select 1 from public.tournament_admins ta
      where ta.user_id=p.id and ta.tournament_id=v_match.tournament_id))
  ) for share;
  if not found then raise exception 'not authorized for court'; end if;
  if v_match.status not in ('set_1'::public.match_status,'set_2'::public.match_status,'super_tiebreak'::public.match_status) then raise exception 'match is not live'; end if;
  if lower(v_definition.name)='il prescelto' or v_definition.slug='il-prescelto' then
    if p_selected_player_id is null or not exists(select 1 from public.match_lineups ml
      where ml.match_id=v_match.id and ml.team_id=v_card.team_id and ml.set_number=v_match.current_set
        and p_selected_player_id in (ml.active_player_1_id,ml.active_player_2_id)) then
      raise exception 'selected player is not in active lineup';
    end if;
  end if;
  update public.match_cards set status=case when v_definition.duration_type='instant'::public.card_duration_type then 'used'::public.card_status else 'active'::public.card_status end,
    activated_at=v_now,expires_at=case when v_definition.duration_type='timed'::public.card_duration_type then v_now+make_interval(secs=>v_definition.duration_value) else null end,
    remaining_games=case when v_definition.duration_type='games'::public.card_duration_type then v_definition.duration_value else null end
  where id=v_card.id returning * into v_card;
  update public.card_usages set confirmed_by=auth.uid(),confirmed_at=v_now,resolved_at=case when v_definition.duration_type='instant'::public.card_duration_type then v_now else null end,
    payload=payload||jsonb_build_object('selected_player_id',p_selected_player_id,'activated_at',v_now,'expires_at',v_card.expires_at)
  where id=(select cu.id from public.card_usages cu where cu.match_card_id=v_card.id and cu.resolved_at is null order by cu.created_at desc limit 1);
  insert into public.match_events(tournament_id,round_id,match_id,type,payload,actor_user_id)
    values(v_match.tournament_id,v_match.round_id,v_match.id,'CARD_ACTIVATED'::public.match_event_type,
      jsonb_build_object('match_card_id',v_card.id,'team_id',v_card.team_id,'selected_player_id',p_selected_player_id,'activated_at',v_now,'expires_at',v_card.expires_at),auth.uid());
  return v_card;
end; $$;

create or replace function public.reject_match_card_use(p_match_card_id uuid)
returns public.match_cards language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare v_card public.match_cards; v_match public.matches; v_now timestamptz:=clock_timestamp();
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
    where id=(select cu.id from public.card_usages cu where cu.match_card_id=v_card.id and cu.resolved_at is null order by cu.created_at desc limit 1);
  return v_card;
end; $$;

drop policy if exists card_usages_read on public.card_usages;
create policy card_usages_read on public.card_usages for select to authenticated using (exists(
  select 1 from public.matches m join public.profiles p on p.id=auth.uid()
  where m.id=card_usages.match_id and (
    (p.role='team'::public.app_role and p.team_id=card_usages.team_id)
    or (p.role='referee'::public.app_role and p.tournament_id=m.tournament_id and exists(select 1 from public.referee_court_assignments rca where rca.referee_user_id=p.id and rca.tournament_id=m.tournament_id and rca.court_id=m.court_id))
    or (p.role='admin'::public.app_role and exists(select 1 from public.tournament_admins ta where ta.user_id=p.id and ta.tournament_id=m.tournament_id))
  )
));

-- All operational writes go through the validated RPCs above.
drop policy if exists matches_referee_update on public.matches;
drop policy if exists card_usages_insert_team on public.card_usages;

revoke execute on function public.increment_match_set_game(uuid,uuid) from public,anon;
revoke execute on function public.persist_timed_set_score_transition() from public;
revoke execute on function public.set_match_set_score(uuid,integer,integer) from public,anon;
revoke execute on function public.request_match_card_use(uuid) from public,anon;
revoke execute on function public.confirm_match_card_use(uuid,uuid) from public,anon;
revoke execute on function public.reject_match_card_use(uuid) from public,anon;
grant execute on function public.increment_match_set_game(uuid,uuid) to authenticated;
grant execute on function public.set_match_set_score(uuid,integer,integer) to authenticated;
grant execute on function public.request_match_card_use(uuid) to authenticated;
grant execute on function public.confirm_match_card_use(uuid,uuid) to authenticated;
grant execute on function public.reject_match_card_use(uuid) to authenticated;
revoke execute on function public.play_card(uuid) from authenticated;
revoke execute on function public.activate_card(uuid) from authenticated;

do $$ begin
  if exists(select 1 from pg_catalog.pg_publication where pubname='supabase_realtime') then
    if not exists(select 1 from pg_catalog.pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='matches') then alter publication supabase_realtime add table public.matches; end if;
    if not exists(select 1 from pg_catalog.pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='match_cards') then alter publication supabase_realtime add table public.match_cards; end if;
    if not exists(select 1 from pg_catalog.pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='card_usages') then alter publication supabase_realtime add table public.card_usages; end if;
  end if;
end $$;

commit;
