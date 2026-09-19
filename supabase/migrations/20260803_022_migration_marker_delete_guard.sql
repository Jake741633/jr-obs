-- Migration markers control whether legacy data is replayed. Office users may
-- read and upsert marker state, but deletion is a destructive migration action
-- reserved for owner/admin roles. Bind marker attribution to the active actor.

drop policy if exists markers_manage on public.migration_markers;
drop policy if exists migration_markers_office_select on public.migration_markers;
drop policy if exists migration_markers_office_insert on public.migration_markers;
drop policy if exists migration_markers_office_update on public.migration_markers;
drop policy if exists migration_markers_admin_delete on public.migration_markers;

create policy migration_markers_office_select on public.migration_markers
for select to authenticated
using (
  organisation_id = public.current_organisation_id()
  and public.can_manage_office_data()
);

create policy migration_markers_office_insert on public.migration_markers
for insert to authenticated
with check (
  organisation_id = public.current_organisation_id()
  and public.can_manage_office_data()
  and imported_by = auth.uid()
);

create policy migration_markers_office_update on public.migration_markers
for update to authenticated
using (
  organisation_id = public.current_organisation_id()
  and public.can_manage_office_data()
)
with check (
  organisation_id = public.current_organisation_id()
  and public.can_manage_office_data()
  and imported_by = auth.uid()
);

create policy migration_markers_admin_delete on public.migration_markers
for delete to authenticated
using (
  organisation_id = public.current_organisation_id()
  and public.can_manage_business()
);
