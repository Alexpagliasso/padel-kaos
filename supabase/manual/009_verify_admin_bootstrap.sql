-- READ ONLY VERIFY SCRIPT.
-- Run after 008_bootstrap_auth_test.sql from Supabase SQL Editor.
-- Produces one result set for the AUTH TEST BOOTSTRAP ONLY dataset.

with bootstrap_tournament as (
  select *
  from tournaments
  where name = 'Auth Test Bootstrap Tournament'
),
bootstrap_count as (
  select count(*) as tournament_count
  from bootstrap_tournament
),
selected_tournament as (
  select *
  from bootstrap_tournament
  order by created_at desc
  limit 1
),
selected_group as (
  select g.*
  from groups g
  join selected_tournament t on t.id = g.tournament_id
  where g.name = 'Auth Test Group A'
),
selected_courts as (
  select c.*
  from courts c
  join selected_tournament t on t.id = c.tournament_id
  where c.display_slug in ('auth-test-court-1', 'auth-test-court-2')
),
selected_round as (
  select r.*
  from rounds r
  join selected_tournament t on t.id = r.tournament_id
  where r.name = 'Auth Test Round 1'
),
selected_teams as (
  select tm.*
  from teams tm
  join selected_tournament t on t.id = tm.tournament_id
  where tm.short_name in ('RED', 'BLUE')
),
red_team as (
  select *
  from selected_teams
  where short_name = 'RED'
),
blue_team as (
  select *
  from selected_teams
  where short_name = 'BLUE'
),
selected_match as (
  select m.*
  from matches m
  join selected_tournament t on t.id = m.tournament_id
  join selected_round r on r.id = m.round_id
  join selected_group g on g.id = m.group_id
  join red_team red on red.id = m.team_a_id
  join blue_team blue on blue.id = m.team_b_id
),
checks as (
  select
    'tournament' as check_type,
    'Auth Test Bootstrap Tournament' as object_name,
    case when tournament_count = 1 then 'ok' else 'missing_or_duplicate' end as status,
    'count=' || tournament_count::text as details
  from bootstrap_count

  union all

  select
    'tournament' as check_type,
    'status' as object_name,
    case when exists (select 1 from selected_tournament where status = 'configured') then 'ok' else 'invalid' end as status,
    'expected=configured' as details

  union all

  select
    'profile' as check_type,
    'admin' as object_name,
    case
      when exists (
        select 1
        from profiles p
        join selected_tournament t on t.id = p.tournament_id
        where p.username = 'admin'
          and p.role = 'admin'
      )
      then 'ok'
      else 'missing'
    end as status,
    'username=admin role=admin' as details

  union all

  select
    'teams' as check_type,
    'Team Red + Team Blue' as object_name,
    case when count(*) = 2 then 'ok' else 'missing' end as status,
    'count=' || count(*)::text as details
  from selected_teams

  union all

  select
    'players' as check_type,
    'Team Red' as object_name,
    case when count(*) = 3 then 'ok' else 'invalid' end as status,
    'count=' || count(*)::text as details
  from players p
  join red_team red on red.id = p.team_id

  union all

  select
    'players' as check_type,
    'Team Blue' as object_name,
    case when count(*) = 3 then 'ok' else 'invalid' end as status,
    'count=' || count(*)::text as details
  from players p
  join blue_team blue on blue.id = p.team_id

  union all

  select
    'round' as check_type,
    'Auth Test Round 1' as object_name,
    case when count(*) = 1 then 'ok' else 'missing_or_duplicate' end as status,
    'count=' || count(*)::text as details
  from selected_round

  union all

  select
    'match' as check_type,
    'Team Red vs Team Blue' as object_name,
    case when count(*) = 1 then 'ok' else 'missing_or_duplicate' end as status,
    'count=' || count(*)::text as details
  from selected_match

  union all

  select
    'court_assignment' as check_type,
    'group_and_match' as object_name,
    case
      when exists (
        select 1
        from selected_group g
        join selected_match m on m.group_id = g.id
        where g.assigned_court_id = m.court_id
      )
      then 'ok'
      else 'invalid'
    end as status,
    'group.assigned_court_id = match.court_id' as details

  union all

  select
    'courts' as check_type,
    'Court 1 + Court 2' as object_name,
    case when count(*) = 2 then 'ok' else 'missing' end as status,
    'count=' || count(*)::text as details
  from selected_courts

  union all

  select
    'lineups' as check_type,
    'initial set 1' as object_name,
    case
      when count(*) = 2
        and bool_and(ml.set_number = 1)
        and bool_and(ml.active_player_1_id <> ml.active_player_2_id)
        and bool_and(ml.bench_player_id is not null)
      then 'ok'
      else 'invalid'
    end as status,
    'count=' || count(*)::text || ' expected=2 set_number=1' as details
  from match_lineups ml
  join selected_match m on m.id = ml.match_id
)
select
  check_type,
  object_name,
  status,
  details
from checks
order by
  case check_type
    when 'tournament' then 1
    when 'profile' then 2
    when 'teams' then 3
    when 'players' then 4
    when 'courts' then 5
    when 'round' then 6
    when 'match' then 7
    when 'court_assignment' then 8
    when 'lineups' then 9
    else 99
  end,
  object_name;
