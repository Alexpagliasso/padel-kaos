-- The original six-face backfill ran once. New tournaments must receive the
-- same authoritative definitions before Regia can roll the global dice.
begin;

create or replace function public.ensure_tournament_dice_faces(p_tournament_id uuid)
returns void language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
begin
  insert into public.dice_rules (
    tournament_id, dice_value, title, description, effect_type,
    duration_seconds, enabled, product_code
  )
  select p_tournament_id, face.value, face.title, face.description, face.code,
    300, true, face.code
  from (values
    (1, '1vs1', 'Per cinque minuti si gioca uno contro uno.', 'one_vs_one'),
    (2, '3vs3', 'Per cinque minuti si gioca tre contro tre.', 'three_vs_three'),
    (3, 'Palline sgonfie', 'Per cinque minuti si usano palline sgonfie.', 'deflated_balls'),
    (4, 'Palline tennis', 'Per cinque minuti si usano palline da tennis.', 'tennis_balls'),
    (5, '1 solo servizio', 'Per cinque minuti è consentito un solo servizio.', 'single_serve'),
    (6, 'No vetri', 'Per cinque minuti i vetri non sono validi.', 'no_glass')
  ) as face(value, title, description, code)
  on conflict (tournament_id, dice_value) do update set
    title = excluded.title,
    description = excluded.description,
    effect_type = excluded.effect_type,
    duration_seconds = excluded.duration_seconds,
    enabled = true,
    product_code = excluded.product_code;
end;
$$;

create or replace function public.seed_tournament_dice_faces_after_insert()
returns trigger language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
begin
  perform public.ensure_tournament_dice_faces(new.id);
  return new;
end;
$$;

create trigger tournaments_seed_authoritative_dice_faces
after insert on public.tournaments
for each row execute function public.seed_tournament_dice_faces_after_insert();

do $$
declare v_tournament record;
begin
  for v_tournament in select id from public.tournaments loop
    perform public.ensure_tournament_dice_faces(v_tournament.id);
  end loop;
end;
$$;

-- An admin correction can reconcile a still-live Set 2 match to completed
-- after saving its corrected SET_ENDED event. That reconciliation must not
-- replace the corrected event with the old in-play game counters.
create or replace function public.persist_timed_set_score_transition()
returns trigger language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare v_set integer;
begin
  if old.status = 'set_1'::public.match_status and new.status = 'set_break'::public.match_status then
    v_set := 1;
  elsif old.status = 'set_2'::public.match_status
      and new.status in ('super_tiebreak'::public.match_status, 'completed'::public.match_status) then
    if old.set_2_ended_at is not null then return new; end if;
    v_set := 2;
  elsif old.status = 'set_break'::public.match_status and new.status = 'set_2'::public.match_status then
    new.games_a := 0;
    new.games_b := 0;
    return new;
  else
    return new;
  end if;

  perform public.persist_completed_set_result(old, v_set, old.games_a, old.games_b, auth.uid());
  select count(*) filter (where (me.payload->>'games_a')::integer > (me.payload->>'games_b')::integer),
         count(*) filter (where (me.payload->>'games_b')::integer > (me.payload->>'games_a')::integer)
    into new.sets_a, new.sets_b
  from public.match_events me
  where me.match_id = old.id and me.type = 'SET_ENDED'::public.match_event_type
    and (me.payload->>'set_number') ~ '^[12]$'
    and (me.payload->>'games_a') ~ '^[0-9]+$'
    and (me.payload->>'games_b') ~ '^[0-9]+$';
  return new;
end;
$$;

revoke execute on function public.ensure_tournament_dice_faces(uuid) from public, anon, authenticated;
revoke execute on function public.seed_tournament_dice_faces_after_insert() from public, anon, authenticated;
revoke execute on function public.persist_timed_set_score_transition() from public, anon, authenticated;
commit;
