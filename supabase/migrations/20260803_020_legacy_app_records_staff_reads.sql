-- The legacy aggregate contains full organisation backups and must never be
-- readable by customer portal accounts. Keep transition access tenant-scoped
-- and limited to active staff roles.

drop policy if exists "Members can read organisation records" on public.app_records;
drop policy if exists app_records_staff_select on public.app_records;

create policy app_records_staff_select on public.app_records
for select to authenticated
using (
  organisation_id = public.current_organisation_id()
  and public.current_jr_role() in ('owner','admin','office','electrician')
);
