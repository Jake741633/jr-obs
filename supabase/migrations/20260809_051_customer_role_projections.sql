-- Customer records contain internal CRM notes that should not be returned to
-- field users or customer portal accounts. Keep the complete source row
-- office-only and expose allowlisted contact projections for restricted roles.

create table if not exists public.field_customers (
  id uuid primary key references public.customers(id) on delete cascade,
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

create table if not exists public.portal_customers (
  id uuid primary key references public.customers(id) on delete cascade,
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

create index if not exists field_customers_org_updated_idx
on public.field_customers (organisation_id, updated_at desc);
create index if not exists portal_customers_scope_idx
on public.portal_customers (organisation_id, customer_source_id, updated_at desc);

alter table public.field_customers enable row level security;
alter table public.portal_customers enable row level security;

revoke all privileges on table public.field_customers, public.portal_customers
from public, anon, authenticated, service_role;
grant select on table public.field_customers, public.portal_customers to authenticated;
grant select, insert, update, delete on table public.field_customers, public.portal_customers to service_role;

create or replace function private.jr_customer_contact_payload(record_payload jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id', record_payload -> 'id',
    'name', record_payload -> 'name',
    'email', record_payload -> 'email',
    'phone', record_payload -> 'phone',
    'address', record_payload -> 'address',
    'createdAt', record_payload -> 'createdAt',
    'updatedAt', record_payload -> 'updatedAt'
  ))
$$;

revoke execute on function private.jr_customer_contact_payload(jsonb)
from public, anon, authenticated, service_role;

create or replace function private.refresh_jr_customer_role_projections()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.field_customers where id = old.id;
    delete from public.portal_customers where id = old.id;
    return old;
  end if;

  insert into public.field_customers (
    id, organisation_id, source_id, customer_source_id, job_source_id, version,
    source_updated_at, payload, deleted_at, created_at, updated_at
  ) values (
    new.id, new.organisation_id, new.source_id, new.customer_source_id,
    new.job_source_id, new.version, new.source_updated_at,
    private.jr_customer_contact_payload(new.payload), new.deleted_at,
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
    delete from public.portal_customers where id = new.id;
  else
    insert into public.portal_customers (
      id, organisation_id, source_id, customer_source_id, job_source_id, version,
      source_updated_at, payload, deleted_at, created_at, updated_at
    ) values (
      new.id, new.organisation_id, new.source_id, new.customer_source_id,
      new.job_source_id, new.version, new.source_updated_at,
      private.jr_customer_contact_payload(new.payload), new.deleted_at,
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

revoke execute on function private.refresh_jr_customer_role_projections()
from public, anon, authenticated;
grant execute on function private.refresh_jr_customer_role_projections()
to service_role;

drop trigger if exists customer_role_projections on public.customers;
create trigger customer_role_projections
after insert or update or delete on public.customers
for each row execute function private.refresh_jr_customer_role_projections();

insert into public.field_customers (
  id, organisation_id, source_id, customer_source_id, job_source_id, version,
  source_updated_at, payload, deleted_at, created_at, updated_at
)
select
  customer.id, customer.organisation_id, customer.source_id,
  customer.customer_source_id, customer.job_source_id, customer.version,
  customer.source_updated_at, private.jr_customer_contact_payload(customer.payload),
  customer.deleted_at, customer.created_at, customer.updated_at
from public.customers customer
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

insert into public.portal_customers (
  id, organisation_id, source_id, customer_source_id, job_source_id, version,
  source_updated_at, payload, deleted_at, created_at, updated_at
)
select
  customer.id, customer.organisation_id, customer.source_id,
  customer.customer_source_id, customer.job_source_id, customer.version,
  customer.source_updated_at, private.jr_customer_contact_payload(customer.payload),
  customer.deleted_at, customer.created_at, customer.updated_at
from public.customers customer
where customer.customer_source_id is not null
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

drop policy if exists field_customers_electrician_select on public.field_customers;
create policy field_customers_electrician_select
on public.field_customers
for select to authenticated
using (
  deleted_at is null
  and organisation_id = private.current_organisation_id()
  and private.current_jr_role() = 'electrician'
);

drop policy if exists portal_customers_customer_select on public.portal_customers;
create policy portal_customers_customer_select
on public.portal_customers
for select to authenticated
using (
  deleted_at is null
  and organisation_id = private.current_organisation_id()
  and private.current_jr_role() = 'customer'
  and customer_source_id = private.current_customer_source_id()
);

drop policy if exists customers_select on public.customers;
create policy customers_select
on public.customers
for select to authenticated
using (
  organisation_id = private.current_organisation_id()
  and private.can_manage_office_data()
);

notify pgrst, 'reload schema';
