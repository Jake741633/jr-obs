-- Supabase Security & Production Readiness Phase 1.
-- Apply after 20260731_004_generic_collection_sync.sql.

-- Audit rows must be produced by trusted database triggers/functions only.
drop policy if exists audit_append on public.audit_log;
revoke insert, update, delete on public.audit_log from authenticated;
grant select on public.audit_log to authenticated;

-- Keep audit history append-only even for tenant owners/admins through the REST API.
drop policy if exists audit_update on public.audit_log;
drop policy if exists audit_delete on public.audit_log;

-- Private file metadata is customer-scoped for portal users and staff-managed otherwise.
drop policy if exists files_read on public.private_files;
drop policy if exists files_write on public.private_files;
drop policy if exists files_staff_insert on public.private_files;
drop policy if exists files_staff_update on public.private_files;
drop policy if exists files_admin_delete on public.private_files;

create policy files_read on public.private_files
for select to authenticated
using (
  organisation_id=public.current_organisation_id()
  and (
    public.current_role()<>'customer'
    or customer_source_id=(select customer_source_id from public.profiles where id=auth.uid())
  )
);

create policy files_staff_insert on public.private_files
for insert to authenticated
with check (
  organisation_id=public.current_organisation_id()
  and public.can_manage_field_data()
  and (storage.foldername(object_path))[1]=organisation_id::text
  and bucket='jr-os-private'
  and mime_type in (
    'application/pdf','image/jpeg','image/png','image/webp','image/heic','image/heif',
    'text/plain','text/csv','application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  )
);

create policy files_staff_update on public.private_files
for update to authenticated
using (organisation_id=public.current_organisation_id() and public.can_manage_field_data())
with check (
  organisation_id=public.current_organisation_id()
  and public.can_manage_field_data()
  and (storage.foldername(object_path))[1]=organisation_id::text
  and bucket='jr-os-private'
);

create policy files_admin_delete on public.private_files
for delete to authenticated
using (organisation_id=public.current_organisation_id() and public.can_manage_business());

-- Replace private bucket policies with tenant, role, customer-scope and content controls.
drop policy if exists jr_private_select on storage.objects;
drop policy if exists jr_private_insert on storage.objects;
drop policy if exists jr_private_update on storage.objects;
drop policy if exists jr_private_delete on storage.objects;

create policy jr_private_select on storage.objects
for select to authenticated
using (
  bucket_id='jr-os-private'
  and (storage.foldername(name))[1]=public.current_organisation_id()::text
  and (
    public.current_role()<>'customer'
    or exists (
      select 1
      from public.private_files pf
      where pf.organisation_id=public.current_organisation_id()
        and pf.bucket='jr-os-private'
        and pf.object_path=storage.objects.name
        and pf.customer_source_id=(select customer_source_id from public.profiles where id=auth.uid())
    )
  )
);

create policy jr_private_insert on storage.objects
for insert to authenticated
with check (
  bucket_id='jr-os-private'
  and (storage.foldername(name))[1]=public.current_organisation_id()::text
  and public.can_manage_field_data()
  and lower(coalesce(metadata->>'mimetype','')) in (
    'application/pdf','image/jpeg','image/png','image/webp','image/heic','image/heif',
    'text/plain','text/csv','application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  )
  and coalesce((metadata->>'size')::bigint,0)>0
  and coalesce((metadata->>'size')::bigint,0)<=10485760
);

create policy jr_private_update on storage.objects
for update to authenticated
using (
  bucket_id='jr-os-private'
  and (storage.foldername(name))[1]=public.current_organisation_id()::text
  and public.can_manage_field_data()
)
with check (
  bucket_id='jr-os-private'
  and (storage.foldername(name))[1]=public.current_organisation_id()::text
  and public.can_manage_field_data()
  and lower(coalesce(metadata->>'mimetype','')) in (
    'application/pdf','image/jpeg','image/png','image/webp','image/heic','image/heif',
    'text/plain','text/csv','application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  )
  and coalesce((metadata->>'size')::bigint,0)>0
  and coalesce((metadata->>'size')::bigint,0)<=10485760
);

create policy jr_private_delete on storage.objects
for delete to authenticated
using (
  bucket_id='jr-os-private'
  and (storage.foldername(name))[1]=public.current_organisation_id()::text
  and public.can_manage_business()
);
