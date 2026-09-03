-- Purchase-list projections contain supplier names and URLs, quantities,
-- order/receipt state and free-text notes. The original field inventory policy
-- exposed every list in an electrician's organisation. Bind each read to the
-- active canonical job assignment so unrelated procurement cannot enter the
-- field UI or its offline cache.

-- PurchaseList payloads carry jobId but no customerId. Office-authored and
-- migrated rows can therefore have a NULL customer envelope. Treat a non-NULL
-- customer as an exact constraint while always requiring one active field
-- identity and a live assigned job.
create or replace function private.jr_field_purchase_list_targets_assigned_job(
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

revoke execute on function private.jr_field_purchase_list_targets_assigned_job(uuid, text, text)
from public, anon, authenticated, service_role;
grant execute on function private.jr_field_purchase_list_targets_assigned_job(uuid, text, text)
to authenticated, service_role;

drop policy if exists field_purchase_lists_electrician_select
on public.field_purchase_lists;
create policy field_purchase_lists_electrician_select
on public.field_purchase_lists
for select to authenticated
using (
  deleted_at is null
  and organisation_id = private.current_organisation_id()
  and private.current_jr_role() = 'electrician'
  and private.jr_field_purchase_list_targets_assigned_job(
    organisation_id,
    customer_source_id,
    job_source_id
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
    '20260903141000_scope_field_purchase_list_reads_to_assignments.sql'
  )
$$;

revoke execute on function public.jr_os_deployed_migration()
from public, anon, authenticated, service_role;
grant execute on function public.jr_os_deployed_migration()
to service_role;

notify pgrst, 'reload schema';
