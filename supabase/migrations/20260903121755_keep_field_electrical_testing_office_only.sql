-- Canonical electrical testing rows contain complete installation test results
-- and office handoff detail. Electricians keep device-local testing drafts;
-- canonical typed records remain available only to office-management roles.
drop policy if exists electrical_testing_records_select on public.electrical_testing_records;
create policy electrical_testing_records_select
on public.electrical_testing_records
for select to authenticated
using (
  organisation_id = private.current_organisation_id()
  and (select private.can_manage_office_data())
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
    '20260903121755_keep_field_electrical_testing_office_only.sql'
  )
$$;

revoke execute on function public.jr_os_deployed_migration()
from public, anon, authenticated, service_role;
grant execute on function public.jr_os_deployed_migration()
to service_role;

notify pgrst, 'reload schema';
