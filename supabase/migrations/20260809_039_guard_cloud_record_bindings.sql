-- Customer-facing RLS trusts the relational envelope around each JSON payload.
-- Prove that the envelope and payload describe the same stable record and that
-- every customer/job reference belongs to the envelope organisation.

create or replace function private.jr_cloud_record_binding_is_valid(
  record_table text,
  record_organisation_id uuid,
  record_source_id text,
  record_customer_source_id text,
  record_job_source_id text,
  record_payload jsonb
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with payload_links as (
    select
      case
        when jsonb_typeof(record_payload -> 'customerId') = 'string'
          then record_payload ->> 'customerId'
        when jsonb_typeof(record_payload -> 'customerSourceId') = 'string'
          then record_payload ->> 'customerSourceId'
        else null
      end as customer_source_id,
      case
        when jsonb_typeof(record_payload -> 'jobId') = 'string'
          then record_payload ->> 'jobId'
        when jsonb_typeof(record_payload -> 'jobSourceId') = 'string'
          then record_payload ->> 'jobSourceId'
        else null
      end as job_source_id
  )
  select coalesce(
    jsonb_typeof(record_payload) = 'object'
    and jsonb_typeof(record_payload -> 'id') = 'string'
    and record_payload ->> 'id' = record_source_id
    and (
      (
        record_table = 'customers'
        and (record_customer_source_id is null or record_customer_source_id = record_source_id)
        and (payload_links.customer_source_id is null or payload_links.customer_source_id = record_source_id)
      )
      or (
        record_table <> 'customers'
        and record_customer_source_id is not distinct from payload_links.customer_source_id
      )
    )
    and (
      (
        record_table in ('customers', 'jobs')
        and record_job_source_id is null
        and payload_links.job_source_id is null
      )
      or (
        record_table not in ('customers', 'jobs')
        and record_job_source_id is not distinct from payload_links.job_source_id
      )
    )
    and (
      record_customer_source_id is null
      or (record_table = 'customers' and record_customer_source_id = record_source_id)
      or exists (
        select 1
        from public.customers customer
        where customer.organisation_id = record_organisation_id
          and customer.source_id = record_customer_source_id
      )
    )
    and (
      record_job_source_id is null
      or exists (
        select 1
        from public.jobs job
        where job.organisation_id = record_organisation_id
          and job.source_id = record_job_source_id
          and (
            record_customer_source_id is null
            or job.customer_source_id is not distinct from record_customer_source_id
          )
      )
    ),
    false
  )
  from payload_links
$$;

revoke execute on function private.jr_cloud_record_binding_is_valid(text, uuid, text, text, text, jsonb)
from public, anon, authenticated, service_role;

create or replace function private.guard_jr_cloud_record_binding()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.jr_cloud_record_binding_is_valid(
    tg_table_name,
    new.organisation_id,
    new.source_id,
    new.customer_source_id,
    new.job_source_id,
    new.payload
  ) then
    raise exception 'Cloud record payload and customer/job bindings are inconsistent'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke execute on function private.guard_jr_cloud_record_binding()
from public, anon, authenticated;
grant execute on function private.guard_jr_cloud_record_binding()
to service_role;

do $$
declare
  table_name text;
  invalid_source_id text;
begin
  foreach table_name in array array[
    'cloud_collections',
    'customers','builders','jobs','pricing_documents','invoices','payments','expenses',
    'materials','stock_items','stock_movements','purchase_lists','planner_entries',
    'team_members','timesheets','certificates','electrical_testing_records',
    'job_documents','portal_approvals','portal_requests','ai_recommendation_evidence'
  ] loop
    invalid_source_id := null;
    execute format(
      'select source_id from public.%I cloud_record
       where not private.jr_cloud_record_binding_is_valid(%L, cloud_record.organisation_id, cloud_record.source_id, cloud_record.customer_source_id, cloud_record.job_source_id, cloud_record.payload)
       limit 1',
      table_name,
      table_name
    ) into invalid_source_id;

    if invalid_source_id is not null then
      raise exception 'Cannot secure %.% because its payload or customer/job binding is invalid',
        table_name,
        invalid_source_id;
    end if;
  end loop;
end
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'cloud_collections',
    'customers','builders','jobs','pricing_documents','invoices','payments','expenses',
    'materials','stock_items','stock_movements','purchase_lists','planner_entries',
    'team_members','timesheets','certificates','electrical_testing_records',
    'job_documents','portal_approvals','portal_requests','ai_recommendation_evidence'
  ] loop
    execute format('drop trigger if exists cloud_record_binding_guard on public.%I', table_name);
    execute format(
      'create trigger cloud_record_binding_guard before insert or update on public.%I for each row execute function private.guard_jr_cloud_record_binding()',
      table_name
    );
  end loop;
end
$$;

notify pgrst, 'reload schema';
