-- READ ONLY VERIFY SCRIPT.
-- Run after 004_apply_backup_reset.sql from Supabase SQL Editor.
-- Produces one result set so Supabase SQL Editor shows every check together.

with
extension_check as (
  select
    'extension' as check_type,
    'pgcrypto' as object_name,
    case
      when e.extname is null then 'missing'
      when n.nspname <> 'extensions' then 'wrong_schema'
      else 'ok'
    end as status,
    case
      when e.extname is null then 'missing'
      else 'schema=' || n.nspname
    end as details
  from (select 'pgcrypto'::text as extname) expected
  left join pg_extension e on e.extname = expected.extname
  left join pg_namespace n on n.oid = e.extnamespace
),
table_check as (
  select
    'table' as check_type,
    'public.tournament_backups' as object_name,
    case when c.relname is not null then 'ok' else 'missing' end as status,
    case when c.relname is not null then 'present' else 'missing' end as details
  from (select 'tournament_backups'::text as relname) expected
  left join pg_class c
    on c.relname = expected.relname
    and c.relkind = 'r'
    and c.relnamespace = 'public'::regnamespace
),
rls_check as (
  select
    'rls' as check_type,
    'public.tournament_backups' as object_name,
    case when c.relrowsecurity then 'ok' else 'missing' end as status,
    case when c.relrowsecurity then 'enabled' else 'disabled_or_missing' end as details
  from (select 'tournament_backups'::text as relname) expected
  left join pg_class c
    on c.relname = expected.relname
    and c.relkind = 'r'
    and c.relnamespace = 'public'::regnamespace
),
rpc_check as (
  select
    'rpc' as check_type,
    e.function_name || '(' || e.argument_types || ')' as object_name,
    case
      when p.proname is null then 'missing'
      when p.prosecdef then 'ok'
      else 'not_security_definer'
    end as status,
    'security_definer=' || coalesce(p.prosecdef::text, 'false') as details
  from (
    values
      ('backup_payload_sha256', 'jsonb'),
      ('has_recent_valid_tournament_backup', 'uuid'),
      ('create_tournament_backup_snapshot', 'uuid, text'),
      ('reset_tournament', 'uuid'),
      ('restore_tournament_backup', 'uuid')
  ) as e(function_name, argument_types)
  left join pg_proc p
    on p.proname = e.function_name
    and oidvectortypes(p.proargtypes) = e.argument_types
    and p.pronamespace = 'public'::regnamespace
),
policy_check as (
  select
    'policy' as check_type,
    e.policy_name as object_name,
    case when p.policyname is not null then 'ok' else 'missing' end as status,
    case when p.policyname is not null then 'present' else 'missing' end as details
  from (
    values
      ('tournament_backups_admin_select'),
      ('tournament_backups_admin_insert'),
      ('tournament_backups_admin_delete')
  ) as e(policy_name)
  left join pg_policies p
    on p.schemaname = 'public'
    and p.tablename = 'tournament_backups'
    and p.policyname = e.policy_name
),
lifecycle_check as (
  select
    'lifecycle' as check_type,
    'tournament_status' as object_name,
    case
      when con.conname is null then 'missing'
      when pg_get_constraintdef(con.oid) like '%draft%'
        and pg_get_constraintdef(con.oid) like '%configured%'
        and pg_get_constraintdef(con.oid) like '%live%'
        and pg_get_constraintdef(con.oid) like '%completed%'
        and pg_get_constraintdef(con.oid) like '%archived%'
      then 'ok'
      else 'incomplete'
    end as status,
    case
      when con.conname is null then 'constraint missing'
      when pg_get_constraintdef(con.oid) like '%draft%'
        and pg_get_constraintdef(con.oid) like '%configured%'
        and pg_get_constraintdef(con.oid) like '%live%'
        and pg_get_constraintdef(con.oid) like '%completed%'
        and pg_get_constraintdef(con.oid) like '%archived%'
      then 'all expected statuses supported'
      else pg_get_constraintdef(con.oid)
    end as details
  from (select 'tournaments_status_lifecycle_check'::text as conname) expected
  left join pg_constraint con on con.conname = expected.conname
),
checks as (
  select check_type, object_name, status, details from extension_check
  union all
  select check_type, object_name, status, details from table_check
  union all
  select check_type, object_name, status, details from rls_check
  union all
  select check_type, object_name, status, details from rpc_check
  union all
  select check_type, object_name, status, details from policy_check
  union all
  select check_type, object_name, status, details from lifecycle_check
)
select
  check_type,
  object_name,
  status,
  details
from checks
order by
  case check_type
    when 'extension' then 1
    when 'table' then 2
    when 'rls' then 3
    when 'rpc' then 4
    when 'policy' then 5
    when 'lifecycle' then 6
    else 99
  end,
  object_name;
