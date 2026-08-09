-- Private-file metadata policies are permissive and combine with OR. Remove
-- every legacy and hardened write-policy name before recreating one strict
-- policy per operation, so actor, tenant, path, bucket and MIME checks cannot
-- be satisfied across different policies.

drop policy if exists files_write on public.private_files;
drop policy if exists files_staff_insert on public.private_files;
drop policy if exists files_staff_update on public.private_files;
drop policy if exists files_admin_delete on public.private_files;
drop policy if exists private_files_staff_insert on public.private_files;
drop policy if exists private_files_staff_update on public.private_files;
drop policy if exists private_files_admin_delete on public.private_files;

create policy private_files_staff_insert on public.private_files
for insert to authenticated
with check (
  organisation_id = public.current_organisation_id()
  and public.can_manage_field_data()
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
  and created_by = auth.uid()
  and updated_by = auth.uid()
);

create policy private_files_staff_update on public.private_files
for update to authenticated
using (
  organisation_id = public.current_organisation_id()
  and public.can_manage_field_data()
)
with check (
  organisation_id = public.current_organisation_id()
  and public.can_manage_field_data()
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
  and updated_by = auth.uid()
);

create policy private_files_admin_delete on public.private_files
for delete to authenticated
using (
  organisation_id = public.current_organisation_id()
  and public.can_manage_business()
);
