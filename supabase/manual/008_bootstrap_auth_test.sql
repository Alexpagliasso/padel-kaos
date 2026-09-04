-- AUTH TEST BOOTSTRAP ONLY.
-- Run from Supabase SQL Editor after production foundation and backup/reset scripts.
-- Replace __ADMIN_AUTH_USER_ID__ be with the UID of a real Auth user created manually in Supabase Authentication.
-- This script does not create auth.users and does not delete existing data.

begin;

do $$
begin
  if left('5df3684e-56e2-4668-8d16-6615756d39be', 2) = '__' then
    raise exception 'Replace 5df3684e-56e2-4668-8d16-6615756d39be with the Admin Auth user UID before running this script';
  end if;

  if exists (
    select 1
    from tournaments
    where name = 'Auth Test Bootstrap Tournament'
  ) then
    raise exception 'AUTH TEST BOOTSTRAP already exists; stop to avoid duplicate test data';
  end if;
end;
$$;

create temp table auth_test_bootstrap_ids (
  tournament_id uuid not null,
  group_id uuid not null,
  court_1_id uuid not null,
  court_2_id uuid not null,
  round_id uuid not null,
  team_red_id uuid not null,
  team_blue_id uuid not null,
  red_player_1_id uuid not null,
  red_player_2_id uuid not null,
  red_player_3_id uuid not null,
  blue_player_1_id uuid not null,
  blue_player_2_id uuid not null,
  blue_player_3_id uuid not null,
  match_id uuid not null
) on commit preserve rows;

insert into auth_test_bootstrap_ids
select
  gen_random_uuid(),
  gen_random_uuid(),
  gen_random_uuid(),
  gen_random_uuid(),
  gen_random_uuid(),
  gen_random_uuid(),
  gen_random_uuid(),
  gen_random_uuid(),
  gen_random_uuid(),
  gen_random_uuid(),
  gen_random_uuid(),
  gen_random_uuid(),
  gen_random_uuid(),
  gen_random_uuid();

insert into tournaments (id, name, status)
select tournament_id, 'Auth Test Bootstrap Tournament', 'configured'
from auth_test_bootstrap_ids;

insert into courts (id, tournament_id, name, display_slug, sort_order)
select court_1_id, tournament_id, 'Court 1', 'auth-test-court-1', 1 from auth_test_bootstrap_ids
union all
select court_2_id, tournament_id, 'Court 2', 'auth-test-court-2', 2 from auth_test_bootstrap_ids;

insert into groups (id, tournament_id, assigned_court_id, name, sort_order)
select group_id, tournament_id, court_1_id, 'Auth Test Group A', 1
from auth_test_bootstrap_ids;

insert into teams (id, tournament_id, group_id, name, short_name, color)
select team_red_id, tournament_id, group_id, 'Team Red', 'RED', '#E23D28' from auth_test_bootstrap_ids
union all
select team_blue_id, tournament_id, group_id, 'Team Blue', 'BLUE', '#1769E0' from auth_test_bootstrap_ids;

insert into players (id, tournament_id, team_id, full_name, nickname, gender)
select red_player_1_id, tournament_id, team_red_id, 'Red Player 1', 'RED1', 'female'::player_gender from auth_test_bootstrap_ids
union all
select red_player_2_id, tournament_id, team_red_id, 'Red Player 2', 'RED2', 'male'::player_gender from auth_test_bootstrap_ids
union all
select red_player_3_id, tournament_id, team_red_id, 'Red Player 3', 'RED3', 'male'::player_gender from auth_test_bootstrap_ids
union all
select blue_player_1_id, tournament_id, team_blue_id, 'Blue Player 1', 'BLUE1', 'male'::player_gender from auth_test_bootstrap_ids
union all
select blue_player_2_id, tournament_id, team_blue_id, 'Blue Player 2', 'BLUE2', 'female'::player_gender from auth_test_bootstrap_ids
union all
select blue_player_3_id, tournament_id, team_blue_id, 'Blue Player 3', 'BLUE3', 'male'::player_gender from auth_test_bootstrap_ids;

insert into rounds (id, tournament_id, name, stage, sequence, status)
select round_id, tournament_id, 'Auth Test Round 1', 'group'::round_stage, 1, 'scheduled'::round_status
from auth_test_bootstrap_ids;

insert into matches (id, tournament_id, round_id, group_id, court_id, team_a_id, team_b_id, status)
select match_id, tournament_id, round_id, group_id, court_1_id, team_red_id, team_blue_id, 'ready'::match_status
from auth_test_bootstrap_ids;

insert into match_lineups (match_id, team_id, set_number, active_player_1_id, active_player_2_id, bench_player_id)
select match_id, team_red_id, 1, red_player_1_id, red_player_2_id, red_player_3_id from auth_test_bootstrap_ids
union all
select match_id, team_blue_id, 1, blue_player_1_id, blue_player_2_id, blue_player_3_id from auth_test_bootstrap_ids;

insert into profiles (id, tournament_id, role, username, display_name)
select '5df3684e-56e2-4668-8d16-6615756d39be'::uuid, tournament_id, 'admin'::app_role, 'admin', 'Admin'
from auth_test_bootstrap_ids;

commit;

select
  tournament_id,
  group_id,
  court_1_id,
  court_2_id,
  round_id,
  team_red_id,
  team_blue_id,
  match_id
from auth_test_bootstrap_ids;
