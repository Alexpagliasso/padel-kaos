-- Fix the meta-card request wrapper assigning a composite match_cards value
-- to the UUID field of a match_cards row variable.
begin;

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

  select requested.* into v_card
  from public.request_match_card_use(p_match_card_id) requested;

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

revoke execute on function public.request_match_card_effect(uuid,uuid) from public,anon;
grant execute on function public.request_match_card_effect(uuid,uuid) to authenticated;

commit;
