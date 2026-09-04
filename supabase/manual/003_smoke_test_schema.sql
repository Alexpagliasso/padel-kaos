-- SAFE SCHEMA SMOKE TEST.
-- This script inserts minimal data and rolls it back.
-- It does not create auth users and does not test real RLS identities.

begin;

insert into tournaments (id, name, status)
values ('00000000-0000-0000-0000-000000000001', 'Smoke Tournament', 'draft');

insert into courts (id, tournament_id, name, display_slug, sort_order)
values
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000001', 'Court 1', 'court-1', 1);

insert into groups (id, tournament_id, assigned_court_id, name, sort_order)
values
  ('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000101', 'Group A', 1);

insert into teams (id, tournament_id, group_id, name, short_name, color)
values
  ('00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000201', 'Team A', 'A', '#FFD000'),
  ('00000000-0000-0000-0000-000000000302', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000201', 'Team B', 'B', '#00A3FF');

insert into players (id, tournament_id, team_id, full_name, nickname, gender)
values
  ('00000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000301', 'Team A Player 1', 'A1', 'female'),
  ('00000000-0000-0000-0000-000000000402', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000301', 'Team A Player 2', 'A2', 'male'),
  ('00000000-0000-0000-0000-000000000403', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000301', 'Team A Player 3', 'A3', 'male'),
  ('00000000-0000-0000-0000-000000000404', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000302', 'Team B Player 1', 'B1', 'male'),
  ('00000000-0000-0000-0000-000000000405', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000302', 'Team B Player 2', 'B2', 'female'),
  ('00000000-0000-0000-0000-000000000406', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000302', 'Team B Player 3', 'B3', 'male');

insert into dice_rules (id, tournament_id, dice_value, title, description, effect_type, duration_seconds)
values
  ('00000000-0000-0000-0000-000000000501', '00000000-0000-0000-0000-000000000001', 1, 'Smoke Dice', 'Smoke dice rule.', 'SMOKE', 300);

insert into rounds (id, tournament_id, name, stage, sequence, status)
values
  ('00000000-0000-0000-0000-000000000601', '00000000-0000-0000-0000-000000000001', 'Round 1', 'group', 1, 'scheduled');

insert into matches (id, tournament_id, round_id, group_id, court_id, team_a_id, team_b_id, status)
values (
  '00000000-0000-0000-0000-000000000701',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000601',
  '00000000-0000-0000-0000-000000000201',
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000301',
  '00000000-0000-0000-0000-000000000302',
  'ready'
);

insert into match_lineups (match_id, team_id, set_number, active_player_1_id, active_player_2_id, bench_player_id)
values
  ('00000000-0000-0000-0000-000000000701', '00000000-0000-0000-0000-000000000301', 1, '00000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000402', '00000000-0000-0000-0000-000000000403'),
  ('00000000-0000-0000-0000-000000000701', '00000000-0000-0000-0000-000000000302', 1, '00000000-0000-0000-0000-000000000404', '00000000-0000-0000-0000-000000000405', '00000000-0000-0000-0000-000000000406');

insert into card_definitions (id, tournament_id, name, slug, description, effect_type, target_type, duration_type, duration_value, can_be_stolen)
values
  ('00000000-0000-0000-0000-000000000801', null, 'Smoke Timed Card', 'smoke-timed-card', 'Smoke timed card.', 'SMOKE_TIMED', 'team', 'timed', 60, true),
  ('00000000-0000-0000-0000-000000000802', '00000000-0000-0000-0000-000000000001', 'Smoke Instant Card', 'smoke-instant-card', 'Smoke instant card.', 'SMOKE_INSTANT', 'team', 'instant', null, false);

insert into match_cards (match_id, team_id, card_definition_id)
values
  ('00000000-0000-0000-0000-000000000701', '00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000801'),
  ('00000000-0000-0000-0000-000000000701', '00000000-0000-0000-0000-000000000302', '00000000-0000-0000-0000-000000000802');

select
  'smoke_test_counts' as check_type,
  (select count(*) from tournaments where id = '00000000-0000-0000-0000-000000000001') as tournaments,
  (select count(*) from matches where id = '00000000-0000-0000-0000-000000000701') as matches,
  (select count(*) from match_lineups where match_id = '00000000-0000-0000-0000-000000000701') as lineups,
  (select count(*) from match_cards where match_id = '00000000-0000-0000-0000-000000000701') as match_cards;

rollback;
