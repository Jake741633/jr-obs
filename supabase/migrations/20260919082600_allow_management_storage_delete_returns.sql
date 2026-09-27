-- Storage DELETE reads the object and uses DELETE ... RETURNING. Mirror the
-- existing same-tenant owner/admin DELETE permission in SELECT for this exact
-- operation, including orphan cleanup. Downloads, listing, signing and bulk
-- deletion retain their existing restrictions.
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
      storage.allow_only_operation('storage.object.delete')
      and private.can_manage_business()
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

create or replace function public.jr_os_deployed_migration()
returns jsonb
language sql
immutable
parallel safe
security invoker
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'migration', '20260919082600_allow_management_storage_delete_returns.sql'
  )
$$;

revoke execute on function public.jr_os_deployed_migration()
from public, anon, authenticated, service_role;
grant execute on function public.jr_os_deployed_migration() to service_role;

notify pgrst, 'reload schema';
