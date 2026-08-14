-- Customer portal finance records previously exposed their complete generic
-- JSON source rows. Keep those source rows office-only and maintain two narrow
-- customer projections whose scope is derived from canonical finance records.

create table if not exists public.customer_deposit_requirements (
  id uuid primary key references public.cloud_collections(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  collection_key text not null check (collection_key = 'jr-os-deposit-requirements'),
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

create table if not exists public.customer_portal_payment_links (
  id uuid primary key references public.cloud_collections(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  collection_key text not null check (collection_key = 'jr-os-portal-payment-links'),
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

create index if not exists customer_deposit_requirements_scope_idx
on public.customer_deposit_requirements (organisation_id, customer_source_id, updated_at desc);
create index if not exists customer_portal_payment_links_scope_idx
on public.customer_portal_payment_links (organisation_id, customer_source_id, updated_at desc);

alter table public.customer_deposit_requirements enable row level security;
alter table public.customer_portal_payment_links enable row level security;

revoke all privileges on table
  public.customer_deposit_requirements,
  public.customer_portal_payment_links
from public, anon, authenticated, service_role;
grant select on table
  public.customer_deposit_requirements,
  public.customer_portal_payment_links
to authenticated;
grant select, insert, update, delete on table
  public.customer_deposit_requirements,
  public.customer_portal_payment_links
to service_role;

create or replace function private.jr_customer_valid_iso_date(candidate text)
returns boolean
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  parsed date;
begin
  if candidate !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    return false;
  end if;

  begin
    parsed := candidate::date;
  exception when others then
    return false;
  end;

  return pg_catalog.to_char(parsed, 'YYYY-MM-DD') = candidate;
end;
$$;

revoke execute on function private.jr_customer_valid_iso_date(text)
from public, anon, authenticated, service_role;

create or replace function private.jr_customer_deposit_requirement_payload(
  record_source_id text,
  pricing_source_id text,
  record_payload jsonb
)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
    'id', pg_catalog.to_jsonb(record_source_id),
    'pricingDocumentId', pg_catalog.to_jsonb(pricing_source_id),
    'mode', record_payload -> 'mode',
    'value', record_payload -> 'value',
    'dueRule', record_payload -> 'dueRule',
    'dueDate', case
      when record_payload ->> 'dueRule' = 'Specified date'
        then pg_catalog.to_jsonb(record_payload ->> 'dueDate')
      else null
    end,
    'createdAt', case
      when pg_catalog.jsonb_typeof(record_payload -> 'createdAt') = 'string'
        then record_payload -> 'createdAt'
      else null
    end,
    'updatedAt', case
      when pg_catalog.jsonb_typeof(record_payload -> 'updatedAt') = 'string'
        then record_payload -> 'updatedAt'
      else null
    end
  ))
$$;

create or replace function private.jr_customer_portal_payment_link_payload(
  record_source_id text,
  record_customer_source_id text,
  record_job_source_id text,
  invoice_source_id text,
  record_payload jsonb
)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
    'id', pg_catalog.to_jsonb(record_source_id),
    'customerId', pg_catalog.to_jsonb(record_customer_source_id),
    'jobId', pg_catalog.to_jsonb(record_job_source_id),
    'invoiceId', pg_catalog.to_jsonb(invoice_source_id),
    'paymentUrl', record_payload -> 'paymentUrl',
    'providerConfigured', pg_catalog.to_jsonb(true),
    'updatedAt', case
      when pg_catalog.jsonb_typeof(record_payload -> 'updatedAt') = 'string'
        then record_payload -> 'updatedAt'
      else null
    end
  ))
$$;

revoke execute on function private.jr_customer_deposit_requirement_payload(text,text,jsonb)
from public, anon, authenticated, service_role;
revoke execute on function private.jr_customer_portal_payment_link_payload(text,text,text,text,jsonb)
from public, anon, authenticated, service_role;

create or replace function private.refresh_jr_customer_portal_finance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  pricing_customer_source_id text;
  pricing_job_source_id text;
  target_pricing_source_id text;
  target_invoice_source_id text;
