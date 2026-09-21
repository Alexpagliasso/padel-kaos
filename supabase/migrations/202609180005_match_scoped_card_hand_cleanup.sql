-- Close every match-scoped card hand when the final result is confirmed.
begin;

create or replace function public.close_match_card_hand(
  p_match_id uuid,
  p_closed_at timestamptz default clock_timestamp()
)
returns void
language plpgsql
security definer
set search_path=pg_catalog,pg_temp
as $$
declare
  v_closed_at timestamptz:=coalesce(p_closed_at,clock_timestamp());
begin
  -- Pending requests are rejected so they cannot remain actionable for a referee.
  update public.card_usages cu set
    rejected_at=coalesce(cu.rejected_at,v_closed_at),
    resolved_at=coalesce(cu.resolved_at,v_closed_at),
    payload=cu.payload||jsonb_build_object(
      'closed_at',v_closed_at,
      'closed_reason','match_completed'
    )
  where cu.match_id=p_match_id
    and cu.resolved_at is null
    and exists(
      select 1 from public.match_cards mc
      where mc.id=cu.match_card_id
        and mc.match_id=p_match_id
        and mc.status='pending'::public.card_status
    );

  -- Active persistent effects end with the match while their activation history remains.
  update public.card_usages cu set
    resolved_at=coalesce(cu.resolved_at,v_closed_at),
    payload=cu.payload||jsonb_build_object(
      'closed_at',v_closed_at,
      'closed_reason','match_completed'
    )
  where cu.match_id=p_match_id
    and cu.resolved_at is null
    and exists(
      select 1 from public.match_cards mc
      where mc.id=cu.match_card_id
        and mc.match_id=p_match_id
        and mc.status='active'::public.card_status
    );

  -- card_status already provides coherent terminal states. Keep every row attached
  -- to its original match so assignment readiness and match history stay intact.
  update public.match_cards mc set
    status=case
      when mc.status='pending'::public.card_status then 'cancelled'::public.card_status
      else 'expired'::public.card_status
    end
  where mc.match_id=p_match_id
    and mc.status in (
      'available'::public.card_status,
      'pending'::public.card_status,
      'active'::public.card_status
    );
end;
$$;

create or replace function public.close_match_card_hand_after_confirmation()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,pg_temp
as $$
begin
  if old.result_confirmed_at is null and new.result_confirmed_at is not null then
    perform public.close_match_card_hand(new.id,new.result_confirmed_at);
  end if;
  return new;
end;
$$;

create trigger matches_close_card_hand_after_confirmation
after update of result_confirmed_at on public.matches
for each row
when (old.result_confirmed_at is null and new.result_confirmed_at is not null)
execute function public.close_match_card_hand_after_confirmation();

