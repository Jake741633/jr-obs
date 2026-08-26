-- Canonical completion records contain customer sign-off evidence, acknowledged
-- warnings, completion attribution and final-invoice linkage. Field cloud mode
-- has no secured completion-record consumer or mutation route, so fail closed
-- instead of exposing this office-authored evidence through the generic field
-- projection.
create or replace function private.jr_electrician_collection_is_readable(collection_key_value text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select collection_key_value = any (array[
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
    'jr-os-job-qa-inspections',
    'jr-os-stock-locations',
    'jr-os-fleet',
    'jr-os-certificate-defaults'
  ]::text[])
$$;

revoke execute on function private.jr_electrician_collection_is_readable(text)
from public, anon;
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
    '20260826121246_keep_field_completion_records_office_only.sql'
  )
$$;

revoke execute on function public.jr_os_deployed_migration()
from public, anon, authenticated, service_role;
grant execute on function public.jr_os_deployed_migration()
to service_role;

notify pgrst, 'reload schema';
