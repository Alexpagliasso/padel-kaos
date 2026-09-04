create extension if not exists pgcrypto;

create type app_role as enum ('admin', 'referee', 'team', 'court_display', 'main_display');
create type tournament_phase as enum ('GROUP_STAGE', 'KNOCKOUT');
create type round_stage as enum ('group', 'quarter_final', 'semi_final', 'final');
create type round_status as enum ('scheduled', 'set_1', 'set_break', 'waiting_global_dice', 'kaos_active', 'set_2', 'completed');
create type match_status as enum ('scheduled', 'ready', 'set_1', 'set_break', 'waiting_global_dice', 'set_2', 'super_tiebreak', 'completed');
create type player_gender as enum ('male', 'female', 'non_binary', 'unspecified');
create type card_status as enum ('available', 'pending', 'active', 'used', 'stolen', 'cancelled', 'expired');
create type card_duration_type as enum ('timed', 'games', 'instant', 'until_condition');
create type global_event_status as enum ('draft', 'active', 'completed', 'cancelled');
create type match_event_type as enum (
  'MATCH_STARTED',
  'GAME_WON',
  'SET_ENDED',
  'CARD_PLAYED',
  'CARD_ACTIVATED',
  'CARD_EXPIRED',
  'CARD_STOLEN',
  'MATCH_ENDED',
  'DICE_ROLLED',
  'KAOS_STARTED',
  'KAOS_ENDED',
  'GLOBAL_EVENT_STARTED',
  'GLOBAL_EVENT_WON',
  'SCORE_CORRECTED'
);

create table tournaments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phase tournament_phase not null default 'GROUP_STAGE',
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table courts (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  name text not null,
  display_slug text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (id, tournament_id),
  unique (tournament_id, display_slug),
  unique (tournament_id, sort_order)
);

create table groups (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  assigned_court_id uuid references courts(id),
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (id, tournament_id),
  unique (tournament_id, name),
  unique (tournament_id, sort_order),
  unique (tournament_id, assigned_court_id)
);

create table teams (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  group_id uuid references groups(id),
  name text not null,
  short_name text not null,
  color text not null default '#FFD000',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tournament_id),
  unique (tournament_id, short_name)
);

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  tournament_id uuid not null references tournaments(id) on delete cascade,
  role app_role not null,
  username text not null,
  display_name text not null,
  team_id uuid references teams(id),
  court_id uuid references courts(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tournament_id, username),
  constraint team_profile_requires_team check (role <> 'team' or team_id is not null),
  constraint display_or_referee_court_scope check (role not in ('referee', 'court_display') or court_id is not null)
);

create table players (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  team_id uuid not null references teams(id) on delete cascade,
  full_name text not null,
  nickname text not null,
  gender player_gender not null,
  created_at timestamptz not null default now(),
  unique (id, team_id),
  unique (team_id, nickname)
);

create table dice_rules (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  dice_value int not null check (dice_value between 1 and 6),
  title text not null,
  description text not null,
  effect_type text not null,
  duration_seconds int not null default 300 check (duration_seconds > 0),
  enabled boolean not null default true,
  unique (id, tournament_id),
  unique (tournament_id, dice_value)
);

create table rounds (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  name text not null,
  stage round_stage not null default 'group',
  sequence int not null,
  status round_status not null default 'scheduled',
  dice_result int check (dice_result between 1 and 6),
  dice_rule_id uuid references dice_rules(id),
  dice_started_at timestamptz,
  dice_ends_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, tournament_id),
  unique (tournament_id, sequence),
  constraint dice_window_is_ordered check (dice_started_at is null or dice_ends_at is null or dice_ends_at > dice_started_at),
  constraint dice_result_requires_rule check (dice_result is null or dice_rule_id is not null)
);

create table matches (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  round_id uuid not null references rounds(id) on delete cascade,
  group_id uuid references groups(id),
  court_id uuid not null references courts(id),
  team_a_id uuid not null references teams(id),
  team_b_id uuid not null references teams(id),
  status match_status not null default 'scheduled',
  current_set int not null default 1 check (current_set in (1, 2, 3)),
  games_a int not null default 0 check (games_a >= 0),
  games_b int not null default 0 check (games_b >= 0),
  sets_a int not null default 0 check (sets_a >= 0),
  sets_b int not null default 0 check (sets_b >= 0),
  super_tiebreak_team_a int check (super_tiebreak_team_a is null or super_tiebreak_team_a >= 0),
  super_tiebreak_team_b int check (super_tiebreak_team_b is null or super_tiebreak_team_b >= 0),
  set_1_started_at timestamptz,
  set_1_ended_at timestamptz,
  set_2_started_at timestamptz,
  set_2_ended_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tournament_id),
  constraint different_teams check (team_a_id <> team_b_id),
  constraint set_1_window_is_ordered check (set_1_started_at is null or set_1_ended_at is null or set_1_ended_at >= set_1_started_at),
  constraint set_2_window_is_ordered check (set_2_started_at is null or set_2_ended_at is null or set_2_ended_at >= set_2_started_at)
);

