-- Timesheets contain personal working hours, breaks and notes. Office roles
-- need organisation-wide payroll visibility, while electricians should only
-- read and amend the timesheets they created themselves.

drop policy if exists timesheets_select on public.timesheets;
create policy timesheets_select
on public.timesheets
for select to authenticated
using (
  deleted_at is null
  and organisation_id = private.current_organisation_id()
  and (
    private.can_manage_office_data()
    or (
      private.current_jr_role() = 'electrician'
      and created_by = (select auth.uid())
    )
  )
);

drop policy if exists timesheets_field_update on public.timesheets;
create policy timesheets_field_update
on public.timesheets
for update to authenticated
using (
  organisation_id = private.current_organisation_id()
  and (
    private.can_manage_office_data()
    or (
      private.current_jr_role() = 'electrician'
      and created_by = (select auth.uid())
    )
  )
)
with check (
  organisation_id = private.current_organisation_id()
  and (
    private.can_manage_office_data()
    or (
      private.current_jr_role() = 'electrician'
      and created_by = (select auth.uid())
    )
  )
);

notify pgrst, 'reload schema';
