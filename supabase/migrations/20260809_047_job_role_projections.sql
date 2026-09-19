-- Job payloads carry both field-operational data and private commercial data:
-- contract value, retention and the accepted quote snapshot (including costs and
-- profitability). RLS cannot redact JSON fields in-place, so expose dedicated
-- role projections while keeping the complete source row office-only.

create table if not exists public.field_jobs (
  id uuid primary key references public.jobs(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  source_id text not null,
  customer_source_id text,
  job_source_id text,
  version integer not null check (version > 0),
  source_updated_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  deleted_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  unique (organisation_id, source_id)
);

create table if not exists public.customer_jobs (
  id uuid primary key references public.jobs(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  source_id text not null,
  customer_source_id text not null,
  job_source_id text,
  version integer not null check (version > 0),
  source_updated_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  deleted_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  unique (organisation_id, source_id)
);

create index if not exists field_jobs_org_updated_idx
on public.field_jobs (organisation_id, updated_at desc);
create index if not exists customer_jobs_scope_idx
on public.customer_jobs (organisation_id, customer_source_id, updated_at desc);

alter table public.field_jobs enable row level security;
alter table public.customer_jobs enable row level security;

revoke all privileges on table public.field_jobs, public.customer_jobs
from public, anon, authenticated, service_role;
grant select on table public.field_jobs, public.customer_jobs to authenticated;
grant select, insert, update, delete on table public.field_jobs, public.customer_jobs to service_role;

create or replace function private.jr_field_job_payload(record_payload jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id', record_payload -> 'id',
    'title', record_payload -> 'title',
    'customerId', record_payload -> 'customerId',
    'builderId', record_payload -> 'builderId',
    'siteAddress', record_payload -> 'siteAddress',
    'status', record_payload -> 'status',
    'startDate', record_payload -> 'startDate',
    'targetCompletionDate', record_payload -> 'targetCompletionDate',
    'priority', record_payload -> 'priority',
    'assignedTo', record_payload -> 'assignedTo',
    'contacts', record_payload -> 'contacts',
    'requiredCertificateTypes', record_payload -> 'requiredCertificateTypes',
    'notes', record_payload -> 'notes',
    'createdAt', record_payload -> 'createdAt',
    'updatedAt', record_payload -> 'updatedAt'
  ))
$$;

create or replace function private.jr_customer_job_payload(record_payload jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id', record_payload -> 'id',
    'title', record_payload -> 'title',
    'customerId', record_payload -> 'customerId',
    'siteAddress', record_payload -> 'siteAddress',
    'status', record_payload -> 'status',
    'startDate', record_payload -> 'startDate',
    'targetCompletionDate', record_payload -> 'targetCompletionDate',
    'createdAt', record_payload -> 'createdAt',
    'updatedAt', record_payload -> 'updatedAt'
  ))
$$;

revoke execute on function
  private.jr_field_job_payload(jsonb),
  private.jr_customer_job_payload(jsonb)
from public, anon, authenticated, service_role;

create or replace function private.guard_jr_electrician_job_payload()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() = 'service_role' or private.current_jr_role() <> 'electrician' then
    return new;
  end if;

  if tg_op = 'UPDATE'
    and new.customer_source_id is distinct from old.customer_source_id then
    raise exception 'Electricians cannot rebind a job to another customer'
      using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    new.payload := private.jr_field_job_payload(new.payload);
  else
    -- Field clients read a redacted payload. Merge only those allowlisted field
    -- keys into the complete stored payload so hidden commercial keys survive
    -- an operational update and cannot be overwritten by crafted JSON.
    new.payload := old.payload || private.jr_field_job_payload(new.payload);
  end if;

  return new;
end;
$$;

revoke execute on function private.guard_jr_electrician_job_payload()
from public, anon, authenticated;
grant execute on function private.guard_jr_electrician_job_payload()
to service_role;

drop trigger if exists jobs_field_payload_guard on public.jobs;
create trigger jobs_field_payload_guard
before insert or update on public.jobs
for each row execute function private.guard_jr_electrician_job_payload();

