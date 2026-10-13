-- Price-check timestamps and sources are pricing metadata too. Migration 049
-- removed monetary material fields, but field users should not read or mutate
-- office price-maintenance metadata either.

create or replace function private.jr_field_material_payload(record_payload jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id', record_payload -> 'id',
    'name', record_payload -> 'name',
    'category', record_payload -> 'category',
    'manufacturer', record_payload -> 'manufacturer',
    'supplier', record_payload -> 'supplier',
    'supplierUrl', record_payload -> 'supplierUrl',
    'stockCode', record_payload -> 'stockCode',
    'unit', record_payload -> 'unit',
    'favourite', record_payload -> 'favourite',
    'notes', record_payload -> 'notes',
    'createdAt', record_payload -> 'createdAt',
    'updatedAt', record_payload -> 'updatedAt'
  ))
$$;

revoke execute on function private.jr_field_material_payload(jsonb)
from public, anon, authenticated, service_role;

update public.field_materials projection
set
  payload = private.jr_field_material_payload(source.payload),
  source_updated_at = source.source_updated_at,
  version = source.version,
  deleted_at = source.deleted_at,
  updated_at = source.updated_at
from public.materials source
where projection.id = source.id;

notify pgrst, 'reload schema';
