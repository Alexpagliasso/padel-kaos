-- READ ONLY PARTIAL APPLY CHECK.
-- Run this after a failed 004_apply_backup_reset.sql attempt.
-- It does not modify schema or data.

select
  'extension' as check_type,
  'pgcrypto' as object_name,
  case when e.extname is not null then 'present' else 'missing' end as status,
  n.nspname as extension_schema
from (select 'pgcrypto'::text as extname) expected
left join pg_extension e on e.extname = expected.extname
left join pg_namespace n on n.oid = e.extnamespace;

select
  'constraint' as check_type,
  'tournaments_status_lifecycle_check' as object_name,
  case when con.conname is not null then 'present' else 'missing' end as status
from (select 'tournaments_status_lifecycle_check'::text as conname) expected
left join pg_constraint con on con.conname = expected.conname;

select
  'table' as check_type,
  'tournament_backups' as object_name,
  case when c.relname is not null then 'present' else 'missing' end as status,
  coalesce(c.relrowsecurity, false) as rls_enabled
from (select 'tournament_backups'::text as relname) expected
left join pg_class c
  on c.relname = expected.relname
  and c.relkind = 'r'
  and c.relnamespace = 'public'::regnamespace;

with expected_policies(policy_name) as (
  values
    ('tournament_backups_admin_select'),
    ('tournament_backups_admin_insert'),
    ('tournament_backups_admin_delete')
)
select
  'policy' as check_type,
  policy_name as object_name,
  case when p.policyname is not null then 'present' else 'missing' end as status
from expected_policies e
left join pg_policies p
  on p.schemaname = 'public'
  and p.tablename = 'tournament_backups'
  and p.policyname = e.policy_name
order by object_name;

with expected_functions(function_name, argument_types) as (
  values
    ('backup_payload_sha256', 'jsonb'),
    ('has_recent_valid_tournament_backup', 'uuid'),
    ('create_tournament_backup_snapshot', 'uuid, text'),
    ('reset_tournament', 'uuid'),
    ('restore_tournament_backup', 'uuid')
)
select
  'rpc' as check_type,
  function_name || '(' || argument_types || ')' as object_name,
  case when p.proname is not null then 'present' else 'missing' end as status,
  coalesce(p.prosecdef, false) as security_definer
from expected_functions e
left join pg_proc p
  on p.proname = e.function_name
  and oidvectortypes(p.proargtypes) = e.argument_types
  and p.pronamespace = 'public'::regnamespace
order by object_name;
