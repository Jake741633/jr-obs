-- A profile row is an authentication and authorization record, not a team
-- directory entry. Field, office and customer sessions need their own row to
-- resolve JR OS identity, but only owner/admin accounts manage organisation
-- memberships. Require a live business-auth session for both paths and prevent
-- lower-privilege roles from enumerating user IDs, roles and portal bindings.

drop policy if exists profiles_tenant_select on public.profiles;
create policy profiles_tenant_select
on public.profiles
for select to authenticated
using (
  private.current_jr_role() is not null
  and (
    id = (select auth.uid())
    or (
      organisation_id = private.current_organisation_id()
      and private.current_jr_role() in ('owner', 'admin')
    )
  )
);

notify pgrst, 'reload schema';
