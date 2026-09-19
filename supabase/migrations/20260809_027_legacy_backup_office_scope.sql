-- Legacy aggregate rows contain complete organisation backups. They are a
-- transitional office function, not field or customer data.

drop policy if exists "Members can read organisation records" on public.app_records;
drop policy if exists app_records_staff_select on public.app_records;
drop policy if exists app_records_office_select on public.app_records;

create policy app_records_office_select on public.app_records
for select to authenticated
using (
  organisation_id = public.current_organisation_id()
  and public.can_manage_office_data()
);
