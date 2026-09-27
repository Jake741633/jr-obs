-- Customer portal progress previously read complete jr-os-job-timeline payloads
-- from cloud_collections. Timeline notes, staff attribution and source metadata
-- are office/field history and may contain internal or financial detail. Keep
-- the source record private and expose only the progress fields the portal uses.

create table if not exists public.customer_job_timeline (
  id uuid primary key references public.cloud_collections(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  collection_key text not null check (collection_key = 'jr-os-job-timeline'),
  source_id text not null,
  customer_source_id text not null,
  job_source_id text not null,
  version integer not null check (version > 0),
  source_updated_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  deleted_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  unique (organisation_id, source_id)
);

create index if not exists customer_job_timeline_scope_idx
on public.customer_job_timeline (organisation_id, customer_source_id, updated_at desc);
create index if not exists customer_job_timeline_job_idx
on public.customer_job_timeline (organisation_id, job_source_id, updated_at desc);

alter table public.customer_job_timeline enable row level security;

revoke all privileges on table public.customer_job_timeline
from public, anon, authenticated, service_role;
grant select on table public.customer_job_timeline to authenticated;
grant select, insert, update, delete on table public.customer_job_timeline to service_role;

create or replace function private.jr_customer_timeline_payload(
  record_source_id text,
  record_job_source_id text,
  record_payload jsonb
)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
    'id', pg_catalog.to_jsonb(record_source_id),
    'jobId', pg_catalog.to_jsonb(record_job_source_id),
    'milestone', record_payload -> 'milestone',
    'fromStatus', record_payload -> 'fromStatus',
    'toStatus', record_payload -> 'toStatus',
    'note', pg_catalog.to_jsonb(''::text),
    'completedAt', record_payload -> 'completedAt',
    'createdAt', record_payload -> 'createdAt'
  ))
$$;

revoke execute on function private.jr_customer_timeline_payload(text, text, jsonb)
from public, anon, authenticated, service_role;

create or replace function private.refresh_jr_customer_job_timeline()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.customer_job_timeline where id = old.id;
    return old;
  end if;

  if new.collection_key <> 'jr-os-job-timeline'
    or new.deleted_at is not null
    or new.customer_source_id is null
    or new.job_source_id is null
    or not exists (
      select 1
      from public.jobs job
      where job.organisation_id = new.organisation_id
        and job.source_id = new.job_source_id
        and job.customer_source_id = new.customer_source_id
        and job.deleted_at is null
    ) then
    delete from public.customer_job_timeline where id = new.id;
    return new;
  end if;

  insert into public.customer_job_timeline (
    id,
    organisation_id,
    collection_key,
    source_id,
    customer_source_id,
    job_source_id,
    version,
    source_updated_at,
    payload,
    deleted_at,
    created_at,
    updated_at
  ) values (
    new.id,
    new.organisation_id,
    new.collection_key,
    new.source_id,
    new.customer_source_id,
    new.job_source_id,
    new.version,
    new.source_updated_at,
    private.jr_customer_timeline_payload(new.source_id, new.job_source_id, new.payload),
    new.deleted_at,
    new.created_at,
    new.updated_at
  )
  on conflict (id) do update set
    organisation_id = excluded.organisation_id,
    collection_key = excluded.collection_key,
    source_id = excluded.source_id,
    customer_source_id = excluded.customer_source_id,
    job_source_id = excluded.job_source_id,
    version = excluded.version,
    source_updated_at = excluded.source_updated_at,
    payload = excluded.payload,
    deleted_at = excluded.deleted_at,
    created_at = excluded.created_at,
    updated_at = excluded.updated_at;

  return new;
end;
$$;

revoke execute on function private.refresh_jr_customer_job_timeline()
from public, anon, authenticated;
grant execute on function private.refresh_jr_customer_job_timeline()
to service_role;

drop trigger if exists customer_job_timeline_projection on public.cloud_collections;
create trigger customer_job_timeline_projection
after insert or update or delete on public.cloud_collections
for each row execute function private.refresh_jr_customer_job_timeline();

insert into public.customer_job_timeline (
  id,
  organisation_id,
  collection_key,
  source_id,
  customer_source_id,
  job_source_id,
  version,
  source_updated_at,
  payload,
  deleted_at,
  created_at,
  updated_at
)
select
  timeline.id,
  timeline.organisation_id,
  timeline.collection_key,
  timeline.source_id,
  timeline.customer_source_id,
  timeline.job_source_id,
  timeline.version,
  timeline.source_updated_at,
  private.jr_customer_timeline_payload(timeline.source_id, timeline.job_source_id, timeline.payload),
  timeline.deleted_at,
  timeline.created_at,
  timeline.updated_at
