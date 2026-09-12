-- Private object access must follow the same role boundary as the business
-- record that owns the file. Previously any non-customer staff member could
-- read/update every private object in the organisation, allowing field users to
-- bypass office-only expense/HR/finance table restrictions through Storage.

alter table public.private_files
  add column if not exists storage_key text;

alter table public.private_files
  drop constraint if exists private_files_storage_key_check;
alter table public.private_files
  add constraint private_files_storage_key_check
  check (
    storage_key is null
    or storage_key in ('jr-os-job-documents','jr-os-expenses','jr-os-surveys')
  );

create index if not exists private_files_org_storage_key_idx
on public.private_files (organisation_id, storage_key, updated_at desc);

-- Backfill records whose owning collection can be proven. Unknown historical
-- metadata stays NULL and therefore becomes office-only rather than guessed.
update public.private_files file
set storage_key = 'jr-os-expenses'
where file.storage_key is null
  and exists (
    select 1
    from public.expenses expense
    where expense.organisation_id = file.organisation_id
      and expense.source_id = file.source_id
  );

update public.private_files file
set storage_key = 'jr-os-job-documents'
where file.storage_key is null
  and exists (
    select 1
    from public.job_documents document
    where document.organisation_id = file.organisation_id
      and document.source_id = file.source_id
  );

update public.private_files file
set storage_key = 'jr-os-surveys'
where file.storage_key is null
  and exists (
    select 1
    from public.cloud_collections survey
    cross join lateral jsonb_array_elements(
      case
        when jsonb_typeof(survey.payload -> 'photos') = 'array'
          then survey.payload -> 'photos'
        else '[]'::jsonb
      end
    ) photo
    where survey.organisation_id = file.organisation_id
      and survey.collection_key = 'jr-os-surveys'
      and photo ->> 'id' = file.source_id
  );

create or replace function private.jr_can_read_private_file(
  storage_key_value text,
  customer_source_id_value text
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
      and storage_key_value in ('jr-os-job-documents','jr-os-surveys')
    )
    or (
      private.current_jr_role() = 'customer'
      and storage_key_value = 'jr-os-job-documents'
      and customer_source_id_value = private.current_customer_source_id()
    ),
    false
  )
$$;

revoke execute on function private.jr_can_read_private_file(text,text)
from public, anon;
grant execute on function private.jr_can_read_private_file(text,text)
to authenticated, service_role;

create or replace function private.jr_can_write_private_file(storage_key_value text)
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
      and storage_key_value in ('jr-os-job-documents','jr-os-surveys')
    ),
    false
  )
$$;

revoke execute on function private.jr_can_write_private_file(text)
from public, anon;
grant execute on function private.jr_can_write_private_file(text)
to authenticated, service_role;

-- Metadata reads now mirror the owning collection. Unknown historical rows are
-- visible only to office-capable roles through jr_can_read_private_file().
drop policy if exists files_read on public.private_files;
drop policy if exists private_files_role_select on public.private_files;
create policy private_files_role_select
on public.private_files
for select to authenticated
using (
  organisation_id = private.current_organisation_id()
  and private.jr_can_read_private_file(storage_key, customer_source_id)
);

-- Restrict metadata writes as well so an electrician cannot label or mutate an
-- office-only expense receipt as field data.
drop policy if exists private_files_staff_insert on public.private_files;
create policy private_files_staff_insert
on public.private_files
for insert to authenticated
with check (
  organisation_id = private.current_organisation_id()
  and private.jr_can_write_private_file(storage_key)
  and (storage.foldername(object_path))[1] = organisation_id::text
  and bucket = 'jr-os-private'
  and mime_type in (
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
  )
  and created_by = (select auth.uid())
  and updated_by = (select auth.uid())
);

drop policy if exists private_files_staff_update on public.private_files;
create policy private_files_staff_update
on public.private_files
for update to authenticated
using (
  organisation_id = private.current_organisation_id()
  and private.jr_can_write_private_file(storage_key)
)
with check (
  organisation_id = private.current_organisation_id()
  and private.jr_can_write_private_file(storage_key)
  and (storage.foldername(object_path))[1] = organisation_id::text
  and bucket = 'jr-os-private'
  and mime_type in (
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
  )
  and updated_by = (select auth.uid())
);

-- Authenticated downloads must have matching metadata and role permission.
-- Upload-update also requires matching metadata so field users cannot overwrite
-- an office-only object path even if they know it.
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
        select 1
        from public.private_files file
        where file.organisation_id = private.current_organisation_id()
          and file.bucket = 'jr-os-private'
          and file.object_path = name
          and private.jr_can_read_private_file(file.storage_key, file.customer_source_id)
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

drop policy if exists jr_private_update on storage.objects;
create policy jr_private_update
on storage.objects
for update to authenticated
using (
  storage.allow_only_operation('storage.object.upload_update')
  and bucket_id = 'jr-os-private'
  and (storage.foldername(name))[1] = private.current_organisation_id()::text
  and exists (
    select 1
    from public.private_files file
    where file.organisation_id = private.current_organisation_id()
      and file.bucket = 'jr-os-private'
      and file.object_path = name
      and private.jr_can_write_private_file(file.storage_key)
  )
)
with check (
  storage.allow_only_operation('storage.object.upload_update')
  and bucket_id = 'jr-os-private'
  and (storage.foldername(name))[1] = private.current_organisation_id()::text
  and exists (
    select 1
    from public.private_files file
    where file.organisation_id = private.current_organisation_id()
      and file.bucket = 'jr-os-private'
      and file.object_path = name
      and private.jr_can_write_private_file(file.storage_key)
  )
);

-- New object uploads happen before metadata registration, so keep authenticated
-- field upload creation enabled. Subsequent reads/updates remain unavailable
-- until valid role-scoped metadata exists.
drop policy if exists jr_private_insert on storage.objects;
create policy jr_private_insert
on storage.objects
for insert to authenticated
with check (
  storage.allow_only_operation('storage.object.upload')
  and bucket_id = 'jr-os-private'
  and (storage.foldername(name))[1] = private.current_organisation_id()::text
  and private.can_manage_field_data()
);

-- The legacy bucket has no reliable owning-collection metadata. Fail closed for
-- field users; office roles retain access for migration/recovery only.
drop policy if exists legacy_files_staff_select on storage.objects;
create policy legacy_files_staff_select
on storage.objects
for select to authenticated
using (
  storage.allow_any_operation(array[
    'storage.object.get_authenticated',
    'storage.object.upload_update'
  ]::text[])
  and bucket_id = 'jr-os-files'
  and (storage.foldername(name))[1] = private.current_organisation_id()::text
  and private.can_manage_office_data()
);

drop policy if exists legacy_files_staff_insert on storage.objects;
create policy legacy_files_staff_insert
on storage.objects
for insert to authenticated
with check (
  storage.allow_only_operation('storage.object.upload')
  and bucket_id = 'jr-os-files'
  and (storage.foldername(name))[1] = private.current_organisation_id()::text
  and private.can_manage_office_data()
);

drop policy if exists legacy_files_staff_update on storage.objects;
create policy legacy_files_staff_update
on storage.objects
for update to authenticated
using (
  storage.allow_only_operation('storage.object.upload_update')
  and bucket_id = 'jr-os-files'
  and (storage.foldername(name))[1] = private.current_organisation_id()::text
  and private.can_manage_office_data()
)
with check (
  storage.allow_only_operation('storage.object.upload_update')
  and bucket_id = 'jr-os-files'
  and (storage.foldername(name))[1] = private.current_organisation_id()::text
  and private.can_manage_office_data()
);

notify pgrst, 'reload schema';
