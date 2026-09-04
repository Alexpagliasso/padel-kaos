-- READ ONLY VERIFY SCRIPT.
-- Run after 001_apply_production_foundation.sql from Supabase SQL Editor.

with expected_enums(type_name) as (
  values
    ('app_role'),
    ('tournament_phase'),
    ('round_stage'),
    ('round_status'),
    ('match_status'),
    ('player_gender'),
    ('card_status'),
    ('card_duration_type'),
    ('global_event_status'),
    ('match_event_type')
)
select
  'enum' as check_type,
  type_name as object_name,
  case when t.typname is not null then 'ok' else 'missing' end as status
from expected_enums e
left join pg_type t on t.typname = e.type_name and t.typnamespace = 'public'::regnamespace
order by object_name;

with expected_tables(table_name) as (
  values
    ('tournaments'),
    ('courts'),
    ('groups'),
    ('teams'),
    ('profiles'),
    ('players'),
    ('dice_rules'),
    ('rounds'),
    ('matches'),
    ('match_lineups'),
    ('card_definitions'),
    ('match_cards'),
    ('card_usages'),
    ('match_events'),
    ('tournament_events'),
    ('global_events'),
    ('global_event_winners')
)
select
  'table' as check_type,
  table_name as object_name,
  case when c.relname is not null then 'ok' else 'missing' end as status,
  coalesce(c.relrowsecurity, false) as rls_enabled
from expected_tables e
left join pg_class c on c.relname = e.table_name and c.relkind = 'r' and c.relnamespace = 'public'::regnamespace
order by object_name;

with expected_functions(function_name, argument_types) as (
  values
    ('current_profile', ''),
    ('is_admin_for', 'uuid'),
    ('can_read_tournament', 'uuid'),
    ('can_read_match', 'uuid'),
    ('can_manage_match', 'uuid'),
    ('team_participates_in_match', 'uuid, uuid'),
    ('is_round_dice_active', 'uuid'),
    ('draw_match_cards', 'uuid'),
    ('play_card', 'uuid'),
    ('activate_card', 'uuid'),
    ('roll_global_dice_for_round', 'uuid'),
    ('steal_active_card', 'uuid, uuid'),
    ('start_match', 'uuid'),
    ('end_set', 'uuid'),
    ('start_second_set', 'uuid'),
    ('end_match', 'uuid'),
    ('record_game_won', 'uuid, text'),
    ('record_super_tiebreak_point', 'uuid, text'),
    ('activate_por_tres', 'text'),
    ('claim_global_event_winner', 'uuid, uuid'),
    ('get_active_tournament_state', '')
)
select
  'rpc' as check_type,
  function_name || '(' || argument_types || ')' as object_name,
  case when p.proname is not null then 'ok' else 'missing' end as status,
  coalesce(p.prosecdef, false) as security_definer
from expected_functions e
left join pg_proc p
  on p.proname = e.function_name
  and oidvectortypes(p.proargtypes) = e.argument_types
  and p.pronamespace = 'public'::regnamespace
order by object_name;

with expected_foreign_keys(constraint_name) as (
  values
    ('profiles_id_fkey'),
    ('groups_assigned_court_tournament_fk'),
    ('teams_group_tournament_fk'),
    ('profiles_team_tournament_fk'),
    ('profiles_court_tournament_fk'),
    ('players_team_tournament_fk'),
    ('rounds_dice_rule_tournament_fk'),
    ('matches_round_tournament_fk'),
    ('matches_court_tournament_fk'),
    ('matches_team_a_tournament_fk'),
    ('matches_team_b_tournament_fk'),
    ('match_lineups_active_player_1_team_fk'),
    ('match_lineups_active_player_2_team_fk'),
    ('match_lineups_bench_player_team_fk')
)
select
  'foreign_key' as check_type,
  constraint_name as object_name,
  case when con.conname is not null then 'ok' else 'missing' end as status
from expected_foreign_keys e
left join pg_constraint con on con.conname = e.constraint_name and con.contype = 'f'
order by object_name;

with expected_indexes(index_name) as (
  values
    ('card_definitions_tournament_slug_idx'),
    ('card_definitions_global_template_slug_idx'),
    ('matches_round_idx'),
    ('matches_court_status_idx'),
    ('match_cards_match_team_idx'),
    ('match_cards_status_idx'),
    ('match_events_match_created_idx'),
    ('tournament_events_round_created_idx'),
    ('global_events_tournament_status_idx')
)
select
  'index' as check_type,
  index_name as object_name,
  case when c.relname is not null then 'ok' else 'missing' end as status
from expected_indexes e
left join pg_class c on c.relname = e.index_name and c.relkind = 'i' and c.relnamespace = 'public'::regnamespace
order by object_name;

select
  'policy' as check_type,
  schemaname || '.' || tablename || '.' || policyname as object_name,
  'present' as status
from pg_policies
where schemaname = 'public'
  and tablename in (
    'tournaments',
    'profiles',
    'matches',
    'match_cards',
    'match_events',
    'tournament_events',
    'global_events'
  )
order by tablename, policyname;
