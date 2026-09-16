-- Normalize referee-to-court assignments while retaining profiles.court_id as legacy primary metadata.
begin;

create table public.referee_court_assignments (
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  referee_user_id uuid not null references public.profiles(id) on delete cascade,
  court_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (tournament_id, court_id),
  unique (referee_user_id, court_id),
  foreign key (court_id, tournament_id) references public.courts(id, tournament_id) on delete cascade
);

create index referee_court_assignments_user_idx on public.referee_court_assignments(referee_user_id);
alter table public.referee_court_assignments enable row level security;

create or replace function public.validate_referee_court_assignment()
returns trigger language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
begin
  if not exists (select 1 from public.profiles p where p.id = new.referee_user_id
    and p.tournament_id = new.tournament_id and p.role = 'referee'::public.app_role) then
    raise exception 'L''assegnazione richiede un arbitro dello stesso torneo';
  end if;
  return new;
end;
$$;
create trigger referee_court_assignment_validate
before insert or update on public.referee_court_assignments
for each row execute function public.validate_referee_court_assignment();

create policy referee_court_assignments_read on public.referee_court_assignments for select to authenticated
using (
  referee_user_id = auth.uid()
  or exists (
    select 1 from public.profiles p join public.tournament_admins ta on ta.user_id = p.id
    where p.id = auth.uid() and p.role = 'admin'::public.app_role
      and ta.tournament_id = referee_court_assignments.tournament_id
  )
);

insert into public.referee_court_assignments (tournament_id, referee_user_id, court_id)
select p.tournament_id, p.id, p.court_id
from public.profiles p
where p.role = 'referee'::public.app_role and p.court_id is not null;

create or replace function public.sync_referee_primary_court_assignment()
returns trigger language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
begin
  if new.role = 'referee'::public.app_role and new.court_id is not null then
    insert into public.referee_court_assignments(tournament_id, referee_user_id, court_id)
    values (new.tournament_id, new.id, new.court_id)
    on conflict (referee_user_id, court_id) do nothing;
  end if;
  return new;
end;
$$;

create trigger profiles_sync_referee_primary_court
after insert or update of court_id on public.profiles
for each row execute function public.sync_referee_primary_court_assignment();

create or replace function public.replace_referee_court_assignments(p_referee_user_id uuid, p_court_ids uuid[])
returns setof public.referee_court_assignments
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare v_tournament_id uuid; v_status text; v_primary uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select p.tournament_id into v_tournament_id from public.profiles p
  where p.id = p_referee_user_id and p.role = 'referee'::public.app_role for update;
  if not found then raise exception 'Profilo arbitro non trovato'; end if;
  perform p.id from public.profiles p join public.tournament_admins ta on ta.user_id = p.id
  where p.id = auth.uid() and p.role = 'admin'::public.app_role and ta.tournament_id = v_tournament_id for share of p, ta;
  if not found then raise exception 'not authorized'; end if;
  select t.status into v_status from public.tournaments t where t.id = v_tournament_id for update;
  if v_status not in ('draft','configured') then raise exception 'Le assegnazioni arbitro sono bloccate dopo l''avvio del torneo'; end if;
  if p_court_ids is null or cardinality(p_court_ids) = 0 then raise exception 'Assegna almeno un campo all''arbitro'; end if;
  if cardinality(p_court_ids) <> (select count(distinct id) from unnest(p_court_ids) ids(id)) then raise exception 'Elenco campi duplicato'; end if;
  if exists (select 1 from unnest(p_court_ids) ids(id) where not exists (
    select 1 from public.courts c where c.id = ids.id and c.tournament_id = v_tournament_id
  )) then raise exception 'Uno o più campi non appartengono al torneo'; end if;
  if exists (select 1 from public.referee_court_assignments rca
    where rca.tournament_id = v_tournament_id and rca.court_id = any(p_court_ids)
      and rca.referee_user_id <> p_referee_user_id) then
    raise exception 'Uno o più campi sono già assegnati a un altro arbitro';
  end if;
  delete from public.referee_court_assignments where referee_user_id = p_referee_user_id;
  insert into public.referee_court_assignments(tournament_id, referee_user_id, court_id)
  select v_tournament_id, p_referee_user_id, id from unnest(p_court_ids) ids(id);
  select id into v_primary from unnest(p_court_ids) with ordinality ids(id, position) order by position limit 1;
  update public.profiles set court_id = v_primary, updated_at = now() where id = p_referee_user_id;
  return query select * from public.referee_court_assignments where referee_user_id = p_referee_user_id order by court_id;