create table match_lineups (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  team_id uuid not null references teams(id) on delete cascade,
  set_number int not null check (set_number in (1, 2, 3)),
  active_player_1_id uuid not null references players(id),
  active_player_2_id uuid not null references players(id),
  bench_player_id uuid references players(id),
  created_at timestamptz not null default now(),
  unique (match_id, team_id, set_number),
  constraint unique_lineup_players check (
    active_player_1_id <> active_player_2_id
    and (bench_player_id is null or (active_player_1_id <> bench_player_id and active_player_2_id <> bench_player_id))
  )
);

create table card_definitions (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid references tournaments(id) on delete cascade,
  name text not null,
  slug text not null,
  description text not null,
  effect_type text not null,
  target_type text not null,
  duration_type card_duration_type not null,
  duration_value int check (duration_value is null or duration_value > 0),
  can_be_stolen boolean not null default false,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  constraint card_duration_value_required check (
    duration_type not in ('timed', 'games') or duration_value is not null
  )
);

create table match_cards (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  team_id uuid not null references teams(id) on delete cascade,
  card_definition_id uuid not null references card_definitions(id),
  status card_status not null default 'available',
  used_in_set int check (used_in_set in (1, 2, 3)),
  activated_at timestamptz,
  expires_at timestamptz,
  remaining_games int check (remaining_games is null or remaining_games >= 0),
  stolen_from_team_id uuid references teams(id),
  created_at timestamptz not null default now(),
  unique (match_id, team_id, card_definition_id)
);

