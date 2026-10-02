-- Persist timed-card expiry and release the active slot deterministically.
begin;

create or replace function public.expire_match_card_effect(p_match_card_id uuid)
returns public.match_cards language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare v_card public.match_cards;v_match_id uuid;v_now timestamptz:=clock_timestamp();
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select * into v_card from public.match_cards where id=p_match_card_id for update;
  if not found then raise exception 'card not found'; end if;
  v_match_id:=v_card.match_id;
  if not public.can_read_match(v_match_id) then raise exception 'not authorized'; end if;
  if v_card.status<>'active'::public.card_status or v_card.expires_at is null then return v_card; end if;
  if statement_timestamp()<v_card.expires_at then raise exception 'card deadline has not elapsed'; end if;
  update public.match_cards set status='expired'::public.card_status where id=p_match_card_id returning * into v_card;
  update public.card_usages set resolved_at=coalesce(resolved_at,v_now),payload=payload||jsonb_build_object('closed_at',v_now,'closed_reason','timer_expired')
    where match_card_id=p_match_card_id and resolved_at is null;
  return v_card;
end; $$;

revoke execute on function public.expire_match_card_effect(uuid) from public,anon;
grant execute on function public.expire_match_card_effect(uuid) to authenticated;
commit;
