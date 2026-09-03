-- Assigned electricians need operational completion percentages, but payment
-- progress and office-authored suggestions are finance/planning data. Project
-- those fields out of reads and mutation receipts while retaining them in the
-- canonical office record. Legacy queued clients may still submit a payments
-- key; the dedicated RPC continues to ignore it and preserve the locked value.

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
    else record_payload
  end
$$;

revoke execute on function private.jr_field_cloud_payload(text, jsonb)
from public, anon, authenticated, service_role;

-- Existing projected rows were created before job progress had a field-specific
-- allowlist. Rebuild only that collection from the untouched canonical source.
update public.field_cloud_collections projection
set payload = redacted.payload
from (
  select
    source.id,
    private.jr_field_cloud_payload(source.collection_key, source.payload) as payload
  from public.cloud_collections source
  where source.collection_key = 'jr-os-job-progress'
) redacted
where projection.id = redacted.id
  and projection.payload is distinct from redacted.payload;

create or replace function public.jr_field_save_job_progress(
  collection_key_value text,
  record_source_id text,
  expected_version integer,
  record_payload jsonb,
  mutation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  field_identity record;
  canonical_job public.jobs%rowtype;
  canonical_record public.cloud_collections%rowtype;
  saved_record public.cloud_collections%rowtype;
  received_at timestamptz := pg_catalog.clock_timestamp();
  requested_job_source_id text;
  requested_manual jsonb;
  safe_manual jsonb;
  safe_payload jsonb;
  canonical_payment jsonb := '0'::jsonb;
  canonical_suggestions jsonb := '[]'::jsonb;
  mutation_result jsonb;
  metric_name text;
  metric_value numeric;
begin
  select * into field_identity from private.jr_active_field_identity();
  if field_identity.actor_user_id is null then
    raise exception 'An active electrician with exactly one active team identity is required'
      using errcode = '42501';
  end if;

  if not private.jr_lock_active_field_identity(
    field_identity.actor_user_id,
    field_identity.organisation_id,
    field_identity.team_member_source_id
  ) then
    raise exception 'The active electrician team identity changed'
      using errcode = '42501';
  end if;

  if collection_key_value is distinct from 'jr-os-job-progress' then
    raise exception 'This RPC accepts only job progress records'
      using errcode = '42501';
  end if;

  if expected_version is null or expected_version < 0 then
    raise exception 'An explicit non-negative expected version is required'
      using errcode = '22023';
  end if;

  if record_payload is null
    or pg_catalog.jsonb_typeof(record_payload) <> 'object'
    or pg_catalog.octet_length(record_payload::text) > 32768
    or record_source_id is null
    or pg_catalog.btrim(record_source_id) = ''
    or record_payload ->> 'id' is distinct from record_source_id then
    raise exception 'Field job progress payload identity is invalid'
      using errcode = '22023';
  end if;

  requested_job_source_id := case
    when pg_catalog.jsonb_typeof(record_payload -> 'jobId') = 'string'
      then record_payload ->> 'jobId'
    else null
  end;
  if requested_job_source_id is null
    or pg_catalog.btrim(requested_job_source_id) = '' then
    raise exception 'Field job progress must be bound to a job'
      using errcode = '22023';
  end if;

  requested_manual := record_payload -> 'manual';
  if pg_catalog.jsonb_typeof(requested_manual) is distinct from 'object'
    or requested_manual - array[
      'overall', 'firstFix', 'secondFix', 'testing',
      'certificates', 'materials', 'payments'
    ]::text[] is distinct from '{}'::jsonb then
    raise exception 'Field job progress contains unsupported manual metrics'
      using errcode = '22023';
  end if;

  foreach metric_name in array array[
    'overall', 'firstFix', 'secondFix', 'testing', 'certificates', 'materials'
  ]::text[] loop
    if pg_catalog.jsonb_typeof(requested_manual -> metric_name) is distinct from 'number' then
      raise exception 'Field job progress metric % must be numeric', metric_name
        using errcode = '22023';
    end if;
    metric_value := (requested_manual ->> metric_name)::numeric;
    if metric_value < 0 or metric_value > 100 then
      raise exception 'Field job progress metric % must be between 0 and 100', metric_name
        using errcode = '22023';
    end if;
  end loop;

  -- Preserve the actor-advisory-before-job-row lock order shared by every
  -- field mutation RPC. A replay is returned only after the current job and
  -- assignment have been validated below.
  mutation_result := private.jr_claim_field_mutation(
    field_identity.organisation_id,
    field_identity.actor_user_id,
    mutation_id,
    pg_catalog.jsonb_build_object(
      'rpc', 'jr_field_save_job_progress',
      'collectionKey', collection_key_value,
      'sourceId', record_source_id,
      'expectedVersion', expected_version,
      'payload', record_payload
    )
  );

  select * into canonical_job
  from public.jobs job
  where job.organisation_id = field_identity.organisation_id
    and job.source_id = requested_job_source_id
  for share;

  if canonical_job.id is null
    or canonical_job.deleted_at is not null
    or not private.jr_job_is_assigned_to_team_member(
      canonical_job.payload,
      field_identity.team_member_source_id
    ) then
    raise exception 'The field progress record is not bound to an assigned active job'
      using errcode = '42501';
  end if;

  -- Receipt replay remains bound to the caller's current active assignment.
  if mutation_result is not null then
    return mutation_result || pg_catalog.jsonb_build_object(
      'payload',
      private.jr_field_cloud_payload(
        'jr-os-job-progress',
        mutation_result -> 'payload'
      )
    );
  end if;

  -- Serialize create-by-job checks, including simultaneous creates with
  -- different client record ids, without blocking another job.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'jr-os-job-progress:'
        || field_identity.organisation_id::text
        || ':' || canonical_job.source_id,
      0
    )
  );

  select * into canonical_record
  from public.cloud_collections cloud_record
  where cloud_record.organisation_id = field_identity.organisation_id
    and cloud_record.collection_key = 'jr-os-job-progress'
    and cloud_record.source_id = record_source_id
  for update;

  if expected_version = 0 then
    if canonical_record.id is not null or exists (
      select 1
      from public.cloud_collections duplicate_record
      where duplicate_record.organisation_id = field_identity.organisation_id
        and duplicate_record.collection_key = 'jr-os-job-progress'
        and duplicate_record.job_source_id = canonical_job.source_id
        and duplicate_record.deleted_at is null
    ) then
      raise exception 'An active progress record already exists for this job'
        using errcode = 'PT409';
    end if;
  else
    if canonical_record.id is null
      or canonical_record.deleted_at is not null
      or canonical_record.version <> expected_version
      or canonical_record.job_source_id is distinct from canonical_job.source_id
      or (
        canonical_record.customer_source_id is not null
        and canonical_record.customer_source_id is distinct from canonical_job.customer_source_id
      )
      or canonical_record.payload ->> 'jobId' is distinct from canonical_job.source_id then
      raise exception 'The field progress version changed or the record is unavailable'
        using errcode = 'PT409';
    end if;

    canonical_payment := case
      when pg_catalog.jsonb_typeof(canonical_record.payload #> '{manual,payments}') = 'number'
        and (canonical_record.payload #>> '{manual,payments}')::numeric between 0 and 100
        then canonical_record.payload #> '{manual,payments}'
      else '0'::jsonb
    end;
    canonical_suggestions := case
      when pg_catalog.jsonb_typeof(canonical_record.payload -> 'suggestions') = 'array'
        then canonical_record.payload -> 'suggestions'
      else '[]'::jsonb
    end;
  end if;

  safe_manual := pg_catalog.jsonb_build_object(
    'overall', pg_catalog.round((requested_manual ->> 'overall')::numeric),
    'firstFix', pg_catalog.round((requested_manual ->> 'firstFix')::numeric),
    'secondFix', pg_catalog.round((requested_manual ->> 'secondFix')::numeric),
    'testing', pg_catalog.round((requested_manual ->> 'testing')::numeric),
    'certificates', pg_catalog.round((requested_manual ->> 'certificates')::numeric),
    'materials', pg_catalog.round((requested_manual ->> 'materials')::numeric),
    'payments', canonical_payment
  );
  safe_payload := pg_catalog.jsonb_build_object(
    'id', record_source_id,
    'jobId', canonical_job.source_id,
    'manual', safe_manual,
    'suggestions', canonical_suggestions,
    'updatedBy', field_identity.team_member_name,
    'createdAt', case
      when canonical_record.id is null then pg_catalog.to_jsonb(received_at)
      else pg_catalog.to_jsonb(canonical_record.created_at)
    end,
    'updatedAt', pg_catalog.to_jsonb(received_at)
  );

  if expected_version = 0 then
    begin
      insert into public.cloud_collections (
        organisation_id, collection_key, source_id, customer_source_id,
        job_source_id, version, source_updated_at, payload, deleted_at,
        created_by, updated_by, created_at, updated_at
      ) values (
        field_identity.organisation_id, 'jr-os-job-progress', record_source_id,
        canonical_job.customer_source_id, canonical_job.source_id, 1,
        received_at, safe_payload, null, field_identity.actor_user_id,
        field_identity.actor_user_id, received_at, received_at
      ) returning * into saved_record;
    exception
      when unique_violation then
        raise exception 'An active progress record already exists for this job'
          using errcode = 'PT409';
    end;
  else
    update public.cloud_collections
    set
      payload = safe_payload,
      source_updated_at = received_at
    where id = canonical_record.id
    returning * into saved_record;
  end if;

  mutation_result := pg_catalog.jsonb_build_object(
    'status', 'applied',
    'resource', 'cloud_collections',
    'sourceId', saved_record.source_id,
    'collectionKey', saved_record.collection_key,
    'version', saved_record.version,
    'sourceUpdatedAt', saved_record.source_updated_at,
    'payload', private.jr_field_cloud_payload(
      saved_record.collection_key,
      saved_record.payload
    )
  );
  perform private.jr_complete_field_mutation(
    field_identity.organisation_id,
    field_identity.actor_user_id,
    mutation_id,
    mutation_result
  );
  return mutation_result;
end;
$$;

revoke execute on function public.jr_field_save_job_progress(text, text, integer, jsonb, uuid)
from public, anon, authenticated, service_role;
grant execute on function public.jr_field_save_job_progress(text, text, integer, jsonb, uuid)
to authenticated;

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
    '20260826144606_redact_field_job_progress_finance.sql'
  )
$$;

revoke execute on function public.jr_os_deployed_migration()
from public, anon, authenticated, service_role;
grant execute on function public.jr_os_deployed_migration()
to service_role;

notify pgrst, 'reload schema';
