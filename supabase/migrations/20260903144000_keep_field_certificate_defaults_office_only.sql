-- Certificate defaults are organisation settings containing inspector identity,
-- scheme registration, numbering conventions, default outcomes and private
-- office notes. No permitted electrician route consumes them, so remove this
-- collection from the generic field projection instead of exposing the complete
-- payload through its catch-all branch.
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
    'jr-os-fleet'
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
    '20260903144000_keep_field_certificate_defaults_office_only.sql'
  )
$$;

revoke execute on function public.jr_os_deployed_migration()
from public, anon, authenticated, service_role;
grant execute on function public.jr_os_deployed_migration()
to service_role;

notify pgrst, 'reload schema';
