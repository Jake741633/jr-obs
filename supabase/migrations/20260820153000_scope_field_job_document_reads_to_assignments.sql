-- Field job-document reads previously returned every same-tenant document and
-- private object to an electrician. The field job and customer projections are
-- assignment-scoped, so apply the same canonical job boundary to document rows,
-- private-file metadata and authenticated object downloads.

-- JobDocument payloads contain a jobId but no customerId, so their relational
-- customer envelope is normally NULL, while private-file metadata is bound to
-- the canonical job customer by its existing write guard. Resolve both shapes
-- through the active canonical job and treat each non-NULL customer as an exact
-- constraint. Query the canonical document too so a soft-deleted row cannot
-- remain readable through stale private-file metadata.
create or replace function private.jr_field_can_read_job_document(
  record_organisation_id uuid,
  record_source_id text,
  record_customer_source_id text,
  record_job_source_id text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    record_organisation_id = private.current_organisation_id()
    and record_source_id is not null
    and record_job_source_id is not null
    and private.current_team_member_source_id() is not null
    and exists (
      select 1
      from public.job_documents document
      join public.jobs job
        on job.organisation_id = document.organisation_id
       and job.source_id = document.job_source_id
      where document.organisation_id = record_organisation_id
        and document.source_id = record_source_id
        and document.job_source_id is not distinct from record_job_source_id
        and document.deleted_at is null
        and job.deleted_at is null
        and (
          document.customer_source_id is null
          or job.customer_source_id is not distinct from document.customer_source_id
        )
        and (
          record_customer_source_id is null
          or job.customer_source_id is not distinct from record_customer_source_id
        )
        and private.jr_job_is_assigned_to_team_member(
          job.payload,
          private.current_team_member_source_id()
        )
    ),
    false
  )
$$;

revoke execute on function private.jr_field_can_read_job_document(uuid, text, text, text)
from public, anon, authenticated, service_role;
grant execute on function private.jr_field_can_read_job_document(uuid, text, text, text)
to authenticated, service_role;

drop policy if exists job_documents_select on public.job_documents;
create policy job_documents_select
on public.job_documents
for select to authenticated
using (
  organisation_id = private.current_organisation_id()
  and (
    private.current_jr_role() in ('owner', 'admin', 'office')
    or (
      private.current_jr_role() = 'electrician'
      and deleted_at is null
      and private.jr_field_can_read_job_document(
        organisation_id,
        source_id,
        customer_source_id,
        job_source_id
      )
    )
  )
);

-- The existing private_files and Storage select policies call this helper, so
-- replacing it closes both metadata enumeration and object download paths.
create or replace function private.jr_can_read_private_file(
  storage_key_value text,
  record_organisation_id uuid,
  record_source_id text,
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
        (
          storage_key_value = 'jr-os-job-documents'
          and private.jr_field_can_read_job_document(
            record_organisation_id,
            record_source_id,
            customer_source_id_value,
            job_source_id_value
          )
        )
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

revoke execute on function private.jr_can_read_private_file(text, uuid, text, text, text)
from public, anon, authenticated, service_role;
grant execute on function private.jr_can_read_private_file(text, uuid, text, text, text)
to authenticated, service_role;

-- Replace both policy dependencies before removing the four-argument helper.
drop policy if exists private_files_role_select on public.private_files;
drop policy if exists jr_private_select on storage.objects;
drop function if exists private.jr_can_read_private_file(text, uuid, text, text);

create policy private_files_role_select
on public.private_files
for select to authenticated
using (
  organisation_id = private.current_organisation_id()
  and private.jr_can_read_private_file(
    storage_key,
    organisation_id,
    source_id,
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
            file.source_id,
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
    '20260820153000_scope_field_job_document_reads_to_assignments.sql'
  )
$$;

revoke execute on function public.jr_os_deployed_migration()
from public, anon, authenticated, service_role;
grant execute on function public.jr_os_deployed_migration()
to service_role;

notify pgrst, 'reload schema';
