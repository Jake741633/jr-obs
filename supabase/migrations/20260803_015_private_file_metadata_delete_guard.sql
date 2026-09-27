-- Split private file metadata permissions by operation.
-- Field-capable staff may register and update metadata, but deletion remains
-- aligned with private object deletion and requires owner/admin authority.

drop policy if exists files_write on public.private_files;
drop policy if exists private_files_staff_insert on public.private_files;
drop policy if exists private_files_staff_update on public.private_files;
drop policy if exists private_files_admin_delete on public.private_files;

create policy private_files_staff_insert on public.private_files
for insert to authenticated
with check (
  organisation_id = public.current_organisation_id()
  and public.can_manage_field_data()
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
  and updated_by = auth.uid()
);

create policy private_files_admin_delete on public.private_files
for delete to authenticated
using (
  organisation_id = public.current_organisation_id()
  and public.can_manage_business()
);
