-- An active Auth profile must not outlive the customer record that grants its
-- portal scope. Fail closed for historical inconsistencies, deactivate linked
-- profiles transactionally on customer deletion, and leave restoration as an
-- explicit account-management action.

create or replace function private.jr_profile_scope_is_live(
  record_organisation_id uuid,
  record_role text,
  record_customer_source_id text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when record_role is null then false
    when record_role <> 'customer' then true
    else record_customer_source_id is not null
      and exists (
        select 1
        from public.customers customer
        where customer.organisation_id = record_organisation_id
          and customer.source_id = record_customer_source_id
          and customer.deleted_at is null
      )
  end
$$;

revoke execute on function private.jr_profile_scope_is_live(uuid, text, text)
from public, anon, authenticated, service_role;

create or replace function private.current_jr_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select profile.role
  from public.profiles profile
  where profile.id = (select auth.uid())
    and profile.active
    and private.has_active_auth_session()
    and private.jr_profile_scope_is_live(
      profile.organisation_id,
      profile.role,
      profile.customer_source_id
    )
  limit 1
$$;

create or replace function private.current_customer_source_id()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select profile.customer_source_id
  from public.profiles profile
  where profile.id = (select auth.uid())
    and profile.active
    and profile.role = 'customer'
    and profile.customer_source_id is not null
    and private.has_active_auth_session()
    and private.jr_profile_scope_is_live(
      profile.organisation_id,
      profile.role,
      profile.customer_source_id
    )
  limit 1
$$;

create or replace function private.is_organisation_member(target_organisation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_active_auth_session()
    and exists (
      select 1
      from public.profiles profile
      where profile.id = (select auth.uid())
        and profile.organisation_id = target_organisation_id
        and profile.active
        and private.jr_profile_scope_is_live(
          profile.organisation_id,
          profile.role,
          profile.customer_source_id
        )
    )
$$;

create or replace function private.current_organisation_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select profile.organisation_id
  from public.profiles profile
  where profile.id = (select auth.uid())
    and profile.active
    and private.has_active_auth_session()
    and private.jr_profile_scope_is_live(
      profile.organisation_id,
      profile.role,
      profile.customer_source_id
    )
  limit 1
$$;

create or replace function private."current_role"()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select profile.role
  from public.profiles profile
  where profile.id = (select auth.uid())
    and profile.active
    and private.has_active_auth_session()
    and private.jr_profile_scope_is_live(
      profile.organisation_id,
      profile.role,
      profile.customer_source_id
    )
  limit 1
$$;

revoke execute on function
  private.current_jr_role(),
  private.current_customer_source_id(),
  private.is_organisation_member(uuid),
  private.current_organisation_id(),
  private."current_role"()
from public, anon, authenticated, service_role;

grant execute on function
  private.current_jr_role(),
  private.current_customer_source_id(),
  private.is_organisation_member(uuid),
  private.current_organisation_id(),
  private."current_role"()
to authenticated, service_role;

-- The lifecycle trigger and backfill intentionally reduce privileges after the
-- customer is no longer live. Permit exactly that transition even when no JWT
-- actor exists, while preserving every existing hierarchy rule.
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

  if old.role = 'customer'
    and old.active = true
    and new.active = false
    and new.role is not distinct from old.role
    and new.customer_source_id is not distinct from old.customer_source_id
    and new.full_name is not distinct from old.full_name
    and not exists (
      select 1
      from public.customers customer
      where customer.organisation_id = old.organisation_id
        and customer.source_id = old.customer_source_id
        and customer.deleted_at is null
    ) then
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

create or replace function private.deactivate_jr_customer_portal_profiles()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_organisation_id uuid;
  target_customer_source_id text;
begin
  if tg_op = 'INSERT' then
    if new.deleted_at is null then
      return new;
    end if;
    target_organisation_id := new.organisation_id;
    target_customer_source_id := new.source_id;
  elsif tg_op = 'UPDATE' then
    if old.deleted_at is not null or new.deleted_at is null then
      return new;
    end if;
    target_organisation_id := new.organisation_id;
    target_customer_source_id := new.source_id;
  else
    target_organisation_id := old.organisation_id;
    target_customer_source_id := old.source_id;
  end if;

  update public.profiles profile
  set active = false,
      updated_at = pg_catalog.now()
  where profile.organisation_id = target_organisation_id
    and profile.role = 'customer'
    and profile.customer_source_id = target_customer_source_id
    and profile.active = true;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke execute on function private.deactivate_jr_customer_portal_profiles()
from public, anon, authenticated, service_role;

drop trigger if exists customer_portal_profile_lifecycle on public.customers;
create trigger customer_portal_profile_lifecycle
after insert or update of deleted_at or delete on public.customers
for each row execute function private.deactivate_jr_customer_portal_profiles();

-- Repair stale tenant-bound production bindings installed before the lifecycle
-- trigger. A schema-valid null-organisation profile is already denied by every
-- helper above and has no tenant audit stream, so leave it quarantined instead
-- of making the NOT NULL audit_log insert abort this migration.
update public.profiles profile
set active = false,
    updated_at = pg_catalog.now()
where profile.role = 'customer'
  and profile.active = true
  and profile.organisation_id is not null
  and not exists (
    select 1
    from public.customers customer
    where customer.organisation_id = profile.organisation_id
      and customer.source_id = profile.customer_source_id
      and customer.deleted_at is null
  );

create or replace function public.jr_os_deployed_migration()
returns jsonb
language sql
immutable
parallel safe
security invoker
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'migration',
    '20260813215116_revoke_deleted_customer_portals.sql'
  )
$$;

revoke execute on function public.jr_os_deployed_migration()
from public, anon, authenticated, service_role;
grant execute on function public.jr_os_deployed_migration()
to service_role;

notify pgrst, 'reload schema';