end;
$$;

revoke execute on function public.sync_referee_primary_court_assignment() from public;
revoke execute on function public.validate_referee_court_assignment() from public;
revoke execute on function public.replace_referee_court_assignments(uuid, uuid[]) from public;
grant execute on function public.replace_referee_court_assignments(uuid, uuid[]) to authenticated;

create or replace function public.can_referee_access_court(p_user_id uuid, p_tournament_id uuid, p_court_id uuid)
returns boolean language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select exists (select 1 from public.referee_court_assignments rca
    where rca.referee_user_id = p_user_id and rca.tournament_id = p_tournament_id and rca.court_id = p_court_id)
$$;
revoke execute on function public.can_referee_access_court(uuid, uuid, uuid) from public;
grant execute on function public.can_referee_access_court(uuid, uuid, uuid) to authenticated;

create or replace function public.can_read_match(p_match_id uuid) returns boolean language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select exists (select 1 from public.matches m join public.profiles p on p.id=auth.uid() and p.tournament_id=m.tournament_id
    where m.id=p_match_id and (p.role in ('admin'::public.app_role,'main_display'::public.app_role)
      or (p.role='referee'::public.app_role and public.can_referee_access_court(p.id,m.tournament_id,m.court_id))
      or (p.role='court_display'::public.app_role and p.court_id=m.court_id)
      or (p.role='team'::public.app_role and p.team_id in (m.team_a_id,m.team_b_id))))
$$;
create or replace function public.can_manage_match(p_match_id uuid) returns boolean language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select exists (select 1 from public.matches m join public.profiles p on p.id=auth.uid() and p.tournament_id=m.tournament_id
    where m.id=p_match_id and (p.role='admin'::public.app_role
      or (p.role='referee'::public.app_role and public.can_referee_access_court(p.id,m.tournament_id,m.court_id))))
$$;

