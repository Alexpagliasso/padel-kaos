-- Public card artwork with Admin-only writes scoped to an existing card ID.
begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('card-images', 'card-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists card_images_public_read on storage.objects;
create policy card_images_public_read on storage.objects for select to public
using (bucket_id = 'card-images');

drop policy if exists card_images_admin_insert on storage.objects;
create policy card_images_admin_insert on storage.objects for insert to authenticated
with check (
  bucket_id = 'card-images'
  and (storage.foldername(name))[1] = 'cards'
  and array_length(storage.foldername(name), 1) = 2
  and exists (select 1 from public.card_definitions cd
    where cd.id = ((storage.foldername(name))[2])::uuid and cd.tournament_id is null and cd.archived_at is null)
  and exists (select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'::public.app_role)
);

drop policy if exists card_images_admin_delete on storage.objects;
create policy card_images_admin_delete on storage.objects for delete to authenticated
using (
  bucket_id = 'card-images'
  and (storage.foldername(name))[1] = 'cards'
  and array_length(storage.foldername(name), 1) = 2
  and exists (select 1 from public.card_definitions cd
    where cd.id = ((storage.foldername(name))[2])::uuid and cd.tournament_id is null)
  and exists (select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'::public.app_role)
);

commit;
