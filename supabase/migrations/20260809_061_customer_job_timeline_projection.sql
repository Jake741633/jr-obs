-- Job timeline rows are operational records and can contain internal notes,
-- actor names and source metadata. Customer portal progress needs only the
-- customer job milestone stream. Derive customer scope from the bound job and
-- expose a narrow, read-only projection instead of raw cloud_collections rows.

create table if not exists public.customer_job_timeline (
  id uuid primary key references public.cloud_collections(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  collection_key text not null default 'jr-os-job-timeline',
  source_id text not null,
  customer_source_id text not null,
  job_source_id text not null,
  version integer not null check (version > 0),
  source_updated_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  deleted_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  unique (organisation_id, collection_key, source_id)
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

create or replace function private.jr_customer_job_timeline_payload(record_payload jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id', record_payload -> 'id',
    'jobId', record_payload -> 'jobId',
    'milestone', record_payload -> 'milestone',
    'eventType', record_payload -> 'eventType',
    'note', to_jsonb(''::text),
    'completedAt', record_payload -> 'completedAt',
    'createdAt', record_payload -> 'createdAt'
  ))
$$;

revoke execute on function private.jr_customer_job_timeline_payload(jsonb)
from public, anon, authenticated, service_role;

create or replace function private.refresh_jr_customer_job_timeline()
returns trigger
language plpgsql
security definer
set search_path = ''
declare
  resolved_customer_source_id text;
begin
  if tg_op = 'DELETE' then
    delete from public.customer_job_timeline where id = old.id;
    return old;
  end if;

  if new.deleted_at is not null
    or new.collection_key <> 'jr-os-job-timeline'
    or new.job_source_id is null then
    delete from public.customer_job_timeline where id = new.id;
    return new;
  end if;

  select job.customer_source_id
  into resolved_customer_source_id
  from public.jobs job
  where job.organisation_id = new.organisation_id
    and job.source_id = new.job_source_id
    and job.deleted_at is null
  limit 1;

  if resolved_customer_source_id is null then
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
    resolved_customer_source_id,
    new.job_source_id,
    new.version,
    new.source_updated_at,
    private.jr_customer_job_timeline_payload(new.payload),
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

create or replace function private.refresh_jr_customer_job_timeline_for_job()
returns trigger
language plpgsql
security definer
set search_path = ''
declare
  target_organisation_id uuid;
  target_job_source_id text;
  target_customer_source_id text;
begin
  target_organisation_id := case when tg_op = 'DELETE' then old.organisation_id else new.organisation_id end;
  target_job_source_id := case when tg_op = 'DELETE' then old.source_id else new.source_id end;
  target_customer_source_id := case when tg_op = 'DELETE' then null else new.customer_source_id end;

  if tg_op = 'DELETE' or new.deleted_at is not null or target_customer_source_id is null then
    delete from public.customer_job_timeline
    where organisation_id = target_organisation_id
      and job_source_id = target_job_source_id;
    return case when tg_op = 'DELETE' then old else new end;
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
  )
  select
    timeline.id,
    timeline.organisation_id,
    timeline.collection_key,
    timeline.source_id,
    target_customer_source_id,
    timeline.job_source_id,
    timeline.version,
    timeline.source_updated_at,
    private.jr_customer_job_timeline_payload(timeline.payload),
    timeline.deleted_at,
    timeline.created_at,
    timeline.updated_at
  from public.cloud_collections timeline
  where timeline.organisation_id = target_organisation_id
    and timeline.collection_key = 'jr-os-job-timeline'
    and timeline.job_source_id = target_job_source_id
    and timeline.deleted_at is null
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

revoke execute on function private.refresh_jr_customer_job_timeline_for_job()
from public, anon, authenticated;
grant execute on function private.refresh_jr_customer_job_timeline_for_job()
to service_role;

drop trigger if exists customer_job_timeline_job_scope_projection on public.jobs;
create trigger customer_job_timeline_job_scope_projection
after insert or update or delete on public.jobs
for each row execute function private.refresh_jr_customer_job_timeline_for_job();

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
  job.customer_source_id,
  timeline.job_source_id,
  timeline.version,
  timeline.source_updated_at,
  private.jr_customer_job_timeline_payload(timeline.payload),
  timeline.deleted_at,
  timeline.created_at,
  timeline.updated_at
from public.cloud_collections timeline
join public.jobs job
  on job.organisation_id = timeline.organisation_id
 and job.source_id = timeline.job_source_id
 and job.deleted_at is null
where timeline.collection_key = 'jr-os-job-timeline'
  and timeline.deleted_at is null
  and timeline.job_source_id is not null
  and job.customer_source_id is not null
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
);

-- Raw timeline records remain office-only through cloud_collections. Customer
-- sessions use the job-derived projection above.
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
      and collection_key in (
        'jr-os-portal-payment-links',
        'jr-os-portal-activity',
        'jr-os-deposit-requirements'
      )
    )
  )
);

notify pgrst, 'reload schema';
