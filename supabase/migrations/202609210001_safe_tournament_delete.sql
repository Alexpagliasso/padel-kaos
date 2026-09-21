-- Delete only unstarted tournaments, retaining Admin identities and memberships elsewhere.
begin;

alter table public.profiles alter column tournament_id drop not null;
alter table public.profiles add constraint profiles_non_admin_tournament_required
  check (role = 'admin'::public.app_role or tournament_id is not null);

-- The original RLS helpers scoped Admins to profiles.tournament_id. Membership
-- is authoritative now, including after deletion of the Admin's home tournament.
create or replace function public.is_admin_for(p_tournament_id uuid)
returns boolean language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select exists (
    select 1 from public.profiles p join public.tournament_admins ta on ta.user_id = p.id
    where p.id = auth.uid() and p.role = 'admin'::public.app_role and ta.tournament_id = p_tournament_id
  )
$$;

create or replace function public.can_read_tournament(p_tournament_id uuid)
returns boolean language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.tournament_id = p_tournament_id
  ) or public.is_admin_for(p_tournament_id)
$$;

create or replace function public.can_read_match(p_match_id uuid)
returns boolean language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select exists (
    select 1 from public.matches m join public.profiles p on p.id = auth.uid()
    where m.id = p_match_id and (
      (p.role = 'admin'::public.app_role and public.is_admin_for(m.tournament_id))
      or (p.tournament_id = m.tournament_id and (
        p.role = 'main_display'::public.app_role
        or (p.role in ('referee'::public.app_role, 'court_display'::public.app_role) and p.court_id = m.court_id)
        or (p.role = 'team'::public.app_role and p.team_id in (m.team_a_id, m.team_b_id))
      ))
    )
  )
$$;

create or replace function public.can_manage_match(p_match_id uuid)
returns boolean language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select exists (
    select 1 from public.matches m join public.profiles p on p.id = auth.uid()
    where m.id = p_match_id and (
      (p.role = 'admin'::public.app_role and public.is_admin_for(m.tournament_id))
      or (p.role = 'referee'::public.app_role and p.tournament_id = m.tournament_id and p.court_id = m.court_id)
    )
  )
$$;

create or replace function public.delete_tournament_if_safe(p_tournament_id uuid)
returns void language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare
  v_status text;
  v_admin record;
  v_replacement uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select t.status into v_status from public.tournaments t where t.id = p_tournament_id for update;
  if not found then raise exception 'tournament not found'; end if;
  perform 1 from public.profiles p join public.tournament_admins ta on ta.user_id = p.id
    where p.id = auth.uid() and p.role = 'admin'::public.app_role and ta.tournament_id = p_tournament_id
    for share of p, ta;
  if not found then raise exception 'not authorized'; end if;
  if v_status not in ('draft', 'configured') then raise exception 'tournament deletion locked after start'; end if;
  if exists (select 1 from public.profiles p where p.tournament_id = p_tournament_id and p.role <> 'admin'::public.app_role) then
    raise exception 'cannot hard delete tournament while auth profiles still exist';
  end if;

  for v_admin in select p.id from public.profiles p
    where p.tournament_id = p_tournament_id and p.role = 'admin'::public.app_role for update
  loop
    select ta.tournament_id into v_replacement from public.tournament_admins ta
      where ta.user_id = v_admin.id and ta.tournament_id <> p_tournament_id
      order by ta.tournament_id limit 1;
    update public.profiles set tournament_id = v_replacement, updated_at = clock_timestamp()
      where id = v_admin.id;
  end loop;
  delete from public.tournament_admins where tournament_id = p_tournament_id;
  delete from public.tournaments where id = p_tournament_id;
end;
$$;

revoke execute on function public.delete_tournament_if_safe(uuid) from public, anon;
grant execute on function public.delete_tournament_if_safe(uuid) to authenticated;
commit;