create or replace function public.can_read_match_roster(p_team_id uuid, p_tournament_id uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select exists (select 1 from public.profiles p where p.id=auth.uid() and p.tournament_id=p_tournament_id and (
    p.role in ('admin'::public.app_role,'main_display'::public.app_role)
    or (p.role='team'::public.app_role and (p.team_id=p_team_id or exists (select 1 from public.matches m where m.tournament_id=p_tournament_id and p.team_id in(m.team_a_id,m.team_b_id) and p_team_id in(m.team_a_id,m.team_b_id))))
    or (p.role='referee'::public.app_role and exists (select 1 from public.matches m where m.tournament_id=p_tournament_id and public.can_referee_access_court(p.id,m.tournament_id,m.court_id) and p_team_id in(m.team_a_id,m.team_b_id)))
    or (p.role='court_display'::public.app_role and exists (select 1 from public.matches m where m.tournament_id=p_tournament_id and m.court_id=p.court_id and p_team_id in(m.team_a_id,m.team_b_id)))))
$$;

drop policy if exists match_cards_read_private on public.match_cards;
create policy match_cards_read_private on public.match_cards for select using (exists (
  select 1 from public.matches m join public.profiles p on p.id=auth.uid() and p.tournament_id=m.tournament_id
  where m.id=match_cards.match_id and (p.role='admin'::public.app_role or (p.role='team'::public.app_role and p.team_id=match_cards.team_id)
    or (p.role='referee'::public.app_role and public.can_referee_access_court(p.id,m.tournament_id,m.court_id) and match_cards.status<>'available'::public.card_status)
    or (p.role='court_display'::public.app_role and p.court_id=m.court_id and match_cards.status<>'available'::public.card_status))));
drop policy if exists match_events_read on public.match_events;
create policy match_events_read on public.match_events for select using (exists (
  select 1 from public.matches m join public.profiles p on p.id=auth.uid() and p.tournament_id=m.tournament_id
  where m.id=match_events.match_id and (p.role='admin'::public.app_role or (p.role='team'::public.app_role and p.team_id in(m.team_a_id,m.team_b_id))
    or (p.role='referee'::public.app_role and public.can_referee_access_court(p.id,m.tournament_id,m.court_id))
    or (p.role='court_display'::public.app_role and p.court_id=m.court_id))));

create or replace function public.replace_group_stage_schedule(
  p_tournament_id uuid,
  p_rounds jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_status text;
  v_round jsonb;
  v_match jsonb;
  v_sequence int;
  v_round_id uuid;
  v_group_id uuid;
  v_court_id uuid;
  v_team_a_id uuid;
  v_team_b_id uuid;
  v_sequences int[] := array[]::int[];
  v_turn_groups text[] := array[]::text[];
  v_turn_courts text[] := array[]::text[];
  v_pairings text[] := array[]::text[];
  v_key text;
  v_group_count bigint;
  v_team_count bigint;
  v_expected_match_count bigint;
  v_payload_match_count bigint := 0;
  v_inserted_round_count bigint := 0;
  v_inserted_match_count bigint := 0;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  -- Serialize schedule replacement only for this tournament.
  select t.status into v_status
  from public.tournaments t
  where t.id = p_tournament_id
  for update;
  if not found then raise exception 'tournament not found'; end if;
  -- Lock the caller's membership before authorization so it cannot be revoked
  -- concurrently after the authorization check.
  perform p.id from public.profiles p
  where p.id = auth.uid()
    and p.tournament_id = p_tournament_id
    and p.role = 'admin'::public.app_role
  for share;
  if not found then
    raise exception 'not authorized';
  end if;
  if v_status not in ('draft', 'configured') then
    raise exception 'group-stage schedule is locked after tournament start';
  end if;

  -- Freeze the scoped configuration and roster while it is validated/used.
  perform c.id from public.courts c
  where c.tournament_id = p_tournament_id order by c.id for update;
  perform g.id from public.groups g
  where g.tournament_id = p_tournament_id order by g.id for update;
  perform t.id from public.teams t
  where t.tournament_id = p_tournament_id order by t.id for update;
  perform p.id from public.profiles p
  where p.tournament_id = p_tournament_id order by p.id for update;

  select count(*) into v_group_count
  from public.groups g where g.tournament_id = p_tournament_id;
  if v_group_count = 0 then raise exception 'at least one group is required'; end if;

  if exists (
    select 1 from public.groups g
    where g.tournament_id = p_tournament_id and g.assigned_court_id is null
  ) then raise exception 'every group must have an assigned court'; end if;
  if (
    select count(distinct g.assigned_court_id) from public.groups g
    where g.tournament_id = p_tournament_id
  ) <> v_group_count then raise exception 'assigned group courts must be unique'; end if;
  if exists (
    select 1 from public.groups g
    left join public.courts c
      on c.id = g.assigned_court_id and c.tournament_id = g.tournament_id
    where g.tournament_id = p_tournament_id and c.id is null
  ) then raise exception 'group has a foreign or missing assigned court'; end if;
  if exists (
    select 1 from public.groups g
    where g.tournament_id = p_tournament_id and not exists (
      select 1 from public.referee_court_assignments rca
      where rca.tournament_id = p_tournament_id
        and rca.court_id = g.assigned_court_id
    )
  ) then raise exception 'every assigned group court requires exactly one referee'; end if;

  select count(*) into v_team_count
  from public.teams t where t.tournament_id = p_tournament_id;
  if v_team_count = 0 then raise exception 'at least one team is required'; end if;
  if exists (
    select 1 from public.teams t
    left join public.groups g
      on g.id = t.group_id and g.tournament_id = t.tournament_id
    where t.tournament_id = p_tournament_id and g.id is null
  ) then raise exception 'every team must belong to a tournament group'; end if;

  select coalesce(sum(group_teams.team_count * (group_teams.team_count - 1) / 2), 0)
  into v_expected_match_count
  from (
    select count(*)::bigint as team_count
    from public.teams t
    where t.tournament_id = p_tournament_id
    group by t.group_id
  ) group_teams;

  if jsonb_typeof(p_rounds) is distinct from 'array'
     or jsonb_array_length(p_rounds) = 0 then
    raise exception 'rounds payload must be a non-empty array';
  end if;

  -- Validate the complete graph before deleting any existing schedule rows.
  for v_round in select value from jsonb_array_elements(p_rounds) loop
    if jsonb_typeof(v_round) is distinct from 'object'
       or jsonb_typeof(v_round->'sequence') is distinct from 'number'
       or (v_round->>'sequence') !~ '^[1-9][0-9]*$' then
      raise exception 'each round requires a positive integer sequence';
    end if;
    v_sequence := (v_round->>'sequence')::int;
    if v_sequence = any(v_sequences) then raise exception 'duplicate round sequence: %', v_sequence; end if;
    v_sequences := array_append(v_sequences, v_sequence);
    if jsonb_typeof(v_round->'matches') is distinct from 'array' then
      raise exception 'round % matches must be an array', v_sequence;
    end if;

    for v_match in select value from jsonb_array_elements(v_round->'matches') loop
      if jsonb_typeof(v_match) is distinct from 'object'
         or jsonb_typeof(v_match->'group_id') is distinct from 'string'
         or jsonb_typeof(v_match->'court_id') is distinct from 'string'
         or jsonb_typeof(v_match->'team_a_id') is distinct from 'string'
         or jsonb_typeof(v_match->'team_b_id') is distinct from 'string' then
        raise exception 'round % contains an invalid match', v_sequence;
      end if;
      v_group_id := (v_match->>'group_id')::uuid;
      v_court_id := (v_match->>'court_id')::uuid;
      v_team_a_id := (v_match->>'team_a_id')::uuid;
      v_team_b_id := (v_match->>'team_b_id')::uuid;
      if v_team_a_id = v_team_b_id then raise exception 'a team cannot play itself'; end if;
      if not exists (
        select 1 from public.groups g
        where g.id = v_group_id and g.tournament_id = p_tournament_id
          and g.assigned_court_id = v_court_id
      ) then raise exception 'match court does not match its tournament group'; end if;
      if not exists (
        select 1 from public.teams t
        where t.id = v_team_a_id and t.tournament_id = p_tournament_id and t.group_id = v_group_id
      ) or not exists (
        select 1 from public.teams t
        where t.id = v_team_b_id and t.tournament_id = p_tournament_id and t.group_id = v_group_id
      ) then raise exception 'match teams must belong to the specified tournament group'; end if;

      v_key := v_sequence::text || ':' || v_group_id::text;
      if v_key = any(v_turn_groups) then raise exception 'more than one match for a group in round %', v_sequence; end if;
      v_turn_groups := array_append(v_turn_groups, v_key);
      v_key := v_sequence::text || ':' || v_court_id::text;
      if v_key = any(v_turn_courts) then raise exception 'more than one match for a court in round %', v_sequence; end if;
      v_turn_courts := array_append(v_turn_courts, v_key);
      v_key := v_group_id::text || ':' || least(v_team_a_id, v_team_b_id)::text || ':' || greatest(v_team_a_id, v_team_b_id)::text;
      if v_key = any(v_pairings) then raise exception 'duplicate unordered pairing'; end if;
      v_pairings := array_append(v_pairings, v_key);
      v_payload_match_count := v_payload_match_count + 1;
    end loop;
  end loop;

  if v_payload_match_count <> v_expected_match_count then
    raise exception 'schedule must contain every intra-group pairing exactly once';
  end if;
  if exists (
    select 1 from public.rounds r
    where r.tournament_id = p_tournament_id
      and r.stage <> 'group'::public.round_stage
      and r.sequence = any(v_sequences)
  ) then raise exception 'group-stage sequence conflicts with an existing knockout round'; end if;

  -- Lock and assess only this tournament's existing group-stage schedule.
  perform r.id from public.rounds r
  where r.tournament_id = p_tournament_id and r.stage = 'group'::public.round_stage
  order by r.id for update;
  perform m.id from public.matches m
  join public.rounds r on r.id = m.round_id and r.tournament_id = m.tournament_id
  where r.tournament_id = p_tournament_id and r.stage = 'group'::public.round_stage
  order by m.id for update of m;

  if exists (
    select 1 from public.rounds r
    where r.tournament_id = p_tournament_id and r.stage = 'group'::public.round_stage
      and (r.status <> 'scheduled'::public.round_status or r.dice_result is not null
           or r.dice_rule_id is not null or r.dice_started_at is not null or r.dice_ends_at is not null)
  ) or exists (
    select 1 from public.matches m
    join public.rounds r on r.id = m.round_id and r.tournament_id = m.tournament_id
    where r.tournament_id = p_tournament_id and r.stage = 'group'::public.round_stage
      and (m.status <> 'scheduled'::public.match_status or m.started_at is not null or m.completed_at is not null
           or m.current_set <> 1 or m.games_a <> 0 or m.games_b <> 0 or m.sets_a <> 0 or m.sets_b <> 0
           or m.super_tiebreak_team_a is not null or m.super_tiebreak_team_b is not null
           or m.set_1_started_at is not null or m.set_1_ended_at is not null
           or m.set_2_started_at is not null or m.set_2_ended_at is not null)
  ) then raise exception 'cannot replace a started group-stage schedule'; end if;

  if exists (
    select 1 from public.match_lineups ml join public.matches m on m.id = ml.match_id
    join public.rounds r on r.id = m.round_id and r.tournament_id = m.tournament_id
    where r.tournament_id = p_tournament_id and r.stage = 'group'::public.round_stage
  ) or exists (
    select 1 from public.match_cards mc join public.matches m on m.id = mc.match_id
    join public.rounds r on r.id = m.round_id and r.tournament_id = m.tournament_id
    where r.tournament_id = p_tournament_id and r.stage = 'group'::public.round_stage
  ) or exists (
    select 1 from public.match_events me join public.rounds r on r.id = me.round_id
    where r.tournament_id = p_tournament_id and r.stage = 'group'::public.round_stage
  ) or exists (
    select 1 from public.tournament_events te join public.rounds r on r.id = te.round_id
    where r.tournament_id = p_tournament_id and r.stage = 'group'::public.round_stage
  ) or exists (
    select 1 from public.global_event_winners gew join public.matches m on m.id = gew.match_id
    join public.rounds r on r.id = m.round_id and r.tournament_id = m.tournament_id
    where r.tournament_id = p_tournament_id and r.stage = 'group'::public.round_stage
  ) then raise exception 'cannot replace a group-stage schedule with runtime data'; end if;

  delete from public.matches m using public.rounds r
  where m.round_id = r.id and m.tournament_id = p_tournament_id
    and r.tournament_id = p_tournament_id and r.stage = 'group'::public.round_stage;
  delete from public.rounds r
  where r.tournament_id = p_tournament_id and r.stage = 'group'::public.round_stage;

  for v_round in select value from jsonb_array_elements(p_rounds) order by (value->>'sequence')::int loop
    v_sequence := (v_round->>'sequence')::int;
    insert into public.rounds (tournament_id, name, stage, sequence, status)
    values (p_tournament_id, 'Turno ' || v_sequence, 'group'::public.round_stage, v_sequence, 'scheduled'::public.round_status)
    returning id into v_round_id;
    v_inserted_round_count := v_inserted_round_count + 1;

    for v_match in select value from jsonb_array_elements(v_round->'matches') loop
      insert into public.matches (
        tournament_id, round_id, group_id, court_id, team_a_id, team_b_id, status
      ) values (
        p_tournament_id, v_round_id, (v_match->>'group_id')::uuid,
        (v_match->>'court_id')::uuid, (v_match->>'team_a_id')::uuid,
        (v_match->>'team_b_id')::uuid, 'scheduled'::public.match_status
      );
      v_inserted_match_count := v_inserted_match_count + 1;
    end loop;
  end loop;

  if v_inserted_round_count <> jsonb_array_length(p_rounds)
     or v_inserted_match_count <> v_expected_match_count
     or (select count(*) from public.rounds r
         where r.tournament_id = p_tournament_id and r.stage = 'group'::public.round_stage) <> v_inserted_round_count
     or (select count(*) from public.matches m join public.rounds r on r.id = m.round_id
         where m.tournament_id = p_tournament_id and r.tournament_id = p_tournament_id
           and r.stage = 'group'::public.round_stage) <> v_inserted_match_count then
    raise exception 'incomplete group-stage schedule replacement';
  end if;

  return jsonb_build_object(
    'tournamentId', p_tournament_id,
    'rounds', v_inserted_round_count,
    'matches', v_inserted_match_count
  );
end;
$$;

revoke execute on function public.replace_group_stage_schedule(uuid, jsonb) from public, anon;
grant execute on function public.replace_group_stage_schedule(uuid, jsonb) to authenticated;

commit;

