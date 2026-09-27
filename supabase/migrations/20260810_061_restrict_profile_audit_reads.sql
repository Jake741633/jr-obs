-- Profile audit rows contain complete historical authentication records,
-- including user IDs, roles, active state and customer portal bindings. Keep
-- operational audit visibility for office users, but reserve profile and
-- permission history for the owner/admin roles that can manage profiles.

drop policy if exists audit_read on public.audit_log;
create policy audit_read
on public.audit_log
for select to authenticated
using (
  organisation_id = private.current_organisation_id()
  and (
    private.can_manage_business()
    or (
      private.current_jr_role() = 'office'
      and entity_table <> 'profiles'
      and action <> 'user_permission_changed'
    )
  )
);

notify pgrst, 'reload schema';
