-- POST uploads retain storage.object.upload when x-upsert=true. Storage checks
-- INSERT ... ON CONFLICT DO UPDATE ... RETURNING, so metadata-first creation
-- and retries also need SELECT/UPDATE under that same operation. Keep every
-- existing tenant, exact metadata, live-session and role restriction.
drop policy if exists jr_private_select on storage.objects;
create policy jr_private_select
on storage.objects
for select to authenticated
using (
  bucket_id = 'jr-os-private'
  and (storage.foldername(name))[1] = private.current_organisation_id()::text
  and (
    (
      storage.allow_only_operation('storage.object.get_authenticated')
      and exists (
        select 1 from public.private_files file
        where file.organisation_id = private.current_organisation_id()
          and file.bucket = 'jr-os-private'
          and file.object_path = name
          and private.jr_can_read_private_file(
            file.storage_key, file.organisation_id, file.source_id,
            file.customer_source_id, file.job_source_id
          )
      )
    )
    or (
      storage.allow_any_operation(array[
        'storage.object.upload', 'storage.object.upload_update'
      ]::text[])
      and exists (
        select 1 from public.private_files file
        where file.organisation_id = private.current_organisation_id()
          and file.bucket = 'jr-os-private'
          and file.object_path = name
          and private.jr_can_write_private_file(file.storage_key)
      )
    )
  )
);

drop policy if exists jr_private_update on storage.objects;
create policy jr_private_update
on storage.objects
for update to authenticated
using (
  storage.allow_any_operation(array[
    'storage.object.upload', 'storage.object.upload_update'
  ]::text[])
  and bucket_id = 'jr-os-private'
  and (storage.foldername(name))[1] = private.current_organisation_id()::text
  and exists (
    select 1 from public.private_files file
    where file.organisation_id = private.current_organisation_id()
      and file.bucket = 'jr-os-private'
      and file.object_path = name
      and private.jr_can_write_private_file(file.storage_key)
  )
)
with check (
  storage.allow_any_operation(array[
    'storage.object.upload', 'storage.object.upload_update'
  ]::text[])
  and bucket_id = 'jr-os-private'
  and (storage.foldername(name))[1] = private.current_organisation_id()::text
  and exists (
    select 1 from public.private_files file
    where file.organisation_id = private.current_organisation_id()
      and file.bucket = 'jr-os-private'
      and file.object_path = name
      and private.jr_can_write_private_file(file.storage_key)
  )
);

create or replace function public.jr_os_deployed_migration()
returns jsonb
language sql
immutable
parallel safe
security invoker
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'migration', '20260919080101_allow_metadata_bound_storage_upserts.sql'
  )
$$;

revoke execute on function public.jr_os_deployed_migration()
from public, anon, authenticated, service_role;
grant execute on function public.jr_os_deployed_migration() to service_role;

notify pgrst, 'reload schema';
