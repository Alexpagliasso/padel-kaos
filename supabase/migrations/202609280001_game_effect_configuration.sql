-- Per-round dice eligibility and authoritative meta-card effect resolution.
begin;

create table public.round_dice_effects (
  round_id uuid not null references public.rounds(id) on delete cascade,
  dice_rule_id uuid not null references public.dice_rules(id) on delete cascade,
  enabled boolean not null default true,
  primary key(round_id,dice_rule_id)
);
alter table public.round_dice_effects enable row level security;
create policy round_dice_effects_read on public.round_dice_effects for select to authenticated using (
  exists(select 1 from public.rounds r where r.id=round_id and public.can_read_tournament(r.tournament_id))
);

create table public.jolly_copy_targets (
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  card_definition_id uuid not null references public.card_definitions(id) on delete cascade,
  enabled boolean not null default true,
  primary key(tournament_id,card_definition_id)
);
alter table public.jolly_copy_targets enable row level security;
create policy jolly_copy_targets_read on public.jolly_copy_targets for select to authenticated
  using(public.can_read_tournament(tournament_id));

alter table public.card_usages
  add column resolved_card_definition_id uuid references public.card_definitions(id),
  add column resolved_from_match_card_id uuid references public.match_cards(id);
alter table public.match_cards
  add column resolved_card_definition_id uuid references public.card_definitions(id),
  add column resolved_from_match_card_id uuid references public.match_cards(id);

create or replace function public.set_round_dice_effects(p_round_id uuid,p_enabled_rule_ids uuid[])
returns setof public.round_dice_effects language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare v_round public.rounds;v_dice_enabled boolean;
begin
  select r.* into v_round from public.rounds r where r.id=p_round_id for update;
  if not found then raise exception 'round not found'; end if;
  if not public.live_admin_authorized(v_round.tournament_id) then raise exception 'not authorized'; end if;
  if v_round.opened_at is not null or v_round.status<>'scheduled'::public.round_status
    or exists(select 1 from public.matches m where m.round_id=p_round_id and (m.started_at is not null or m.status not in ('scheduled','ready'))) then
    raise exception 'dice configuration is locked after turn start';
  end if;
  select t.dice_enabled into v_dice_enabled from public.tournaments t where t.id=v_round.tournament_id;
  if p_enabled_rule_ids is null or cardinality(p_enabled_rule_ids)<>(select count(distinct id) from unnest(p_enabled_rule_ids) ids(id)) then raise exception 'invalid dice effect list'; end if;
  if exists(select 1 from unnest(p_enabled_rule_ids) ids(id) where not exists(select 1 from public.dice_rules dr where dr.id=ids.id and dr.tournament_id=v_round.tournament_id and dr.enabled)) then raise exception 'dice effect does not belong to tournament'; end if;
  if v_dice_enabled and cardinality(p_enabled_rule_ids)=0 then raise exception 'at least one dice effect must remain enabled'; end if;
  delete from public.round_dice_effects where round_id=p_round_id;
  insert into public.round_dice_effects(round_id,dice_rule_id,enabled)
  select p_round_id,dr.id,dr.id=any(p_enabled_rule_ids) from public.dice_rules dr
  where dr.tournament_id=v_round.tournament_id and dr.enabled;
  return query select * from public.round_dice_effects where round_id=p_round_id order by dice_rule_id;
end; $$;

