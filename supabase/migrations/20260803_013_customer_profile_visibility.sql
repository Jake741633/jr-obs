-- Restrict profile visibility for customer portal sessions.
-- Customers may read only their own profile; active staff retain organisation-wide
-- visibility needed for team and account administration.

drop policy if exists profiles_tenant_select on public.profiles;
create policy profiles_tenant_select on public.profiles
for select to authenticated
using (
  id = auth.uid()
  or (
    organisation_id = public.current_organisation_id()
    and public.current_role() in ('owner','admin','office','electrician')
  )
);
