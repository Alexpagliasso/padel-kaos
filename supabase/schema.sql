-- LEGACY REFERENCE - DO NOT APPLY TO PRODUCTION.
-- The authoritative production schema is consolidated in:
-- supabase/migrations/202609030001_production_foundation.sql

create type app_role as enum ('SUPER_ADMIN', 'PLAYER', 'REFEREE', 'COURT_DISPLAY', 'MAIN_DISPLAY');
create type match_status as enum ('scheduled', 'lineup', 'ready', 'live', 'set_break', 'kaos_event', 'completed');
create type card_state as enum ('available', 'pending', 'active', 'used', 'cancelled');
create type global_event_status as enum ('draft', 'active', 'completed', 'cancelled');
create type match_event_type as enum (
  'MATCH_STARTED',
  'POINT_SCORED',
  'GAME_WON',
  'SET_WON',
  'LINEUP_CHANGED',
  'CARD_PLAYED',
  'CARD_ACTIVATED',
  'CARD_EXPIRED',
  'DICE_ROLLED',
  'KAOS_RULE_STARTED',
  'KAOS_RULE_ENDED',
  'SPECIAL_EVENT',
  'MATCH_COMPLETED',
  'SCORE_CORRECTED'
);

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role app_role not null default 'PLAYER',
  display_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table tournaments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'draft',
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table groups (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table teams (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  group_id uuid references groups(id),
  name text not null,
  short_name text not null,
  color text not null default '#FFD000',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table players (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  full_name text not null,
  nickname text not null,
  access_token_hash text not null unique,
  token_expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table team_players (
  team_id uuid not null references teams(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (team_id, player_id)
);

create table group_teams (
  group_id uuid not null references groups(id) on delete cascade,
  team_id uuid not null references teams(id) on delete cascade,
  primary key (group_id, team_id)
);

create table courts (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  name text not null,
  display_slug text not null,
  created_at timestamptz not null default now()
);

create table matches (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  group_id uuid references groups(id),
  court_id uuid references courts(id),
  team_a_id uuid not null references teams(id),
  team_b_id uuid not null references teams(id),
  status match_status not null default 'scheduled',
  current_set int not null default 1,
  points_a text not null default '0',
  points_b text not null default '0',
  games_a int not null default 0,
  games_b int not null default 0,
  sets_a int not null default 0,
  sets_b int not null default 0,
  active_kaos_event_id uuid,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint different_teams check (team_a_id <> team_b_id)
);

create table match_lineups (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  team_id uuid not null references teams(id) on delete cascade,
  set_number int not null,
  active_player_1_id uuid not null references players(id),
  active_player_2_id uuid not null references players(id),
  bench_player_id uuid not null references players(id),
  created_at timestamptz not null default now(),
  unique (match_id, team_id, set_number),
  constraint unique_lineup_players check (
    active_player_1_id <> active_player_2_id
    and active_player_1_id <> bench_player_id
    and active_player_2_id <> bench_player_id
  )
);

create table cards (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  name text not null,
  slug text not null,
  description text not null,
  category text not null,
  target text not null,
  activation_timing text not null,
  duration_type text not null,
  duration_value int not null default 1,
  effect_type text not null,
  is_global boolean not null default false,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tournament_id, slug)
);

create table team_cards (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  card_id uuid not null references cards(id) on delete cascade,
  state card_state not null default 'available',
  created_at timestamptz not null default now()
);

create table card_usages (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  team_card_id uuid not null references team_cards(id),
  team_id uuid not null references teams(id),
  state card_state not null default 'pending',
  requested_by uuid references profiles(id),
  confirmed_by uuid references profiles(id),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table dice_rules (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  dice_value int not null check (dice_value between 1 and 6),
  title text not null,
  description text not null,
  effect_type text not null,
  duration_games int,
  enabled boolean not null default true,
  unique (tournament_id, dice_value)
);

create table match_kaos_events (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  dice_rule_id uuid not null references dice_rules(id),
  dice_value int not null check (dice_value between 1 and 6),
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

alter table matches
  add constraint matches_active_kaos_fk foreign key (active_kaos_event_id) references match_kaos_events(id);

create table match_events (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
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
  status global_event_status not null default 'draft',
  prize text,
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

create index teams_tournament_idx on teams(tournament_id);
create index players_tournament_idx on players(tournament_id);
create index matches_tournament_status_idx on matches(tournament_id, status);
create index match_events_match_created_idx on match_events(match_id, created_at desc);
create index team_cards_team_state_idx on team_cards(team_id, state);
create index global_events_tournament_status_idx on global_events(tournament_id, status);

alter table profiles enable row level security;
alter table tournaments enable row level security;
alter table teams enable row level security;
alter table players enable row level security;
alter table matches enable row level security;
alter table match_lineups enable row level security;
alter table cards enable row level security;
alter table team_cards enable row level security;
alter table card_usages enable row level security;
alter table dice_rules enable row level security;
alter table match_kaos_events enable row level security;
alter table match_events enable row level security;
alter table global_events enable row level security;
alter table global_event_winners enable row level security;

create policy "admins read all profiles" on profiles for select using (
  exists (select 1 from profiles me where me.id = auth.uid() and me.role = 'SUPER_ADMIN')
  or id = auth.uid()
);

create policy "authenticated tournament read" on tournaments for select using (auth.role() = 'authenticated');
create policy "authenticated team read" on teams for select using (auth.role() = 'authenticated');
create policy "authenticated player read" on players for select using (auth.role() = 'authenticated');
create policy "authenticated match read" on matches for select using (auth.role() = 'authenticated');
create policy "authenticated lineup read" on match_lineups for select using (auth.role() = 'authenticated');
create policy "authenticated card read" on cards for select using (auth.role() = 'authenticated');
create policy "authenticated team_card read" on team_cards for select using (auth.role() = 'authenticated');
create policy "authenticated dice read" on dice_rules for select using (auth.role() = 'authenticated');
create policy "authenticated kaos read" on match_kaos_events for select using (auth.role() = 'authenticated');
create policy "authenticated match_event read" on match_events for select using (auth.role() = 'authenticated');
create policy "authenticated global_event read" on global_events for select using (auth.role() = 'authenticated');

create policy "admin write tournaments" on tournaments for all using (
  exists (select 1 from profiles me where me.id = auth.uid() and me.role = 'SUPER_ADMIN')
);
create policy "admin write matches" on matches for all using (
  exists (select 1 from profiles me where me.id = auth.uid() and me.role = 'SUPER_ADMIN')
);
create policy "referee append events" on match_events for insert with check (
  exists (select 1 from profiles me where me.id = auth.uid() and me.role in ('SUPER_ADMIN', 'REFEREE'))
);

create or replace function claim_global_event_winner(
  p_global_event_id uuid,
  p_player_id uuid,
  p_team_id uuid,
  p_match_id uuid
) returns global_event_winners
language plpgsql
security definer
as $$
declare
  inserted global_event_winners;
begin
  insert into global_event_winners (global_event_id, player_id, team_id, match_id, awarded_by)
  values (p_global_event_id, p_player_id, p_team_id, p_match_id, auth.uid())
  on conflict (global_event_id) do nothing
  returning * into inserted;

  if inserted.id is null then
    raise exception 'global event already has a winner';
  end if;

  update global_events
  set status = 'completed',
      completed_at = now(),
      winner_player_id = p_player_id,
      winner_team_id = p_team_id
  where id = p_global_event_id and status = 'active';

  return inserted;
end;
$$;
