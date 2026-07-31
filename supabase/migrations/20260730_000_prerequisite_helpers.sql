-- JR OS migration prerequisites.
-- Apply after supabase/schema.sql and before 20260730_001_cloud_foundation.sql.
-- This file is intentionally idempotent so a schema-only project can be recovered safely.

create or replace function public.current_jr_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.role
  from public.profiles p
  where p.id = (select auth.uid())
    and coalesce(p.active, true)
  limit 1
$$;

create or replace function public.current_customer_source_id()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.customer_source_id
  from public.profiles p
  where p.id = (select auth.uid())
    and coalesce(p.active, true)
  limit 1
$$;

create or replace function public.is_organisation_member(target_organisation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.organisation_id = target_organisation_id
      and coalesce(p.active, true)
  )
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  new.version := coalesce(old.version, 0) + 1;
  return new;
end;
$$;

-- RLS helper functions must be callable by authenticated requests but not anonymously.
revoke all on function public.current_jr_role() from public, anon;
revoke all on function public.current_customer_source_id() from public, anon;
revoke all on function public.is_organisation_member(uuid) from public, anon;
grant execute on function public.current_jr_role() to authenticated;
grant execute on function public.current_customer_source_id() to authenticated;
grant execute on function public.is_organisation_member(uuid) to authenticated;

-- Trigger functions are invoked by PostgreSQL triggers, not directly by clients.
revoke all on function public.set_updated_at() from public, anon, authenticated;
