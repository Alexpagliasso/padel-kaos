-- Expand the tournament Dice Effect Library while keeping every round at exactly six faces.
begin;

alter table public.dice_rules
  add column if not exists long_description text,
  add column if not exists image_url text;

alter table public.dice_rules drop constraint if exists dice_rules_dice_value_check;
alter table public.dice_rules drop constraint if exists dice_rules_tournament_id_dice_value_key;

update public.dice_rules set long_description=description where long_description is null;
alter table public.dice_rules alter column long_description set not null;

create or replace function public.create_dice_effect(
  p_tournament_id uuid,p_title text,p_description text,p_long_description text,p_enabled boolean default true
) returns public.dice_rules language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare v_rule public.dice_rules;v_id uuid:=gen_random_uuid();v_value integer;
begin
  if not public.live_admin_authorized(p_tournament_id) then raise exception 'not authorized'; end if;
  if nullif(btrim(p_title),'') is null or nullif(btrim(p_description),'') is null or nullif(btrim(p_long_description),'') is null or p_enabled is null then raise exception 'invalid dice effect'; end if;
  if exists(select 1 from public.rounds r where r.tournament_id=p_tournament_id and r.opened_at is not null and r.status<>'completed') then raise exception 'dice library is locked during an active turn'; end if;
  select coalesce(max(dice_value),0)+1 into v_value from public.dice_rules where tournament_id=p_tournament_id;
  insert into public.dice_rules(id,tournament_id,dice_value,title,description,long_description,effect_type,duration_seconds,enabled,product_code)
  values(v_id,p_tournament_id,v_value,btrim(p_title),btrim(p_description),btrim(p_long_description),'custom',300,p_enabled,'custom_'||replace(v_id::text,'-','')) returning * into v_rule;
  return v_rule;
end; $$;

create or replace function public.update_dice_effect(
  p_dice_rule_id uuid,p_title text,p_description text,p_long_description text,p_image_url text,p_enabled boolean
) returns public.dice_rules language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare v_rule public.dice_rules;
begin
  select * into v_rule from public.dice_rules where id=p_dice_rule_id for update;
  if not found then raise exception 'dice effect not found'; end if;
  if not public.live_admin_authorized(v_rule.tournament_id) then raise exception 'not authorized'; end if;
  if nullif(btrim(p_title),'') is null or nullif(btrim(p_description),'') is null or nullif(btrim(p_long_description),'') is null or p_enabled is null then raise exception 'invalid dice effect'; end if;
  if exists(select 1 from public.rounds r where r.tournament_id=v_rule.tournament_id and r.opened_at is not null and r.status<>'completed') then raise exception 'dice library is locked during an active turn'; end if;
  update public.dice_rules set title=btrim(p_title),description=btrim(p_description),long_description=btrim(p_long_description),image_url=nullif(btrim(p_image_url),''),enabled=p_enabled
  where id=p_dice_rule_id returning * into v_rule;
  return v_rule;
end; $$;

create or replace function public.set_round_dice_effects(p_round_id uuid,p_enabled_rule_ids uuid[])
returns setof public.round_dice_effects language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare v_round public.rounds;v_dice_enabled boolean;
begin
  select * into v_round from public.rounds where id=p_round_id for update;
  if not found then raise exception 'round not found'; end if;
  if not public.live_admin_authorized(v_round.tournament_id) then raise exception 'not authorized'; end if;
  if v_round.opened_at is not null or v_round.status<>'scheduled' or exists(select 1 from public.matches m where m.round_id=p_round_id and (m.started_at is not null or m.status not in ('scheduled','ready'))) then raise exception 'dice configuration is locked after turn start'; end if;
  select dice_enabled into v_dice_enabled from public.tournaments where id=v_round.tournament_id;
  if p_enabled_rule_ids is null or cardinality(p_enabled_rule_ids)<>(select count(distinct id) from unnest(p_enabled_rule_ids) ids(id)) then raise exception 'invalid or duplicate dice effect list'; end if;
  if v_dice_enabled and cardinality(p_enabled_rule_ids)<>6 then raise exception 'exactly six dice effects are required'; end if;
  if exists(select 1 from unnest(p_enabled_rule_ids) ids(id) where not exists(select 1 from public.dice_rules dr where dr.id=ids.id and dr.tournament_id=v_round.tournament_id and dr.enabled)) then raise exception 'dice effect is disabled or belongs to another tournament'; end if;
  delete from public.round_dice_effects where round_id=p_round_id;
  insert into public.round_dice_effects(round_id,dice_rule_id,enabled) select p_round_id,id,true from unnest(p_enabled_rule_ids) ids(id);
  return query select * from public.round_dice_effects where round_id=p_round_id order by dice_rule_id;
