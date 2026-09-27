-- The field job projection removes commercial data, but its RLS policy still
-- exposed every operational job and contact in the organisation. Match the
-- existing field mutation boundary by resolving each projected job against
-- the canonical, active job assigned to the authenticated field identity.

drop policy if exists field_jobs_electrician_select on public.field_jobs;
create policy field_jobs_electrician_select
on public.field_jobs
for select to authenticated
using (
  deleted_at is null
  and organisation_id = private.current_organisation_id()
  and private.current_jr_role() = 'electrician'
  and private.jr_field_record_targets_assigned_job(
    organisation_id,
    customer_source_id,
    source_id
  )
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
    '20260820143000_scope_field_job_reads_to_assignments.sql'
  )
$$;

revoke execute on function public.jr_os_deployed_migration()
from public, anon, authenticated, service_role;
grant execute on function public.jr_os_deployed_migration()
to service_role;

notify pgrst, 'reload schema';
