-- Material-usage projections retain job activity, supplier and site notes even
-- after unit costs are stripped. Bind those reads to an active assigned job so
-- an electrician cannot enumerate another same-tenant job through the field
-- materials screen or its offline cache.

-- JobMaterialUsage payloads carry jobId but no customerId, so generic office
-- and migrated records can legitimately have a NULL customer envelope. Treat
-- a non-NULL customer as an exact constraint while always requiring an active,
-- assigned canonical job.
create or replace function private.jr_field_material_usage_targets_assigned_job(
  record_organisation_id uuid,
  record_customer_source_id text,
  record_job_source_id text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select auth.uid()) is not null
    and record_organisation_id = private.current_organisation_id()
    and record_job_source_id is not null
    and exists (
      select 1
      from private.jr_active_field_identity() field_identity
      join public.jobs job
        on job.organisation_id = field_identity.organisation_id
       and job.source_id = record_job_source_id
      where field_identity.organisation_id = record_organisation_id
        and job.deleted_at is null
        and (
          record_customer_source_id is null
          or job.customer_source_id is not distinct from record_customer_source_id
        )
        and private.jr_job_is_assigned_to_team_member(
          job.payload,
          field_identity.team_member_source_id
        )
    ),
    false
  )
$$;

revoke execute on function private.jr_field_material_usage_targets_assigned_job(uuid, text, text)
from public, anon, authenticated, service_role;
grant execute on function private.jr_field_material_usage_targets_assigned_job(uuid, text, text)
to authenticated, service_role;

drop policy if exists field_cloud_collections_electrician_select
on public.field_cloud_collections;
create policy field_cloud_collections_electrician_select
on public.field_cloud_collections
for select to authenticated
using (
  deleted_at is null
  and organisation_id = private.current_organisation_id()
  and private.current_jr_role() = 'electrician'
  and private.jr_electrician_collection_is_readable(collection_key)
  and case collection_key
    when 'jr-os-surveys' then private.jr_field_record_targets_assigned_job(
      organisation_id,
      customer_source_id,
      job_source_id
    )
    when 'jr-os-job-variations' then private.jr_field_variation_targets_assigned_job(
      organisation_id,
      customer_source_id,
      job_source_id
    )
    when 'jr-os-job-progress' then private.jr_field_progress_targets_assigned_job(
      organisation_id,
      customer_source_id,
      job_source_id
    )
    when 'jr-os-job-material-usage' then private.jr_field_material_usage_targets_assigned_job(
      organisation_id,
      customer_source_id,
      job_source_id
    )
    when 'jr-os-job-timeline' then private.jr_field_timeline_targets_assigned_job(
      organisation_id,
      customer_source_id,
      job_source_id
    )
    when 'jr-os-site-diaries' then private.jr_field_site_diary_targets_assigned_job(
      organisation_id,
      customer_source_id,
      job_source_id
    )
    when 'jr-os-site-diary' then private.jr_field_site_diary_targets_assigned_job(
      organisation_id,
      customer_source_id,
      job_source_id
    )
    else true
  end
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
    '20260826110301_scope_field_material_usage_reads_to_assignments.sql'
  )
$$;

revoke execute on function public.jr_os_deployed_migration()
from public, anon, authenticated, service_role;
grant execute on function public.jr_os_deployed_migration()
to service_role;

notify pgrst, 'reload schema';
