-- Supabase access tokens remain cryptographically valid until exp even after a
-- session is revoked. Require the token's session_id to remain present in
-- auth.sessions before any JR OS tenant or role helper authorizes a request.

create or replace function private.has_active_auth_session()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    auth.role() = 'service_role'
    or exists (
      select 1
      from auth.sessions session
      where session.id::text = (auth.jwt() ->> 'session_id')
        and session.user_id = (select auth.uid())
    ),
    false
  )
$$;

revoke execute on function private.has_active_auth_session()
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
    and private.has_active_auth_session()
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
  limit 1
$$;

notify pgrst, 'reload schema';
