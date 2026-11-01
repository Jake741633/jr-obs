-- Accepted-quote conversion keeps a complete commercial record in jobs.notes:
-- quote line unit prices, internal quote notes, exclusions and terms. The
-- electrician job projection previously copied that mixed-purpose field in
-- full. Timeline variation notes also historically embedded the fixed price.
-- Keep both source records available to office roles while narrowing the field
-- projections and their write guards to explicitly operational data.

create or replace function private.jr_field_job_payload(record_payload jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
    'id', record_payload -> 'id',
    'title', record_payload -> 'title',
    'customerId', record_payload -> 'customerId',
    'builderId', record_payload -> 'builderId',
    'siteAddress', record_payload -> 'siteAddress',
    'status', record_payload -> 'status',
    'startDate', record_payload -> 'startDate',
    'targetCompletionDate', record_payload -> 'targetCompletionDate',
    'priority', record_payload -> 'priority',
    'assignedTo', record_payload -> 'assignedTo',
    'contacts', record_payload -> 'contacts',
    'requiredCertificateTypes', record_payload -> 'requiredCertificateTypes',
    'createdAt', record_payload -> 'createdAt',
    'updatedAt', record_payload -> 'updatedAt'
  ))
$$;

revoke execute on function private.jr_field_job_payload(jsonb)
from public, anon, authenticated, service_role;

-- Immediately remove already-projected job notes. The canonical jobs payload
-- remains untouched, including its accepted quote snapshot and office notes.
update public.field_jobs projection
set payload = redacted.payload
from (
  select source.id, private.jr_field_job_payload(source.payload) as payload
  from public.jobs source
) redacted
where projection.id = redacted.id
  and projection.payload is distinct from redacted.payload;

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
    'jr-os-job-material-usage'
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
    else record_payload
  end
$$;

revoke execute on function private.jr_field_cloud_payload(text, jsonb)
from public, anon, authenticated, service_role;

-- Preserve the complete office variation note and its classification if a
-- guarded field mutation invokes the source trigger. Without this branch a
-- crafted update could change the classification before the projection is
-- refreshed, causing the preserved financial note to be copied.
create or replace function private.jr_merge_field_cloud_payload(
  collection_key_value text,
  old_payload jsonb,
  new_payload jsonb
)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case
    when collection_key_value = 'jr-os-job-packs' then
      (
        old_payload || private.jr_field_cloud_payload(collection_key_value, new_payload)
      ) || pg_catalog.jsonb_build_object(
        'materials',
        coalesce((
          select pg_catalog.jsonb_agg(
            coalesce((
              select old_material
              from pg_catalog.jsonb_array_elements(
                case
                  when pg_catalog.jsonb_typeof(old_payload -> 'materials') = 'array'
                    then old_payload -> 'materials'
                  else '[]'::jsonb
                end
              ) as existing(old_material)
              where old_material ->> 'id' = new_material ->> 'id'
              limit 1
            ), '{}'::jsonb) || new_material
            order by new_material_ordinality
          )
          from pg_catalog.jsonb_array_elements(
            coalesce(
              private.jr_field_cloud_payload(collection_key_value, new_payload) -> 'materials',
              '[]'::jsonb
            )
          ) with ordinality as incoming(new_material, new_material_ordinality)
        ), '[]'::jsonb)
      )
    when collection_key_value = 'jr-os-job-timeline'
      and (
        pg_catalog.btrim(pg_catalog.lower(coalesce(old_payload ->> 'eventType', ''))) = 'variation'
        or pg_catalog.btrim(pg_catalog.lower(coalesce(old_payload ->> 'sourceType', ''))) = 'jobvariation'
        or pg_catalog.btrim(pg_catalog.lower(coalesce(new_payload ->> 'eventType', ''))) = 'variation'
        or pg_catalog.btrim(pg_catalog.lower(coalesce(new_payload ->> 'sourceType', ''))) = 'jobvariation'
      ) then
      old_payload || (
        private.jr_field_cloud_payload(collection_key_value, new_payload)
        - array['note', 'eventType', 'sourceType']::text[]
      )
    else old_payload || private.jr_field_cloud_payload(collection_key_value, new_payload)
  end
$$;

revoke execute on function private.jr_merge_field_cloud_payload(text, jsonb, jsonb)
from public, anon, authenticated, service_role;

-- Rebuild every already-materialised field timeline from its complete source.
-- Office rows retain their original note; only the electrician projection is
-- rewritten.
update public.field_cloud_collections projection
set payload = redacted.payload
from (
  select
    source.id,
    private.jr_field_cloud_payload(source.collection_key, source.payload) as payload
  from public.cloud_collections source
  where source.collection_key = 'jr-os-job-timeline'
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
    '20260813230319_protect_field_job_confidentiality.sql'
  )
$$;

revoke execute on function public.jr_os_deployed_migration()
from public, anon, authenticated, service_role;
grant execute on function public.jr_os_deployed_migration()
to service_role;

notify pgrst, 'reload schema';
