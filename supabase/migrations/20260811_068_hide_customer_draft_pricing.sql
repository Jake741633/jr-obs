-- Customer pricing projections must not expose unsent working drafts.
-- Keep the complete pricing table office-only and project only statuses that
-- represent a document already communicated to the customer.

create or replace function private.jr_customer_pricing_status_is_visible(record_payload jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    pg_catalog.jsonb_typeof(record_payload -> 'status') = 'string'
    and record_payload ->> 'status' in ('Sent', 'Accepted', 'Declined', 'Expired'),
    false
  )
$$;

revoke execute on function private.jr_customer_pricing_status_is_visible(jsonb)
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

  if new.customer_source_id is null
    or new.deleted_at is not null
    or not private.jr_customer_pricing_status_is_visible(new.payload) then
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

delete from public.customer_pricing_documents projection
where not exists (
  select 1
  from public.pricing_documents pricing
  where pricing.id = projection.id
    and pricing.customer_source_id is not null
    and pricing.deleted_at is null
    and private.jr_customer_pricing_status_is_visible(pricing.payload)
);

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
  and pricing.deleted_at is null
  and private.jr_customer_pricing_status_is_visible(pricing.payload)
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

alter table public.customer_pricing_documents
drop constraint if exists customer_pricing_documents_visible_status_check;
alter table public.customer_pricing_documents
add constraint customer_pricing_documents_visible_status_check
check (
  coalesce(
    pg_catalog.jsonb_typeof(payload -> 'status') = 'string'
    and payload ->> 'status' in ('Sent', 'Accepted', 'Declined', 'Expired'),
    false
  )
);

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
  and pg_catalog.jsonb_typeof(payload -> 'status') = 'string'
  and payload ->> 'status' in ('Sent', 'Accepted', 'Declined', 'Expired')
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
    '20260811_068_hide_customer_draft_pricing.sql'
  )
$$;

revoke execute on function public.jr_os_deployed_migration()
from public, anon, authenticated, service_role;
grant execute on function public.jr_os_deployed_migration()
to service_role;

notify pgrst, 'reload schema';
