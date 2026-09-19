-- Allow authenticated users to update harmless fields on their own profile while
-- ensuring organisation membership, role, activation and customer portal scope
-- remain owner/admin controlled.
--
-- The BEFORE UPDATE trigger created by migration 003 rejects protected-field
-- changes. This policy deliberately permits the row to reach that trigger so a
-- privilege-escalation attempt fails explicitly rather than returning a silent
-- zero-row update through PostgREST.

drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update on public.profiles
for update to authenticated
using (
  id = auth.uid()
  and active = true
)
with check (
  id = auth.uid()
);

-- Recreate the guard with a locked search_path. It bases authorization on the
-- existing stored profile, not caller-supplied NEW values.
create or replace function public.prevent_profile_privilege_escalation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_role text;
  actor_organisation_id uuid;
begin
  select p.role, p.organisation_id
    into actor_role, actor_organisation_id
  from public.profiles p
  where p.id = auth.uid()
    and p.active = true;

  if auth.uid() = old.id and coalesce(actor_role, '') not in ('owner', 'admin') then
    if new.organisation_id is distinct from old.organisation_id
      or new.role is distinct from old.role
      or new.active is distinct from old.active
      or new.customer_source_id is distinct from old.customer_source_id then
      raise exception 'Only an owner or admin can change organisation membership, role, activation or portal scope'
        using errcode = '42501';
    end if;
  end if;

  if auth.uid() <> old.id then
    if actor_role not in ('owner', 'admin')
      or actor_organisation_id is distinct from old.organisation_id
      or new.organisation_id is distinct from old.organisation_id then
      raise exception 'Only an owner or admin in the same organisation can update another profile'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.prevent_profile_privilege_escalation() from public, anon, authenticated;

drop trigger if exists profiles_prevent_privilege_escalation on public.profiles;
create trigger profiles_prevent_privilege_escalation
before update on public.profiles
for each row execute function public.prevent_profile_privilege_escalation();
