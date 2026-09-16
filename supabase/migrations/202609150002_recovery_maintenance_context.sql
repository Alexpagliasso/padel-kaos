-- R0: recovery-only, transaction-local lifecycle compatibility.
-- GUCs are NOT credentials. SECURITY INVOKER readers/triggers additionally
-- require the effective SQL role to own a trusted recovery SECURITY DEFINER RPC.
-- Normal API roles cannot impersonate that owner, even with forged settings.
-- Privileged function owners remain trusted; do not expose arbitrary-SQL
-- SECURITY DEFINER routines or grant API roles membership in those owners.
begin;

-- Refuse an installation where an API role can impersonate a recovery owner.
do $$
begin
  if exists (
    select 1 from pg_catalog.pg_proc p
    where p.oid in ('public.reset_tournament(uuid)'::regprocedure,
                    'public.restore_tournament_backup(uuid)'::regprocedure)
      and (not p.prosecdef
        or pg_catalog.pg_has_role('authenticated', p.proowner, 'MEMBER')
        or pg_catalog.pg_has_role('anon', p.proowner, 'MEMBER')
        or pg_catalog.pg_has_role('authenticator', p.proowner, 'MEMBER'))
  ) then
    raise exception 'recovery functions require trusted owners inaccessible to API roles';
  end if;
end;
$$;

-- Future lifecycle triggers MUST be SECURITY INVOKER when using this reader.
-- A SECURITY DEFINER trigger would erase the caller role distinction.

