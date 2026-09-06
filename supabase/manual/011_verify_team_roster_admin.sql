-- READ ONLY VERIFY SCRIPT.
-- Run after 010_apply_team_roster_admin.sql from Supabase SQL Editor.
-- Produces one result set.

with checks as (
  select
    'column' as check_type,
    'players.first_name' as object_name,
    case when exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'players' and column_name = 'first_name'
    ) then 'ok' else 'missing' end as status,
    'expected first_name column' as details

  union all

  select
    'column',
    'players.last_name',
    case when exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'players' and column_name = 'last_name'
    ) then 'ok' else 'missing' end,
    'expected last_name column'

  union all

  select
    'constraint',
    e.constraint_name,
    case when c.conname is not null then 'ok' else 'missing' end,
    'present'
  from (
    values
      ('players_first_name_not_blank'),
      ('players_last_name_not_blank')
  ) as e(constraint_name)
  left join pg_constraint c on c.conname = e.constraint_name

  union all

  select
    'rpc',
    e.function_name || '(' || e.argument_types || ')',
    case
      when p.proname is null then 'missing'
      when p.prosecdef then 'ok'
      else 'not_security_definer'
    end,
    'security_definer=' || coalesce(p.prosecdef::text, 'false')
  from (
    values
      ('validate_roster_payload', 'jsonb'),
      ('create_team_with_roster', 'uuid, text, text, jsonb'),
      ('update_team_with_roster', 'uuid, text, text, jsonb')
  ) as e(function_name, argument_types)
  left join pg_proc p
    on p.proname = e.function_name
    and oidvectortypes(p.proargtypes) = e.argument_types
    and p.pronamespace = 'public'::regnamespace

  union all

  select
    'policy',
    'players_admin_all',
    case when exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'players' and policyname = 'players_admin_all'
    ) then 'ok' else 'missing' end,
    'admin can manage roster'

  union all

  select
    'policy',
    'players_read',
    case when exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'players' and policyname = 'players_read'
    ) then 'ok' else 'missing' end,
    'team can read own roster through existing policy'
)
select check_type, object_name, status, details
from checks
order by check_type, object_name;
