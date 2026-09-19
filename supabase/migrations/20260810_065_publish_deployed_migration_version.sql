-- Publish the exact JR OS migration reached by the disposable Supabase project.
-- The manual live-RLS workflow reads this marker with its protected service-role
-- credential and refuses to test a stale remote schema. Every future migration
-- must replace the marker with its own filename.

begin;

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
    '20260810_065_publish_deployed_migration_version.sql'
  )
$$;

revoke execute on function public.jr_os_deployed_migration()
from public, anon, authenticated, service_role;

grant execute on function public.jr_os_deployed_migration()
to service_role;

notify pgrst, 'reload schema';

commit;
