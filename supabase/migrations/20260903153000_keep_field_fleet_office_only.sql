-- Fleet records contain vehicle registrations, staff assignments, compliance
-- dates, mileage and private office notes. No permitted electrician route
-- consumes this collection, and the generic field projector otherwise copies
-- its payload unchanged, so keep the collection office-only until a dedicated
-- field-safe fleet contract exists.
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
    'jr-os-stock-locations'
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
    '20260903153000_keep_field_fleet_office_only.sql'
  )
$$;

revoke execute on function public.jr_os_deployed_migration()
from public, anon, authenticated, service_role;
grant execute on function public.jr_os_deployed_migration()
to service_role;

notify pgrst, 'reload schema';
