-- The application writes new attachments to jr-os-private, but the empty
-- legacy bucket remains available for compatibility. Apply the same content
-- limits so an older client cannot use it as an unbounded upload surface.

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
where id = 'jr-os-files';

-- PostgreSQL ORs permissive policies. Without an identity guard, an update can
-- satisfy the source bucket's USING clause and the destination bucket's WITH
-- CHECK clause, moving an object between the legacy and current JR buckets.
create or replace function private.guard_jr_storage_bucket_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.bucket_id is distinct from old.bucket_id
    and (
      old.bucket_id in ('jr-os-files', 'jr-os-private')
      or new.bucket_id in ('jr-os-files', 'jr-os-private')
    ) then
    raise exception 'JR storage object bucket identity is immutable'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke execute on function private.guard_jr_storage_bucket_identity()
from public, anon, authenticated;
grant execute on function private.guard_jr_storage_bucket_identity()
to service_role;

drop trigger if exists jr_storage_object_bucket_identity_guard on storage.objects;
create trigger jr_storage_object_bucket_identity_guard
before update of bucket_id on storage.objects
for each row execute function private.guard_jr_storage_bucket_identity();

drop policy if exists legacy_files_staff_insert on storage.objects;
create policy legacy_files_staff_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'jr-os-files'
  and (storage.foldername(name))[1] = private.current_organisation_id()::text
  and private.can_manage_field_data()
);

drop policy if exists legacy_files_staff_update on storage.objects;
create policy legacy_files_staff_update on storage.objects
for update to authenticated
using (
  bucket_id = 'jr-os-files'
  and (storage.foldername(name))[1] = private.current_organisation_id()::text
  and private.can_manage_field_data()
)
with check (
  bucket_id = 'jr-os-files'
  and (storage.foldername(name))[1] = private.current_organisation_id()::text
  and private.can_manage_field_data()
);

notify pgrst, 'reload schema';
