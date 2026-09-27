-- Customer-scoped RLS controls which pricing rows a portal account can see,
-- but the JSON payload also contains staff-only cost, margin, internal-note and
-- revision data. Keep the complete record staff-only and maintain a separate,
-- allowlisted projection for customer portal reads.

create table if not exists public.customer_pricing_documents (
  id uuid primary key references public.pricing_documents(id) on delete cascade,
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

create index if not exists customer_pricing_documents_scope_idx
on public.customer_pricing_documents (organisation_id, customer_source_id, updated_at desc);

alter table public.customer_pricing_documents enable row level security;

revoke all privileges on table public.customer_pricing_documents
from public, anon, authenticated, service_role;
grant select on table public.customer_pricing_documents to authenticated;
grant select, insert, update, delete on table public.customer_pricing_documents to service_role;

create or replace function private.jr_customer_pricing_payload(record_payload jsonb)
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
    'title', record_payload -> 'title',
    'siteAddress', record_payload -> 'siteAddress',
    'validUntil', record_payload -> 'validUntil',
    'vatEnabled', record_payload -> 'vatEnabled',
    'vatRate', record_payload -> 'vatRate',
    'items', coalesce((
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
      ) with ordinality as pricing_item(item, item_ordinality)
    ), '[]'::jsonb),
    'notes', record_payload -> 'notes',
    'exclusions', record_payload -> 'exclusions',
    'terms', record_payload -> 'terms',
    'paymentTerms', record_payload -> 'paymentTerms',
    'createdAt', record_payload -> 'createdAt',
    'updatedAt', record_payload -> 'updatedAt'
  ))
$$;

revoke execute on function private.jr_customer_pricing_payload(jsonb)
from public, anon, authenticated, service_role;

create or replace function private.refresh_jr_customer_pricing_document()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.customer_pricing_documents where id = old.id;
    return old;
  end if;

  if new.customer_source_id is null then
    delete from public.customer_pricing_documents where id = new.id;
    return new;
  end if;

  insert into public.customer_pricing_documents (
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
    private.jr_customer_pricing_payload(new.payload),
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

revoke execute on function private.refresh_jr_customer_pricing_document()
from public, anon, authenticated;
grant execute on function private.refresh_jr_customer_pricing_document()
to service_role;

drop trigger if exists customer_pricing_document_projection on public.pricing_documents;
create trigger customer_pricing_document_projection
after insert or update or delete on public.pricing_documents
for each row execute function private.refresh_jr_customer_pricing_document();

insert into public.customer_pricing_documents (
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
  pricing.id,
  pricing.organisation_id,
  pricing.source_id,
  pricing.customer_source_id,
  pricing.job_source_id,
  pricing.version,
  pricing.source_updated_at,
  private.jr_customer_pricing_payload(pricing.payload),
  pricing.deleted_at,
  pricing.created_at,
  pricing.updated_at
from public.pricing_documents pricing
where pricing.customer_source_id is not null
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

drop policy if exists customer_pricing_documents_customer_select
on public.customer_pricing_documents;
create policy customer_pricing_documents_customer_select
on public.customer_pricing_documents
for select to authenticated
using (
  deleted_at is null
  and organisation_id = private.current_organisation_id()
  and private.current_jr_role() = 'customer'
  and customer_source_id = private.current_customer_source_id()
);

drop policy if exists pricing_documents_select on public.pricing_documents;
create policy pricing_documents_select on public.pricing_documents
for select to authenticated
using (
  organisation_id = private.current_organisation_id()
  and private.current_jr_role() in ('owner', 'admin', 'office', 'electrician')
);

notify pgrst, 'reload schema';