from public.cloud_collections timeline
where timeline.collection_key = 'jr-os-job-timeline'
  and timeline.deleted_at is null
  and timeline.customer_source_id is not null
  and timeline.job_source_id is not null
  and exists (
    select 1
    from public.jobs job
    where job.organisation_id = timeline.organisation_id
      and job.source_id = timeline.job_source_id
      and job.customer_source_id = timeline.customer_source_id
      and job.deleted_at is null
  )
on conflict (id) do update set
  organisation_id = excluded.organisation_id,
  collection_key = excluded.collection_key,
  source_id = excluded.source_id,
  customer_source_id = excluded.customer_source_id,
  job_source_id = excluded.job_source_id,
  version = excluded.version,
  source_updated_at = excluded.source_updated_at,
  payload = excluded.payload,
  deleted_at = excluded.deleted_at,
  created_at = excluded.created_at,
  updated_at = excluded.updated_at;

drop policy if exists customer_job_timeline_customer_select
on public.customer_job_timeline;
create policy customer_job_timeline_customer_select
on public.customer_job_timeline
for select to authenticated
using (
  deleted_at is null
  and organisation_id = private.current_organisation_id()
  and private.current_jr_role() = 'customer'
  and customer_source_id = private.current_customer_source_id()
  and exists (
    select 1
    from public.customer_jobs job
    where job.organisation_id = customer_job_timeline.organisation_id
      and job.source_id = customer_job_timeline.job_source_id
      and job.customer_source_id = customer_job_timeline.customer_source_id
      and job.deleted_at is null
  )
);

-- Complete generic records stay available to office roles. Customer sessions
-- retain the existing portal activity, deposit and protected payment-link
-- surfaces, but no longer receive the complete job timeline source payload.
drop policy if exists "cloud collections tenant read"
on public.cloud_collections;
create policy "cloud collections tenant read"
on public.cloud_collections
for select to authenticated
using (
  private.is_organisation_member(organisation_id)
  and (
    private.can_manage_office_data()
    or (
      private.current_jr_role() = 'customer'
      and customer_source_id = private.current_customer_source_id()
      and (
        collection_key in (
          'jr-os-portal-activity',
          'jr-os-deposit-requirements'
        )
        or (
          collection_key = 'jr-os-portal-payment-links'
          and deleted_at is null
          and coalesce(jsonb_typeof(payload -> 'customerId'), '') = 'string'
          and payload ->> 'customerId' = customer_source_id
          and coalesce(jsonb_typeof(payload -> 'invoiceId'), '') = 'string'
          and coalesce(jsonb_typeof(payload -> 'providerConfigured'), '') = 'boolean'
          and payload -> 'providerConfigured' = 'true'::jsonb
          and coalesce(jsonb_typeof(payload -> 'paymentUrl'), '') = 'string'
          and btrim(payload ->> 'paymentUrl') ~* '^https://[^[:space:]]+$'
          and exists (
            select 1
            from public.customer_invoices invoice
            where invoice.organisation_id = cloud_collections.organisation_id
              and invoice.source_id = cloud_collections.payload ->> 'invoiceId'
              and invoice.customer_source_id is not distinct from cloud_collections.customer_source_id
              and invoice.job_source_id is not distinct from cloud_collections.job_source_id
              and (
                (
                  cloud_collections.job_source_id is null
                  and coalesce(jsonb_typeof(cloud_collections.payload -> 'jobId'), 'null') = 'null'
                )
                or (
                  cloud_collections.job_source_id is not null
                  and coalesce(jsonb_typeof(cloud_collections.payload -> 'jobId'), '') = 'string'
                  and cloud_collections.payload ->> 'jobId' = cloud_collections.job_source_id
                )
              )
              and invoice.deleted_at is null
              and private.jr_customer_invoice_has_outstanding_balance(
                cloud_collections.organisation_id,
                cloud_collections.customer_source_id,
                cloud_collections.payload ->> 'invoiceId'
              )
          )
        )
      )
    )
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
    '20260810_067_customer_timeline_projection.sql'
  )
$$;

revoke execute on function public.jr_os_deployed_migration()
from public, anon, authenticated, service_role;
grant execute on function public.jr_os_deployed_migration()
to service_role;

notify pgrst, 'reload schema';
