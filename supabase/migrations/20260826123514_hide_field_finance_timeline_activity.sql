-- Job timelines mix field-operational events with office finance activity.
-- Assigned electricians still need operational and variation status history,
-- but invoice, payment and deposit events remain an office-only concern.
create or replace function private.jr_field_timeline_is_financial(record_payload jsonb)
returns boolean
language sql
immutable
parallel safe
security invoker
set search_path = ''
as $$
  select
    pg_catalog.lower(pg_catalog.btrim(coalesce(record_payload ->> 'eventType', ''))) = 'financial'
    or pg_catalog.lower(pg_catalog.btrim(coalesce(record_payload ->> 'sourceType', ''))) = 'invoice'
    or pg_catalog.lower(pg_catalog.btrim(coalesce(record_payload ->> 'milestone', ''))) = any (
      array[
        'deposit received',
        'invoice created',
        'invoice sent',
        'payment received'
      ]::text[]
    )
$$;

revoke execute on function private.jr_field_timeline_is_financial(jsonb)
from public, anon, authenticated, service_role;
grant execute on function private.jr_field_timeline_is_financial(jsonb)
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
    when 'jr-os-job-tasks' then private.jr_field_task_targets_assigned_job(
      organisation_id,
      customer_source_id,
      job_source_id
    )
    when 'jr-os-job-qa-inspections' then private.jr_field_qa_inspection_targets_assigned_job(
      organisation_id,
      customer_source_id,
      job_source_id
    )
    when 'jr-os-job-timeline' then
      private.jr_field_timeline_targets_assigned_job(
        organisation_id,
        customer_source_id,
        job_source_id
      )
      and not private.jr_field_timeline_is_financial(payload)
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
    '20260826123514_hide_field_finance_timeline_activity.sql'
  )
$$;

revoke execute on function public.jr_os_deployed_migration()
from public, anon, authenticated, service_role;
grant execute on function public.jr_os_deployed_migration()
to service_role;

notify pgrst, 'reload schema';
