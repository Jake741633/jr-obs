-- Customer payment rows currently expose office reconciliation state, internal
-- notes and references. The portal only needs invoice allocation, amount,
-- method and payment type to calculate paid/outstanding balances. Keep complete
-- payment records in office scope and project only invoice-linked customer data.

create table if not exists public.customer_payments (
  id uuid primary key references public.payments(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  source_id text not null,
  customer_source_id text not null,
  version integer not null check (version > 0),
  source_updated_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  deleted_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  unique (organisation_id, source_id)
);

create index if not exists customer_payments_scope_idx
on public.customer_payments (organisation_id, customer_source_id, updated_at desc);

alter table public.customer_payments enable row level security;

revoke all privileges on table public.customer_payments
from public, anon, authenticated, service_role;
grant select on table public.customer_payments to authenticated;
grant select, insert, update, delete on table public.customer_payments to service_role;

create or replace function private.jr_customer_payment_payload(record_payload jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id', record_payload -> 'id',
    'customerId', record_payload -> 'customerId',
    'invoiceId', record_payload -> 'invoiceId',
    'paymentDate', record_payload -> 'paymentDate',
    'amount', record_payload -> 'amount',
    'method', record_payload -> 'method',
    'type', record_payload -> 'type',
    'createdAt', record_payload -> 'createdAt'
  ))
$$;

revoke execute on function private.jr_customer_payment_payload(jsonb)
from public, anon, authenticated, service_role;

create or replace function private.jr_payment_matches_customer_invoice(
  record_organisation_id uuid,
  record_customer_source_id text,
  record_payload jsonb
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    record_customer_source_id is not null
    and jsonb_typeof(record_payload -> 'invoiceId') = 'string'
    and exists (
      select 1
      from public.invoices invoice
      where invoice.organisation_id = record_organisation_id
        and invoice.source_id = record_payload ->> 'invoiceId'
        and invoice.customer_source_id = record_customer_source_id
        and invoice.deleted_at is null
    ),
    false
  )
$$;

revoke execute on function private.jr_payment_matches_customer_invoice(uuid,text,jsonb)
from public, anon, authenticated, service_role;

create or replace function private.refresh_jr_customer_payment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.customer_payments where id = old.id;
    return old;
  end if;

  if new.deleted_at is not null
    or not private.jr_payment_matches_customer_invoice(
      new.organisation_id,
      new.customer_source_id,
      new.payload
    ) then
    delete from public.customer_payments where id = new.id;
    return new;
  end if;

  insert into public.customer_payments (
    id,
    organisation_id,
    source_id,
    customer_source_id,
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
    new.version,
    new.source_updated_at,
    private.jr_customer_payment_payload(new.payload),
    new.deleted_at,
    new.created_at,
    new.updated_at
  )
  on conflict (id) do update set
    organisation_id = excluded.organisation_id,
    source_id = excluded.source_id,
    customer_source_id = excluded.customer_source_id,
    version = excluded.version,
    source_updated_at = excluded.source_updated_at,
    payload = excluded.payload,
    deleted_at = excluded.deleted_at,
    created_at = excluded.created_at,
    updated_at = excluded.updated_at;

  return new;
end;
$$;

revoke execute on function private.refresh_jr_customer_payment()
from public, anon, authenticated;
grant execute on function private.refresh_jr_customer_payment()
to service_role;

drop trigger if exists customer_payment_projection on public.payments;
create trigger customer_payment_projection
after insert or update or delete on public.payments
for each row execute function private.refresh_jr_customer_payment();

insert into public.customer_payments (
  id,
  organisation_id,
  source_id,
  customer_source_id,
  version,
  source_updated_at,
  payload,
  deleted_at,
  created_at,
  updated_at
)
select
  payment.id,
  payment.organisation_id,
  payment.source_id,
  payment.customer_source_id,
  payment.version,
  payment.source_updated_at,
  private.jr_customer_payment_payload(payment.payload),
  payment.deleted_at,
  payment.created_at,
  payment.updated_at
from public.payments payment
where payment.deleted_at is null
  and private.jr_payment_matches_customer_invoice(
    payment.organisation_id,
    payment.customer_source_id,
    payment.payload
  )
on conflict (id) do update set
  organisation_id = excluded.organisation_id,
  source_id = excluded.source_id,
  customer_source_id = excluded.customer_source_id,
  version = excluded.version,
  source_updated_at = excluded.source_updated_at,
  payload = excluded.payload,
  deleted_at = excluded.deleted_at,
  created_at = excluded.created_at,
  updated_at = excluded.updated_at;

drop policy if exists customer_payments_customer_select
on public.customer_payments;
create policy customer_payments_customer_select
on public.customer_payments
for select to authenticated
using (
  deleted_at is null
  and organisation_id = private.current_organisation_id()
  and private.current_jr_role() = 'customer'
  and customer_source_id = private.current_customer_source_id()
  and exists (
    select 1
    from public.customer_invoices invoice
    where invoice.organisation_id = customer_payments.organisation_id
      and invoice.customer_source_id = customer_payments.customer_source_id
      and invoice.source_id = customer_payments.payload ->> 'invoiceId'
      and invoice.deleted_at is null
  )
);

-- Complete payment rows contain reconciliation and internal office notes.
drop policy if exists payments_select on public.payments;
create policy payments_select
on public.payments
for select to authenticated
using (
  organisation_id = private.current_organisation_id()
  and private.can_manage_office_data()
);

notify pgrst, 'reload schema';