create or replace function public.is_authorized_tournament_maintenance(p_tournament_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = pg_catalog, public, pg_temp
as $$
  select coalesce(
    current_setting('app.maintenance_mode', true) = 'recovery'
    and current_setting('app.maintenance_tournament_id', true) = p_tournament_id::text
    and current_user not in ('anon', 'authenticated', 'authenticator')
    and exists (
      select 1 from pg_catalog.pg_proc p
      where p.oid in ('public.reset_tournament(uuid)'::regprocedure,
                      'public.restore_tournament_backup(uuid)'::regprocedure)
        and p.prosecdef and p.proowner = current_user::regrole
    ), false
  );
$$;
revoke all on function public.is_authorized_tournament_maintenance(uuid) from public, anon, authenticated;
-- Read-only helper, not an activation RPC. Invoker triggers need this grant.
grant execute on function public.is_authorized_tournament_maintenance(uuid) to authenticated;

create or replace function public.enforce_group_structure_lifecycle()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public, pg_temp
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

  if public.is_authorized_tournament_maintenance(v_id) then
    if tg_op = 'DELETE' then return old; end if;
    return new;
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

create or replace function public.enforce_team_group_lifecycle()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public, pg_temp
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
  if public.is_authorized_tournament_maintenance(new.tournament_id) then return new; end if;
  select status into v_status from public.tournaments
  where id = new.tournament_id for update;
  if not found then raise exception 'tournament not found'; end if;
  if v_status not in ('draft', 'configured') then
    raise exception 'team group assignment is locked after tournament start';
  end if;
  return new;
end;
$$;

create or replace function public.enforce_team_ranking_lock()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_status text;
begin
  if tg_op = 'UPDATE' and new.ranking is not distinct from old.ranking then
    return new;
  end if;

  if public.is_authorized_tournament_maintenance(new.tournament_id) then return new; end if;

  select t.status into v_status
  from public.tournaments t
  where t.id = new.tournament_id;

  if v_status is null then
    raise exception 'tournament not found';
  end if;

  if v_status not in ('draft', 'configured') then
    raise exception 'team ranking is locked after tournament start';
  end if;

  return new;
end;
$$;

create or replace function public.enforce_tournament_structural_lock()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if not public.is_authorized_tournament_maintenance(old.id)
     and old.status not in ('draft', 'configured') and (
    new.name is distinct from old.name
    or new.teams_count is distinct from old.teams_count
    or new.teams_per_group is distinct from old.teams_per_group
    or new.gold_qualified_count is distinct from old.gold_qualified_count
    or new.silver_qualified_count is distinct from old.silver_qualified_count
    or new.courts_count is distinct from old.courts_count
    or new.allow_byes is distinct from old.allow_byes
    or new.theme_preset is distinct from old.theme_preset
    or new.theme_color is distinct from old.theme_color
  ) then
    raise exception 'tournament structure is locked after start';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.reset_tournament(p_tournament_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_previous_mode text := current_setting('app.maintenance_mode', true);
  v_previous_tournament text := current_setting('app.maintenance_tournament_id', true);
  v_tournament public.tournaments;
  v_deleted jsonb := '{}'::jsonb;
  v_count int;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select * into v_tournament
  from public.tournaments
  where id = p_tournament_id
  for update;

  if not found or not public.is_admin_for(p_tournament_id) then
    raise exception 'not authorized';
  end if;

  if v_tournament.status not in ('completed', 'archived') then
    raise exception 'tournament must be completed or archived before reset';
  end if;

  if not public.has_recent_valid_tournament_backup(p_tournament_id) then
    raise exception 'recent valid backup required before reset';
  end if;

  perform set_config('app.maintenance_mode', 'recovery', true);
  perform set_config('app.maintenance_tournament_id', p_tournament_id::text, true);

  delete from public.profiles where tournament_id = p_tournament_id and role <> 'admin';
  get diagnostics v_count = row_count;
  v_deleted := v_deleted || jsonb_build_object('profiles', v_count);

  delete from public.card_usages where match_id in (select id from public.matches where tournament_id = p_tournament_id);
  get diagnostics v_count = row_count;
  v_deleted := v_deleted || jsonb_build_object('cardUsages', v_count);

  delete from public.match_cards where match_id in (select id from public.matches where tournament_id = p_tournament_id);
  get diagnostics v_count = row_count;
  v_deleted := v_deleted || jsonb_build_object('matchCards', v_count);

  delete from public.match_events where tournament_id = p_tournament_id;
  get diagnostics v_count = row_count;
  v_deleted := v_deleted || jsonb_build_object('matchEvents', v_count);

  delete from public.tournament_events where tournament_id = p_tournament_id;
  get diagnostics v_count = row_count;
  v_deleted := v_deleted || jsonb_build_object('tournamentEvents', v_count);

  delete from public.global_event_winners where global_event_id in (select id from public.global_events where tournament_id = p_tournament_id);
  get diagnostics v_count = row_count;
  v_deleted := v_deleted || jsonb_build_object('globalEventWinners', v_count);

  delete from public.global_events where tournament_id = p_tournament_id;
  get diagnostics v_count = row_count;
  v_deleted := v_deleted || jsonb_build_object('globalEvents', v_count);

  delete from public.match_lineups where match_id in (select id from public.matches where tournament_id = p_tournament_id);
  get diagnostics v_count = row_count;
  v_deleted := v_deleted || jsonb_build_object('lineups', v_count);

  delete from public.matches where tournament_id = p_tournament_id;
  get diagnostics v_count = row_count;
  v_deleted := v_deleted || jsonb_build_object('matches', v_count);

  delete from public.rounds where tournament_id = p_tournament_id;
  get diagnostics v_count = row_count;
  v_deleted := v_deleted || jsonb_build_object('rounds', v_count);

  delete from public.players where tournament_id = p_tournament_id;
  get diagnostics v_count = row_count;
  v_deleted := v_deleted || jsonb_build_object('players', v_count);

  delete from public.teams where tournament_id = p_tournament_id;
  get diagnostics v_count = row_count;
  v_deleted := v_deleted || jsonb_build_object('teams', v_count);

  delete from public.groups where tournament_id = p_tournament_id;
  get diagnostics v_count = row_count;
  v_deleted := v_deleted || jsonb_build_object('groups', v_count);

  delete from public.courts where tournament_id = p_tournament_id;
  get diagnostics v_count = row_count;
  v_deleted := v_deleted || jsonb_build_object('courts', v_count);

  update public.tournaments
  set status = 'draft',
      phase = 'GROUP_STAGE',
      updated_at = now()
  where id = p_tournament_id;

  -- Restore prior context on success; errors roll back SET LOCAL with the RPC.
  perform set_config('app.maintenance_mode', coalesce(v_previous_mode, ''), true);
  perform set_config('app.maintenance_tournament_id', coalesce(v_previous_tournament, ''), true);

  return jsonb_build_object(
    'ok', true,
    'tournamentId', p_tournament_id,
    'status', 'draft',
    'deleted', v_deleted
  );
end;
$$;

-- Internal semantic validator; no writes and no maintenance activation.
create or replace function public.validate_recovery_payload(p_tournament_id uuid, p_payload jsonb)
returns void
language plpgsql
security invoker
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_key text;
  v_table text;
  v_row jsonb;
  v_ref jsonb;
  v_rule jsonb;
  v_id uuid;
  v_ids uuid[];
  v_existing uuid;
  v_exists boolean;
  v_target text;
  v_field text;
begin
  if jsonb_typeof(p_payload) is distinct from 'object'
     or jsonb_typeof(p_payload->'tournamentId') is distinct from 'string'
     or (p_payload->>'tournamentId')::uuid is distinct from p_tournament_id
     or jsonb_typeof(p_payload->'tournament') is distinct from 'object'
     or (p_payload#>>'{tournament,id}')::uuid is distinct from p_tournament_id then
    raise exception 'invalid backup tournament identity';
  end if;
  -- Enumerated names are trusted identifiers, never identifiers from payload.
  for v_key, v_table in select * from (values
    ('courts','courts'),('groups','groups'),('teams','teams'),('players','players'),
    ('rounds','rounds'),('matches','matches'),('lineups','match_lineups'),
    ('matchCards','match_cards'),('cardDefinitionsSnapshot','card_definitions'),
    ('globalEvents','global_events'),('tournamentEvents','tournament_events')
  ) as collections(key, table_name) loop
    if jsonb_typeof(p_payload->v_key) is distinct from 'array' then
      raise exception 'missing or invalid backup collection: %', v_key;
    end if;
    v_ids := array[]::uuid[];
    for v_row in select value from jsonb_array_elements(p_payload->v_key) loop
      if jsonb_typeof(v_row) is distinct from 'object'
         or jsonb_typeof(v_row->'id') is distinct from 'string' then
        raise exception 'invalid row in %', v_key;
      end if;
      v_id := (v_row->>'id')::uuid;
      if v_id = any(v_ids) then raise exception 'duplicate ID in %', v_key; end if;
      v_ids := array_append(v_ids,v_id);
      if v_key not in ('lineups','matchCards') then
        if v_key = 'cardDefinitionsSnapshot' and v_row->'tournament_id' = 'null'::jsonb then
          -- Shared definitions are references, not restorable global writes.
          if not exists (select 1 from public.card_definitions c where c.id=v_id and c.tournament_id is null) then
            raise exception 'global card definition must already exist';
          end if;
        elsif jsonb_typeof(v_row->'tournament_id') is distinct from 'string'
           or (v_row->>'tournament_id')::uuid is distinct from p_tournament_id then
          raise exception 'foreign or missing tournament_id in %',v_key;
        end if;
      elsif v_row ? 'tournament_id' and (v_row->>'tournament_id')::uuid is distinct from p_tournament_id then
        raise exception 'foreign tournament_id in %',v_key;
      end if;
      if v_key = 'cardDefinitionsSnapshot' then
        select c.tournament_id into v_existing from public.card_definitions c where c.id=v_id for share;
        if found and v_existing is distinct from (v_row->>'tournament_id')::uuid then
          raise exception 'card definition ownership mismatch';
        end if;
      else
        -- Do not let any payload UUID collide with existing records, including B.
        execute format('select exists (select 1 from public.%I where id=$1)', v_table) into v_exists using v_id;
        if v_exists then raise exception 'restore row already exists in %',v_key; end if;
      end if;
    end loop;
  end loop;

  -- Each indirect reference must resolve inside this validated backup graph,
  -- except retained dice rules and actor profiles, checked explicitly below.
  for v_rule in select value from jsonb_array_elements('[
    ["groups","assigned_court_id","courts",false],
    ["teams","group_id","groups",false],
    ["players","team_id","teams",true],
    ["matches","round_id","rounds",true],
    ["matches","group_id","groups",false],
    ["matches","court_id","courts",true],
    ["matches","team_a_id","teams",true],
    ["matches","team_b_id","teams",true],
    ["lineups","match_id","matches",true],
    ["lineups","team_id","teams",true],
    ["lineups","active_player_1_id","players",true],
    ["lineups","active_player_2_id","players",true],
    ["lineups","bench_player_id","players",false],
    ["matchCards","match_id","matches",true],
    ["matchCards","team_id","teams",true],
    ["matchCards","card_definition_id","cardDefinitionsSnapshot",true],
    ["matchCards","stolen_from_team_id","teams",false],
    ["globalEvents","winner_player_id","players",false],
    ["globalEvents","winner_team_id","teams",false],
    ["tournamentEvents","round_id","rounds",false]
  ]'::jsonb) loop
    v_key := v_rule->>0; v_field := v_rule->>1; v_target := v_rule->>2;
    for v_row in select value from jsonb_array_elements(p_payload->v_key) loop
      if v_row->>v_field is null then
        if (v_rule->>3)::boolean then raise exception 'missing reference %.%',v_key,v_field; end if;
      else
        if jsonb_typeof(v_row->v_field) is distinct from 'string' then raise exception 'invalid UUID reference'; end if;
        v_id := (v_row->>v_field)::uuid;
        select value into v_ref from jsonb_array_elements(p_payload->v_target) where (value->>'id')::uuid=v_id;
        if not found then raise exception 'foreign or missing reference %.%',v_key,v_field; end if;
        if v_key='lineups' and v_target='players' and (v_ref->>'team_id')::uuid is distinct from (v_row->>'team_id')::uuid then
          raise exception 'lineup player belongs to another team';
        end if;
        if v_key in ('lineups','matchCards') and v_target='matches'
           and (v_row->>'team_id')::uuid not in ((v_ref->>'team_a_id')::uuid,(v_ref->>'team_b_id')::uuid) then
          raise exception 'team does not participate in referenced match';
        end if;
      end if;
    end loop;
  end loop;
  for v_row in select value from jsonb_array_elements(p_payload->'rounds') loop
    if v_row->>'dice_rule_id' is not null then
      select d.tournament_id into v_existing from public.dice_rules d
      where d.id=(v_row->>'dice_rule_id')::uuid for share;
      if not found or v_existing is distinct from p_tournament_id then
        raise exception 'foreign or missing dice rule';
      end if;
    end if;
  end loop;
  for v_row in select value from jsonb_array_elements(p_payload->'tournamentEvents') loop
    if v_row->>'actor_user_id' is not null then
      select p.tournament_id into v_existing from public.profiles p
      where p.id=(v_row->>'actor_user_id')::uuid for share;
      if not found or v_existing is distinct from p_tournament_id then
        raise exception 'foreign or missing event actor';
      end if;
    end if;
  end loop;
end;
$$;
revoke all on function public.validate_recovery_payload(uuid,jsonb) from public, anon, authenticated;

create or replace function public.restore_tournament_backup(p_backup_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_previous_mode text := current_setting('app.maintenance_mode', true);
  v_previous_tournament text := current_setting('app.maintenance_tournament_id', true);
  v_backup public.tournament_backups;
  v_tournament_id uuid;
  v_restored jsonb := '{}'::jsonb;
  v_count int;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select * into v_backup
  from public.tournament_backups
  where id = p_backup_id
  for update;

  if not found or not public.is_admin_for(v_backup.tournament_id) then
    raise exception 'not authorized';
  end if;

  if v_backup.schema_version is distinct from 1
     or jsonb_typeof(v_backup.payload) is distinct from 'object'
     or jsonb_typeof(v_backup.payload->'schemaVersion') is distinct from 'number'
     or v_backup.payload->'schemaVersion' is distinct from '1'::jsonb then
    raise exception 'unsupported backup schema version';
  end if;

  if v_backup.checksum is null or v_backup.checksum is distinct from public.backup_payload_sha256(v_backup.payload) then
    raise exception 'backup checksum mismatch';
  end if;

  v_tournament_id := (v_backup.payload ->> 'tournamentId')::uuid;
  if v_tournament_id is null or v_tournament_id is distinct from v_backup.tournament_id then
    raise exception 'backup tournament mismatch';
  end if;

  perform public.validate_recovery_payload(v_tournament_id, v_backup.payload);

  perform id from public.tournaments where id = v_tournament_id for update;
  if not found then raise exception 'tournament not found'; end if;

  if exists (
    select 1
    from public.courts c
    where c.tournament_id = v_tournament_id
      and c.id in (select (item ->> 'id')::uuid from jsonb_array_elements(v_backup.payload -> 'courts') item)
  ) or exists (
    select 1
    from public.groups g
    where g.tournament_id = v_tournament_id
      and g.id in (select (item ->> 'id')::uuid from jsonb_array_elements(v_backup.payload -> 'groups') item)
  ) or exists (
    select 1
    from public.teams t
    where t.tournament_id = v_tournament_id
      and t.id in (select (item ->> 'id')::uuid from jsonb_array_elements(v_backup.payload -> 'teams') item)
  ) or exists (
    select 1
    from public.matches m
    where m.tournament_id = v_tournament_id
      and m.id in (select (item ->> 'id')::uuid from jsonb_array_elements(v_backup.payload -> 'matches') item)
  ) then
    raise exception 'restore target still contains event data; reset first or review collision';
  end if;

  perform set_config('app.maintenance_mode', 'recovery', true);
  perform set_config('app.maintenance_tournament_id', v_tournament_id::text, true);

  update public.tournaments
  set name = coalesce(v_backup.payload #>> '{tournament,name}', name),
      phase = coalesce((v_backup.payload #>> '{tournament,phase}')::public.tournament_phase, phase),
      status = 'archived',
      updated_at = now()
  where id = v_tournament_id;

  insert into public.courts (id, tournament_id, name, display_slug, sort_order, created_at)
  select id, tournament_id, name, display_slug, sort_order, created_at
  from jsonb_to_recordset(v_backup.payload -> 'courts') as x(
    id uuid,
    tournament_id uuid,
    name text,
    display_slug text,
    sort_order int,
    created_at timestamptz
  );
  get diagnostics v_count = row_count;
  v_restored := v_restored || jsonb_build_object('courts', v_count);

  insert into public.groups (id, tournament_id, assigned_court_id, name, sort_order, created_at)
  select id, tournament_id, assigned_court_id, name, sort_order, created_at
  from jsonb_to_recordset(v_backup.payload -> 'groups') as x(
    id uuid,
    tournament_id uuid,
    assigned_court_id uuid,
    name text,
    sort_order int,
    created_at timestamptz
  );
  get diagnostics v_count = row_count;
  v_restored := v_restored || jsonb_build_object('groups', v_count);

  insert into public.teams (id, tournament_id, group_id, name, short_name, color, created_at, updated_at, ranking)
  select id, tournament_id, group_id, name, short_name, color, created_at, updated_at, ranking
  from jsonb_to_recordset(v_backup.payload -> 'teams') as x(
    id uuid,
    tournament_id uuid,
    group_id uuid,
    name text,
    short_name text,
    color text,
    created_at timestamptz,
    updated_at timestamptz,
    ranking int
  );
  get diagnostics v_count = row_count;
  v_restored := v_restored || jsonb_build_object('teams', v_count);

  insert into public.players (id, tournament_id, team_id, full_name, nickname, gender, created_at)
  select id, tournament_id, team_id, full_name, nickname, gender, created_at
  from jsonb_to_recordset(v_backup.payload -> 'players') as x(
    id uuid,
    tournament_id uuid,
    team_id uuid,
    full_name text,
    nickname text,
    gender public.player_gender,
    created_at timestamptz
  );
  get diagnostics v_count = row_count;
  v_restored := v_restored || jsonb_build_object('players', v_count);

  insert into public.card_definitions (id, tournament_id, name, slug, description, effect_type, target_type, duration_type, duration_value, can_be_stolen, enabled, created_at)
  select id, tournament_id, name, slug, description, effect_type, target_type, duration_type, duration_value, can_be_stolen, enabled, created_at
  from jsonb_to_recordset(v_backup.payload -> 'cardDefinitionsSnapshot') as x(
    id uuid,
    tournament_id uuid,
    name text,
    slug text,
    description text,
    effect_type text,
    target_type text,
    duration_type public.card_duration_type,
    duration_value int,
    can_be_stolen boolean,
    enabled boolean,
    created_at timestamptz
  )
  where tournament_id = v_tournament_id
  on conflict do nothing;
  get diagnostics v_count = row_count;
  v_restored := v_restored || jsonb_build_object('cardDefinitionsSnapshot', v_count);

  -- Also cover a concurrent insert that won ON CONFLICT after validation.
  -- Lock all resolved cards and reject ownership changes before linking them.
  perform c.id from public.card_definitions c
  where c.id in (select (value->>'id')::uuid
                from jsonb_array_elements(v_backup.payload->'cardDefinitionsSnapshot'))
  order by c.id for share;
  if exists (
    select 1 from jsonb_array_elements(v_backup.payload->'cardDefinitionsSnapshot') item
    left join public.card_definitions c on c.id=(item->>'id')::uuid
    where c.id is null or c.tournament_id is distinct from (item->>'tournament_id')::uuid
  ) then raise exception 'card definition missing or ownership changed during restore'; end if;

  insert into public.rounds (id, tournament_id, name, stage, sequence, status, dice_result, dice_rule_id, dice_started_at, dice_ends_at, created_at)
  select id, tournament_id, name, stage, sequence, status, dice_result, dice_rule_id, dice_started_at, dice_ends_at, created_at
  from jsonb_to_recordset(v_backup.payload -> 'rounds') as x(
    id uuid,
    tournament_id uuid,
    name text,
    stage public.round_stage,
    sequence int,
    status public.round_status,
    dice_result int,
    dice_rule_id uuid,
    dice_started_at timestamptz,
    dice_ends_at timestamptz,
    created_at timestamptz
  );
  get diagnostics v_count = row_count;
  v_restored := v_restored || jsonb_build_object('rounds', v_count);

  insert into public.matches (
    id,
    tournament_id,
    round_id,
    group_id,
    court_id,
    team_a_id,
    team_b_id,
    status,
    current_set,
    games_a,
    games_b,
    sets_a,
    sets_b,
    super_tiebreak_team_a,
    super_tiebreak_team_b,
    set_1_started_at,
    set_1_ended_at,
    set_2_started_at,
    set_2_ended_at,
    started_at,
    completed_at,
    created_at,
    updated_at
  )
  select
    id,
    tournament_id,
    round_id,
    group_id,
    court_id,
    team_a_id,
    team_b_id,
    status,
    current_set,
    games_a,
    games_b,
    sets_a,
    sets_b,
    super_tiebreak_team_a,
    super_tiebreak_team_b,
    set_1_started_at,
    set_1_ended_at,
    set_2_started_at,
    set_2_ended_at,
    started_at,
    completed_at,
    created_at,
    updated_at
  from jsonb_to_recordset(v_backup.payload -> 'matches') as x(
    id uuid,
    tournament_id uuid,
    round_id uuid,
    group_id uuid,
    court_id uuid,
    team_a_id uuid,
    team_b_id uuid,
    status public.match_status,
    current_set int,
    games_a int,
    games_b int,
    sets_a int,
    sets_b int,
    super_tiebreak_team_a int,
    super_tiebreak_team_b int,
    set_1_started_at timestamptz,
    set_1_ended_at timestamptz,
    set_2_started_at timestamptz,
    set_2_ended_at timestamptz,
    started_at timestamptz,
    completed_at timestamptz,
    created_at timestamptz,
    updated_at timestamptz
  );
  get diagnostics v_count = row_count;
  v_restored := v_restored || jsonb_build_object('matches', v_count);

  insert into public.match_lineups (id, match_id, team_id, set_number, active_player_1_id, active_player_2_id, bench_player_id, created_at)
  select id, match_id, team_id, set_number, active_player_1_id, active_player_2_id, bench_player_id, created_at
  from jsonb_to_recordset(v_backup.payload -> 'lineups') as x(
    id uuid,
    match_id uuid,
    team_id uuid,
    set_number int,
    active_player_1_id uuid,
    active_player_2_id uuid,
    bench_player_id uuid,
    created_at timestamptz
  );
  get diagnostics v_count = row_count;
  v_restored := v_restored || jsonb_build_object('lineups', v_count);

  insert into public.match_cards (id, match_id, team_id, card_definition_id, status, used_in_set, activated_at, expires_at, remaining_games, stolen_from_team_id, created_at)
  select id, match_id, team_id, card_definition_id, status, used_in_set, activated_at, expires_at, remaining_games, stolen_from_team_id, created_at
  from jsonb_to_recordset(v_backup.payload -> 'matchCards') as x(
    id uuid,
    match_id uuid,
    team_id uuid,
    card_definition_id uuid,
    status public.card_status,
    used_in_set int,
    activated_at timestamptz,
    expires_at timestamptz,
    remaining_games int,
    stolen_from_team_id uuid,
    created_at timestamptz
  );
  get diagnostics v_count = row_count;
  v_restored := v_restored || jsonb_build_object('matchCards', v_count);

  insert into public.global_events (id, tournament_id, type, title, description, prize, status, started_at, completed_at, winner_player_id, winner_team_id, created_at)
  select id, tournament_id, type, title, description, prize, status, started_at, completed_at, winner_player_id, winner_team_id, created_at
  from jsonb_to_recordset(v_backup.payload -> 'globalEvents') as x(
    id uuid,
    tournament_id uuid,
    type text,
    title text,
    description text,
    prize text,
    status public.global_event_status,
    started_at timestamptz,
    completed_at timestamptz,
    winner_player_id uuid,
    winner_team_id uuid,
    created_at timestamptz
  );
  get diagnostics v_count = row_count;
  v_restored := v_restored || jsonb_build_object('globalEvents', v_count);

  insert into public.tournament_events (id, tournament_id, round_id, type, payload, actor_user_id, created_at)
  select id, tournament_id, round_id, type, payload, actor_user_id, created_at
  from jsonb_to_recordset(v_backup.payload -> 'tournamentEvents') as x(
    id uuid,
    tournament_id uuid,
    round_id uuid,
    type public.match_event_type,
    payload jsonb,
    actor_user_id uuid,
    created_at timestamptz
  );
  get diagnostics v_count = row_count;
  v_restored := v_restored || jsonb_build_object('tournamentEvents', v_count);

  -- Restore prior context on success; errors roll back SET LOCAL with the RPC.
  perform set_config('app.maintenance_mode', coalesce(v_previous_mode, ''), true);
  perform set_config('app.maintenance_tournament_id', coalesce(v_previous_tournament, ''), true);

  return jsonb_build_object(
    'ok', true,
    'tournamentId', v_tournament_id,
    'restored', v_restored
  );
end;
$$;

-- CREATE OR REPLACE preserves existing ownership. Explicitly retain only
-- authenticated entry points; helper cannot enable context and has no writes.
revoke execute on function public.reset_tournament(uuid) from public, anon;
revoke execute on function public.restore_tournament_backup(uuid) from public, anon;
grant execute on function public.reset_tournament(uuid) to authenticated;
grant execute on function public.restore_tournament_backup(uuid) to authenticated;
revoke execute on function public.enforce_group_structure_lifecycle() from public, anon, authenticated;
revoke execute on function public.enforce_team_group_lifecycle() from public, anon, authenticated;
revoke execute on function public.enforce_team_ranking_lock() from public, anon, authenticated;
revoke execute on function public.enforce_tournament_structural_lock() from public, anon, authenticated;
commit;
