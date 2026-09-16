-- Materialize the configured court count for an editable tournament.
begin;

create or replace function public.sync_tournament_courts(
  p_tournament_id uuid,
  p_courts_count integer
)
returns setof public.courts
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_status text;
  v_configured_count integer;
  v_group_count bigint;
  v_existing_count bigint;
  v_next_order integer;
  v_excess_ids uuid[];
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  perform p.id
  from public.profiles p
  where p.id = auth.uid()
    and p.role = 'admin'::public.app_role
  for share;
  if not found then
    raise exception 'not authorized';
  end if;

  perform ta.user_id
  from public.tournament_admins ta
  where ta.user_id = auth.uid()
    and ta.tournament_id = p_tournament_id
  for share;
  if not found then
    raise exception 'not authorized';
  end if;

  select t.status, t.courts_count
  into v_status, v_configured_count
  from public.tournaments t
  where t.id = p_tournament_id
  for update;
  if not found then
    raise exception 'tournament not found';
  end if;
  if v_status not in ('draft', 'configured') then
    raise exception 'La struttura dei campi non può essere modificata dopo l''avvio del torneo';
  end if;
  if p_courts_count is null or p_courts_count < 1 then
    raise exception 'Il numero di campi deve essere almeno 1';
  end if;
  if v_configured_count is distinct from p_courts_count then
    raise exception 'Il numero di campi richiesto non corrisponde alla configurazione salvata';
  end if;

  select count(*) into v_group_count
  from public.groups g
  where g.tournament_id = p_tournament_id;
  if v_group_count > 0 and v_group_count <> p_courts_count then
    raise exception 'Il numero di campi deve corrispondere al numero di gironi';
  end if;

  perform c.id
  from public.courts c
  where c.tournament_id = p_tournament_id
  order by c.sort_order, c.id
  for update;

  select count(*) into v_existing_count
  from public.courts c
  where c.tournament_id = p_tournament_id;

  if v_existing_count > p_courts_count then
    select array_agg(excess.id order by excess.sort_order desc, excess.id desc)
    into v_excess_ids
    from (
      select c.id, c.sort_order
      from public.courts c
      where c.tournament_id = p_tournament_id
      order by c.sort_order, c.id
      offset p_courts_count
    ) excess;

    if exists (select 1 from public.groups g where g.assigned_court_id = any(v_excess_ids))
       or exists (select 1 from public.matches m where m.court_id = any(v_excess_ids))
       or exists (select 1 from public.profiles p where p.court_id = any(v_excess_ids)) then
      raise exception 'Impossibile ridurre i campi: uno o più campi in eccesso sono assegnati a gironi, partite o account';
    end if;

    delete from public.courts c where c.id = any(v_excess_ids);
    v_existing_count := p_courts_count;
  end if;

  while v_existing_count < p_courts_count loop
    select candidate.sort_order
    into v_next_order
    from generate_series(0, p_courts_count + v_existing_count::integer) as candidate(sort_order)
    where not exists (
      select 1 from public.courts c
      where c.tournament_id = p_tournament_id
        and c.sort_order = candidate.sort_order
    )
    order by candidate.sort_order
    limit 1;

    insert into public.courts (tournament_id, name, display_slug, sort_order)
    values (
      p_tournament_id,
      'Campo ' || (v_next_order + 1),
      'campo-' || (v_next_order + 1),
      v_next_order
    );
    v_existing_count := v_existing_count + 1;
  end loop;

  return query
  select c.*
  from public.courts c
  where c.tournament_id = p_tournament_id
  order by c.sort_order, c.id;
end;
$$;

revoke execute on function public.sync_tournament_courts(uuid, integer) from public;
grant execute on function public.sync_tournament_courts(uuid, integer) to authenticated;

-- Keep configuration and physical court rows in the same RPC transaction.
create or replace function public.update_tournament_configuration_with_courts(
  p_tournament_id uuid,
  p_name text,
  p_teams_count integer,
  p_teams_per_group integer,
  p_gold_qualified_count integer,
  p_silver_qualified_count integer,
  p_courts_count integer,
  p_allow_byes boolean,
  p_theme_preset text,
  p_theme_color text default null
)
returns public.tournaments
language plpgsql
security invoker
set search_path = pg_catalog, pg_temp
as $$
declare
  v_tournament public.tournaments;
begin
  select public.update_tournament_configuration(
    p_tournament_id,
    p_name,
    p_teams_count,
    p_teams_per_group,
    p_gold_qualified_count,
    p_silver_qualified_count,
    p_courts_count,
    p_allow_byes,
    p_theme_preset,
    p_theme_color
  ) into v_tournament;

  perform public.sync_tournament_courts(p_tournament_id, p_courts_count);
  return v_tournament;
end;
$$;

revoke execute on function public.update_tournament_configuration_with_courts(uuid, text, integer, integer, integer, integer, integer, boolean, text, text) from public;
grant execute on function public.update_tournament_configuration_with_courts(uuid, text, integer, integer, integer, integer, integer, boolean, text, text) to authenticated;

commit;
