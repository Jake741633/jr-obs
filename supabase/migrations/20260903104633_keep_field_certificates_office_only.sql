-- Canonical certificate rows contain complete installation, inspection and
-- internal drafting detail. Field testing is an evidence handoff to the office;
-- electricians do not have a secured canonical certificate consumer and must
-- not receive these tenant-wide payloads through the typed Data API.
drop policy if exists certificates_select on public.certificates;
create policy certificates_select
on public.certificates
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
    '20260903104633_keep_field_certificates_office_only.sql'
  )
$$;

revoke execute on function public.jr_os_deployed_migration()
from public, anon, authenticated, service_role;
grant execute on function public.jr_os_deployed_migration()
to service_role;

notify pgrst, 'reload schema';
