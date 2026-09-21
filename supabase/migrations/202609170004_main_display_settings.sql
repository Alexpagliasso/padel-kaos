-- Persist the venue-wide display paging mode for each tournament.
begin;

alter table public.tournaments
  add column if not exists main_display_mode text not null default 'auto'
    check (main_display_mode in ('auto','fixed')),
  add column if not exists main_display_page integer not null default 0
    check (main_display_page >= 0),
  add column if not exists main_display_interval_seconds integer not null default 5
    check (main_display_interval_seconds in (4,5,8,10));

create or replace function public.set_main_display_settings(
  p_tournament_id uuid,p_mode text,p_page integer,p_interval_seconds integer
) returns public.tournaments language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare v_tournament public.tournaments;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_mode not in ('auto','fixed') or p_page is null or p_page<0
     or p_interval_seconds not in (4,5,8,10) then raise exception 'invalid display settings'; end if;
  perform p.id from public.profiles p join public.tournament_admins ta on ta.user_id=p.id
  where p.id=auth.uid() and p.role='admin'::public.app_role and ta.tournament_id=p_tournament_id
  for share of p,ta;
  if not found then raise exception 'not authorized'; end if;
  update public.tournaments set main_display_mode=p_mode,main_display_page=p_page,
    main_display_interval_seconds=p_interval_seconds,updated_at=clock_timestamp()
  where id=p_tournament_id returning * into v_tournament;
  if not found then raise exception 'tournament not found'; end if;
  return v_tournament;
end; $$;

-- Main Display may read public match history and confirmed active effects,
-- never available/pending cards or private hands.
drop policy if exists match_cards_read_private on public.match_cards;
create policy match_cards_read_private on public.match_cards for select to authenticated using (exists (
  select 1 from public.matches m join public.profiles p on p.id=auth.uid() and p.tournament_id=m.tournament_id
  where m.id=match_cards.match_id and (
    p.role='admin'::public.app_role
    or (p.role='team'::public.app_role and (p.team_id=match_cards.team_id or (p.team_id in(m.team_a_id,m.team_b_id) and match_cards.status='active'::public.card_status)))
    or (p.role='referee'::public.app_role and public.can_referee_access_court(p.id,m.tournament_id,m.court_id) and match_cards.status<>'available'::public.card_status)
    or (p.role='court_display'::public.app_role and p.court_id=m.court_id and match_cards.status='active'::public.card_status)
    or (p.role='main_display'::public.app_role and match_cards.status='active'::public.card_status)
  )
));

drop policy if exists match_events_read on public.match_events;
create policy match_events_read on public.match_events for select to authenticated using (exists (
  select 1 from public.matches m join public.profiles p on p.id=auth.uid() and p.tournament_id=m.tournament_id
  where m.id=match_events.match_id and (
    p.role in ('admin'::public.app_role,'main_display'::public.app_role)
    or (p.role='team'::public.app_role and p.team_id in(m.team_a_id,m.team_b_id))
    or (p.role='referee'::public.app_role and public.can_referee_access_court(p.id,m.tournament_id,m.court_id))
    or (p.role='court_display'::public.app_role and p.court_id=m.court_id)
  )
));

revoke execute on function public.set_main_display_settings(uuid,text,integer,integer) from public,anon;
grant execute on function public.set_main_display_settings(uuid,text,integer,integer) to authenticated;

commit;
