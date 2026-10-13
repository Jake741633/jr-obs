-- RLS helpers need SECURITY DEFINER so they can read the active profile without
-- recursing through profile policies. They do not need to be public Data API
-- endpoints. Move them into Supabase's non-exposed private schema while keeping
-- only the schema/function privileges required for policy evaluation.

create schema if not exists private;
comment on schema private is
  'Internal JR OS authorization helpers; not exposed through the Data API.';

revoke all on schema private from public, anon, authenticated, service_role;
grant usage on schema private to authenticated, service_role;

alter default privileges for role postgres in schema private
  revoke execute on functions from public, anon, authenticated, service_role;

-- ALTER FUNCTION preserves the function OID, so stored RLS expressions keep
-- their dependencies and PostgreSQL updates their schema-qualified references.
alter function public.current_jr_role() set schema private;
alter function public.current_customer_source_id() set schema private;
alter function public.is_organisation_member(uuid) set schema private;
alter function public.current_organisation_id() set schema private;
alter function public."current_role"() set schema private;
alter function public.can_manage_business() set schema private;
alter function public.can_manage_office_data() set schema private;
alter function public.can_manage_field_data() set schema private;
alter function public.can_write_cloud_collection(text) set schema private;

-- SQL and PL/pgSQL bodies are stored as source text. Rebind the four helper
-- bodies and the tombstone trigger that used explicit public.* function names.
create or replace function private.can_manage_business()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select coalesce(private."current_role"() in ('owner','admin'), false) $$;

create or replace function private.can_manage_office_data()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select coalesce(private."current_role"() in ('owner','admin','office'), false) $$;

create or replace function private.can_manage_field_data()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select coalesce(private."current_role"() in ('owner','admin','office','electrician'), false) $$;

create or replace function private.can_write_cloud_collection(collection_key_value text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when private.current_jr_role() in ('owner','admin','office') then true
    when private.current_jr_role() = 'electrician' then collection_key_value = any (array[
      'jr-os-surveys',
      'jr-os-rams',
      'jr-os-job-packs',
      'jr-os-job-variations',
      'jr-os-job-timeline',
      'jr-os-site-diaries',
      'jr-os-site-diary',
      'jr-os-job-tasks',
      'jr-os-job-progress',
      'jr-os-job-material-usage',
      'jr-os-job-completion'
    ]::text[])
    else false
  end
$$;

create or replace function public.guard_jr_tombstone_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.deleted_at is not null and not private.can_manage_business() then
      raise exception 'Only an owner or admin can create a deleted record';
    end if;
  elsif new.deleted_at is distinct from old.deleted_at and not private.can_manage_business() then
    raise exception 'Only an owner or admin can delete or restore records';
  end if;
  return new;
end;
$$;

revoke execute on function
  private.current_jr_role(),
  private.current_customer_source_id(),
  private.is_organisation_member(uuid),
  private.current_organisation_id(),
  private."current_role"(),
  private.can_manage_business(),
  private.can_manage_office_data(),
  private.can_manage_field_data(),
  private.can_write_cloud_collection(text)
from public, anon;

grant execute on function
  private.current_jr_role(),
  private.current_customer_source_id(),
  private.is_organisation_member(uuid),
  private.current_organisation_id(),
  private."current_role"(),
  private.can_manage_business(),
  private.can_manage_office_data(),
  private.can_manage_field_data(),
  private.can_write_cloud_collection(text)
to authenticated, service_role;

notify pgrst, 'reload schema';