create or replace function public.set_jolly_copy_targets(p_tournament_id uuid,p_card_definition_ids uuid[])
returns setof public.jolly_copy_targets language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
begin
  if not public.live_admin_authorized(p_tournament_id) then raise exception 'not authorized'; end if;
  if exists(select 1 from public.matches where tournament_id=p_tournament_id and status in ('set_1','set_2','super_tiebreak')) then raise exception 'jolly configuration is locked during an active turn'; end if;
  if p_card_definition_ids is null or exists(select 1 from unnest(p_card_definition_ids) ids(id) join public.card_definitions cd on cd.id=ids.id where lower(cd.name)='jolly' or cd.slug='jolly') then raise exception 'jolly cannot copy itself'; end if;
  if exists(select 1 from unnest(p_card_definition_ids) ids(id) where not exists(select 1 from public.card_definitions cd where cd.id=ids.id and (cd.tournament_id is null or cd.tournament_id=p_tournament_id) and cd.enabled and cd.archived_at is null)) then raise exception 'invalid jolly copy target'; end if;
  delete from public.jolly_copy_targets where tournament_id=p_tournament_id;
  insert into public.jolly_copy_targets(tournament_id,card_definition_id)
  select p_tournament_id,id from unnest(p_card_definition_ids) ids(id);
  return query select * from public.jolly_copy_targets where tournament_id=p_tournament_id order by card_definition_id;
end; $$;

create or replace function public.valid_meta_card_target(p_match_card_id uuid,p_target_definition_id uuid,p_kind text)
returns boolean language sql stable security definer set search_path=pg_catalog,pg_temp as $$
select exists(select 1 from public.match_cards source join public.matches m on m.id=source.match_id
  join public.card_definitions target on target.id=p_target_definition_id
  where source.id=p_match_card_id and target.id<>source.card_definition_id and target.enabled and target.archived_at is null
    and (target.tournament_id is null or target.tournament_id=m.tournament_id)
    and ((p_kind='jolly' and not (lower(target.name) in ('jolly','lupin') or target.slug in ('jolly','lupin'))
      and (not exists(select 1 from public.jolly_copy_targets j where j.tournament_id=m.tournament_id)
        or exists(select 1 from public.jolly_copy_targets j where j.tournament_id=m.tournament_id and j.card_definition_id=target.id and j.enabled)))
    or (p_kind='lupin' and target.can_be_stolen and exists(select 1 from public.match_cards victim
      where victim.match_id=source.match_id and victim.team_id<>source.team_id and victim.card_definition_id=target.id and victim.status='active'))))
$$;

create or replace function public.roll_global_dice_for_round(p_round_id uuid)
returns public.rounds language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare v_round public.rounds;v_rule public.dice_rules;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select r.* into v_round from public.rounds r join public.tournaments t on t.id=r.tournament_id where r.id=p_round_id and t.dice_enabled for update of r,t;
  if not found then raise exception 'global dice is disabled or round not found'; end if;
  if not public.live_admin_authorized(v_round.tournament_id) then raise exception 'not authorized'; end if;
  perform m.id from public.matches m where m.round_id=p_round_id order by m.id for update;
  if not found then raise exception 'round has no matches'; end if;
  if v_round.dice_result is not null then raise exception 'global dice already rolled'; end if;
  if exists(select 1 from public.matches m where m.round_id=p_round_id and (m.status<>'set_break' or m.set_1_ended_at is null or not public.has_valid_completed_set_result(m.id,1))) then raise exception 'set 1 results are incomplete'; end if;
  select dr.* into v_rule from public.dice_rules dr where dr.tournament_id=v_round.tournament_id and dr.enabled
    and dr.product_code in ('one_vs_one','three_vs_three','deflated_balls','tennis_balls','single_serve','no_glass')
    and (not exists(select 1 from public.round_dice_effects configured where configured.round_id=p_round_id)
      or exists(select 1 from public.round_dice_effects configured where configured.round_id=p_round_id and configured.dice_rule_id=dr.id and configured.enabled))
    order by random() limit 1;
  if not found then raise exception 'no dice effects enabled for round'; end if;
  update public.rounds set dice_result=v_rule.dice_value,dice_rule_id=v_rule.id,dice_rolled_at=clock_timestamp(),dice_started_at=null,dice_ends_at=null where id=p_round_id returning * into v_round;
  return v_round;
end; $$;

