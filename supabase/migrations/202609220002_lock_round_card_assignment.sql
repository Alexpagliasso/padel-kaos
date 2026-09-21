-- Keep direct admin inserts subject to the same round-wide start gate as assign_round_cards.
begin;

drop policy if exists match_cards_admin_insert on public.match_cards;
create policy match_cards_admin_insert on public.match_cards
for insert to authenticated with check (
  exists (
    select 1 from public.matches m
    join public.rounds r on r.id = m.round_id
    where m.id = match_cards.match_id
      and match_cards.team_id in (m.team_a_id, m.team_b_id)
      and public.is_admin_for(m.tournament_id)
      and r.opened_at is null
      and r.status = 'scheduled'::public.round_status
      and not exists (
        select 1 from public.matches sibling
        where sibling.round_id = r.id
          and (sibling.status not in ('scheduled'::public.match_status, 'ready'::public.match_status)
            or sibling.started_at is not null)
      )
  )
);

commit;
