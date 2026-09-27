-- Client-side staff controls are not an authorization boundary. Enforce the
-- same owner/admin hierarchy on direct profile updates so a valid admin token
-- cannot promote itself, manage owners/admins, or rebind a membership identity.

create or replace function private.guard_jr_profile_management()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_role text;
  actor_organisation_id uuid;
  protected_membership_changed boolean;
begin
  if new.id is distinct from old.id
    or new.organisation_id is distinct from old.organisation_id then
    raise exception 'Profile user and organisation identities are immutable'
      using errcode = '42501';
  end if;

  if new.created_at is distinct from old.created_at then
    raise exception 'Profile creation identity is immutable'
      using errcode = '42501';
  end if;

  if auth.role() = 'service_role' then
    return new;
  end if;

  select profile.role, profile.organisation_id
    into actor_role, actor_organisation_id
  from public.profiles profile
  where profile.id = auth.uid()
    and profile.active = true;

  protected_membership_changed := new.role is distinct from old.role
    or new.active is distinct from old.active
    or new.customer_source_id is distinct from old.customer_source_id;

  if auth.uid() = old.id then
    if protected_membership_changed then
      raise exception 'Users cannot change their own role, activation or customer scope'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if actor_role not in ('owner', 'admin')
    or actor_organisation_id is distinct from old.organisation_id then
    raise exception 'Only an active owner or admin can manage same-organisation profiles'
      using errcode = '42501';
  end if;

  if old.role = 'owner' then
    raise exception 'Owner memberships cannot be managed by another profile'
      using errcode = '42501';
  end if;

  if new.role = 'owner' then
    raise exception 'The owner role cannot be assigned through staff management'
      using errcode = '42501';
  end if;

  if actor_role = 'admin'
    and (old.role = 'admin' or new.role = 'admin') then
    raise exception 'Admins cannot manage or assign admin memberships'
      using errcode = '42501';
  end if;

  if new.role <> 'customer' and new.customer_source_id is not null then
    raise exception 'Only customer profiles may have a customer portal scope'
      using errcode = '42501';
  end if;

  if new.role = 'customer'
    and new.active = true
    and (
      new.customer_source_id is null
      or not exists (
        select 1
        from public.customers customer
        where customer.organisation_id = new.organisation_id
          and customer.source_id = new.customer_source_id
          and customer.deleted_at is null
      )
    ) then
    raise exception 'Active customer profiles require an active same-organisation customer'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke execute on function private.guard_jr_profile_management()
from public, anon, authenticated;
grant execute on function private.guard_jr_profile_management()
to service_role;

drop trigger if exists profiles_prevent_privilege_escalation on public.profiles;
create trigger profiles_prevent_privilege_escalation
before update on public.profiles
for each row execute function private.guard_jr_profile_management();

drop function if exists public.prevent_profile_privilege_escalation();

notify pgrst, 'reload schema';
