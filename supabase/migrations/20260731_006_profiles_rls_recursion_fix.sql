-- Fix recursive profile RLS inherited from the original base schema.
-- The legacy policy queried public.profiles from inside a policy on public.profiles,
-- which causes PostgreSQL to raise "infinite recursion detected in policy".

-- Reuse the security-definer helper, which is scoped to auth.uid(), active profiles,
-- and an explicit empty search_path.
drop policy if exists "Users can view organisation profiles" on public.profiles;
drop policy if exists profiles_tenant_select on public.profiles;

create policy profiles_tenant_select on public.profiles
for select to authenticated
using (
  id = auth.uid()
  or organisation_id = public.current_organisation_id()
);

-- The original organisations policy also queried profiles directly. Replace it with
-- the same non-recursive tenant helper for consistent active-user enforcement.
drop policy if exists "Members can view their organisation" on public.organisations;
drop policy if exists organisations_tenant_select on public.organisations;

create policy organisations_tenant_select on public.organisations
for select to authenticated
using (id = public.current_organisation_id());