end; $$;

create or replace function public.seed_round_dice_effects()
returns trigger language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
begin
  insert into public.round_dice_effects(round_id,dice_rule_id,enabled)
  select new.id,dr.id,true from public.dice_rules dr where dr.tournament_id=new.tournament_id and dr.enabled
  order by dr.dice_value,dr.id limit 6;
  return new;
end; $$;
create trigger rounds_seed_six_dice_effects after insert on public.rounds for each row execute function public.seed_round_dice_effects();

do $$ declare v_round record; begin
  for v_round in select r.id,r.tournament_id from public.rounds r where r.opened_at is null and r.status='scheduled' loop
    if (select count(*) from public.round_dice_effects where round_id=v_round.id and enabled)<>6 then
      delete from public.round_dice_effects where round_id=v_round.id;
      insert into public.round_dice_effects(round_id,dice_rule_id,enabled)
      select v_round.id,dr.id,true from public.dice_rules dr where dr.tournament_id=v_round.tournament_id and dr.enabled
      order by dr.dice_value,dr.id limit 6;
    end if;
  end loop;
end $$;

create or replace function public.roll_global_dice_for_round(p_round_id uuid)
returns public.rounds language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare v_round public.rounds;v_rule public.dice_rules;v_face integer;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select r.* into v_round from public.rounds r join public.tournaments t on t.id=r.tournament_id where r.id=p_round_id and t.dice_enabled for update of r,t;
  if not found then raise exception 'global dice is disabled or round not found'; end if;
  if not public.live_admin_authorized(v_round.tournament_id) then raise exception 'not authorized'; end if;
  perform m.id from public.matches m where m.round_id=p_round_id order by m.id for update;
  if not found then raise exception 'round has no matches'; end if;
  if v_round.dice_result is not null then raise exception 'global dice already rolled'; end if;
  if exists(select 1 from public.matches m where m.round_id=p_round_id and (m.status<>'set_break' or m.set_1_ended_at is null or not public.has_valid_completed_set_result(m.id,1))) then raise exception 'set 1 results are incomplete'; end if;
  if (select count(*) from public.round_dice_effects rde join public.dice_rules dr on dr.id=rde.dice_rule_id where rde.round_id=p_round_id and rde.enabled and dr.enabled and dr.tournament_id=v_round.tournament_id)<>6 then raise exception 'exactly six dice effects are required'; end if;
  select selected.rule,selected.face into v_rule,v_face from (
    select dr rule,row_number() over(order by dr.dice_value,dr.id)::integer face
    from public.round_dice_effects rde join public.dice_rules dr on dr.id=rde.dice_rule_id
    where rde.round_id=p_round_id and rde.enabled and dr.enabled and dr.tournament_id=v_round.tournament_id
  ) selected order by random() limit 1;
  update public.rounds set dice_result=v_face,dice_rule_id=v_rule.id,dice_rolled_at=clock_timestamp(),dice_started_at=null,dice_ends_at=null where id=p_round_id returning * into v_round;
  return v_round;
end; $$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('dice-effect-images','dice-effect-images',true,5242880,array['image/jpeg','image/png','image/webp']) on conflict(id) do nothing;
create policy dice_effect_images_public_read on storage.objects for select to public using(bucket_id='dice-effect-images');
create policy dice_effect_images_admin_insert on storage.objects for insert to authenticated with check(bucket_id='dice-effect-images' and public.is_admin_for(((storage.foldername(name))[1])::uuid));
create policy dice_effect_images_admin_delete on storage.objects for delete to authenticated using(bucket_id='dice-effect-images' and public.is_admin_for(((storage.foldername(name))[1])::uuid));

revoke execute on function public.create_dice_effect(uuid,text,text,text,boolean) from public,anon;
revoke execute on function public.update_dice_effect(uuid,text,text,text,text,boolean) from public,anon;
revoke execute on function public.seed_round_dice_effects() from public,anon,authenticated;
grant execute on function public.create_dice_effect(uuid,text,text,text,boolean) to authenticated;
grant execute on function public.update_dice_effect(uuid,text,text,text,text,boolean) to authenticated;
commit;
