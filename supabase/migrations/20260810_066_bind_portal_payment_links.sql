-- Payment-link rows are customer-readable generic records, but their invoice
-- target previously existed only inside JSON. Bind every new or changed link
-- to one live customer-visible invoice before RLS can expose its payment URL.

create or replace function private.jr_customer_invoice_has_outstanding_balance(
  record_organisation_id uuid,
  record_customer_source_id text,
  record_invoice_source_id text
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  invoice_payload jsonb;
  invoice_gross numeric := 0;
  recorded_paid numeric := 0;
  allocated_paid numeric := 0;
begin
  -- This helper is used by customer RLS and therefore remains directly
  -- executable by authenticated sessions. Authorise the complete requested
  -- scope before touching the underlying office-only invoice/payment tables.
  if auth.uid() is not null
    and (
      not private.has_active_auth_session()
      or not exists (
        select 1
        from public.profiles profile
        where profile.id = auth.uid()
          and profile.organisation_id = record_organisation_id
          and profile.active
          and (
            profile.role in ('owner', 'admin', 'office')
            or (
              profile.role = 'customer'
              and profile.customer_source_id is not distinct from record_customer_source_id
            )
          )
      )
    ) then
    return false;
  end if;

  select invoice.payload
  into invoice_payload
  from public.invoices invoice
  where invoice.organisation_id = record_organisation_id
    and invoice.source_id = record_invoice_source_id
    and invoice.customer_source_id is not distinct from record_customer_source_id
    and invoice.customer_source_id is not null
    and invoice.deleted_at is null
    and invoice.payload ->> 'status' in ('Sent', 'Part paid', 'Overdue')
  limit 1;

  if not found then
    return false;
  end if;

  if coalesce(jsonb_typeof(invoice_payload -> 'items'), '') <> 'array'
    or coalesce(jsonb_typeof(invoice_payload -> 'vatEnabled'), '') <> 'boolean'
    or coalesce(jsonb_typeof(invoice_payload -> 'vatRate'), '') <> 'number'
    or (
      invoice_payload ? 'amountPaid'
      and coalesce(jsonb_typeof(invoice_payload -> 'amountPaid'), '') <> 'number'
    ) then
    return false;
  end if;

  if (invoice_payload ->> 'vatRate')::numeric < 0 then
    return false;
  end if;

  if exists (
    select 1
    from jsonb_array_elements(invoice_payload -> 'items') item
    where coalesce(jsonb_typeof(item -> 'quantity'), '') <> 'number'
      or coalesce(jsonb_typeof(item -> 'unitPrice'), '') <> 'number'
  ) then
    return false;
  end if;

  if exists (
    select 1
    from jsonb_array_elements(invoice_payload -> 'items') item
    where (item ->> 'quantity')::numeric <= 0
      or (item ->> 'unitPrice')::numeric < 0
  ) then
    return false;
  end if;

  select coalesce(sum(
    (item ->> 'quantity')::numeric * (item ->> 'unitPrice')::numeric
  ), 0)
  into invoice_gross
  from jsonb_array_elements(invoice_payload -> 'items') item;

  if invoice_payload -> 'vatEnabled' = 'true'::jsonb then
    invoice_gross := invoice_gross * (
      1 + ((invoice_payload ->> 'vatRate')::numeric / 100)
    );
  end if;

  if invoice_gross <= 0 then
    return false;
  end if;

  if jsonb_typeof(invoice_payload -> 'amountPaid') = 'number' then
    recorded_paid := greatest(0, (invoice_payload ->> 'amountPaid')::numeric);
  end if;

  if exists (
    select 1
    from public.payments payment
    where payment.organisation_id = record_organisation_id
      and payment.customer_source_id is not distinct from record_customer_source_id
      and payment.deleted_at is null
      and jsonb_typeof(payment.payload -> 'invoiceId') = 'string'
      and payment.payload ->> 'invoiceId' = record_invoice_source_id
      and coalesce(jsonb_typeof(payment.payload -> 'amount'), '') <> 'number'
  ) then
    return false;
  end if;

  select coalesce(sum(
    case
      when payment.payload ->> 'type' = 'Refund'
        then -abs((payment.payload ->> 'amount')::numeric)
      else abs((payment.payload ->> 'amount')::numeric)
    end
  ), 0)
  into allocated_paid
  from public.payments payment
  where payment.organisation_id = record_organisation_id
    and payment.customer_source_id is not distinct from record_customer_source_id
    and payment.deleted_at is null
    and jsonb_typeof(payment.payload -> 'invoiceId') = 'string'
    and payment.payload ->> 'invoiceId' = record_invoice_source_id
    and jsonb_typeof(payment.payload -> 'amount') = 'number';

  return invoice_gross > greatest(0, recorded_paid, allocated_paid);
end;
$$;

revoke execute on function private.jr_customer_invoice_has_outstanding_balance(uuid,text,text)
from public, anon;
grant execute on function private.jr_customer_invoice_has_outstanding_balance(uuid,text,text)
to authenticated, service_role;

create or replace function private.guard_jr_portal_payment_link_binding()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_invoice_id text;
  target_found boolean := false;
  target_customer_source_id text;
  target_job_source_id text;
  old_unbound boolean := false;
  new_unbound boolean := false;
begin
  if new.collection_key <> 'jr-os-portal-payment-links' then
    return new;
  end if;

  -- This privileged invoice lookup executes before the caller's INSERT/UPDATE
  -- policy. Reject stale, recovery-only and forged tenant/actor envelopes first
  -- so the trigger cannot become a cross-tenant invoice-existence oracle.
  if auth.uid() is not null
    and (
      not private.has_active_auth_session()
      or not exists (
        select 1
        from public.profiles profile
        where profile.id = auth.uid()
          and profile.organisation_id = new.organisation_id
          and profile.active
          and profile.role in ('owner', 'admin', 'office')
      )
      or (
        tg_op = 'INSERT'
        and (
          new.created_by is distinct from auth.uid()
          or new.updated_by is distinct from auth.uid()
        )
      )
    ) then
    raise exception 'Portal payment link write is not authorised for this account'
      using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' then
    old_unbound := old.customer_source_id is null
      and old.job_source_id is null
      and coalesce(jsonb_typeof(old.payload -> 'customerId'), 'null') = 'null'
      and coalesce(jsonb_typeof(old.payload -> 'jobId'), 'null') = 'null';

    if new.payload -> 'invoiceId' is distinct from old.payload -> 'invoiceId' then
      raise exception 'Portal payment link invoice binding is immutable'
        using errcode = '23514';
    end if;

    -- An invoice can be cancelled or deleted after its link was issued. Permit
    -- an unchanged tombstone without requiring that stale target to remain
    -- customer-visible, but do not let cleanup rewrite any relationship.
    if new.deleted_at is not null then
      if new.customer_source_id is distinct from old.customer_source_id
        or new.job_source_id is distinct from old.job_source_id
        or new.payload -> 'customerId' is distinct from old.payload -> 'customerId'
        or new.payload -> 'jobId' is distinct from old.payload -> 'jobId' then
        raise exception 'Portal payment link cleanup cannot rewrite its bindings'
          using errcode = '23514';
      end if;
      return new;
    end if;
  end if;

  target_invoice_id := new.payload ->> 'invoiceId';
  if coalesce(jsonb_typeof(new.payload -> 'invoiceId'), '') <> 'string'
    or nullif(btrim(target_invoice_id), '') is null then
    raise exception 'Portal payment link requires a valid invoice target'
      using errcode = '23514';
  end if;

  select
    true,
    invoice.customer_source_id,
    invoice.job_source_id
  into target_found, target_customer_source_id, target_job_source_id
  from public.invoices invoice
  where invoice.organisation_id = new.organisation_id
    and invoice.source_id = target_invoice_id
    and invoice.customer_source_id is not null
    and invoice.deleted_at is null
    and invoice.payload ->> 'status' in ('Sent', 'Part paid', 'Overdue')
  limit 1;

  if not coalesce(target_found, false) then
    raise exception 'Portal payment link invoice must be active and customer-visible'
      using errcode = '23503';
  end if;

  if not private.jr_customer_invoice_has_outstanding_balance(
    new.organisation_id,
    target_customer_source_id,
    target_invoice_id
  ) then
    raise exception 'Portal payment link invoice must have an outstanding balance'
      using errcode = '23503';
  end if;

  -- Older local/cloud records contain only invoiceId. Canonicalize precisely
  -- that wholly-unbound shape from the verified invoice before the shared
  -- envelope guard runs. Conflicting caller-supplied IDs are never rewritten.
  new_unbound := new.customer_source_id is null
    and new.job_source_id is null
    and coalesce(jsonb_typeof(new.payload -> 'customerId'), 'null') = 'null'
    and coalesce(jsonb_typeof(new.payload -> 'jobId'), 'null') = 'null';
  if new_unbound then
    new.customer_source_id := target_customer_source_id;
    new.job_source_id := target_job_source_id;
    new.payload := jsonb_set(new.payload, '{customerId}', to_jsonb(target_customer_source_id), true);
    if target_job_source_id is null then
      new.payload := new.payload - 'jobId';
    else
      new.payload := jsonb_set(new.payload, '{jobId}', to_jsonb(target_job_source_id), true);
    end if;
  end if;

  if tg_op = 'UPDATE'
    and not old_unbound
    and (
      new.customer_source_id is distinct from old.customer_source_id
      or new.job_source_id is distinct from old.job_source_id
      or new.payload -> 'customerId' is distinct from old.payload -> 'customerId'
      or new.payload -> 'jobId' is distinct from old.payload -> 'jobId'
    ) then
    raise exception 'Portal payment link customer and job bindings are immutable'
      using errcode = '23514';
  end if;

  if new.customer_source_id is distinct from target_customer_source_id
    or new.job_source_id is distinct from target_job_source_id
    or coalesce(jsonb_typeof(new.payload -> 'customerId'), '') <> 'string'
    or new.payload ->> 'customerId' is distinct from target_customer_source_id
    or not (
      (
        target_job_source_id is null
        and coalesce(jsonb_typeof(new.payload -> 'jobId'), 'null') = 'null'
      )
      or (
        target_job_source_id is not null
        and coalesce(jsonb_typeof(new.payload -> 'jobId'), '') = 'string'
        and new.payload ->> 'jobId' is not distinct from target_job_source_id
      )
    ) then
    raise exception 'Portal payment link must match its invoice customer and job'
      using errcode = '23503';
  end if;

  if coalesce(jsonb_typeof(new.payload -> 'providerConfigured'), '') <> 'boolean'
    or coalesce(jsonb_typeof(new.payload -> 'providerName'), '') <> 'string'
    or coalesce(jsonb_typeof(new.payload -> 'paymentUrl'), '') <> 'string'
    or (
      new.payload -> 'providerConfigured' = 'true'::jsonb
      and (
        nullif(btrim(new.payload ->> 'paymentUrl'), '') is null
        or btrim(new.payload ->> 'paymentUrl') !~* '^https://[^[:space:]]+$'
      )
    ) then
    raise exception 'Configured portal payment links require a valid HTTPS URL'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke execute on function private.guard_jr_portal_payment_link_binding()
from public, anon, authenticated;
grant execute on function private.guard_jr_portal_payment_link_binding()
to service_role;

-- Canonicalize only legacy links whose invoice is already customer-visible.
-- Preserve version/timestamp/actor history by disabling only the mechanical
-- touch trigger; every relationship still passes the shared binding guard.
do $$
declare
  invalid_source_id text;
  duplicate_invoice_id text;
begin
  lock table public.cloud_collections, public.customer_invoices
  in share row exclusive mode;

  alter table public.cloud_collections
  disable trigger cloud_collections_set_updated_at;

  update public.cloud_collections link
  set customer_source_id = invoice.customer_source_id,
      job_source_id = invoice.job_source_id,
      payload = case
        when invoice.job_source_id is null then
          jsonb_set(link.payload, '{customerId}', to_jsonb(invoice.customer_source_id), true) - 'jobId'
        else
          jsonb_set(
            jsonb_set(link.payload, '{customerId}', to_jsonb(invoice.customer_source_id), true),
            '{jobId}',
            to_jsonb(invoice.job_source_id),
            true
          )
      end
  from public.customer_invoices invoice
  where link.collection_key = 'jr-os-portal-payment-links'
    and link.deleted_at is null
    and link.customer_source_id is null
    and link.job_source_id is null
    and coalesce(jsonb_typeof(link.payload -> 'customerId'), 'null') = 'null'
    and coalesce(jsonb_typeof(link.payload -> 'jobId'), 'null') = 'null'
    and coalesce(jsonb_typeof(link.payload -> 'invoiceId'), '') = 'string'
    and invoice.organisation_id = link.organisation_id
    and invoice.source_id = link.payload ->> 'invoiceId'
    and invoice.deleted_at is null;

  alter table public.cloud_collections
  enable trigger cloud_collections_set_updated_at;

  select link.source_id
  into invalid_source_id
  from public.cloud_collections link
  where link.collection_key = 'jr-os-portal-payment-links'
    and link.deleted_at is null
    and link.customer_source_id is not null
    and (
      coalesce(jsonb_typeof(link.payload -> 'customerId'), '') <> 'string'
      or link.payload ->> 'customerId' is distinct from link.customer_source_id
      or coalesce(jsonb_typeof(link.payload -> 'invoiceId'), '') <> 'string'
      or not exists (
        select 1
        from public.customer_invoices invoice
        where invoice.organisation_id = link.organisation_id
          and invoice.source_id = link.payload ->> 'invoiceId'
          and invoice.customer_source_id is not distinct from link.customer_source_id
          and invoice.job_source_id is not distinct from link.job_source_id
          and (
            (
              link.job_source_id is null
              and coalesce(jsonb_typeof(link.payload -> 'jobId'), 'null') = 'null'
            )
            or (
              link.job_source_id is not null
              and coalesce(jsonb_typeof(link.payload -> 'jobId'), '') = 'string'
              and link.payload ->> 'jobId' is not distinct from link.job_source_id
            )
          )
          and invoice.deleted_at is null
      )
    )
  limit 1;

  if invalid_source_id is not null then
    raise exception 'Cannot secure portal payment link % because its invoice target is invalid',
      invalid_source_id;
  end if;

  select link.payload ->> 'invoiceId'
  into duplicate_invoice_id
  from public.cloud_collections link
  where link.collection_key = 'jr-os-portal-payment-links'
    and link.deleted_at is null
    and link.customer_source_id is not null
  group by link.organisation_id, link.payload ->> 'invoiceId'
  having count(*) > 1
  limit 1;

  if duplicate_invoice_id is not null then
    raise exception 'Cannot secure duplicate active portal payment links for invoice %',
      duplicate_invoice_id;
  end if;

  execute 'create unique index if not exists cloud_collections_active_payment_invoice_unique
    on public.cloud_collections (organisation_id, ((payload ->> ''invoiceId'')))
    where collection_key = ''jr-os-portal-payment-links''
      and deleted_at is null
      and customer_source_id is not null';

  -- Run before the shared cloud-record binding trigger so legacy imports are
  -- canonicalized before that trigger validates the generic envelope.
  execute 'drop trigger if exists a_portal_payment_link_binding_guard on public.cloud_collections';
  execute 'create trigger a_portal_payment_link_binding_guard
    before insert or update on public.cloud_collections
    for each row execute function private.guard_jr_portal_payment_link_binding()';
end;
$$;

-- Keep complete generic data available to office roles. Customer sessions may
-- see a configured payment link only while its exact invoice remains in the
-- customer-safe projection. This also fails closed for tombstones, malformed
-- URLs and crafted historical rows that predate the write trigger.
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
          'jr-os-job-timeline',
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

-- Keep the protected disposable-project verification exact. A live RLS run
-- must not accept the preceding schema marker when this boundary is absent.
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
    '20260810_066_bind_portal_payment_links.sql'
  )
$$;

revoke execute on function public.jr_os_deployed_migration()
from public, anon, authenticated, service_role;

grant execute on function public.jr_os_deployed_migration()
to service_role;

notify pgrst, 'reload schema';
