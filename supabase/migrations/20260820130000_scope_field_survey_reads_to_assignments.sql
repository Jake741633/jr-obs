-- Field surveys contain property, circuit, defect, note and photo evidence.
-- Their write RPC already requires the active electrician to be assigned to
-- the canonical job, but the field read projection previously exposed every
-- survey in the organisation. Apply the same assigned-job boundary to survey
-- rows and their private files while leaving other field collection and job-
-- document read behaviour unchanged for separate review.

drop policy if exists field_cloud_collections_electrician_select
on public.field_cloud_collections;
create policy field_cloud_collections_electrician_select
on public.field_cloud_collections
for select to authenticated
using (
  deleted_at is null
  and organisation_id = private.current_organisation_id()
  and private.current_jr_role() = 'electrician'
  and private.jr_electrician_collection_is_readable(collection_key)
  and (
    collection_key <> 'jr-os-surveys'
    or private.jr_field_record_targets_assigned_job(
      organisation_id,
      customer_source_id,
      job_source_id
    )
  )
);

create or replace function private.jr_can_read_private_file(
  storage_key_value text,
  record_organisation_id uuid,
  customer_source_id_value text,
  job_source_id_value text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    private.can_manage_office_data()
    or (
      private.current_jr_role() = 'electrician'
      and (
        storage_key_value = 'jr-os-job-documents'
        or (
          storage_key_value = 'jr-os-surveys'
          and private.jr_field_record_targets_assigned_job(
            record_organisation_id,
            customer_source_id_value,
            job_source_id_value
          )
        )
      )
    ),
    false
  )
$$;

revoke execute on function private.jr_can_read_private_file(text, uuid, text, text)
from public, anon, authenticated, service_role;
grant execute on function private.jr_can_read_private_file(text, uuid, text, text)
to authenticated, service_role;

-- Replace every remaining two-argument policy dependency before removing the
-- older helper, which had no job envelope and therefore could not enforce an
-- electrician assignment.
drop policy if exists private_files_role_select on public.private_files;
drop policy if exists jr_private_select on storage.objects;
drop function if exists private.jr_can_read_private_file(text, text);

create policy private_files_role_select
on public.private_files
for select to authenticated
using (
  organisation_id = private.current_organisation_id()
  and private.jr_can_read_private_file(
    storage_key,
    organisation_id,
    customer_source_id,
    job_source_id
  )
);

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
        select 1
        from public.private_files file
        where file.organisation_id = private.current_organisation_id()
          and file.bucket = 'jr-os-private'
          and file.object_path = name
          and private.jr_can_read_private_file(
            file.storage_key,
            file.organisation_id,
            file.customer_source_id,
            file.job_source_id
          )
      )
    )
    or (
      storage.allow_only_operation('storage.object.upload_update')
      and exists (
        select 1
        from public.private_files file
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
    'migration',
    '20260820130000_scope_field_survey_reads_to_assignments.sql'
  )
$$;

revoke execute on function public.jr_os_deployed_migration()
from public, anon, authenticated, service_role;
grant execute on function public.jr_os_deployed_migration()
to service_role;

notify pgrst, 'reload schema';