-- Meta cards retain their source identity while these endpoints resolve the
-- effective definition used for validation, duration and public presentation.
create or replace function public.request_match_card_effect(
  p_match_card_id uuid,p_resolved_card_definition_id uuid default null
) returns public.match_cards language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare v_source public.card_definitions;v_card public.match_cards;v_usage_id uuid;v_is_jolly boolean;v_is_lupin boolean;
begin
  select mc.* into v_card
  from public.match_cards mc
  where mc.id=p_match_card_id;
  if not found then raise exception 'card not found'; end if;

  select cd.* into v_source
  from public.card_definitions cd
  where cd.id=v_card.card_definition_id;
  if not found then raise exception 'card definition not found'; end if;
  v_is_jolly:=v_source.slug='jolly' or lower(v_source.name)='jolly';
  v_is_lupin:=v_source.slug='lupin' or lower(v_source.name)='lupin';
  if v_is_jolly and (p_resolved_card_definition_id is null or not public.valid_meta_card_target(p_match_card_id,p_resolved_card_definition_id,'jolly')) then raise exception 'invalid jolly target'; end if;
  if not v_is_jolly and p_resolved_card_definition_id is not null then raise exception 'resolved effect is only valid for jolly'; end if;
  select public.request_match_card_use(p_match_card_id) into v_card;
  if v_is_jolly or v_is_lupin then
    update public.match_cards set status='pending'::public.card_status,activated_at=null,expires_at=null,remaining_games=null,
      resolved_card_definition_id=case when v_is_jolly then p_resolved_card_definition_id else null end
    where id=p_match_card_id returning * into v_card;
    update public.card_usages set confirmed_at=null,resolved_at=null,resolved_card_definition_id=case when v_is_jolly then p_resolved_card_definition_id else null end,
      payload=payload||jsonb_build_object('source_card_definition_id',v_source.id,'resolved_card_definition_id',p_resolved_card_definition_id,'meta_card',case when v_is_jolly then 'jolly' else 'lupin' end)
    where id=(select id from public.card_usages where match_card_id=p_match_card_id order by created_at desc limit 1) returning id into v_usage_id;
    update public.match_events set payload=payload||jsonb_build_object('card_usage_id',v_usage_id,'source_card_definition_id',v_source.id,'resolved_card_definition_id',p_resolved_card_definition_id,'requires_referee_validation',true)
    where id=(select id from public.match_events where match_id=v_card.match_id and type='CARD_PLAYED' and payload->>'match_card_id'=p_match_card_id::text order by created_at desc limit 1);
  end if;
  return v_card;
end; $$;

