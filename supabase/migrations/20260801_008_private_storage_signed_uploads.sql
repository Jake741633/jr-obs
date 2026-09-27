-- Allow authenticated staff to create signed upload URLs while enforcing
-- file type and size at the private bucket boundary.
-- Apply after 20260801_007_profile_self_update_guard.sql.

update storage.buckets
set
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
    'text/plain',
    'text/csv',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]::text[]
where id = 'jr-os-private';

drop policy if exists jr_private_insert on storage.objects;
create policy jr_private_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'jr-os-private'
  and (storage.foldername(name))[1] = public.current_organisation_id()::text
  and public.can_manage_field_data()
);

drop policy if exists jr_private_update on storage.objects;
create policy jr_private_update on storage.objects
for update to authenticated
using (
  bucket_id = 'jr-os-private'
  and (storage.foldername(name))[1] = public.current_organisation_id()::text
  and public.can_manage_field_data()
)
with check (
  bucket_id = 'jr-os-private'
  and (storage.foldername(name))[1] = public.current_organisation_id()::text
  and public.can_manage_field_data()
);
