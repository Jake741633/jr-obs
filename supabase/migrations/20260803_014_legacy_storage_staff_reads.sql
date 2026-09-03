-- Restrict reads from the legacy jr-os-files bucket to authenticated staff.
-- Customer portal sessions must use the metadata-scoped jr-os-private bucket instead.

drop policy if exists "Members can view organisation files" on storage.objects;
drop policy if exists legacy_files_staff_select on storage.objects;

create policy legacy_files_staff_select on storage.objects
for select to authenticated
using (
  bucket_id = 'jr-os-files'
  and (storage.foldername(name))[1] = public.current_organisation_id()::text
  and public.can_manage_field_data()
);
