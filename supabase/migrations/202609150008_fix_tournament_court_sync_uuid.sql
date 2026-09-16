-- Preserve the composite result as a tournaments row before syncing courts.
begin;

create or replace function public.update_tournament_configuration_with_courts(
  p_tournament_id uuid,
  p_name text,
  p_teams_count integer,
  p_teams_per_group integer,
  p_gold_qualified_count integer,
  p_silver_qualified_count integer,
  p_courts_count integer,
  p_allow_byes boolean,
  p_theme_preset text,
  p_theme_color text default null
)
returns public.tournaments
language plpgsql
security invoker
set search_path = pg_catalog, pg_temp
as $$
declare
  v_tournament public.tournaments;
begin
  select updated_tournament.*
  into v_tournament
  from public.update_tournament_configuration(
    p_tournament_id,
    p_name,
    p_teams_count,
    p_teams_per_group,
    p_gold_qualified_count,
    p_silver_qualified_count,
    p_courts_count,
    p_allow_byes,
    p_theme_preset,
    p_theme_color
  ) as updated_tournament;

  perform public.sync_tournament_courts(p_tournament_id, p_courts_count);
  return v_tournament;
end;
$$;

revoke execute on function public.update_tournament_configuration_with_courts(uuid, text, integer, integer, integer, integer, integer, boolean, text, text) from public;
grant execute on function public.update_tournament_configuration_with_courts(uuid, text, integer, integer, integer, integer, integer, boolean, text, text) to authenticated;

commit;
