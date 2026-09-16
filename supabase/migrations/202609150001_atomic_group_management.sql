-- Local prerequisite for Checkpoint H. Apply manually after review.
-- Requires the existing tournament safe-delete guard (202609120002).
begin;

-- The cascade exception below is safe only with the existing parent guard.
do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_trigger
    where tgrelid = 'public.tournaments'::regclass
      and tgname = 'tournaments_safe_hard_delete'
      and tgenabled in ('O', 'A') and not tgisinternal
  ) then
    raise exception 'required tournaments_safe_hard_delete trigger is missing or disabled';
  end if;
end;
$$;

create or replace function public.enforce_group_structure_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_id uuid;
  v_status text;
begin
  -- Moving ownership must not bypass the lifecycle of the old tournament.
  if tg_op = 'UPDATE' then
    if new.tournament_id is distinct from old.tournament_id then
      raise exception 'group tournament ownership cannot be changed';
    end if;
  end if;
  if tg_op = 'DELETE' then v_id := old.tournament_id;
  else v_id := new.tournament_id;
  end if;

  select status into v_status from public.tournaments where id = v_id for update;
  if not found then
    -- ON DELETE CASCADE runs after the parent is removed. The existing
    -- tournaments_safe_hard_delete trigger already checked its lifecycle.
    if tg_op = 'DELETE' then return old; end if;
    raise exception 'tournament not found';
  end if;
  if v_status not in ('draft', 'configured') then
    raise exception 'group structure is locked after tournament start';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger groups_structure_lifecycle
before insert or update or delete on public.groups
for each row execute function public.enforce_group_structure_lifecycle();

create or replace function public.enforce_team_group_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_status text;
begin
  if tg_op = 'UPDATE' then
    if new.tournament_id is distinct from old.tournament_id then
      raise exception 'team tournament ownership cannot be changed';
    end if;
    if new.group_id is not distinct from old.group_id then return new; end if;
  elsif new.group_id is null then
    return new;
  end if;
  select status into v_status from public.tournaments
  where id = new.tournament_id for update;
  if not found then raise exception 'tournament not found'; end if;
  if v_status not in ('draft', 'configured') then
    raise exception 'team group assignment is locked after tournament start';
  end if;
  return new;
end;
$$;

create trigger teams_group_lifecycle
before insert or update of group_id, tournament_id on public.teams
for each row execute function public.enforce_team_group_lifecycle();