create table card_usages (
  id uuid primary key default gen_random_uuid(),
  match_card_id uuid not null references match_cards(id) on delete cascade,
  match_id uuid not null references matches(id) on delete cascade,
  team_id uuid not null references teams(id),
  requested_by uuid references profiles(id),
  confirmed_by uuid references profiles(id),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table match_events (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  round_id uuid references rounds(id) on delete cascade,
  match_id uuid not null references matches(id) on delete cascade,
  type match_event_type not null,
  payload jsonb not null default '{}'::jsonb,
  actor_user_id uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table tournament_events (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  round_id uuid references rounds(id) on delete cascade,
  type match_event_type not null,
  payload jsonb not null default '{}'::jsonb,
  actor_user_id uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table global_events (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  type text not null,
  title text not null,
  description text not null,
  prize text,
  status global_event_status not null default 'draft',
  started_at timestamptz,
  completed_at timestamptz,
  winner_player_id uuid references players(id),
  winner_team_id uuid references teams(id),
  created_at timestamptz not null default now()
);

create table global_event_winners (
  id uuid primary key default gen_random_uuid(),
  global_event_id uuid not null references global_events(id) on delete cascade,
  player_id uuid references players(id),
  team_id uuid references teams(id),
  match_id uuid references matches(id),
  awarded_by uuid references profiles(id),
  awarded_at timestamptz not null default now(),
  unique (global_event_id)
);

alter table groups
  add constraint groups_assigned_court_tournament_fk
  foreign key (assigned_court_id, tournament_id) references courts(id, tournament_id);

alter table teams
  add constraint teams_group_tournament_fk
  foreign key (group_id, tournament_id) references groups(id, tournament_id);

alter table profiles
  add constraint profiles_team_tournament_fk
  foreign key (team_id, tournament_id) references teams(id, tournament_id),
  add constraint profiles_court_tournament_fk
  foreign key (court_id, tournament_id) references courts(id, tournament_id);

alter table players
  add constraint players_team_tournament_fk
  foreign key (team_id, tournament_id) references teams(id, tournament_id);

alter table rounds
  add constraint rounds_dice_rule_tournament_fk
  foreign key (dice_rule_id, tournament_id) references dice_rules(id, tournament_id);

alter table matches
  add constraint matches_round_tournament_fk
  foreign key (round_id, tournament_id) references rounds(id, tournament_id),
  add constraint matches_group_tournament_fk
  foreign key (group_id, tournament_id) references groups(id, tournament_id),
  add constraint matches_court_tournament_fk
  foreign key (court_id, tournament_id) references courts(id, tournament_id),
  add constraint matches_team_a_tournament_fk
  foreign key (team_a_id, tournament_id) references teams(id, tournament_id),
  add constraint matches_team_b_tournament_fk
  foreign key (team_b_id, tournament_id) references teams(id, tournament_id);

alter table match_lineups
  add constraint match_lineups_active_player_1_team_fk
  foreign key (active_player_1_id, team_id) references players(id, team_id),
  add constraint match_lineups_active_player_2_team_fk
  foreign key (active_player_2_id, team_id) references players(id, team_id),
  add constraint match_lineups_bench_player_team_fk
  foreign key (bench_player_id, team_id) references players(id, team_id);

create unique index card_definitions_tournament_slug_idx on card_definitions(tournament_id, slug) where tournament_id is not null;
create unique index card_definitions_global_template_slug_idx on card_definitions(slug) where tournament_id is null;
create index profiles_tournament_role_idx on profiles(tournament_id, role);
create index profiles_team_idx on profiles(team_id) where team_id is not null;
create index players_team_idx on players(team_id);
create index courts_tournament_idx on courts(tournament_id);
create index groups_assigned_court_idx on groups(assigned_court_id);
create index rounds_tournament_sequence_idx on rounds(tournament_id, sequence);
create index matches_round_idx on matches(round_id);
create index matches_court_status_idx on matches(court_id, status);
create index matches_team_a_idx on matches(team_a_id);
create index matches_team_b_idx on matches(team_b_id);
create index match_lineups_match_team_set_idx on match_lineups(match_id, team_id, set_number);
create index match_cards_match_team_idx on match_cards(match_id, team_id);
create index match_cards_status_idx on match_cards(status);
create index match_cards_active_persistent_idx on match_cards(match_id, team_id, status) where status in ('pending', 'active');
create index match_events_match_created_idx on match_events(match_id, created_at desc);
create index match_events_round_created_idx on match_events(round_id, created_at desc);
create index tournament_events_round_created_idx on tournament_events(round_id, created_at desc);
create index global_events_tournament_status_idx on global_events(tournament_id, status);

create or replace function current_profile()
returns profiles
language sql
stable
security definer
set search_path = public
as $$
  select * from profiles where id = auth.uid()
$$;

create or replace function is_admin_for(p_tournament_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from profiles
    where id = auth.uid()
      and tournament_id = p_tournament_id
      and role = 'admin'
  )
$$;

create or replace function can_read_tournament(p_tournament_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from profiles
    where id = auth.uid()
      and tournament_id = p_tournament_id
  )
$$;

create or replace function can_read_match(p_match_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from matches m
    join profiles p on p.id = auth.uid() and p.tournament_id = m.tournament_id
    where m.id = p_match_id
      and (
        p.role in ('admin', 'main_display')
        or (p.role = 'referee' and p.court_id = m.court_id)
        or (p.role = 'court_display' and p.court_id = m.court_id)
        or (p.role = 'team' and p.team_id in (m.team_a_id, m.team_b_id))
      )
  )
$$;

create or replace function can_manage_match(p_match_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from matches m
    join profiles p on p.id = auth.uid() and p.tournament_id = m.tournament_id
    where m.id = p_match_id
      and (
        p.role = 'admin'
        or (p.role = 'referee' and p.court_id = m.court_id)
      )
  )
$$;

create or replace function team_participates_in_match(p_match_id uuid, p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from matches
    where id = p_match_id
      and p_team_id in (team_a_id, team_b_id)
  )
$$;

create or replace function is_round_dice_active(p_round_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from rounds
    where id = p_round_id
      and dice_started_at is not null
      and dice_ends_at is not null
      and now() >= dice_started_at
      and now() < dice_ends_at
  )
$$;

alter table tournaments enable row level security;
alter table courts enable row level security;
alter table groups enable row level security;
alter table teams enable row level security;
alter table profiles enable row level security;
alter table players enable row level security;
alter table dice_rules enable row level security;
alter table rounds enable row level security;
alter table matches enable row level security;
alter table match_lineups enable row level security;
alter table card_definitions enable row level security;
alter table match_cards enable row level security;
alter table card_usages enable row level security;
alter table match_events enable row level security;
alter table tournament_events enable row level security;
alter table global_events enable row level security;
alter table global_event_winners enable row level security;

create policy tournament_read on tournaments for select using (can_read_tournament(id));
create policy tournament_admin_all on tournaments for all using (is_admin_for(id)) with check (is_admin_for(id));

create policy courts_read on courts for select using (can_read_tournament(tournament_id));
create policy courts_admin_all on courts for all using (is_admin_for(tournament_id)) with check (is_admin_for(tournament_id));

create policy groups_read on groups for select using (can_read_tournament(tournament_id));
create policy groups_admin_all on groups for all using (is_admin_for(tournament_id)) with check (is_admin_for(tournament_id));

create policy teams_read on teams for select using (
  is_admin_for(tournament_id)
  or exists (
    select 1
    from profiles p
    where p.id = auth.uid()
      and p.tournament_id = teams.tournament_id
      and (
        p.role in ('referee', 'court_display', 'main_display')
        or p.team_id = teams.id
      )
  )
);
create policy teams_admin_all on teams for all using (is_admin_for(tournament_id)) with check (is_admin_for(tournament_id));

create policy profiles_read_own_or_admin on profiles for select using (
  id = auth.uid()
  or is_admin_for(tournament_id)
);
create policy profiles_admin_all on profiles for all using (is_admin_for(tournament_id)) with check (is_admin_for(tournament_id));

create policy players_read on players for select using (
  is_admin_for(tournament_id)
  or exists (
    select 1
    from profiles p
    where p.id = auth.uid()
      and p.tournament_id = players.tournament_id
      and (
        p.role in ('referee', 'court_display', 'main_display')
        or p.team_id = players.team_id
      )
  )
);
create policy players_admin_all on players for all using (is_admin_for(tournament_id)) with check (is_admin_for(tournament_id));

create policy dice_rules_read on dice_rules for select using (can_read_tournament(tournament_id));
create policy dice_rules_admin_all on dice_rules for all using (is_admin_for(tournament_id)) with check (is_admin_for(tournament_id));

create policy rounds_read on rounds for select using (can_read_tournament(tournament_id));
create policy rounds_admin_all on rounds for all using (is_admin_for(tournament_id)) with check (is_admin_for(tournament_id));

create policy matches_read on matches for select using (can_read_match(id));
create policy matches_admin_all on matches for all using (is_admin_for(tournament_id)) with check (is_admin_for(tournament_id));
create policy matches_referee_update on matches for update using (can_manage_match(id)) with check (can_manage_match(id));

create policy lineups_read on match_lineups for select using (can_read_match(match_id));
create policy lineups_admin_all on match_lineups for all using (
  exists (select 1 from matches m where m.id = match_lineups.match_id and is_admin_for(m.tournament_id))
) with check (
  exists (select 1 from matches m where m.id = match_lineups.match_id and is_admin_for(m.tournament_id))
);
create policy lineups_referee_update on match_lineups for update using (can_manage_match(match_id)) with check (can_manage_match(match_id));

create policy card_definitions_read on card_definitions for select using (
  (tournament_id is not null and can_read_tournament(tournament_id))
  or exists (
    select 1
    from match_cards mc
    join matches m on m.id = mc.match_id
    where mc.card_definition_id = card_definitions.id
      and can_read_match(m.id)
      and (
        card_definitions.tournament_id is null
        or card_definitions.tournament_id = m.tournament_id
      )
  )
);
create policy card_definitions_admin_all on card_definitions for all using (
  tournament_id is not null and is_admin_for(tournament_id)
) with check (
  tournament_id is not null and is_admin_for(tournament_id)
);

create policy match_cards_read_private on match_cards for select using (
  exists (
    select 1
    from matches m
    join profiles p on p.id = auth.uid() and p.tournament_id = m.tournament_id
    where m.id = match_cards.match_id
      and (
        p.role = 'admin'
        or (p.role = 'team' and p.team_id = match_cards.team_id)
        or (p.role in ('referee', 'court_display') and p.court_id = m.court_id and match_cards.status <> 'available')
      )
  )
);
create policy match_cards_admin_insert on match_cards for insert with check (
  exists (select 1 from matches m where m.id = match_cards.match_id and is_admin_for(m.tournament_id))
);

create policy card_usages_read on card_usages for select using (can_read_match(match_id));
create policy card_usages_insert_team on card_usages for insert with check (
  exists (
    select 1
    from matches m
    join profiles p on p.id = auth.uid() and p.tournament_id = m.tournament_id
    where m.id = card_usages.match_id
      and p.role = 'team'
      and p.team_id = card_usages.team_id
  )
);
create policy card_usages_referee_update on card_usages for update using (can_manage_match(match_id)) with check (can_manage_match(match_id));

create policy match_events_read on match_events for select using (
  exists (
    select 1
    from matches m
    join profiles p on p.id = auth.uid() and p.tournament_id = m.tournament_id
    where m.id = match_events.match_id
      and (
        p.role = 'admin'
        or (p.role = 'team' and p.team_id in (m.team_a_id, m.team_b_id))
        or (p.role in ('referee', 'court_display') and p.court_id = m.court_id)
      )
  )
);
create policy match_events_insert_referee on match_events for insert with check (
  is_admin_for(tournament_id) or can_manage_match(match_id)
);

create policy tournament_events_read on tournament_events for select using (can_read_tournament(tournament_id));
create policy tournament_events_insert_admin_referee on tournament_events for insert with check (
  is_admin_for(tournament_id)
  or exists (
    select 1
    from rounds r
    join matches m on m.round_id = r.id
    where r.id = tournament_events.round_id
      and can_manage_match(m.id)
  )
);

create policy global_events_read on global_events for select using (can_read_tournament(tournament_id));
create policy global_events_admin_all on global_events for all using (is_admin_for(tournament_id)) with check (is_admin_for(tournament_id));

create policy global_event_winners_read on global_event_winners for select using (
  exists (
    select 1
    from global_events ge
    where ge.id = global_event_winners.global_event_id
      and can_read_tournament(ge.tournament_id)
  )
);

create or replace function draw_match_cards(p_match_id uuid)
returns setof match_cards
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match matches;
  v_existing_count int;
  v_team uuid;
  v_draw_count int;
begin
  select * into v_match from matches where id = p_match_id for update;
  if not found or not is_admin_for(v_match.tournament_id) then
    raise exception 'not authorized';
  end if;

  select count(*) into v_existing_count from match_cards where match_id = p_match_id;
  if v_existing_count > 0 then
    return query select * from match_cards where match_id = p_match_id order by team_id, created_at;
    return;
  end if;

  foreach v_team in array array[v_match.team_a_id, v_match.team_b_id] loop
    insert into match_cards (match_id, team_id, card_definition_id)
    select p_match_id, v_team, drawn.id
    from (
      select cd.id
      from card_definitions cd
      where (cd.tournament_id = v_match.tournament_id or cd.tournament_id is null)
        and cd.enabled
      order by random()
      limit 3
    ) drawn;

    get diagnostics v_draw_count = row_count;
    if v_draw_count <> 3 then
      raise exception 'not enough enabled card definitions';
    end if;
  end loop;

  insert into tournament_events (tournament_id, round_id, type, payload, actor_user_id)
  values (v_match.tournament_id, v_match.round_id, 'GLOBAL_EVENT_STARTED', jsonb_build_object('event', 'CARDS_DRAWN', 'match_id', p_match_id), auth.uid());

  return query select * from match_cards where match_id = p_match_id order by team_id, created_at;
end;
$$;

create or replace function play_card(p_match_card_id uuid)
returns match_cards
language plpgsql
security definer
set search_path = public
as $$
declare
  v_card match_cards;
  v_match matches;
  v_definition card_definitions;
begin
  select * into v_card from match_cards where id = p_match_card_id for update;
  if not found or v_card.status <> 'available' then
    raise exception 'card not available';
  end if;

  select * into v_match from matches where id = v_card.match_id;
  select * into v_definition from card_definitions where id = v_card.card_definition_id;

  if v_match.status not in ('set_1', 'set_2', 'super_tiebreak') then
    raise exception 'match is not live';
  end if;

  if is_round_dice_active(v_match.round_id) then
    raise exception 'cards blocked during global dice effect';
  end if;

  if not exists (
    select 1
    from profiles p
    where p.id = auth.uid()
      and p.role = 'team'
      and p.team_id = v_card.team_id
      and p.tournament_id = v_match.tournament_id
  ) then
    raise exception 'not authorized';
  end if;

  if not team_participates_in_match(v_card.match_id, v_card.team_id) then
    raise exception 'team does not participate in match';
  end if;

  if v_definition.duration_type <> 'instant' and exists (
    select 1
    from match_cards mc
    join card_definitions cd on cd.id = mc.card_definition_id
    where mc.match_id = v_card.match_id
      and mc.team_id = v_card.team_id
      and mc.status = 'active'
      and cd.duration_type <> 'instant'
  ) then
    raise exception 'team already has active persistent card';
  end if;

  update match_cards
  set status = case when v_definition.duration_type = 'instant' then 'used'::card_status else 'pending'::card_status end,
      used_in_set = v_match.current_set
  where id = p_match_card_id
  returning * into v_card;

  insert into card_usages (match_card_id, match_id, team_id, requested_by)
  values (v_card.id, v_card.match_id, v_card.team_id, auth.uid());

  insert into match_events (tournament_id, round_id, match_id, type, payload, actor_user_id)
  values (
    v_match.tournament_id,
    v_match.round_id,
    v_match.id,
    'CARD_PLAYED',
    jsonb_build_object('match_card_id', v_card.id, 'card_definition_id', v_card.card_definition_id),
    auth.uid()
  );

  return v_card;
end;
$$;

create or replace function activate_card(p_match_card_id uuid)
returns match_cards
language plpgsql
security definer
set search_path = public
as $$
declare
  v_card match_cards;
  v_match matches;
  v_definition card_definitions;
begin
  select * into v_card from match_cards where id = p_match_card_id for update;
  if not found or v_card.status <> 'pending' then
    raise exception 'card is not pending';
  end if;

  if not can_manage_match(v_card.match_id) then
    raise exception 'not authorized';
  end if;

  select * into v_match from matches where id = v_card.match_id;
  select * into v_definition from card_definitions where id = v_card.card_definition_id;

  if v_definition.duration_type <> 'instant' and exists (
    select 1
    from match_cards mc
    join card_definitions cd on cd.id = mc.card_definition_id
    where mc.match_id = v_card.match_id
      and mc.team_id = v_card.team_id
      and mc.status = 'active'
      and mc.id <> v_card.id
      and cd.duration_type <> 'instant'
  ) then
    raise exception 'team already has active persistent card';
  end if;

  update match_cards
  set status = 'active',
      activated_at = now(),
      expires_at = case
        when v_definition.duration_type = 'timed' then now() + make_interval(secs => v_definition.duration_value)
        else expires_at
      end,
      remaining_games = case
        when v_definition.duration_type = 'games' then v_definition.duration_value
        else remaining_games
      end
  where id = p_match_card_id
  returning * into v_card;

  insert into match_events (tournament_id, round_id, match_id, type, payload, actor_user_id)
  values (v_match.tournament_id, v_match.round_id, v_match.id, 'CARD_ACTIVATED', jsonb_build_object('match_card_id', v_card.id), auth.uid());

  return v_card;
end;
$$;

create or replace function roll_global_dice_for_round(p_round_id uuid)
returns rounds
language plpgsql
security definer
set search_path = public
as $$
declare
  v_round rounds;
  v_rule dice_rules;
  v_value int;
begin
  select * into v_round from rounds where id = p_round_id for update;
  if not found then
    raise exception 'round not found';
  end if;

  if not is_admin_for(v_round.tournament_id)
    and not exists (
      select 1
      from matches m
      where m.round_id = p_round_id
        and can_manage_match(m.id)
    )
  then
    raise exception 'not authorized';
  end if;

  if v_round.dice_result is not null then
    return v_round;
  end if;

  if v_round.status <> 'waiting_global_dice' then
    raise exception 'round is not waiting for dice';
  end if;

  v_value := floor(random() * 6 + 1)::int;
  select * into v_rule
  from dice_rules
  where tournament_id = v_round.tournament_id
    and dice_value = v_value
    and enabled
  limit 1;

  if v_rule.id is null then
    raise exception 'enabled dice rule not found';
  end if;

  update rounds
  set status = 'kaos_active',
      dice_result = v_value,
      dice_rule_id = v_rule.id,
      dice_started_at = now(),
      dice_ends_at = now() + make_interval(secs => v_rule.duration_seconds)
  where id = v_round.id
  returning * into v_round;

  update matches
  set status = 'waiting_global_dice'
  where round_id = v_round.id
    and status in ('set_break', 'waiting_global_dice');

  insert into tournament_events (tournament_id, round_id, type, payload, actor_user_id)
  values (
    v_round.tournament_id,
    v_round.id,
    'DICE_ROLLED',
    jsonb_build_object('value', v_value, 'rule_id', v_rule.id, 'starts_at', v_round.dice_started_at, 'ends_at', v_round.dice_ends_at),
    auth.uid()
  );

  return v_round;
end;
$$;

create or replace function steal_active_card(p_steal_card_id uuid, p_target_match_card_id uuid)
returns match_cards
language plpgsql
security definer
set search_path = public
as $$
declare
  v_steal match_cards;
  v_target match_cards;
  v_steal_definition card_definitions;
  v_target_definition card_definitions;
  v_match matches;
  v_actor profiles;
  v_original_target_team_id uuid;
begin
  select * into v_steal from match_cards where id = p_steal_card_id for update;
  if not found or v_steal.status <> 'available' then
    raise exception 'steal card not available';
  end if;

  select * into v_target from match_cards where id = p_target_match_card_id for update;
  if not found or v_target.status <> 'active' then
    raise exception 'target card is not active';
  end if;

  if v_steal.match_id <> v_target.match_id then
    raise exception 'cards belong to different matches';
  end if;

  select * into v_match from matches where id = v_steal.match_id;
  select * into v_actor from profiles where id = auth.uid();
  select * into v_steal_definition from card_definitions where id = v_steal.card_definition_id;
  select * into v_target_definition from card_definitions where id = v_target.card_definition_id;

  if v_actor.id is null
    or v_actor.role <> 'team'
    or v_actor.tournament_id <> v_match.tournament_id
    or v_actor.team_id <> v_steal.team_id
  then
    raise exception 'not authorized';
  end if;

  if v_steal_definition.effect_type <> 'STEAL_ACTIVE_CARD' then
    raise exception 'card is not a steal card';
  end if;

  if not v_target_definition.can_be_stolen then
    raise exception 'target card cannot be stolen';
  end if;

  if v_target.team_id = v_steal.team_id then
    raise exception 'cannot steal own active card';
  end if;

  if not team_participates_in_match(v_match.id, v_steal.team_id)
    or not team_participates_in_match(v_match.id, v_target.team_id)
  then
    raise exception 'team does not participate in match';
  end if;

  if is_round_dice_active(v_match.round_id) then
    raise exception 'cards blocked during global dice effect';
  end if;

  if v_target_definition.duration_type <> 'instant' and exists (
    select 1
    from match_cards mc
    join card_definitions cd on cd.id = mc.card_definition_id
    where mc.match_id = v_match.id
      and mc.team_id = v_steal.team_id
      and mc.status = 'active'
      and mc.id <> v_target.id
      and cd.duration_type <> 'instant'
  ) then
    raise exception 'team already has active persistent card';
  end if;

  v_original_target_team_id := v_target.team_id;

  update match_cards
  set team_id = v_steal.team_id,
      stolen_from_team_id = v_original_target_team_id
  where id = v_target.id
  returning * into v_target;

  update match_cards
  set status = 'used',
      used_in_set = v_match.current_set
  where id = v_steal.id;

  insert into match_events (tournament_id, round_id, match_id, type, payload, actor_user_id)
  values (
    v_match.tournament_id,
    v_match.round_id,
    v_match.id,
    'CARD_STOLEN',
    jsonb_build_object(
      'steal_card_id', v_steal.id,
      'target_match_card_id', v_target.id,
      'from_team_id', v_original_target_team_id,
      'to_team_id', v_steal.team_id
    ),
    auth.uid()
  );

  return v_target;
end;
$$;

create or replace function start_match(p_match_id uuid)
returns matches
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match matches;
begin
  if not can_manage_match(p_match_id) then
    raise exception 'not authorized';
  end if;

  update matches
  set status = 'set_1',
      started_at = coalesce(started_at, now()),
      set_1_started_at = coalesce(set_1_started_at, now()),
      current_set = 1,
      games_a = 0,
      games_b = 0
  where id = p_match_id
    and status in ('ready', 'scheduled')
  returning * into v_match;

  if v_match.id is null then
    select * into v_match from matches where id = p_match_id;
  end if;

  update rounds
  set status = 'set_1'
  where id = v_match.round_id
    and status = 'scheduled';

  insert into match_events (tournament_id, round_id, match_id, type, actor_user_id)
  values (v_match.tournament_id, v_match.round_id, v_match.id, 'MATCH_STARTED', auth.uid());

  return v_match;
end;
$$;

create or replace function end_set(p_match_id uuid)
returns matches
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match matches;
begin
  if not can_manage_match(p_match_id) then
    raise exception 'not authorized';
  end if;

  select * into v_match from matches where id = p_match_id for update;
  if not found then
    raise exception 'match not found';
  end if;

  if v_match.status = 'set_1' then
    update matches
    set status = 'set_break',
        current_set = 2,
        games_a = 0,
        games_b = 0,
        set_1_ended_at = coalesce(set_1_ended_at, now())
    where id = p_match_id
    returning * into v_match;

    update rounds
    set status = 'waiting_global_dice'
    where id = v_match.round_id
      and status in ('set_1', 'set_break', 'scheduled');
  elsif v_match.status = 'set_2' then
    update matches
    set status = 'super_tiebreak',
        current_set = 3,
        games_a = 0,
        games_b = 0,
        super_tiebreak_team_a = 0,
        super_tiebreak_team_b = 0,
        set_2_ended_at = coalesce(set_2_ended_at, now())
    where id = p_match_id
    returning * into v_match;
  else
    raise exception 'match is not in a set';
  end if;

  insert into match_events (tournament_id, round_id, match_id, type, payload, actor_user_id)
  values (v_match.tournament_id, v_match.round_id, v_match.id, 'SET_ENDED', jsonb_build_object('next_status', v_match.status), auth.uid());

  return v_match;
end;
$$;

create or replace function start_second_set(p_match_id uuid)
returns setof matches
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match matches;
begin
  select * into v_match from matches where id = p_match_id;
  if not found or not can_manage_match(p_match_id) then
    raise exception 'not authorized';
  end if;

  if not exists (select 1 from rounds r where r.id = v_match.round_id and r.dice_result is not null) then
    raise exception 'dice required';
  end if;

  update matches
  set status = 'set_2',
      current_set = 2,
      games_a = 0,
      games_b = 0,
      set_2_started_at = coalesce(set_2_started_at, now())
  where round_id = v_match.round_id
    and status in ('set_break', 'waiting_global_dice');

  update rounds
  set status = 'set_2'
  where id = v_match.round_id;

  insert into tournament_events (tournament_id, round_id, type, payload, actor_user_id)
  values (v_match.tournament_id, v_match.round_id, 'KAOS_ENDED', jsonb_build_object('round_id', v_match.round_id), auth.uid());

  return query select * from matches where round_id = v_match.round_id;
end;
$$;

create or replace function end_match(p_match_id uuid)
returns matches
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match matches;
begin
  if not can_manage_match(p_match_id) then
    raise exception 'not authorized';
  end if;

  update matches
  set status = 'completed',
      completed_at = now()
  where id = p_match_id
  returning * into v_match;

  insert into match_events (tournament_id, round_id, match_id, type, actor_user_id)
  values (v_match.tournament_id, v_match.round_id, v_match.id, 'MATCH_ENDED', auth.uid());

  return v_match;
end;
$$;

create or replace function record_game_won(p_match_id uuid, p_winner_side text)
returns matches
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match matches;
begin
  if p_winner_side not in ('A', 'B') then
    raise exception 'invalid winner side';
  end if;

  if not can_manage_match(p_match_id) then
    raise exception 'not authorized';
  end if;

  update matches
  set games_a = games_a + case when p_winner_side = 'A' then 1 else 0 end,
      games_b = games_b + case when p_winner_side = 'B' then 1 else 0 end
  where id = p_match_id
    and status in ('set_1', 'set_2')
  returning * into v_match;

  if v_match.id is null then
    raise exception 'match is not in a regular set';
  end if;

  insert into match_events (tournament_id, round_id, match_id, type, payload, actor_user_id)
  values (v_match.tournament_id, v_match.round_id, v_match.id, 'GAME_WON', jsonb_build_object('winner_side', p_winner_side), auth.uid());

  return v_match;
end;
$$;

create or replace function record_super_tiebreak_point(p_match_id uuid, p_winner_side text)
returns matches
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match matches;
begin
  if p_winner_side not in ('A', 'B') then
    raise exception 'invalid winner side';
  end if;

  if not can_manage_match(p_match_id) then
    raise exception 'not authorized';
  end if;

  update matches
  set super_tiebreak_team_a = coalesce(super_tiebreak_team_a, 0) + case when p_winner_side = 'A' then 1 else 0 end,
      super_tiebreak_team_b = coalesce(super_tiebreak_team_b, 0) + case when p_winner_side = 'B' then 1 else 0 end
  where id = p_match_id
    and status = 'super_tiebreak'
  returning * into v_match;

  if v_match.id is null then
    raise exception 'match is not in super tiebreak';
  end if;

  insert into match_events (tournament_id, round_id, match_id, type, payload, actor_user_id)
  values (v_match.tournament_id, v_match.round_id, v_match.id, 'SCORE_CORRECTED', jsonb_build_object('winner_side', p_winner_side, 'score_type', 'super_tiebreak'), auth.uid());

  return v_match;
end;
$$;

create or replace function activate_por_tres(p_prize text)
returns global_events
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile profiles;
  v_event global_events;
begin
  select * into v_profile
  from profiles
  where id = auth.uid()
    and role = 'admin'
  limit 1;

  if not found then
    raise exception 'not authorized';
  end if;

  insert into global_events (tournament_id, type, title, description, prize, status, started_at)
  values (v_profile.tournament_id, 'POR_TRES', 'POR TRES CHALLENGE', 'First valid Por Tres wins the prize.', p_prize, 'active', now())
  returning * into v_event;

  insert into tournament_events (tournament_id, type, payload, actor_user_id)
  values (v_profile.tournament_id, 'GLOBAL_EVENT_STARTED', jsonb_build_object('global_event_id', v_event.id, 'type', 'POR_TRES'), auth.uid());

  return v_event;
end;
$$;

create or replace function claim_global_event_winner(
  p_match_id uuid,
  p_player_id uuid
) returns global_event_winners
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match matches;
  v_event global_events;
  v_team_id uuid;
  inserted global_event_winners;
begin
  select * into v_match from matches where id = p_match_id;
  if not found or not can_manage_match(p_match_id) then
    raise exception 'not authorized';
  end if;

  select team_id into v_team_id
  from players
  where id = p_player_id
    and tournament_id = v_match.tournament_id;

  if v_team_id is null or v_team_id not in (v_match.team_a_id, v_match.team_b_id) then
    raise exception 'player is not in this match';
  end if;

  if not exists (
    select 1
    from match_lineups ml
    where ml.match_id = p_match_id
      and ml.team_id = v_team_id
      and ml.set_number = v_match.current_set
      and p_player_id in (ml.active_player_1_id, ml.active_player_2_id)
  ) then
    raise exception 'player is not in the active lineup';
  end if;

  select * into v_event
  from global_events
  where tournament_id = v_match.tournament_id
    and type = 'POR_TRES'
    and status = 'active'
  order by started_at desc
  limit 1
  for update;

  if not found then
    raise exception 'no active global event';
  end if;

  insert into global_event_winners (global_event_id, player_id, team_id, match_id, awarded_by)
  values (v_event.id, p_player_id, v_team_id, p_match_id, auth.uid())
  on conflict (global_event_id) do nothing
  returning * into inserted;

  if inserted.id is null then
    raise exception 'global event already has a winner';
  end if;

  update global_events
  set status = 'completed',
      completed_at = now(),
      winner_player_id = p_player_id,
      winner_team_id = v_team_id
  where id = v_event.id
    and winner_player_id is null;

  insert into tournament_events (tournament_id, type, payload, actor_user_id)
  values (
    v_match.tournament_id,
    'GLOBAL_EVENT_WON',
    jsonb_build_object('global_event_id', v_event.id, 'match_id', p_match_id, 'player_id', p_player_id, 'team_id', v_team_id),
    auth.uid()
  );

  return inserted;
end;
$$;

create or replace function get_active_tournament_state()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'tournaments', coalesce(jsonb_agg(t), '[]'::jsonb)
  )
  from tournaments t
  where can_read_tournament(t.id)
$$;

revoke execute on function current_profile() from public;
revoke execute on function is_admin_for(uuid) from public;
revoke execute on function can_read_tournament(uuid) from public;
revoke execute on function can_read_match(uuid) from public;
revoke execute on function can_manage_match(uuid) from public;
revoke execute on function team_participates_in_match(uuid, uuid) from public;
revoke execute on function is_round_dice_active(uuid) from public;
revoke execute on function draw_match_cards(uuid) from public;
revoke execute on function play_card(uuid) from public;
revoke execute on function activate_card(uuid) from public;
revoke execute on function roll_global_dice_for_round(uuid) from public;
revoke execute on function steal_active_card(uuid, uuid) from public;
revoke execute on function start_match(uuid) from public;
revoke execute on function end_set(uuid) from public;
revoke execute on function start_second_set(uuid) from public;
revoke execute on function end_match(uuid) from public;
revoke execute on function record_game_won(uuid, text) from public;
revoke execute on function record_super_tiebreak_point(uuid, text) from public;
revoke execute on function activate_por_tres(text) from public;
revoke execute on function claim_global_event_winner(uuid, uuid) from public;
revoke execute on function get_active_tournament_state() from public;

grant execute on function current_profile() to authenticated;
grant execute on function is_admin_for(uuid) to authenticated;
grant execute on function can_read_tournament(uuid) to authenticated;
grant execute on function can_read_match(uuid) to authenticated;
grant execute on function can_manage_match(uuid) to authenticated;
grant execute on function team_participates_in_match(uuid, uuid) to authenticated;
grant execute on function is_round_dice_active(uuid) to authenticated;
grant execute on function draw_match_cards(uuid) to authenticated;
grant execute on function play_card(uuid) to authenticated;
grant execute on function activate_card(uuid) to authenticated;
grant execute on function roll_global_dice_for_round(uuid) to authenticated;
grant execute on function steal_active_card(uuid, uuid) to authenticated;
grant execute on function start_match(uuid) to authenticated;
grant execute on function end_set(uuid) to authenticated;
grant execute on function start_second_set(uuid) to authenticated;
grant execute on function end_match(uuid) to authenticated;
grant execute on function record_game_won(uuid, text) to authenticated;
grant execute on function record_super_tiebreak_point(uuid, text) to authenticated;
grant execute on function activate_por_tres(text) to authenticated;
grant execute on function claim_global_event_winner(uuid, uuid) to authenticated;
grant execute on function get_active_tournament_state() to authenticated;
