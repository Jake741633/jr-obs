-- Customer invoices reuse PricingLineItem, which carries staff-only cost,
-- supplier, stock and labour-rate metadata. Customers also should not receive
-- Draft or Cancelled invoice rows simply because the customer ID matches.
-- Preserve complete invoice records for office roles and expose a narrow,
-- customer-safe projection for live customer portal sessions.

create table if not exists public.customer_invoices (
  id uuid primary key references public.invoices(id) on delete cascade,
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

create index if not exists customer_invoices_scope_idx
on public.customer_invoices (organisation_id, customer_source_id, updated_at desc);

alter table public.customer_invoices enable row level security;

revoke all privileges on table public.customer_invoices
from public, anon, authenticated, service_role;
grant select on table public.customer_invoices to authenticated;
grant select, insert, update, delete on table public.customer_invoices to service_role;

create or replace function private.jr_customer_invoice_items(record_payload jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce((
    select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'id', item -> 'id',
      'description', item -> 'description',
      'category', item -> 'category',
      'quantity', item -> 'quantity',
      'unitPrice', item -> 'unitPrice'
    )) order by item_ordinality)
    from jsonb_array_elements(
      case
        when jsonb_typeof(record_payload -> 'items') = 'array'
          then record_payload -> 'items'
        else '[]'::jsonb
      end
    ) with ordinality as invoice_item(item, item_ordinality)
  ), '[]'::jsonb)
$$;

revoke execute on function private.jr_customer_invoice_items(jsonb)
from public, anon, authenticated, service_role;

create or replace function private.jr_customer_invoice_payload(record_payload jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id', record_payload -> 'id',
    'number', record_payload -> 'number',
    'status', record_payload -> 'status',
    'customerId', record_payload -> 'customerId',
    'jobId', record_payload -> 'jobId',
    'title', record_payload -> 'title',
    'issueDate', record_payload -> 'issueDate',
    'dueDate', record_payload -> 'dueDate',
    'vatEnabled', record_payload -> 'vatEnabled',
    'vatRate', record_payload -> 'vatRate',
    'items', private.jr_customer_invoice_items(record_payload),
    'amountPaid', record_payload -> 'amountPaid',
    'notes', record_payload -> 'notes',
    'paymentDetails', record_payload -> 'paymentDetails',
    'paymentTermsText', record_payload -> 'paymentTermsText',
    'createdAt', record_payload -> 'createdAt',
    'updatedAt', record_payload -> 'updatedAt'
  ))
$$;

revoke execute on function private.jr_customer_invoice_payload(jsonb)
from public, anon, authenticated, service_role;

create or replace function private.refresh_jr_customer_invoice()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.customer_invoices where id = old.id;
    return old;
  end if;

  if new.deleted_at is not null
    or new.customer_source_id is null
    or coalesce(new.payload ->> 'status', '') not in ('Sent','Part paid','Paid','Overdue') then
    delete from public.customer_invoices where id = new.id;
    return new;
  end if;

  insert into public.customer_invoices (
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
    private.jr_customer_invoice_payload(new.payload),
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

revoke execute on function private.refresh_jr_customer_invoice()
from public, anon, authenticated;
grant execute on function private.refresh_jr_customer_invoice()
to service_role;

drop trigger if exists customer_invoice_projection on public.invoices;
create trigger customer_invoice_projection
after insert or update or delete on public.invoices
for each row execute function private.refresh_jr_customer_invoice();

insert into public.customer_invoices (
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
  invoice.id,
  invoice.organisation_id,
  invoice.source_id,
  invoice.customer_source_id,
  invoice.job_source_id,
  invoice.version,
  invoice.source_updated_at,
  private.jr_customer_invoice_payload(invoice.payload),
  invoice.deleted_at,
  invoice.created_at,
  invoice.updated_at
from public.invoices invoice
where invoice.deleted_at is null
  and invoice.customer_source_id is not null
  and coalesce(invoice.payload ->> 'status', '') in ('Sent','Part paid','Paid','Overdue')
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

drop policy if exists customer_invoices_customer_select
on public.customer_invoices;
create policy customer_invoices_customer_select
on public.customer_invoices
for select to authenticated
using (
  deleted_at is null
  and organisation_id = private.current_organisation_id()
  and private.current_jr_role() = 'customer'
  and customer_source_id = private.current_customer_source_id()
);

-- Complete invoices are office finance records. Customers use the safe
-- projection; electricians remain excluded as before.
drop policy if exists invoices_select on public.invoices;
create policy invoices_select
on public.invoices
for select to authenticated
using (
  organisation_id = private.current_organisation_id()
  and private.can_manage_office_data()
);

notify pgrst, 'reload schema';
