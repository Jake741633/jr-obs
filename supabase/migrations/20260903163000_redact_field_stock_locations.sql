-- Stock-location records are operationally useful to field staff, but their
-- canonical payload also carries office-only vehicle links, notes and any
-- future fields. The field materials screen needs only the stable location ID
-- and display name, so project exactly those fields and repair existing rows.

-- Block canonical and projection writes for the duration of the projector
-- replacement and backfill so an in-flight old trigger cannot restore a
-- complete payload after this migration commits. Keep canonical-first order to
-- match the projection trigger's lock order.
lock table public.cloud_collections in share row exclusive mode;
lock table public.field_cloud_collections in share row exclusive mode;

create or replace function private.jr_field_cloud_collection_has_private_fields(
  collection_key_value text
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select collection_key_value = any (array[
    'jr-os-surveys',
    'jr-os-job-packs',
    'jr-os-job-variations',
    'jr-os-job-timeline',
    'jr-os-job-material-usage',
    'jr-os-stock-locations'
  ]::text[])
$$;

revoke execute on function private.jr_field_cloud_collection_has_private_fields(text)
from public, anon, authenticated, service_role;

create or replace function private.jr_field_cloud_payload(
  collection_key_value text,
  record_payload jsonb
)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case collection_key_value
    when 'jr-os-surveys' then
      pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
        'id', record_payload -> 'id',
        'number', record_payload -> 'number',
        'status', record_payload -> 'status',
        'customerId', record_payload -> 'customerId',
        'builderId', record_payload -> 'builderId',
        'jobId', record_payload -> 'jobId',
        'propertyType', record_payload -> 'propertyType',
        'occupancy', record_payload -> 'occupancy',
        'floors', record_payload -> 'floors',
        'bedrooms', record_payload -> 'bedrooms',
        'constructionType', record_payload -> 'constructionType',
        'loftAccess', record_payload -> 'loftAccess',
        'installationAge', record_payload -> 'installationAge',
        'earthingArrangement', record_payload -> 'earthingArrangement',
        'supplyType', record_payload -> 'supplyType',
        'fuseRating', record_payload -> 'fuseRating',
        'cutoutType', record_payload -> 'cutoutType',
        'meterPosition', record_payload -> 'meterPosition',
        'consumerUnitPosition', record_payload -> 'consumerUnitPosition',
        'mainBonding', record_payload -> 'mainBonding',
        'earthingConductorSize', record_payload -> 'earthingConductorSize',
        'consumerUnitManufacturer', record_payload -> 'consumerUnitManufacturer',
        'consumerUnitWays', record_payload -> 'consumerUnitWays',
        'spdFitted', record_payload -> 'spdFitted',
        'rcbosFitted', record_payload -> 'rcbosFitted',
        'rcdType', record_payload -> 'rcdType',
        'spareWays', record_payload -> 'spareWays',
        'consumerUnitCondition', record_payload -> 'consumerUnitCondition',
        'circuits', record_payload -> 'circuits',
        'photos', record_payload -> 'photos',
        'defects', record_payload -> 'defects',
        'risks', record_payload -> 'risks',
        'recommendations', record_payload -> 'recommendations',
        'voiceNotes', record_payload -> 'voiceNotes',
        'surveyNotes', record_payload -> 'surveyNotes',
        'labourHours', record_payload -> 'labourHours',
        'healthScore', record_payload -> 'healthScore',
        'createdAt', record_payload -> 'createdAt',
        'updatedAt', record_payload -> 'updatedAt'
      ))
    when 'jr-os-job-progress' then
      pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
        'id', record_payload -> 'id',
        'jobId', record_payload -> 'jobId',
        'manual', pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
          'overall', record_payload #> '{manual,overall}',
          'firstFix', record_payload #> '{manual,firstFix}',
          'secondFix', record_payload #> '{manual,secondFix}',
          'testing', record_payload #> '{manual,testing}',
          'certificates', record_payload #> '{manual,certificates}',
          'materials', record_payload #> '{manual,materials}'
        )),
        'updatedBy', record_payload -> 'updatedBy',
        'createdAt', record_payload -> 'createdAt',
        'updatedAt', record_payload -> 'updatedAt'
      ))
    when 'jr-os-job-packs' then
      pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
        'id', record_payload -> 'id',
        'name', record_payload -> 'name',
        'category', record_payload -> 'category',
        'description', record_payload -> 'description',
        'labourDescription', record_payload -> 'labourDescription',
        'labourHours', record_payload -> 'labourHours',
        'materials', coalesce((
          select pg_catalog.jsonb_agg(pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
            'id', material -> 'id',
            'materialId', material -> 'materialId',
            'description', material -> 'description',
            'quantity', material -> 'quantity'
          )) order by material_ordinality)
          from pg_catalog.jsonb_array_elements(
            case
              when pg_catalog.jsonb_typeof(record_payload -> 'materials') = 'array'
                then record_payload -> 'materials'
              else '[]'::jsonb
            end
          ) with ordinality as pack_material(material, material_ordinality)
        ), '[]'::jsonb),
        'testingRequirements', record_payload -> 'testingRequirements',
        'certificatesRequired', record_payload -> 'certificatesRequired',
        'notes', record_payload -> 'notes',
        'createdAt', record_payload -> 'createdAt',
        'updatedAt', record_payload -> 'updatedAt'
      ))
    when 'jr-os-job-variations' then
      pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
        'id', record_payload -> 'id',
        'jobId', record_payload -> 'jobId',
        'number', record_payload -> 'number',
        'title', record_payload -> 'title',
        'description', record_payload -> 'description',
        'pricingMode', record_payload -> 'pricingMode',
        'status', record_payload -> 'status',
        'approvalMethod', record_payload -> 'approvalMethod',
        'approvalReference', record_payload -> 'approvalReference',
        'requestedBy', record_payload -> 'requestedBy',
        'sentTo', record_payload -> 'sentTo',
        'sentAt', record_payload -> 'sentAt',
        'decidedAt', record_payload -> 'decidedAt',
        'decidedBy', record_payload -> 'decidedBy',
        'photos', record_payload -> 'photos',
        'photoDocumentIds', record_payload -> 'photoDocumentIds',
        'customerNotes', record_payload -> 'customerNotes',
        'createdAt', record_payload -> 'createdAt',
        'updatedAt', record_payload -> 'updatedAt'
      ))
    when 'jr-os-job-timeline' then
      pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
        'id', record_payload -> 'id',
        'jobId', record_payload -> 'jobId',
        'customerId', record_payload -> 'customerId',
        'milestone', record_payload -> 'milestone',
        'eventType', record_payload -> 'eventType',
        'sourceId', record_payload -> 'sourceId',
        'sourceType', record_payload -> 'sourceType',
        'fromStatus', record_payload -> 'fromStatus',
        'toStatus', record_payload -> 'toStatus',
        'note', case
          when pg_catalog.btrim(pg_catalog.lower(coalesce(record_payload ->> 'eventType', ''))) = 'variation'
            or pg_catalog.btrim(pg_catalog.lower(coalesce(record_payload ->> 'sourceType', ''))) = 'jobvariation'
            then pg_catalog.to_jsonb('Variation status updated.'::text)
          else record_payload -> 'note'
        end,
        'completedBy', record_payload -> 'completedBy',
        'completedAt', record_payload -> 'completedAt',
        'createdAt', record_payload -> 'createdAt'
      ))
    when 'jr-os-job-material-usage' then
      pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
        'id', record_payload -> 'id',
        'jobId', record_payload -> 'jobId',
        'materialId', record_payload -> 'materialId',
        'description', record_payload -> 'description',
        'quantity', record_payload -> 'quantity',
        'unit', record_payload -> 'unit',
        'supplier', record_payload -> 'supplier',
        'usedAt', record_payload -> 'usedAt',
        'recordedBy', record_payload -> 'recordedBy',
        'notes', record_payload -> 'notes',
        'createdAt', record_payload -> 'createdAt',
        'updatedAt', record_payload -> 'updatedAt'
      ))
    when 'jr-os-stock-locations' then
      pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
        'id', record_payload -> 'id',
        'name', record_payload -> 'name'
      ))
    else record_payload
  end
$$;

revoke execute on function private.jr_field_cloud_payload(text, jsonb)
from public, anon, authenticated, service_role;

-- The projection table may already contain complete stock-location payloads.
-- Rebuild just those rows from the untouched canonical source.
update public.field_cloud_collections projection
set payload = redacted.payload
from (
  select
    source.id,
    private.jr_field_cloud_payload(source.collection_key, source.payload) as payload
  from public.cloud_collections source
  where source.collection_key = 'jr-os-stock-locations'
) redacted
where projection.id = redacted.id
  and projection.payload is distinct from redacted.payload;

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
    '20260903163000_redact_field_stock_locations.sql'
  )
$$;

revoke execute on function public.jr_os_deployed_migration()
from public, anon, authenticated, service_role;
grant execute on function public.jr_os_deployed_migration()
to service_role;

notify pgrst, 'reload schema';
