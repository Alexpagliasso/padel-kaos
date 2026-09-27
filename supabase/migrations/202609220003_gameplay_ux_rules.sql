-- Preserve explicit card durations, keep timed sets live for the last game,
-- and seed each new game's point score from the confirmed active lineup.
begin;

alter table public.tournaments
  add column default_timed_card_duration_seconds integer not null default 300
    check (default_timed_card_duration_seconds between 60 and 10800
      and default_timed_card_duration_seconds % 60 = 0);

create or replace function public.set_tournament_default_timed_card_duration(
  p_tournament_id uuid, p_minutes integer
) returns public.tournaments language plpgsql security definer
set search_path=pg_catalog,pg_temp as $$
declare v_tournament public.tournaments;
begin
  if p_minutes is null or p_minutes not between 1 and 180 then raise exception 'invalid timed card duration'; end if;
  select * into v_tournament from public.tournaments where id=p_tournament_id for update;
  if not found then raise exception 'tournament not found'; end if;
  if not public.live_admin_authorized(p_tournament_id) then raise exception 'not authorized'; end if;
  if exists(select 1 from public.rounds r where r.tournament_id=p_tournament_id
    and r.opened_at is not null and r.status<>'completed'::public.round_status)
    or exists(select 1 from public.matches m where m.tournament_id=p_tournament_id
      and m.started_at is not null and m.result_confirmed_at is null) then
    raise exception 'timed card duration is locked during an active turn';
  end if;
  update public.tournaments set default_timed_card_duration_seconds=p_minutes*60,
    updated_at=clock_timestamp() where id=p_tournament_id returning * into v_tournament;
  return v_tournament;
end; $$;

create or replace function public.apply_default_timed_card_duration()
returns trigger language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
begin
  if new.duration_type='timed'::public.card_duration_type and new.duration_value is null then
    select t.default_timed_card_duration_seconds into new.duration_value
    from public.tournaments t where t.id=new.tournament_id;
    new.duration_value:=coalesce(new.duration_value,300);
  end if;
  return new;
end; $$;
create trigger card_definitions_apply_default_timed_duration
before insert on public.card_definitions for each row
execute function public.apply_default_timed_card_duration();

alter table public.matches
  add column game_start_points_a text not null default '0' check(game_start_points_a in ('0','15','30')),
  add column game_start_points_b text not null default '0' check(game_start_points_b in ('0','15','30')),
  add column gender_handicap_available boolean not null default false;

create or replace function public.gender_game_start_score(p_match_id uuid,p_set_number integer)
returns table(points_a text,points_b text,available boolean)
language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$
declare v_a integer;v_b integer;v_a_valid integer;v_b_valid integer;
begin
  select count(*) filter(where pl.gender='female'::public.player_gender),
    count(*) filter(where pl.gender in ('male'::public.player_gender,'female'::public.player_gender))
    into v_a,v_a_valid
  from public.match_lineups ml join public.matches m on m.id=ml.match_id
  join public.players pl on pl.id in (ml.active_player_1_id,ml.active_player_2_id)
  where ml.match_id=p_match_id and ml.team_id=m.team_a_id and ml.set_number=p_set_number;
  select count(*) filter(where pl.gender='female'::public.player_gender),
    count(*) filter(where pl.gender in ('male'::public.player_gender,'female'::public.player_gender))
    into v_b,v_b_valid
  from public.match_lineups ml join public.matches m on m.id=ml.match_id
  join public.players pl on pl.id in (ml.active_player_1_id,ml.active_player_2_id)
  where ml.match_id=p_match_id and ml.team_id=m.team_b_id and ml.set_number=p_set_number;
  if v_a_valid<>2 or v_b_valid<>2 then
    return query select '0'::text,'0'::text,false;
    return;
  end if;
  return query select
    case when v_a-v_b=2 then '30' when v_a-v_b=1 then '15' else '0' end,
    case when v_b-v_a=2 then '30' when v_b-v_a=1 then '15' else '0' end,
    true;
end; $$;

create or replace function public.seed_game_start_score()
returns trigger language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
begin
  if new.status in ('set_1'::public.match_status,'set_2'::public.match_status)
    and (old.status is distinct from new.status or old.games_a is distinct from new.games_a
      or old.games_b is distinct from new.games_b) then
    select score.points_a,score.points_b,score.available
      into new.game_start_points_a,new.game_start_points_b,new.gender_handicap_available
    from public.gender_game_start_score(new.id,new.current_set) score;
  end if;
  return new;
