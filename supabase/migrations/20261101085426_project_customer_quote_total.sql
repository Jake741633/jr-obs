-- Publish only the customer selling total. Private costs, settings and margins
-- remain in the canonical office record. Applying this file requires the full
-- preceding recovery chain and never updates canonical quote rows or versions.
begin;

create or replace function private.jr_customer_quote_net_total(record_payload jsonb)
returns numeric
language plpgsql
immutable
set search_path = ''
set extra_float_digits = 3
as $$
declare
  candidate jsonb;
  line jsonb;
  setting_name text;
  line_total double precision := 0;
  result double precision;
  recorded numeric;
  extras jsonb := '{}'::jsonb;
  maximum_float constant numeric := 1.7976931348623157e308;
begin
  -- A present authoritative total must be valid. Do not reconstruct a different
  -- accepted price from an older breakdown when the snapshot is malformed.
  candidate := record_payload #> '{profitability,sellingPrice}';
  if candidate is not null then
    if pg_catalog.jsonb_typeof(candidate) <> 'number' then return null; end if;
    recorded := candidate::text::numeric;
    if recorded < 0 or recorded > maximum_float then return null; end if;
    return recorded;
  end if;
  if record_payload -> 'profitability' is not null
    and record_payload -> 'profitability' <> 'null'::jsonb
    and pg_catalog.jsonb_typeof(record_payload -> 'profitability') <> 'object' then
    return null;
  end if;

  if pg_catalog.jsonb_typeof(record_payload -> 'items') is distinct from 'array' then
    return null;
  end if;
  for line in select value from pg_catalog.jsonb_array_elements(record_payload -> 'items') loop
    if pg_catalog.jsonb_typeof(line -> 'quantity') is distinct from 'number'
      or pg_catalog.jsonb_typeof(line -> 'unitPrice') is distinct from 'number' then
      return null;
    end if;
    if (line ->> 'quantity')::numeric <= 0
      or (line ->> 'unitPrice')::numeric < 0 then
      return null;
    end if;
    result := (line ->> 'quantity')::double precision * (line ->> 'unitPrice')::double precision;
    line_total := line_total + result;
  end loop;

  if record_payload -> 'pricingSettings' is not null
    and record_payload -> 'pricingSettings' <> 'null'::jsonb
    and pg_catalog.jsonb_typeof(record_payload -> 'pricingSettings') <> 'object' then
    return null;
  end if;
  foreach setting_name in array array['contingencyPercent', 'travelPrice', 'parkingPrice'] loop
    candidate := record_payload -> 'pricingSettings' -> setting_name;
    if candidate is null or candidate = 'null'::jsonb then candidate := '0'::jsonb; end if;
    if pg_catalog.jsonb_typeof(candidate) <> 'number' then return null; end if;
    if candidate::text::numeric < 0 then return null; end if;
    extras := extras || pg_catalog.jsonb_build_object(setting_name, candidate);
  end loop;
  -- Match the quote engine's JavaScript doubles and operation order, including
  -- values immediately below a half penny. float8 arithmetic rejects range
  -- overflow/underflow, which the exception handler withholds from customers.
  result := line_total * ((extras ->> 'contingencyPercent')::double precision / 100::double precision);
  result := line_total + result;
  result := result + (extras ->> 'travelPrice')::double precision;
  result := result + (extras ->> 'parkingPrice')::double precision;
  if result < 0 then return null; end if;
  -- float8::numeric rounds to fewer digits. Serialize the round-trip double
  -- first, then retain that exact JSON numeric representation in the payload.
  return pg_catalog.to_jsonb(result)::text::numeric;
exception when numeric_value_out_of_range then
  return null;
end;
$$;

revoke execute on function private.jr_customer_quote_net_total(jsonb)
from public, anon, authenticated, service_role;

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
    'customerNetTotal', pg_catalog.to_jsonb(private.jr_customer_quote_net_total(record_payload)),
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

-- Update only already-visible projections, under the same canonical scope.
-- The existing version-binding trigger retains each projection's source version.
lock table public.pricing_documents, public.customer_pricing_documents
in share row exclusive mode;

update public.customer_pricing_documents projection
set payload = private.jr_customer_pricing_payload(pricing.payload)
from public.pricing_documents pricing
where pricing.id = projection.id
  and pricing.organisation_id = projection.organisation_id
  and pricing.version = projection.version
  and pricing.customer_source_id = projection.customer_source_id
  and pricing.job_source_id is not distinct from projection.job_source_id
  and pricing.customer_source_id is not null
  and pricing.deleted_at is null
  and projection.deleted_at is null
  and private.jr_customer_pricing_status_is_visible(pricing.payload);

create or replace function public.jr_os_deployed_migration()
returns jsonb
language sql
immutable
parallel safe
security invoker
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'migration', '20261101085426_project_customer_quote_total.sql'
  )
$$;

revoke execute on function public.jr_os_deployed_migration()
from public, anon, authenticated, service_role;
grant execute on function public.jr_os_deployed_migration()
to service_role;

notify pgrst, 'reload schema';
commit;