create or replace function public.confirm_match_card_effect(
  p_match_card_id uuid,p_selected_player_id uuid default null,p_resolved_from_match_card_id uuid default null
) returns public.match_cards language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare v_card public.match_cards;v_match public.matches;v_source public.card_definitions;v_effect public.card_definitions;v_victim public.match_cards;v_now timestamptz:=clock_timestamp();v_usage_id uuid;v_is_lupin boolean;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select * into v_card from public.match_cards where id=p_match_card_id for update;
  if not found or v_card.status<>'pending' then raise exception 'card is not pending'; end if;
  select * into v_match from public.matches where id=v_card.match_id for share;
  perform p.id from public.profiles p where p.id=auth.uid() and ((p.role='referee' and p.tournament_id=v_match.tournament_id and public.can_referee_access_court(p.id,v_match.tournament_id,v_match.court_id)) or (p.role='admin' and public.is_admin_for(v_match.tournament_id))) for share;
  if not found then raise exception 'not authorized for court'; end if;
  select * into v_source from public.card_definitions where id=v_card.card_definition_id;
  v_is_lupin:=v_source.slug='lupin' or lower(v_source.name)='lupin';
  if v_is_lupin then
    select victim.* into v_victim from public.match_cards victim join public.card_definitions cd on cd.id=victim.card_definition_id
      where victim.id=p_resolved_from_match_card_id and victim.match_id=v_card.match_id and victim.team_id<>v_card.team_id and victim.status='active' and cd.can_be_stolen for update;
    if not found or not public.valid_meta_card_target(v_card.id,v_victim.card_definition_id,'lupin') then raise exception 'invalid lupin target'; end if;
    update public.match_cards set status='expired' where id=v_victim.id;
    v_card.resolved_card_definition_id:=v_victim.card_definition_id;v_card.resolved_from_match_card_id:=v_victim.id;
  elsif p_resolved_from_match_card_id is not null then raise exception 'lupin target is not allowed';
  end if;
  select * into v_effect from public.card_definitions where id=coalesce(v_card.resolved_card_definition_id,v_card.card_definition_id);
  if (v_effect.slug='il-prescelto' or lower(v_effect.name)='il prescelto') and (p_selected_player_id is null or not exists(select 1 from public.match_lineups ml where ml.match_id=v_match.id and ml.team_id=v_card.team_id and ml.set_number=v_match.current_set and p_selected_player_id in(ml.active_player_1_id,ml.active_player_2_id))) then raise exception 'selected player is not in active lineup'; end if;
  update public.match_cards set status=case when v_effect.duration_type='instant' then 'used'::public.card_status else 'active'::public.card_status end,
    resolved_card_definition_id=v_card.resolved_card_definition_id,resolved_from_match_card_id=v_card.resolved_from_match_card_id,activated_at=v_now,
    expires_at=case when v_effect.duration_type='timed' then v_now+make_interval(secs=>v_effect.duration_value) end,
    remaining_games=case when v_effect.duration_type='games' then v_effect.duration_value end where id=v_card.id returning * into v_card;
  update public.card_usages set confirmed_by=auth.uid(),confirmed_at=v_now,resolved_at=case when v_effect.duration_type='instant' then v_now end,
    resolved_card_definition_id=v_card.resolved_card_definition_id,resolved_from_match_card_id=v_card.resolved_from_match_card_id,
    payload=payload||jsonb_build_object('selected_player_id',p_selected_player_id,'activated_at',v_now,'expires_at',v_card.expires_at,'resolved_card_definition_id',v_card.resolved_card_definition_id,'resolved_from_match_card_id',v_card.resolved_from_match_card_id)
    where id=(select id from public.card_usages where match_card_id=v_card.id and resolved_at is null order by created_at desc limit 1) returning id into v_usage_id;
  insert into public.match_events(tournament_id,round_id,match_id,type,payload,actor_user_id) values(v_match.tournament_id,v_match.round_id,v_match.id,'CARD_ACTIVATED',jsonb_build_object('card_usage_id',v_usage_id,'match_card_id',v_card.id,'team_id',v_card.team_id,'source_card_definition_id',v_card.card_definition_id,'resolved_card_definition_id',coalesce(v_card.resolved_card_definition_id,v_card.card_definition_id),'resolved_from_match_card_id',v_card.resolved_from_match_card_id,'selected_player_id',p_selected_player_id,'activated_at',v_now,'expires_at',v_card.expires_at),auth.uid());
  return v_card;
end; $$;

revoke execute on function public.set_round_dice_effects(uuid,uuid[]) from public,anon;
revoke execute on function public.set_jolly_copy_targets(uuid,uuid[]) from public,anon;
revoke execute on function public.valid_meta_card_target(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.set_round_dice_effects(uuid,uuid[]) to authenticated;
grant execute on function public.set_jolly_copy_targets(uuid,uuid[]) to authenticated;
revoke execute on function public.request_match_card_effect(uuid,uuid) from public,anon;
revoke execute on function public.confirm_match_card_effect(uuid,uuid,uuid) from public,anon;
grant execute on function public.request_match_card_effect(uuid,uuid) to authenticated;
grant execute on function public.confirm_match_card_effect(uuid,uuid,uuid) to authenticated;
do $$ begin
  if exists(select 1 from pg_catalog.pg_publication where pubname='supabase_realtime') then
    if not exists(select 1 from pg_catalog.pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='round_dice_effects') then alter publication supabase_realtime add table public.round_dice_effects; end if;
    if not exists(select 1 from pg_catalog.pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='jolly_copy_targets') then alter publication supabase_realtime add table public.jolly_copy_targets; end if;
  end if;
end $$;
commit;
