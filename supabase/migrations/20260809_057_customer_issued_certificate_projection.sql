-- Customer portal sessions should only receive certificates that have reached
-- the explicit Issued state. The UI already filters to Issued, but RLS on the
-- base certificates table previously allowed a customer to query Draft,
-- In progress, Complete and Superseded payloads directly.

create table if not exists public.customer_certificates (
  id uuid primary key references public.certificates(id) on delete cascade,
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

create index if not exists customer_certificates_scope_idx
on public.customer_certificates (organisation_id, customer_source_id, updated_at desc);

alter table public.customer_certificates enable row level security;

revoke all privileges on table public.customer_certificates
from public, anon, authenticated, service_role;
grant select on table public.customer_certificates to authenticated;
grant select, insert, update, delete on table public.customer_certificates to service_role;

-- Keep only certificate fields that belong on a customer-facing issued record.
-- structuredObservations contains internal drafting/AI-assistance metadata and
-- remains on the staff certificate record only.
create or replace function private.jr_customer_certificate_payload(record_payload jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id', record_payload -> 'id',
    'number', record_payload -> 'number',
    'type', record_payload -> 'type',
    'status', record_payload -> 'status',
    'customerId', record_payload -> 'customerId',
    'jobId', record_payload -> 'jobId',
    'installationAddress', record_payload -> 'installationAddress',
    'description', record_payload -> 'description',
    'inspectorName', record_payload -> 'inspectorName',
    'schemeProvider', record_payload -> 'schemeProvider',
    'registrationNumber', record_payload -> 'registrationNumber',
    'inspectionDate', record_payload -> 'inspectionDate',
    'nextInspectionDate', record_payload -> 'nextInspectionDate',
    'outcome', record_payload -> 'outcome',
    'observations', record_payload -> 'observations',
    'externalPdfUrl', record_payload -> 'externalPdfUrl',
    'createdAt', record_payload -> 'createdAt',
    'updatedAt', record_payload -> 'updatedAt'
  ))
$$;

revoke execute on function private.jr_customer_certificate_payload(jsonb)
from public, anon, authenticated, service_role;

create or replace function private.refresh_jr_customer_certificate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.customer_certificates where id = old.id;
    return old;
  end if;

  if new.deleted_at is not null
    or new.customer_source_id is null
    or coalesce(new.payload ->> 'status', '') <> 'Issued' then
    delete from public.customer_certificates where id = new.id;
    return new;
  end if;

  insert into public.customer_certificates (
    id,
    organisation_id,
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
    new.source_id,
    new.customer_source_id,
    new.job_source_id,
    new.version,
    new.source_updated_at,
    private.jr_customer_certificate_payload(new.payload),
    new.deleted_at,
    new.created_at,
    new.updated_at
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

  return new;
end;
$$;

revoke execute on function private.refresh_jr_customer_certificate()
from public, anon, authenticated;
grant execute on function private.refresh_jr_customer_certificate()
to service_role;

drop trigger if exists customer_certificate_projection on public.certificates;
create trigger customer_certificate_projection
after insert or update or delete on public.certificates
for each row execute function private.refresh_jr_customer_certificate();

insert into public.customer_certificates (
  id,
  organisation_id,
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
  certificate.id,
  certificate.organisation_id,
  certificate.source_id,
  certificate.customer_source_id,
  certificate.job_source_id,
  certificate.version,
  certificate.source_updated_at,
  private.jr_customer_certificate_payload(certificate.payload),
  certificate.deleted_at,
  certificate.created_at,
  certificate.updated_at
from public.certificates certificate
where certificate.deleted_at is null
  and certificate.customer_source_id is not null
  and coalesce(certificate.payload ->> 'status', '') = 'Issued'
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

drop policy if exists customer_certificates_customer_select
on public.customer_certificates;
create policy customer_certificates_customer_select
on public.customer_certificates
for select to authenticated
using (
  deleted_at is null
  and organisation_id = private.current_organisation_id()
  and private.current_jr_role() = 'customer'
  and customer_source_id = private.current_customer_source_id()
);

-- Complete certificate rows remain staff/field operational data. Customer
-- sessions must use the issued-only projection above.
drop policy if exists certificates_select on public.certificates;
create policy certificates_select
on public.certificates
for select to authenticated
using (
  organisation_id = private.current_organisation_id()
  and private.current_jr_role() in ('owner', 'admin', 'office', 'electrician')
);

notify pgrst, 'reload schema';
