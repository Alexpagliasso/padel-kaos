-- ADMIN TEAM ROSTER APPLY SCRIPT.
-- RUN FROM SUPABASE SQL EDITOR.
-- Applies first/last player names and atomic admin roster RPCs.
-- DO NOT RUN WITHOUT REVIEWING ON A DATABASE WITH EXISTING DATA.

alter table players
  add column if not exists first_name text,
  add column if not exists last_name text;

update players
set
  first_name = coalesce(nullif(btrim(first_name), ''), split_part(btrim(full_name), ' ', 1)),
  last_name = coalesce(
    nullif(btrim(last_name), ''),
    nullif(btrim(substr(btrim(full_name), length(split_part(btrim(full_name), ' ', 1)) + 1)), ''),
    nickname
  )
where first_name is null
  or last_name is null
  or btrim(first_name) = ''
  or btrim(last_name) = '';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'players_first_name_not_blank'
  ) then
    alter table players
      add constraint players_first_name_not_blank check (first_name is null or btrim(first_name) <> '');
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'players_last_name_not_blank'
  ) then
    alter table players
      add constraint players_last_name_not_blank check (last_name is null or btrim(last_name) <> '');
  end if;
end $$;

create or replace function validate_roster_payload(p_players jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player jsonb;
begin
  if jsonb_typeof(p_players) <> 'array' or jsonb_array_length(p_players) <> 3 then
    raise exception 'exactly 3 players are required';
  end if;

  for v_player in select * from jsonb_array_elements(p_players)
  loop
    if nullif(btrim(v_player ->> 'firstName'), '') is null then
      raise exception 'player first name is required';
    end if;
    if nullif(btrim(v_player ->> 'lastName'), '') is null then
      raise exception 'player last name is required';
    end if;
    if (v_player ->> 'gender') not in ('male', 'female') then
      raise exception 'player gender is required';
    end if;
  end loop;
end;
$$;

create or replace function create_team_with_roster(
  p_tournament_id uuid,
  p_name text,
  p_color text,
  p_players jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tournament tournaments;
  v_team_id uuid;
  v_player jsonb;
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

  if v_tournament.status not in ('draft', 'configured') then
    raise exception 'roster can only be changed while tournament is draft or configured';
  end if;

  if nullif(btrim(p_name), '') is null then
    raise exception 'team name is required';
  end if;

  perform validate_roster_payload(p_players);

  insert into teams (tournament_id, name, short_name, color)
  values (
    p_tournament_id,
    btrim(p_name),
    upper(left(regexp_replace(btrim(p_name), '[^[:alnum:]]+', '', 'g'), 4)),
    coalesce(nullif(btrim(p_color), ''), '#FFD000')
  )
  returning id into v_team_id;

  for v_player in select * from jsonb_array_elements(p_players)
  loop
    insert into players (tournament_id, team_id, first_name, last_name, full_name, nickname, gender)
    values (
      p_tournament_id,
      v_team_id,
      btrim(v_player ->> 'firstName'),
      btrim(v_player ->> 'lastName'),
      btrim((v_player ->> 'firstName') || ' ' || (v_player ->> 'lastName')),
      btrim(v_player ->> 'firstName'),
      (v_player ->> 'gender')::player_gender
    );
  end loop;

  return v_team_id;
end;
$$;

create or replace function update_team_with_roster(
  p_team_id uuid,
  p_name text,
  p_color text,
  p_players jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team teams;
  v_tournament tournaments;
  v_player jsonb;
  v_seen_player_ids uuid[] := '{}';
  v_player_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select * into v_team
  from teams
  where id = p_team_id
  for update;

  if not found or not is_admin_for(v_team.tournament_id) then
    raise exception 'not authorized';
  end if;

  select * into v_tournament
  from tournaments
  where id = v_team.tournament_id
  for update;

  if v_tournament.status not in ('draft', 'configured') then
    raise exception 'roster can only be changed while tournament is draft or configured';
  end if;

  if nullif(btrim(p_name), '') is null then
    raise exception 'team name is required';
  end if;

  perform validate_roster_payload(p_players);

  update teams
  set
    name = btrim(p_name),
    short_name = upper(left(regexp_replace(btrim(p_name), '[^[:alnum:]]+', '', 'g'), 4)),
    color = coalesce(nullif(btrim(p_color), ''), color),
    updated_at = now()
  where id = p_team_id;

  for v_player in select * from jsonb_array_elements(p_players)
  loop
    v_player_id := nullif(v_player ->> 'id', '')::uuid;

    if v_player_id is null then
      insert into players (tournament_id, team_id, first_name, last_name, full_name, nickname, gender)
      values (
        v_team.tournament_id,
        p_team_id,
        btrim(v_player ->> 'firstName'),
        btrim(v_player ->> 'lastName'),
        btrim((v_player ->> 'firstName') || ' ' || (v_player ->> 'lastName')),
        btrim(v_player ->> 'firstName'),
        (v_player ->> 'gender')::player_gender
      )
      returning id into v_player_id;
    else
      update players
      set
        first_name = btrim(v_player ->> 'firstName'),
        last_name = btrim(v_player ->> 'lastName'),
        full_name = btrim((v_player ->> 'firstName') || ' ' || (v_player ->> 'lastName')),
        nickname = btrim(v_player ->> 'firstName'),
        gender = (v_player ->> 'gender')::player_gender
      where id = v_player_id
        and team_id = p_team_id
        and tournament_id = v_team.tournament_id;

      if not found then
        raise exception 'player does not belong to this team';
      end if;
    end if;

    v_seen_player_ids := array_append(v_seen_player_ids, v_player_id);
  end loop;

  if (
    select count(*)
    from players
    where team_id = p_team_id
      and tournament_id = v_team.tournament_id
      and id <> all(v_seen_player_ids)
  ) <> 0 then
    raise exception 'team roster must contain exactly the existing 3 players';
  end if;

  return p_team_id;
end;
$$;

revoke execute on function validate_roster_payload(jsonb) from public;
revoke execute on function create_team_with_roster(uuid, text, text, jsonb) from public;
revoke execute on function update_team_with_roster(uuid, text, text, jsonb) from public;

grant execute on function create_team_with_roster(uuid, text, text, jsonb) to authenticated;
grant execute on function update_team_with_roster(uuid, text, text, jsonb) to authenticated;