end; $$;
create trigger matches_seed_game_start_score
before update of status,games_a,games_b on public.matches for each row
execute function public.seed_game_start_score();

-- Reconcile already-live games without changing completed scores or set results.
do $$
declare v_match record;v_score record;
begin
  for v_match in select id,current_set from public.matches
    where status in ('set_1'::public.match_status,'set_2'::public.match_status) loop
    select * into v_score from public.gender_game_start_score(v_match.id,v_match.current_set);
    update public.matches set game_start_points_a=v_score.points_a,
      game_start_points_b=v_score.points_b,gender_handicap_available=v_score.available
    where id=v_match.id;
  end loop;
end; $$;

-- Timeout is a client-derived last-game phase. Old clients may still call this
-- endpoint, so it remains an authorized, idempotent read of canonical state.
create or replace function public.expire_timed_match_set(p_match_id uuid)
returns public.matches language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare v_match public.matches;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select * into v_match from public.matches where id=p_match_id;
  if not found then raise exception 'match not found'; end if;
  if not (public.live_admin_authorized(v_match.tournament_id)
    or exists(select 1 from public.profiles p where p.id=auth.uid()
      and p.role='referee'::public.app_role and p.tournament_id=v_match.tournament_id
      and public.can_referee_access_court(p.id,v_match.tournament_id,v_match.court_id))
    or exists(select 1 from public.profiles p where p.id=auth.uid()
      and p.role='court_display'::public.app_role and p.tournament_id=v_match.tournament_id and p.court_id=v_match.court_id)
    or exists(select 1 from public.profiles p where p.id=auth.uid()
      and p.role='main_display'::public.app_role and p.tournament_id=v_match.tournament_id)) then
    raise exception 'not authorized';
  end if;
  return v_match;
end; $$;

create or replace function public.control_referee_match_set(p_match_id uuid,p_action text)
returns public.matches language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare v_match public.matches;v_mode public.set_control_mode;v_opened timestamptz;v_deadline timestamptz;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select m.* into v_match from public.matches m join public.tournaments t on t.id=m.tournament_id
    join public.rounds r on r.id=m.round_id where m.id=p_match_id for update of m,r,t;
  if not found then raise exception 'match not found'; end if;
  select t.set_control_mode,r.opened_at into v_mode,v_opened from public.tournaments t
    join public.rounds r on r.tournament_id=t.id where t.id=v_match.tournament_id and r.id=v_match.round_id;
  if v_mode<>'referee'::public.set_control_mode or v_opened is null then raise exception 'round is not open for referee control'; end if;
  perform p.id from public.profiles p join public.referee_court_assignments rca on rca.referee_user_id=p.id
    where p.id=auth.uid() and p.role='referee'::public.app_role
      and rca.tournament_id=v_match.tournament_id and rca.court_id=v_match.court_id for share of p,rca;
  if not found then raise exception 'not authorized'; end if;
  if p_action in ('end_set_1','end_set_2') then
    v_deadline:=case when p_action='end_set_1' then v_match.set_1_started_at else v_match.set_2_started_at end
      +make_interval(mins=>coalesce(v_match.active_set_duration_minutes,
        public.effective_round_set_duration(v_match.round_id)));
    if v_deadline is null or statement_timestamp()<v_deadline then raise exception 'last game has not started'; end if;
  end if;
  select public.apply_match_set_action(v_match.id,p_action,clock_timestamp()) into v_match;
  update public.rounds set status=case
    when p_action='start_set_1' then 'set_1'::public.round_status
    when p_action='end_set_1' and not exists(select 1 from public.matches m where m.round_id=v_match.round_id and m.status='set_1') then 'set_break'::public.round_status
    when p_action='start_set_2' then 'set_2'::public.round_status
    else status end where id=v_match.round_id and status<>'completed'::public.round_status;
  return v_match;
end; $$;

revoke execute on function public.set_tournament_default_timed_card_duration(uuid,integer) from public,anon;
grant execute on function public.set_tournament_default_timed_card_duration(uuid,integer) to authenticated;
revoke execute on function public.apply_default_timed_card_duration() from public,anon,authenticated;
revoke execute on function public.gender_game_start_score(uuid,integer) from public,anon,authenticated;
revoke execute on function public.seed_game_start_score() from public,anon,authenticated;
commit;