create or replace function public.replace_tournament_groups(
  p_tournament_id uuid,
  p_groups jsonb
)
returns setof public.groups
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_status text;
  v_group jsonb;
  v_team jsonb;
  v_group_id uuid;
  v_team_id uuid;
  v_ids uuid[] := array[]::uuid[];
  v_group_ids uuid[] := array[]::uuid[];
  v_names text[] := array[]::text[];
  v_orders int[] := array[]::int[];
  v_name text;
  v_order int;
  v_count bigint;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if not public.is_admin_for(p_tournament_id) then raise exception 'not authorized'; end if;

  -- Serialize replacements and lifecycle changes only for this tournament.
  select status into v_status from public.tournaments
  where id = p_tournament_id for update;
  if not found then raise exception 'tournament not found'; end if;
  if v_status not in ('draft', 'configured') then
    raise exception 'group structure is locked after tournament start';
  end if;

  -- Protect participating rows before validation, in deterministic UUID order.
  -- Concurrent inserts must also satisfy their immediate tournament FK:
  -- its parent KEY SHARE check conflicts with our tournament FOR UPDATE.
  perform id from public.teams
  where tournament_id = p_tournament_id order by id for update;
  -- DELETE below obtains the required group row locks; no extra lock needed.
  -- Direct row updates can acquire a child row before their lifecycle trigger
  -- locks the parent. PostgreSQL may abort a deadlock victim (40P01); callers
  -- must refetch/retry the complete operation, never individual assignments.

  if jsonb_typeof(p_groups) is distinct from 'array' then
    raise exception 'groups payload must be an array';
  end if;
  select count(*) into v_count from public.teams where tournament_id = p_tournament_id;
  if v_count > 0 and jsonb_array_length(p_groups) = 0 then
    raise exception 'at least one group is required';
  end if;
  for v_group in select value from jsonb_array_elements(p_groups) loop
    if jsonb_typeof(v_group) is distinct from 'object'
       or jsonb_typeof(v_group->'name') is distinct from 'string' then
      raise exception 'each group must have a non-empty name';
    end if;
    v_name := btrim(v_group->>'name');
    if v_name = '' or v_name = any(v_names) then
      raise exception 'group names must be non-empty and unique';
    end if;
    if jsonb_typeof(v_group->'sort_order') is distinct from 'number'
       or (v_group->>'sort_order') !~ '^[0-9]+$' then
      raise exception 'sort_order must be a nonnegative integer';
    end if;
    v_order := (v_group->>'sort_order')::int;
    if v_order = any(v_orders) then raise exception 'duplicate group sort_order'; end if;
    v_names := array_append(v_names, v_name);
    v_orders := array_append(v_orders, v_order);
    if jsonb_typeof(v_group->'team_ids') is distinct from 'array' then
      raise exception 'team_ids must be an array';
    end if;
    for v_team in select value from jsonb_array_elements(v_group->'team_ids') loop
      if jsonb_typeof(v_team) is distinct from 'string' then
        raise exception 'team IDs must be UUID strings';
      end if;
      v_team_id := (v_team #>> '{}')::uuid;
      if v_team_id = any(v_ids) then raise exception 'duplicate team ID: %', v_team_id; end if;
      if not exists (select 1 from public.teams where id = v_team_id and tournament_id = p_tournament_id) then
        raise exception 'unknown or foreign tournament team: %', v_team_id;
      end if;
      v_ids := array_append(v_ids, v_team_id);
    end loop;
  end loop;
  if cardinality(v_ids) <> v_count or exists (
    select 1 from public.teams where tournament_id = p_tournament_id and not (id = any(v_ids))
  ) then raise exception 'every tournament team must appear exactly once'; end if;
  if exists (
    select 1 from public.matches m join public.groups g on g.id = m.group_id
    where g.tournament_id = p_tournament_id
  ) then raise exception 'cannot replace groups referenced by matches'; end if;

  update public.teams set group_id = null, updated_at = now() where tournament_id = p_tournament_id;
  delete from public.groups where tournament_id = p_tournament_id;
  for v_group in select value from jsonb_array_elements(p_groups) loop
    insert into public.groups (tournament_id, name, sort_order, assigned_court_id)
    values (p_tournament_id, btrim(v_group->>'name'), (v_group->>'sort_order')::int, null)
    returning id into v_group_id;
    v_group_ids := array_append(v_group_ids, v_group_id);
    update public.teams set group_id = v_group_id, updated_at = now()
    where tournament_id = p_tournament_id and id in (
      select value::uuid from jsonb_array_elements_text(v_group->'team_ids')
    );
  end loop;
  if (select count(*) from public.teams where tournament_id = p_tournament_id) <> v_count
     or (select count(*) from public.teams t join public.groups g
         on g.id = t.group_id and g.tournament_id = t.tournament_id
         where t.tournament_id = p_tournament_id and t.group_id = any(v_group_ids)) <> v_count
     or exists (select 1 from public.teams
                where tournament_id = p_tournament_id and not (id = any(v_ids)))
     or exists (select 1 from unnest(v_ids) as expected(id)
                where not exists (select 1 from public.teams t
                                  where t.id = expected.id and t.tournament_id = p_tournament_id))
     or (select count(*) from public.groups where tournament_id = p_tournament_id) <> cardinality(v_group_ids)
     or exists (select 1 from unnest(v_group_ids) as expected(id)
                where not exists (select 1 from public.groups g
                                  where g.id = expected.id and g.tournament_id = p_tournament_id)) then
    raise exception 'incomplete group assignment';
  end if;
  -- No exception handler: any failure rolls back the entire RPC statement.
  return query select * from public.groups where tournament_id = p_tournament_id order by sort_order, id;
end;
$$;

revoke execute on function public.enforce_group_structure_lifecycle() from public;
revoke execute on function public.enforce_team_group_lifecycle() from public;
revoke execute on function public.replace_tournament_groups(uuid, jsonb) from public;
grant execute on function public.replace_tournament_groups(uuid, jsonb) to authenticated;

commit;