begin
  if tg_op = 'DELETE' then
    delete from public.customer_deposit_requirements where id = old.id;
    delete from public.customer_portal_payment_links where id = old.id;
    return old;
  end if;

  if new.collection_key = 'jr-os-deposit-requirements' then
    delete from public.customer_portal_payment_links where id = new.id;
    target_pricing_source_id := new.payload ->> 'pricingDocumentId';
    pricing_customer_source_id := null;
    pricing_job_source_id := null;

    if new.deleted_at is null
      and pg_catalog.jsonb_typeof(new.payload -> 'pricingDocumentId') = 'string'
      and pg_catalog.jsonb_typeof(new.payload -> 'mode') = 'string'
      and new.payload ->> 'mode' in ('Fixed', 'Percentage')
      and case
        when pg_catalog.jsonb_typeof(new.payload -> 'value') = 'number' then
          (new.payload ->> 'value')::numeric > 0
          and (
            new.payload ->> 'mode' <> 'Percentage'
            or (new.payload ->> 'value')::numeric <= 100
          )
        else false
      end
      and pg_catalog.jsonb_typeof(new.payload -> 'dueRule') = 'string'
      and new.payload ->> 'dueRule' in ('On acceptance', 'Specified date')
      and (
        new.payload ->> 'dueRule' = 'On acceptance'
        or (
          pg_catalog.jsonb_typeof(new.payload -> 'dueDate') = 'string'
          and private.jr_customer_valid_iso_date(new.payload ->> 'dueDate')
        )
      ) then
      select pricing.customer_source_id, pricing.job_source_id
      into pricing_customer_source_id, pricing_job_source_id
      from public.pricing_documents pricing
      where pricing.organisation_id = new.organisation_id
        and pricing.source_id = target_pricing_source_id
        and pricing.customer_source_id is not null
        and pricing.deleted_at is null
        and pricing.payload ->> 'type' in ('Quote', 'Estimate')
      limit 1;
    end if;

    if pricing_customer_source_id is null then
      delete from public.customer_deposit_requirements where id = new.id;
      return new;
    end if;

    if not (
      (
        new.customer_source_id is null
        and new.job_source_id is null
      )
      or (
        new.customer_source_id is not distinct from pricing_customer_source_id
        and new.job_source_id is not distinct from pricing_job_source_id
      )
    ) then
      delete from public.customer_deposit_requirements where id = new.id;
      return new;
    end if;

    insert into public.customer_deposit_requirements (
      id, organisation_id, collection_key, source_id, customer_source_id,
      job_source_id, version, source_updated_at, payload, deleted_at,
      created_at, updated_at
    ) values (
      new.id, new.organisation_id, new.collection_key, new.source_id,
      pricing_customer_source_id, pricing_job_source_id, new.version,
      new.source_updated_at,
      private.jr_customer_deposit_requirement_payload(
        new.source_id, target_pricing_source_id, new.payload
      ),
      new.deleted_at, new.created_at, new.updated_at
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
  end if;

  delete from public.customer_deposit_requirements where id = new.id;

  if new.collection_key = 'jr-os-portal-payment-links' then
    target_invoice_source_id := new.payload ->> 'invoiceId';
    if new.deleted_at is not null
      or new.customer_source_id is null
      or coalesce(pg_catalog.jsonb_typeof(new.payload -> 'invoiceId'), '') <> 'string'
      or coalesce(pg_catalog.jsonb_typeof(new.payload -> 'providerConfigured'), '') <> 'boolean'
      or new.payload -> 'providerConfigured' <> 'true'::jsonb
      or coalesce(pg_catalog.jsonb_typeof(new.payload -> 'paymentUrl'), '') <> 'string'
      or pg_catalog.btrim(new.payload ->> 'paymentUrl') !~* '^https://[^[:space:]]+$'
      or not exists (
        select 1
        from public.customer_invoices invoice
        where invoice.organisation_id = new.organisation_id
          and invoice.source_id = target_invoice_source_id
          and invoice.customer_source_id is not distinct from new.customer_source_id
          and invoice.job_source_id is not distinct from new.job_source_id
          and invoice.deleted_at is null
      )
      then
      delete from public.customer_portal_payment_links where id = new.id;
      return new;
    end if;

    insert into public.customer_portal_payment_links (
      id, organisation_id, collection_key, source_id, customer_source_id,
      job_source_id, version, source_updated_at, payload, deleted_at,
      created_at, updated_at
    ) values (
      new.id, new.organisation_id, new.collection_key, new.source_id,
      new.customer_source_id, new.job_source_id, new.version,
      new.source_updated_at,
      private.jr_customer_portal_payment_link_payload(
        new.source_id, new.customer_source_id, new.job_source_id,
        target_invoice_source_id, new.payload
      ),
      new.deleted_at, new.created_at, new.updated_at
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
  end if;

  delete from public.customer_portal_payment_links where id = new.id;
  return new;
end;
$$;

revoke execute on function private.refresh_jr_customer_portal_finance()
from public, anon, authenticated;
grant execute on function private.refresh_jr_customer_portal_finance()
to service_role;

drop trigger if exists customer_portal_finance_projection on public.cloud_collections;
create trigger customer_portal_finance_projection
after insert or update or delete on public.cloud_collections
for each row execute function private.refresh_jr_customer_portal_finance();

lock table public.cloud_collections, public.pricing_documents, public.customer_invoices,
  public.customer_deposit_requirements, public.customer_portal_payment_links
in share row exclusive mode;

delete from public.customer_deposit_requirements;
delete from public.customer_portal_payment_links;

insert into public.customer_deposit_requirements (
  id, organisation_id, collection_key, source_id, customer_source_id,
  job_source_id, version, source_updated_at, payload, deleted_at,
  created_at, updated_at
)
select
  deposit.id, deposit.organisation_id, deposit.collection_key, deposit.source_id,
  pricing.customer_source_id, pricing.job_source_id, deposit.version,
  deposit.source_updated_at,
  private.jr_customer_deposit_requirement_payload(
    deposit.source_id, pricing.source_id, deposit.payload
  ),
  deposit.deleted_at, deposit.created_at, deposit.updated_at
from public.cloud_collections deposit
join public.pricing_documents pricing
  on pricing.organisation_id = deposit.organisation_id
 and pricing.source_id = deposit.payload ->> 'pricingDocumentId'
 and pricing.customer_source_id is not null
 and pricing.deleted_at is null
 and pricing.payload ->> 'type' in ('Quote', 'Estimate')
where deposit.collection_key = 'jr-os-deposit-requirements'
  and deposit.deleted_at is null
  and pg_catalog.jsonb_typeof(deposit.payload -> 'pricingDocumentId') = 'string'
  and pg_catalog.jsonb_typeof(deposit.payload -> 'mode') = 'string'
  and deposit.payload ->> 'mode' in ('Fixed', 'Percentage')
  and case
    when pg_catalog.jsonb_typeof(deposit.payload -> 'value') = 'number' then
      (deposit.payload ->> 'value')::numeric > 0
      and (
        deposit.payload ->> 'mode' <> 'Percentage'
        or (deposit.payload ->> 'value')::numeric <= 100
      )
    else false
  end
  and pg_catalog.jsonb_typeof(deposit.payload -> 'dueRule') = 'string'
  and deposit.payload ->> 'dueRule' in ('On acceptance', 'Specified date')
  and (
    deposit.payload ->> 'dueRule' = 'On acceptance'
    or (
      pg_catalog.jsonb_typeof(deposit.payload -> 'dueDate') = 'string'
      and private.jr_customer_valid_iso_date(deposit.payload ->> 'dueDate')
    )
  )
  and (
    (
      deposit.customer_source_id is null
      and deposit.job_source_id is null
    )
    or (
      deposit.customer_source_id is not distinct from pricing.customer_source_id
      and deposit.job_source_id is not distinct from pricing.job_source_id
    )
  );

insert into public.customer_portal_payment_links (
  id, organisation_id, collection_key, source_id, customer_source_id,
  job_source_id, version, source_updated_at, payload, deleted_at,
  created_at, updated_at
)
select
  link.id, link.organisation_id, link.collection_key, link.source_id,
  link.customer_source_id, link.job_source_id, link.version,
  link.source_updated_at,
  private.jr_customer_portal_payment_link_payload(
    link.source_id, link.customer_source_id, link.job_source_id,
    link.payload ->> 'invoiceId', link.payload
  ),
  link.deleted_at, link.created_at, link.updated_at
from public.cloud_collections link
where link.collection_key = 'jr-os-portal-payment-links'
  and link.deleted_at is null
  and link.customer_source_id is not null
  and pg_catalog.jsonb_typeof(link.payload -> 'invoiceId') = 'string'
  and pg_catalog.jsonb_typeof(link.payload -> 'providerConfigured') = 'boolean'
  and link.payload -> 'providerConfigured' = 'true'::jsonb
  and pg_catalog.jsonb_typeof(link.payload -> 'paymentUrl') = 'string'
  and pg_catalog.btrim(link.payload ->> 'paymentUrl') ~* '^https://[^[:space:]]+$'
  and exists (
    select 1
    from public.customer_invoices invoice
    where invoice.organisation_id = link.organisation_id
      and invoice.source_id = link.payload ->> 'invoiceId'
      and invoice.customer_source_id is not distinct from link.customer_source_id
      and invoice.job_source_id is not distinct from link.job_source_id
      and invoice.deleted_at is null
  );

do $$
declare
  duplicate_pricing_source_id text;
begin
  select projection.payload ->> 'pricingDocumentId'
  into duplicate_pricing_source_id
  from public.customer_deposit_requirements projection
  group by projection.organisation_id, projection.payload ->> 'pricingDocumentId'
  having count(*) > 1
  limit 1;

  if duplicate_pricing_source_id is not null then
    raise exception 'Cannot secure duplicate deposit requirements for pricing document %',
      duplicate_pricing_source_id;
  end if;
end
$$;

create unique index if not exists customer_deposit_requirements_document_unique
on public.customer_deposit_requirements (organisation_id, ((payload ->> 'pricingDocumentId')));

drop policy if exists customer_deposit_requirements_customer_select
on public.customer_deposit_requirements;
create policy customer_deposit_requirements_customer_select
on public.customer_deposit_requirements
for select to authenticated
using (
  deleted_at is null
  and organisation_id = private.current_organisation_id()
  and private.current_jr_role() = 'customer'
  and customer_source_id = private.current_customer_source_id()
  and exists (
    select 1
    from public.customer_pricing_documents pricing
    where pricing.organisation_id = customer_deposit_requirements.organisation_id
      and pricing.source_id = customer_deposit_requirements.payload ->> 'pricingDocumentId'
      and pricing.customer_source_id = customer_deposit_requirements.customer_source_id
      and pricing.job_source_id is not distinct from customer_deposit_requirements.job_source_id
      and pricing.deleted_at is null
      and pricing.payload ->> 'status' = 'Accepted'
  )
);

drop policy if exists customer_portal_payment_links_customer_select
on public.customer_portal_payment_links;
create policy customer_portal_payment_links_customer_select
on public.customer_portal_payment_links
for select to authenticated
using (
  deleted_at is null
  and organisation_id = private.current_organisation_id()
  and private.current_jr_role() = 'customer'
  and customer_source_id = private.current_customer_source_id()
  and exists (
    select 1
    from public.customer_invoices invoice
    where invoice.organisation_id = customer_portal_payment_links.organisation_id
      and invoice.source_id = customer_portal_payment_links.payload ->> 'invoiceId'
      and invoice.customer_source_id = customer_portal_payment_links.customer_source_id
      and invoice.job_source_id is not distinct from customer_portal_payment_links.job_source_id
      and invoice.deleted_at is null
  )
  and private.jr_customer_invoice_has_outstanding_balance(
    organisation_id, customer_source_id, payload ->> 'invoiceId'
  )
);

-- Customers now read only explicit projections. Portal activity is an office
-- audit surface and is intentionally not projected because the authenticated
-- customer portal does not render it.
drop policy if exists "cloud collections tenant read"
on public.cloud_collections;
create policy "cloud collections tenant read"
on public.cloud_collections
for select to authenticated
using (
  private.is_organisation_member(organisation_id)
  and private.can_manage_office_data()
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
    '20260814091500_project_customer_portal_finance.sql'
  )
$$;

revoke execute on function public.jr_os_deployed_migration()
from public, anon, authenticated, service_role;
grant execute on function public.jr_os_deployed_migration()
to service_role;

notify pgrst, 'reload schema';
