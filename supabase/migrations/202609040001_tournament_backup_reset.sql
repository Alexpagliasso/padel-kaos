create extension if not exists pgcrypto with schema extensions;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'tournaments_status_lifecycle_check'
  ) then
    alter table tournaments
      add constraint tournaments_status_lifecycle_check
      check (status in ('draft', 'configured', 'live', 'completed', 'archived'));
  end if;
end;
$$;

create table if not exists tournament_backups (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  schema_version int not null check (schema_version = 1),
  backup_type text not null default 'server_snapshot',
  payload jsonb not null,
  checksum text not null check (checksum ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '48 hours',
  created_by uuid references profiles(id),
  constraint tournament_backups_expiry_check check (expires_at > created_at),
  constraint tournament_backups_payload_checksum_check check ((payload ->> 'checksum') = checksum),
  constraint tournament_backups_payload_tournament_check check ((payload ->> 'tournamentId')::uuid = tournament_id),
  constraint tournament_backups_payload_schema_check check ((payload ->> 'schemaVersion')::int = schema_version)
);

create index if not exists tournament_backups_tournament_created_idx on tournament_backups(tournament_id, created_at desc);
create index if not exists tournament_backups_valid_recent_idx on tournament_backups(tournament_id, expires_at desc) where schema_version = 1;

alter table tournament_backups enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tournament_backups' and policyname = 'tournament_backups_admin_select') then
    create policy tournament_backups_admin_select on tournament_backups for select using (is_admin_for(tournament_id));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tournament_backups' and policyname = 'tournament_backups_admin_insert') then
    create policy tournament_backups_admin_insert on tournament_backups for insert with check (is_admin_for(tournament_id));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tournament_backups' and policyname = 'tournament_backups_admin_delete') then
    create policy tournament_backups_admin_delete on tournament_backups for delete using (is_admin_for(tournament_id));
  end if;
end;
$$;

create or replace function backup_payload_sha256(p_payload jsonb)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select encode(extensions.digest(convert_to((p_payload - 'checksum')::text, 'UTF8'), 'sha256'), 'hex')
$$;

create or replace function has_recent_valid_tournament_backup(p_tournament_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from tournament_backups tb
    where tb.tournament_id = p_tournament_id
      and tb.schema_version = 1
      and tb.created_at >= now() - interval '48 hours'
      and tb.expires_at > now()
      and tb.checksum = backup_payload_sha256(tb.payload)
  )
$$;

create or replace function create_tournament_backup_snapshot(p_tournament_id uuid, p_backup_type text default 'server_snapshot')
returns tournament_backups
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tournament tournaments;
  v_payload jsonb;
  v_checksum text;
  v_backup tournament_backups;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select * into v_tournament
  from tournaments
  where id = p_tournament_id;

  if not found or not is_admin_for(p_tournament_id) then
    raise exception 'not authorized';
  end if;

  v_payload := jsonb_build_object(
    'schemaVersion', 1,
    'appVersion', '0.0.0',
    'backupType', p_backup_type,
    'tournamentId', v_tournament.id,
    'tournamentName', v_tournament.name,
    'exportedAt', now(),
    'tournament', to_jsonb(v_tournament),
    'groups', coalesce((select jsonb_agg(to_jsonb(g) order by g.sort_order, g.name) from groups g where g.tournament_id = p_tournament_id), '[]'::jsonb),
    'courts', coalesce((select jsonb_agg(to_jsonb(c) order by c.sort_order, c.name) from courts c where c.tournament_id = p_tournament_id), '[]'::jsonb),
    'rounds', coalesce((select jsonb_agg(to_jsonb(r) order by r.sequence, r.name) from rounds r where r.tournament_id = p_tournament_id), '[]'::jsonb),
    'teams', coalesce((select jsonb_agg(to_jsonb(t) order by t.short_name, t.name) from teams t where t.tournament_id = p_tournament_id), '[]'::jsonb),
    'players', coalesce((select jsonb_agg(to_jsonb(p) order by p.team_id, p.nickname) from players p where p.tournament_id = p_tournament_id), '[]'::jsonb),
    'matches', coalesce((select jsonb_agg(to_jsonb(m) order by m.created_at, m.id) from matches m where m.tournament_id = p_tournament_id), '[]'::jsonb),
    'lineups', coalesce((
      select jsonb_agg(to_jsonb(ml) order by ml.match_id, ml.team_id, ml.set_number)
      from match_lineups ml
      join matches m on m.id = ml.match_id
      where m.tournament_id = p_tournament_id
    ), '[]'::jsonb),
    'cardDefinitionsSnapshot', coalesce((
      select jsonb_agg(to_jsonb(cd) order by cd.tournament_id nulls first, cd.slug)
      from card_definitions cd
      where cd.tournament_id = p_tournament_id or cd.tournament_id is null
    ), '[]'::jsonb),
    'matchCards', coalesce((
      select jsonb_agg(to_jsonb(mc) order by mc.match_id, mc.team_id, mc.created_at)
      from match_cards mc
      join matches m on m.id = mc.match_id
      where m.tournament_id = p_tournament_id
    ), '[]'::jsonb),
    'globalEvents', coalesce((select jsonb_agg(to_jsonb(ge) order by ge.created_at) from global_events ge where ge.tournament_id = p_tournament_id), '[]'::jsonb),
    'tournamentEvents', coalesce((select jsonb_agg(to_jsonb(te) order by te.created_at) from tournament_events te where te.tournament_id = p_tournament_id), '[]'::jsonb)
  );

  v_checksum := backup_payload_sha256(v_payload);
  v_payload := v_payload || jsonb_build_object('checksum', v_checksum);

  insert into tournament_backups (tournament_id, schema_version, backup_type, payload, checksum, created_by)
  values (p_tournament_id, 1, p_backup_type, v_payload, v_checksum, auth.uid())
  returning * into v_backup;

  return v_backup;
end;
$$;

create or replace function reset_tournament(p_tournament_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tournament tournaments;
  v_deleted jsonb := '{}'::jsonb;
  v_count int;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select * into v_tournament
  from tournaments
  where id = p_tournament_id
  for update;

  if not found or not is_admin_for(p_tournament_id) then
    raise exception 'not authorized';
  end if;

  if v_tournament.status not in ('completed', 'archived') then
    raise exception 'tournament must be completed or archived before reset';
  end if;

  if not has_recent_valid_tournament_backup(p_tournament_id) then
    raise exception 'recent valid backup required before reset';
  end if;

  delete from profiles where tournament_id = p_tournament_id and role <> 'admin';
  get diagnostics v_count = row_count;
  v_deleted := v_deleted || jsonb_build_object('profiles', v_count);

  delete from card_usages where match_id in (select id from matches where tournament_id = p_tournament_id);
  get diagnostics v_count = row_count;
  v_deleted := v_deleted || jsonb_build_object('cardUsages', v_count);

  delete from match_cards where match_id in (select id from matches where tournament_id = p_tournament_id);
  get diagnostics v_count = row_count;
  v_deleted := v_deleted || jsonb_build_object('matchCards', v_count);

  delete from match_events where tournament_id = p_tournament_id;
  get diagnostics v_count = row_count;
  v_deleted := v_deleted || jsonb_build_object('matchEvents', v_count);

  delete from tournament_events where tournament_id = p_tournament_id;
  get diagnostics v_count = row_count;
  v_deleted := v_deleted || jsonb_build_object('tournamentEvents', v_count);

  delete from global_event_winners where global_event_id in (select id from global_events where tournament_id = p_tournament_id);
  get diagnostics v_count = row_count;
  v_deleted := v_deleted || jsonb_build_object('globalEventWinners', v_count);

  delete from global_events where tournament_id = p_tournament_id;
  get diagnostics v_count = row_count;
  v_deleted := v_deleted || jsonb_build_object('globalEvents', v_count);

  delete from match_lineups where match_id in (select id from matches where tournament_id = p_tournament_id);
  get diagnostics v_count = row_count;
  v_deleted := v_deleted || jsonb_build_object('lineups', v_count);

  delete from matches where tournament_id = p_tournament_id;
  get diagnostics v_count = row_count;
  v_deleted := v_deleted || jsonb_build_object('matches', v_count);

  delete from rounds where tournament_id = p_tournament_id;
  get diagnostics v_count = row_count;
  v_deleted := v_deleted || jsonb_build_object('rounds', v_count);

  delete from players where tournament_id = p_tournament_id;
  get diagnostics v_count = row_count;
  v_deleted := v_deleted || jsonb_build_object('players', v_count);

  delete from teams where tournament_id = p_tournament_id;
  get diagnostics v_count = row_count;
  v_deleted := v_deleted || jsonb_build_object('teams', v_count);

  delete from groups where tournament_id = p_tournament_id;
  get diagnostics v_count = row_count;
  v_deleted := v_deleted || jsonb_build_object('groups', v_count);

  delete from courts where tournament_id = p_tournament_id;
  get diagnostics v_count = row_count;
  v_deleted := v_deleted || jsonb_build_object('courts', v_count);

  update tournaments
  set status = 'draft',
      phase = 'GROUP_STAGE',
      updated_at = now()
  where id = p_tournament_id;

  return jsonb_build_object(
    'ok', true,
    'tournamentId', p_tournament_id,
    'status', 'draft',
    'deleted', v_deleted
  );
end;
$$;

create or replace function restore_tournament_backup(p_backup_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_backup tournament_backups;
  v_tournament_id uuid;
  v_restored jsonb := '{}'::jsonb;
  v_count int;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select * into v_backup
  from tournament_backups
  where id = p_backup_id
  for update;

  if not found or not is_admin_for(v_backup.tournament_id) then
    raise exception 'not authorized';
  end if;

  if v_backup.schema_version <> 1 or (v_backup.payload ->> 'schemaVersion')::int <> 1 then
    raise exception 'unsupported backup schema version';
  end if;

  if v_backup.checksum <> backup_payload_sha256(v_backup.payload) then
    raise exception 'backup checksum mismatch';
  end if;

  v_tournament_id := (v_backup.payload ->> 'tournamentId')::uuid;
  if v_tournament_id <> v_backup.tournament_id then
    raise exception 'backup tournament mismatch';
  end if;

  if exists (
    select 1
    from courts c
    where c.tournament_id = v_tournament_id
      and c.id in (select (item ->> 'id')::uuid from jsonb_array_elements(v_backup.payload -> 'courts') item)
  ) or exists (
    select 1
    from groups g
    where g.tournament_id = v_tournament_id
      and g.id in (select (item ->> 'id')::uuid from jsonb_array_elements(v_backup.payload -> 'groups') item)
  ) or exists (
    select 1
    from teams t
    where t.tournament_id = v_tournament_id
      and t.id in (select (item ->> 'id')::uuid from jsonb_array_elements(v_backup.payload -> 'teams') item)
  ) or exists (
    select 1
    from matches m
    where m.tournament_id = v_tournament_id
      and m.id in (select (item ->> 'id')::uuid from jsonb_array_elements(v_backup.payload -> 'matches') item)
  ) then
    raise exception 'restore target still contains event data; reset first or review collision';
  end if;

  update tournaments
  set name = coalesce(v_backup.payload #>> '{tournament,name}', name),
      phase = coalesce((v_backup.payload #>> '{tournament,phase}')::tournament_phase, phase),
      status = 'archived',
      updated_at = now()
  where id = v_tournament_id;

  insert into courts (id, tournament_id, name, display_slug, sort_order, created_at)
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

  insert into groups (id, tournament_id, assigned_court_id, name, sort_order, created_at)
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

  insert into teams (id, tournament_id, group_id, name, short_name, color, created_at, updated_at)
  select id, tournament_id, group_id, name, short_name, color, created_at, updated_at
  from jsonb_to_recordset(v_backup.payload -> 'teams') as x(
    id uuid,
    tournament_id uuid,
    group_id uuid,
    name text,
    short_name text,
    color text,
    created_at timestamptz,
    updated_at timestamptz
  );
  get diagnostics v_count = row_count;
  v_restored := v_restored || jsonb_build_object('teams', v_count);

  insert into players (id, tournament_id, team_id, full_name, nickname, gender, created_at)
  select id, tournament_id, team_id, full_name, nickname, gender, created_at
  from jsonb_to_recordset(v_backup.payload -> 'players') as x(
    id uuid,
    tournament_id uuid,
    team_id uuid,
    full_name text,
    nickname text,
    gender player_gender,
    created_at timestamptz
  );
  get diagnostics v_count = row_count;
  v_restored := v_restored || jsonb_build_object('players', v_count);

  insert into card_definitions (id, tournament_id, name, slug, description, effect_type, target_type, duration_type, duration_value, can_be_stolen, enabled, created_at)
  select id, tournament_id, name, slug, description, effect_type, target_type, duration_type, duration_value, can_be_stolen, enabled, created_at
  from jsonb_to_recordset(v_backup.payload -> 'cardDefinitionsSnapshot') as x(
    id uuid,
    tournament_id uuid,
    name text,
    slug text,
    description text,
    effect_type text,
    target_type text,
    duration_type card_duration_type,
    duration_value int,
    can_be_stolen boolean,
    enabled boolean,
    created_at timestamptz
  )
  on conflict do nothing;
  get diagnostics v_count = row_count;
  v_restored := v_restored || jsonb_build_object('cardDefinitionsSnapshot', v_count);

  insert into rounds (id, tournament_id, name, stage, sequence, status, dice_result, dice_rule_id, dice_started_at, dice_ends_at, created_at)
  select id, tournament_id, name, stage, sequence, status, dice_result, dice_rule_id, dice_started_at, dice_ends_at, created_at
  from jsonb_to_recordset(v_backup.payload -> 'rounds') as x(
    id uuid,
    tournament_id uuid,
    name text,
    stage round_stage,
    sequence int,
    status round_status,
    dice_result int,
    dice_rule_id uuid,
    dice_started_at timestamptz,
    dice_ends_at timestamptz,
    created_at timestamptz
  );
  get diagnostics v_count = row_count;
  v_restored := v_restored || jsonb_build_object('rounds', v_count);

  insert into matches (
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
    status match_status,
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

  insert into match_lineups (id, match_id, team_id, set_number, active_player_1_id, active_player_2_id, bench_player_id, created_at)
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

  insert into match_cards (id, match_id, team_id, card_definition_id, status, used_in_set, activated_at, expires_at, remaining_games, stolen_from_team_id, created_at)
  select id, match_id, team_id, card_definition_id, status, used_in_set, activated_at, expires_at, remaining_games, stolen_from_team_id, created_at
  from jsonb_to_recordset(v_backup.payload -> 'matchCards') as x(
    id uuid,
    match_id uuid,
    team_id uuid,
    card_definition_id uuid,
    status card_status,
    used_in_set int,
    activated_at timestamptz,
    expires_at timestamptz,
    remaining_games int,
    stolen_from_team_id uuid,
    created_at timestamptz
  );
  get diagnostics v_count = row_count;
  v_restored := v_restored || jsonb_build_object('matchCards', v_count);

  insert into global_events (id, tournament_id, type, title, description, prize, status, started_at, completed_at, winner_player_id, winner_team_id, created_at)
  select id, tournament_id, type, title, description, prize, status, started_at, completed_at, winner_player_id, winner_team_id, created_at
  from jsonb_to_recordset(v_backup.payload -> 'globalEvents') as x(
    id uuid,
    tournament_id uuid,
    type text,
    title text,
    description text,
    prize text,
    status global_event_status,
    started_at timestamptz,
    completed_at timestamptz,
    winner_player_id uuid,
    winner_team_id uuid,
    created_at timestamptz
  );
  get diagnostics v_count = row_count;
  v_restored := v_restored || jsonb_build_object('globalEvents', v_count);

  insert into tournament_events (id, tournament_id, round_id, type, payload, actor_user_id, created_at)
  select id, tournament_id, round_id, type, payload, actor_user_id, created_at
  from jsonb_to_recordset(v_backup.payload -> 'tournamentEvents') as x(
    id uuid,
    tournament_id uuid,
    round_id uuid,
    type match_event_type,
    payload jsonb,
    actor_user_id uuid,
    created_at timestamptz
  );
  get diagnostics v_count = row_count;
  v_restored := v_restored || jsonb_build_object('tournamentEvents', v_count);

  return jsonb_build_object(
    'ok', true,
    'tournamentId', v_tournament_id,
    'restored', v_restored
  );
end;
$$;

revoke execute on function backup_payload_sha256(jsonb) from public;
revoke execute on function has_recent_valid_tournament_backup(uuid) from public;
revoke execute on function create_tournament_backup_snapshot(uuid, text) from public;
revoke execute on function reset_tournament(uuid) from public;
revoke execute on function restore_tournament_backup(uuid) from public;

grant execute on function backup_payload_sha256(jsonb) to authenticated;
grant execute on function has_recent_valid_tournament_backup(uuid) to authenticated;
grant execute on function create_tournament_backup_snapshot(uuid, text) to authenticated;
grant execute on function reset_tournament(uuid) to authenticated;
grant execute on function restore_tournament_backup(uuid) to authenticated;
