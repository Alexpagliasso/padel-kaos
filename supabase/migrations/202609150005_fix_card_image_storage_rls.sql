-- Evaluate card image ownership and Admin authorization outside nested table RLS.
begin;

create or replace function public.can_manage_card_image_object(
  p_name text,
  p_require_active_card boolean
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_folders text[];
  v_card_id uuid;
begin
  if auth.uid() is null then
    return false;
  end if;

  v_folders := storage.foldername(p_name);
  if cardinality(v_folders) <> 2
     or v_folders[1] <> 'cards'
     or v_folders[2] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  v_card_id := v_folders[2]::uuid;

  return exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'::public.app_role
  ) and exists (
    select 1
    from public.card_definitions cd
    where cd.id = v_card_id
      and cd.tournament_id is null
      and (not p_require_active_card or cd.archived_at is null)
  );
end;
$$;

revoke execute on function public.can_manage_card_image_object(text, boolean) from public;
grant execute on function public.can_manage_card_image_object(text, boolean) to authenticated;

drop policy if exists card_images_admin_insert on storage.objects;
create policy card_images_admin_insert on storage.objects for insert to authenticated
with check (
  bucket_id = 'card-images'
  and public.can_manage_card_image_object(name, true)
);

drop policy if exists card_images_admin_delete on storage.objects;
create policy card_images_admin_delete on storage.objects for delete to authenticated
using (
  bucket_id = 'card-images'
  and public.can_manage_card_image_object(name, false)
);

commit;