-- Keep the live request endpoint explicit about both the match lifecycle and the
-- match-scoped ownership of the selected card.
create or replace function public.request_match_card_use(p_match_card_id uuid)
returns public.match_cards language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare v_card public.match_cards;v_match public.matches;v_definition public.card_definitions;v_validate boolean;v_requires_validation boolean;v_now timestamptz:=clock_timestamp();v_usage_id uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select mc.* into v_card from public.match_cards mc where mc.id=p_match_card_id for update;
  if not found then raise exception 'card not found'; end if;
  if v_card.status<>'available'::public.card_status then raise exception 'card not available'; end if;
  select m.* into v_match from public.matches m where m.id=v_card.match_id for share;
  if not found then raise exception 'card match not found'; end if;
  if v_match.result_confirmed_at is not null or v_match.status='completed'::public.match_status
     or v_match.status not in ('set_1'::public.match_status,'set_2'::public.match_status,'super_tiebreak'::public.match_status) then
    raise exception 'match is not live';
  end if;
  if v_card.team_id not in(v_match.team_a_id,v_match.team_b_id) then raise exception 'card does not belong to match'; end if;
  select cd.* into v_definition from public.card_definitions cd where cd.id=v_card.card_definition_id;
  select t.referee_can_validate_cards into v_validate from public.tournaments t where t.id=v_match.tournament_id and t.cards_enabled for share;
  if not found then raise exception 'cards are disabled'; end if;
  v_requires_validation:=v_validate or lower(v_definition.name)='il prescelto' or v_definition.slug='il-prescelto';
  perform p.id from public.profiles p where p.id=auth.uid() and p.tournament_id=v_match.tournament_id and p.role='team'::public.app_role and p.team_id=v_card.team_id for share;
  if not found then raise exception 'not authorized'; end if;
  if v_match.status='set_2'::public.match_status and v_match.set_2_started_at is not null and statement_timestamp()<v_match.set_2_started_at+make_interval(secs=>300) and exists(select 1 from public.tournaments t where t.id=v_match.tournament_id and t.dice_enabled) then raise exception 'cards blocked during global dice effect'; end if;
  if exists(select 1 from public.match_cards mc join public.card_definitions cd on cd.id=mc.card_definition_id where mc.match_id=v_match.id and mc.team_id=v_card.team_id and mc.status in ('pending','active') and mc.id<>v_card.id and cd.duration_type<>'instant') then raise exception 'team already has active persistent card'; end if;
  update public.match_cards set status=case when v_requires_validation then 'pending'::public.card_status when v_definition.duration_type='instant'::public.card_duration_type then 'used'::public.card_status else 'active'::public.card_status end,used_in_set=v_match.current_set,activated_at=case when v_requires_validation then activated_at else v_now end,expires_at=case when not v_requires_validation and v_definition.duration_type='timed'::public.card_duration_type then v_now+make_interval(secs=>v_definition.duration_value) else null end,remaining_games=case when not v_requires_validation and v_definition.duration_type='games'::public.card_duration_type then v_definition.duration_value else null end where id=v_card.id and match_id=v_match.id and status='available'::public.card_status returning * into v_card;
  if not found then raise exception 'card not available'; end if;
  insert into public.card_usages(match_card_id,match_id,team_id,requested_by,confirmed_at,resolved_at,payload)
  values(v_card.id,v_match.id,v_card.team_id,auth.uid(),case when v_requires_validation then null else v_now end,case when not v_requires_validation and v_definition.duration_type='instant'::public.card_duration_type then v_now else null end,jsonb_build_object('requested_at',v_now,'auto_accepted',not v_requires_validation,'requires_referee_validation',v_requires_validation)) returning id into v_usage_id;
  insert into public.match_events(tournament_id,round_id,match_id,type,payload,actor_user_id)
  values(v_match.tournament_id,v_match.round_id,v_match.id,'CARD_PLAYED',jsonb_build_object('card_usage_id',v_usage_id,'match_card_id',v_card.id,'card_definition_id',v_card.card_definition_id,'team_id',v_card.team_id,'requested_at',v_now,'requires_referee_validation',v_requires_validation),auth.uid());
  if not v_requires_validation then insert into public.match_events(tournament_id,round_id,match_id,type,payload,actor_user_id) values(v_match.tournament_id,v_match.round_id,v_match.id,'CARD_ACTIVATED',jsonb_build_object('match_card_id',v_card.id,'team_id',v_card.team_id,'activated_at',v_now,'expires_at',v_card.expires_at,'auto_accepted',true),auth.uid()); end if;
  return v_card;
end;
$$;

-- Bring already confirmed matches into the same terminal state without deleting
-- their assigned cards or usage history.
do $$
declare v_match record;
begin
  for v_match in
    select m.id,m.result_confirmed_at
    from public.matches m
    where m.result_confirmed_at is not null
  loop
    perform public.close_match_card_hand(v_match.id,v_match.result_confirmed_at);
  end loop;
end;
$$;

revoke execute on function public.close_match_card_hand(uuid,timestamptz) from public;
revoke execute on function public.close_match_card_hand_after_confirmation() from public;
revoke execute on function public.request_match_card_use(uuid) from public,anon;
grant execute on function public.request_match_card_use(uuid) to authenticated;

commit;
