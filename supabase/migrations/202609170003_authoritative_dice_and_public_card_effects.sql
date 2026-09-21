-- Install the six product dice faces and expose only confirmed active effects to match participants.
begin;

alter table public.dice_rules add column if not exists product_code text;
create unique index if not exists dice_rules_tournament_product_code_unique
  on public.dice_rules(tournament_id,product_code) where product_code is not null;

update public.dice_rules set enabled=false;

insert into public.dice_rules(tournament_id,dice_value,title,description,effect_type,duration_seconds,enabled,product_code)
select t.id,face.value,face.title,face.description,face.code,300,true,face.code
from public.tournaments t cross join (values
  (1,'1vs1','Per cinque minuti si gioca uno contro uno.','one_vs_one'),
  (2,'3vs3','Per cinque minuti si gioca tre contro tre.','three_vs_three'),
  (3,'Palline sgonfie','Per cinque minuti si usano palline sgonfie.','deflated_balls'),
  (4,'Palline tennis','Per cinque minuti si usano palline da tennis.','tennis_balls'),
  (5,'1 solo servizio','Per cinque minuti è consentito un solo servizio.','single_serve'),
  (6,'No vetri','Per cinque minuti i vetri non sono validi.','no_glass')
) as face(value,title,description,code)
on conflict(tournament_id,dice_value) do update set
  title=excluded.title,description=excluded.description,effect_type=excluded.effect_type,
  duration_seconds=300,enabled=true,product_code=excluded.product_code;

create or replace function public.roll_global_dice_for_round(p_round_id uuid)
returns public.rounds language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare v_round public.rounds; v_rule public.dice_rules;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select r.* into v_round from public.rounds r where r.id=p_round_id for update;
  if not found then raise exception 'round not found'; end if;
  perform p.id from public.profiles p join public.tournament_admins ta on ta.user_id=p.id
  where p.id=auth.uid() and p.role='admin'::public.app_role and ta.tournament_id=v_round.tournament_id for share of p,ta;
  if not found then raise exception 'not authorized'; end if;
  perform m.id from public.matches m where m.round_id=p_round_id order by m.id for update;
  if not found then raise exception 'round has no matches'; end if;
  if v_round.dice_result is not null then raise exception 'global dice already rolled'; end if;
  if exists(select 1 from public.matches m where m.round_id=p_round_id and
    (m.status<>'set_break'::public.match_status or m.set_1_ended_at is null or not public.has_valid_completed_set_result(m.id,1))) then
    raise exception 'set 1 results are incomplete';
  end if;
  select dr.* into v_rule from public.dice_rules dr
  where dr.tournament_id=v_round.tournament_id and dr.enabled
    and dr.product_code in ('one_vs_one','three_vs_three','deflated_balls','tennis_balls','single_serve','no_glass')
  order by random() limit 1;
  if not found then raise exception 'authoritative dice faces are not configured'; end if;
  update public.rounds set dice_result=v_rule.dice_value,dice_rule_id=v_rule.id,dice_rolled_at=clock_timestamp(),
    dice_started_at=null,dice_ends_at=null where id=p_round_id returning * into v_round;
  return v_round;
end; $$;

drop policy if exists match_cards_read_private on public.match_cards;
create policy match_cards_read_private on public.match_cards for select to authenticated using (exists (
  select 1 from public.matches m join public.profiles p on p.id=auth.uid() and p.tournament_id=m.tournament_id
  where m.id=match_cards.match_id and (
    p.role='admin'::public.app_role
    or (p.role='team'::public.app_role and (
      p.team_id=match_cards.team_id
      or (p.team_id in(m.team_a_id,m.team_b_id) and match_cards.status='active'::public.card_status)
    ))
    or (p.role='referee'::public.app_role and public.can_referee_access_court(p.id,m.tournament_id,m.court_id) and match_cards.status<>'available'::public.card_status)
    or (p.role='court_display'::public.app_role and p.court_id=m.court_id and match_cards.status='active'::public.card_status)
  )
));

revoke execute on function public.roll_global_dice_for_round(uuid) from public,anon;
grant execute on function public.roll_global_dice_for_round(uuid) to authenticated;

commit;
