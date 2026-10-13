-- Canonical RAMS records contain complete method statements, hazards, controls,
-- responsible people, approvals and private site notes. Cloud electricians have
-- no secured RAMS consumer or mutation route, so keep this collection office-only
-- instead of returning complete tenant-wide payloads through the generic field
-- projection.
create or replace function private.jr_electrician_collection_is_readable(collection_key_value text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select collection_key_value = any (array[
    'jr-os-surveys',
    'jr-os-job-packs',
    'jr-os-job-variations',
    'jr-os-job-timeline',
    'jr-os-site-diaries',
    'jr-os-site-diary',
    'jr-os-job-tasks',
    'jr-os-job-progress',
    'jr-os-job-material-usage',
    'jr-os-job-qa-inspections',
    'jr-os-stock-locations',
    'jr-os-fleet',
    'jr-os-certificate-defaults'
  ]::text[])
$$;

revoke execute on function private.jr_electrician_collection_is_readable(text)
from public, anon, authenticated, service_role;
grant execute on function private.jr_electrician_collection_is_readable(text)
to authenticated, service_role;

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
    '20260827001445_keep_field_rams_office_only.sql'
  )
$$;

revoke execute on function public.jr_os_deployed_migration()
from public, anon, authenticated, service_role;
grant execute on function public.jr_os_deployed_migration()
to service_role;

notify pgrst, 'reload schema';