create or replace function private.refresh_jr_job_projections()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.field_jobs where id = old.id;
    delete from public.customer_jobs where id = old.id;
    return old;
  end if;

  insert into public.field_jobs (
    id, organisation_id, source_id, customer_source_id, job_source_id, version,
    source_updated_at, payload, deleted_at, created_at, updated_at
  ) values (
    new.id, new.organisation_id, new.source_id, new.customer_source_id,
    new.job_source_id, new.version, new.source_updated_at,
    private.jr_field_job_payload(new.payload), new.deleted_at,
    new.created_at, new.updated_at
  )
  on conflict (id) do update set
    organisation_id = excluded.organisation_id,
    source_id = excluded.source_id,
    customer_source_id = excluded.customer_source_id,
    job_source_id = excluded.job_source_id,
    version = excluded.version,
    source_updated_at = excluded.source_updated_at,
    payload = excluded.payload,
    deleted_at = excluded.deleted_at,
    created_at = excluded.created_at,
    updated_at = excluded.updated_at;

  if new.customer_source_id is null then
    delete from public.customer_jobs where id = new.id;
  else
    insert into public.customer_jobs (
      id, organisation_id, source_id, customer_source_id, job_source_id, version,
      source_updated_at, payload, deleted_at, created_at, updated_at
    ) values (
      new.id, new.organisation_id, new.source_id, new.customer_source_id,
      new.job_source_id, new.version, new.source_updated_at,
      private.jr_customer_job_payload(new.payload), new.deleted_at,
      new.created_at, new.updated_at
    )
    on conflict (id) do update set
      organisation_id = excluded.organisation_id,
      source_id = excluded.source_id,
      customer_source_id = excluded.customer_source_id,
      job_source_id = excluded.job_source_id,
      version = excluded.version,
      source_updated_at = excluded.source_updated_at,
      payload = excluded.payload,
      deleted_at = excluded.deleted_at,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at;
  end if;

  return new;
end;
$$;

revoke execute on function private.refresh_jr_job_projections()
from public, anon, authenticated;
grant execute on function private.refresh_jr_job_projections()
to service_role;

drop trigger if exists job_role_projections on public.jobs;
create trigger job_role_projections
after insert or update or delete on public.jobs
for each row execute function private.refresh_jr_job_projections();

insert into public.field_jobs (
  id, organisation_id, source_id, customer_source_id, job_source_id, version,
  source_updated_at, payload, deleted_at, created_at, updated_at
)
select
  job.id, job.organisation_id, job.source_id, job.customer_source_id,
  job.job_source_id, job.version, job.source_updated_at,
  private.jr_field_job_payload(job.payload), job.deleted_at,
  job.created_at, job.updated_at
from public.jobs job
on conflict (id) do update set
  organisation_id = excluded.organisation_id,
  source_id = excluded.source_id,
  customer_source_id = excluded.customer_source_id,
  job_source_id = excluded.job_source_id,
  version = excluded.version,
  source_updated_at = excluded.source_updated_at,
  payload = excluded.payload,
  deleted_at = excluded.deleted_at,
  created_at = excluded.created_at,
  updated_at = excluded.updated_at;

insert into public.customer_jobs (
  id, organisation_id, source_id, customer_source_id, job_source_id, version,
  source_updated_at, payload, deleted_at, created_at, updated_at
)
select
  job.id, job.organisation_id, job.source_id, job.customer_source_id,
  job.job_source_id, job.version, job.source_updated_at,
  private.jr_customer_job_payload(job.payload), job.deleted_at,
  job.created_at, job.updated_at
from public.jobs job
where job.customer_source_id is not null
on conflict (id) do update set
  organisation_id = excluded.organisation_id,
  source_id = excluded.source_id,
  customer_source_id = excluded.customer_source_id,
  job_source_id = excluded.job_source_id,
  version = excluded.version,
  source_updated_at = excluded.source_updated_at,
  payload = excluded.payload,
  deleted_at = excluded.deleted_at,
  created_at = excluded.created_at,
  updated_at = excluded.updated_at;

drop policy if exists field_jobs_electrician_select on public.field_jobs;
create policy field_jobs_electrician_select
on public.field_jobs
for select to authenticated
using (
  deleted_at is null
  and organisation_id = private.current_organisation_id()
  and private.current_jr_role() = 'electrician'
);

drop policy if exists customer_jobs_customer_select on public.customer_jobs;
create policy customer_jobs_customer_select
on public.customer_jobs
for select to authenticated
using (
  deleted_at is null
  and organisation_id = private.current_organisation_id()
  and private.current_jr_role() = 'customer'
  and customer_source_id = private.current_customer_source_id()
);

drop policy if exists jobs_select on public.jobs;
create policy jobs_select
on public.jobs
for select to authenticated
using (
  organisation_id = private.current_organisation_id()
  and private.can_manage_office_data()
);

notify pgrst, 'reload schema';
