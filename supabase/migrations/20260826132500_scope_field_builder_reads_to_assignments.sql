-- Field builder rows contain operational contact PII. Limit each electrician
-- to builders referenced by a live canonical job assigned to their unique
-- active field identity; keep the complete builder source office-only.

create index if not exists jobs_org_builder_assignment_idx
on public.jobs (
  organisation_id,
  ((payload ->> 'builderId'))
)
where deleted_at is null
  and pg_catalog.jsonb_typeof(payload -> 'builderId') = 'string';

create or replace function private.jr_field_builder_has_assigned_job(
  record_organisation_id uuid,
  record_builder_source_id text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    record_organisation_id = private.current_organisation_id()
    and record_builder_source_id is not null
    and nullif(pg_catalog.btrim(record_builder_source_id), '') is not null
    and exists (
      select 1
      from private.jr_active_field_identity() field_identity
      join public.jobs job
        on job.organisation_id = field_identity.organisation_id
      where field_identity.organisation_id = record_organisation_id
        and job.deleted_at is null
        and pg_catalog.jsonb_typeof(job.payload -> 'builderId') = 'string'
        and job.payload ->> 'builderId' = record_builder_source_id
        and private.jr_job_is_assigned_to_team_member(
          job.payload,
          field_identity.team_member_source_id
        )
    ),
    false
  )
$$;

revoke execute on function private.jr_field_builder_has_assigned_job(uuid, text)
from public, anon, authenticated, service_role;
grant execute on function private.jr_field_builder_has_assigned_job(uuid, text)
to authenticated, service_role;

drop policy if exists field_builders_electrician_select on public.field_builders;
create policy field_builders_electrician_select
on public.field_builders
for select to authenticated
using (
  deleted_at is null
  and organisation_id = private.current_organisation_id()
  and private.current_jr_role() = 'electrician'
  and private.jr_field_builder_has_assigned_job(
    organisation_id,
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
    '20260826132500_scope_field_builder_reads_to_assignments.sql'
  )
$$;

revoke execute on function public.jr_os_deployed_migration()
from public, anon, authenticated, service_role;
grant execute on function public.jr_os_deployed_migration()
to service_role;

notify pgrst, 'reload schema';
