-- Completed field mutation receipts are idempotency evidence, not a lasting
-- authorization grant. Revalidate the current canonical job and assignment
-- before replaying either a status or generic collection result.

create or replace function public.jr_field_update_job_status(
  record_source_id text,
  expected_version integer,
  requested_status text,
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
  updated_job public.jobs%rowtype;
  received_at timestamptz := pg_catalog.clock_timestamp();
  current_status text;
  transition_source_status text;
  normalized_status text := case pg_catalog.btrim(coalesce(requested_status, ''))
    when 'In progress' then 'First fix'
    else pg_catalog.btrim(coalesce(requested_status, ''))
  end;
  timeline_source_id text;
  timeline_payload jsonb;
  mutation_result jsonb;
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

  if expected_version is null or expected_version <= 0 then
    raise exception 'Field job status mutation is update-only'
      using errcode = 'PT409';
  end if;

  mutation_result := private.jr_claim_field_mutation(
    field_identity.organisation_id,
    field_identity.actor_user_id,
    mutation_id,
    pg_catalog.jsonb_build_object(
      'rpc', 'jr_field_update_job_status',
      'sourceId', record_source_id,
      'expectedVersion', expected_version,
      'requestedStatus', normalized_status
    )
  );
  select * into canonical_job
  from public.jobs job
  where job.organisation_id = field_identity.organisation_id
    and job.source_id = record_source_id
  for update;

  if canonical_job.id is null
    or canonical_job.deleted_at is not null
    or (
      mutation_result is null
      and canonical_job.version <> expected_version
    ) then
    raise exception 'The job version changed or the job is unavailable'
      using errcode = 'PT409';
  end if;

  if not private.jr_job_is_assigned_to_team_member(
    canonical_job.payload,
    field_identity.team_member_source_id
  ) then
    raise exception 'The authenticated electrician is not assigned to this job'
      using errcode = '42501';
  end if;

  -- A response-loss retry may return an old receipt only while the same
  -- electrician is still assigned to the live canonical job. Preserve the
  -- receipt-before-job lock order used by the original mutation contract.
  if mutation_result is not null then
    return mutation_result;
  end if;

  current_status := pg_catalog.btrim(coalesce(canonical_job.payload ->> 'status', ''));
  transition_source_status := case
    when current_status = 'In progress' then 'First fix'
    else current_status
  end;
  if not (
    (transition_source_status = 'Scheduled' and normalized_status = 'First fix')
    or (transition_source_status = 'First fix' and normalized_status in ('Awaiting builder', 'Second fix'))
    or (transition_source_status = 'Awaiting builder' and normalized_status in ('First fix', 'Second fix'))
    or (transition_source_status = 'Second fix' and normalized_status = 'Testing')
    or (transition_source_status = 'Testing' and normalized_status in ('Snagging', 'Complete'))
    or (transition_source_status = 'Snagging' and normalized_status in ('Testing', 'Complete'))
  ) then
    raise exception 'The requested field job status transition is not permitted'
      using errcode = '22023';
  end if;

  if current_status = normalized_status then
    raise exception 'The job is already in the requested status'
      using errcode = 'PT409';
  end if;

  update public.jobs
  set
    payload = canonical_job.payload || pg_catalog.jsonb_build_object(
      'status', normalized_status,
      'updatedAt', received_at
    ),
    source_updated_at = received_at
  where id = canonical_job.id
  returning * into updated_job;

  timeline_source_id := 'field-status-'
    || field_identity.actor_user_id::text || '-' || mutation_id::text;
  timeline_payload := pg_catalog.jsonb_build_object(
    'id', timeline_source_id,
    'jobId', updated_job.source_id,
    'customerId', updated_job.customer_source_id,
    'milestone', 'Custom update',
    'eventType', 'Status change',
    'fromStatus', current_status,
    'toStatus', normalized_status,
    'note', 'Job status updated from ' || current_status || ' to ' || normalized_status || '.',
    'completedBy', field_identity.team_member_name,
    'completedAt', received_at,
    'createdAt', received_at
  );

  insert into public.cloud_collections (
    organisation_id, collection_key, source_id, customer_source_id,
    job_source_id, version, source_updated_at, payload, deleted_at,
    created_by, updated_by, created_at, updated_at
  ) values (
    field_identity.organisation_id, 'jr-os-job-timeline', timeline_source_id,
    updated_job.customer_source_id, updated_job.source_id, 1, received_at,
    timeline_payload, null, field_identity.actor_user_id,
    field_identity.actor_user_id, received_at, received_at
  );

  mutation_result := pg_catalog.jsonb_build_object(
    'status', 'applied',
    'resource', 'jobs',
    'sourceId', updated_job.source_id,
    'version', updated_job.version,
    'sourceUpdatedAt', updated_job.source_updated_at,
    'payload', private.jr_field_job_payload(updated_job.payload)
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

revoke execute on function public.jr_field_update_job_status(text, integer, text, uuid)
from public, anon, authenticated, service_role;
grant execute on function public.jr_field_update_job_status(text, integer, text, uuid)
to authenticated;

create or replace function public.jr_field_save_collection(
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
  safe_payload jsonb;
  requested_job_source_id text;
  requested_customer_source_id text;
  requested_task_status text;
  canonical_task_status text;
  mutation_result jsonb;
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

  -- Reject oversized untrusted JSON before it is copied into the idempotency
  -- receipt or any collection-specific projection work begins.
  if record_payload is not null
    and pg_catalog.octet_length(record_payload::text) > 131072 then
    raise exception 'The field collection payload is too large'
      using errcode = '22023';
  end if;

  if collection_key_value is null or collection_key_value not in (
      'jr-os-surveys',
      'jr-os-site-diaries',
      'jr-os-job-tasks',
      'jr-os-job-timeline'
    ) then
    raise exception 'This collection is read-only for field sessions'
      using errcode = '42501';
  end if;

  if expected_version is null or expected_version < 0 then
    raise exception 'An explicit non-negative expected version is required'
      using errcode = '22023';
  end if;

  mutation_result := private.jr_claim_field_mutation(
    field_identity.organisation_id,
    field_identity.actor_user_id,
    mutation_id,
    pg_catalog.jsonb_build_object(
      'rpc', 'jr_field_save_collection',
      'collectionKey', collection_key_value,
      'sourceId', record_source_id,
      'expectedVersion', expected_version,
      'payload', record_payload
    )
  );
  if pg_catalog.jsonb_typeof(record_payload) <> 'object'
    or record_source_id is null
    or pg_catalog.btrim(record_source_id) = ''
    or record_payload ->> 'id' is distinct from record_source_id then
    raise exception 'Field payload identity is invalid'
      using errcode = '22023';
  end if;

  requested_job_source_id := case
    when pg_catalog.jsonb_typeof(record_payload -> 'jobId') = 'string'
      then record_payload ->> 'jobId'
    else null
  end;
  if requested_job_source_id is null or pg_catalog.btrim(requested_job_source_id) = '' then
    raise exception 'Field collection records must be bound to a job'
      using errcode = '22023';
  end if;

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
    raise exception 'The field record is not bound to an assigned active job'
      using errcode = '42501';
  end if;

  -- Revalidate the exact job encoded in the persisted request before returning
  -- a completed receipt, so assignment revocation also invalidates offline
  -- response-loss retries and their optimistic cache reconciliation.
  if mutation_result is not null then
    return mutation_result;
  end if;

  requested_customer_source_id := canonical_job.customer_source_id;

  if collection_key_value = 'jr-os-surveys'
    and coalesce(record_payload ->> 'status', '') not in ('Draft', 'In progress', 'Complete') then
    raise exception 'The requested survey status is not permitted'
      using errcode = '22023';
  end if;

  if collection_key_value = 'jr-os-job-tasks' then
    if coalesce(record_payload ->> 'type', '') not in ('Task', 'Snag')
      or coalesce(record_payload ->> 'category', '') not in (
        'General', 'Survey', 'First fix', 'Second fix', 'Testing',
        'Certificate', 'Materials', 'Handover', 'Safety', 'Other'
      )
      or coalesce(record_payload ->> 'priority', '') not in ('Low', 'Normal', 'High', 'Urgent') then
      raise exception 'The requested task type, category or priority is not permitted'
        using errcode = '22023';
    end if;
    if expected_version = 0 and record_payload ->> 'status' is distinct from 'Open' then
      raise exception 'Field-created tasks must start open'
        using errcode = '22023';
    end if;
  end if;

  if collection_key_value = 'jr-os-job-timeline'
    and pg_catalog.btrim(coalesce(record_payload ->> 'note', '')) = '' then
    raise exception 'A field timeline note is required'
      using errcode = '22023';
  end if;

  safe_payload := private.jr_field_collection_write_payload(
    collection_key_value,
    record_payload || pg_catalog.jsonb_build_object(
      'id', record_source_id,
      'jobId', canonical_job.source_id,
      'customerId', canonical_job.customer_source_id,
      'builderId', canonical_job.payload -> 'builderId'
    ),
    field_identity.team_member_source_id,
    field_identity.team_member_name,
    received_at
  );

  select * into canonical_record
  from public.cloud_collections cloud_record
  where cloud_record.organisation_id = field_identity.organisation_id
    and cloud_record.collection_key = collection_key_value
    and cloud_record.source_id = record_source_id
  for update;

  if expected_version = 0 then
    if canonical_record.id is not null then
      raise exception 'The field record already exists'
        using errcode = 'PT409';
    end if;

    begin
      insert into public.cloud_collections (
        organisation_id, collection_key, source_id, customer_source_id,
        job_source_id, version, source_updated_at, payload, deleted_at,
        created_by, updated_by, created_at, updated_at
      ) values (
        field_identity.organisation_id, collection_key_value, record_source_id,
        requested_customer_source_id, canonical_job.source_id, 1, received_at,
        safe_payload, null, field_identity.actor_user_id,
        field_identity.actor_user_id, received_at, received_at
      ) returning * into saved_record;
    exception
      when unique_violation then
        -- An absent row cannot be protected by FOR UPDATE. Translate the
        -- loser of two simultaneous create intents into the same conflict
        -- contract as an already-visible create collision.
        raise exception 'The field record already exists'
          using errcode = 'PT409';
    end;
  else
    if collection_key_value in ('jr-os-site-diaries', 'jr-os-job-timeline') then
      raise exception 'This field collection is insert-only'
        using errcode = '42501';
    end if;
    if canonical_record.id is null
      or canonical_record.deleted_at is not null
      or canonical_record.version <> expected_version
      or canonical_record.job_source_id is distinct from canonical_job.source_id
      or (
        collection_key_value <> 'jr-os-job-tasks'
        and canonical_record.customer_source_id is distinct from requested_customer_source_id
      )
      or (
        collection_key_value = 'jr-os-job-tasks'
        and canonical_record.customer_source_id is not null
        and canonical_record.customer_source_id is distinct from requested_customer_source_id
      ) then
      raise exception 'The field record version changed or the record is unavailable'
        using errcode = 'PT409';
    end if;

    if collection_key_value = 'jr-os-job-tasks' then
      -- Existing office-created tasks predate the relational customer envelope
      -- and legitimately have NULL in both the envelope and payload. The
      -- locked canonical job remains the source of assignment/customer truth;
      -- preserve that legacy NULL while changing status only. New field tasks
      -- are always created with the server-derived customer binding above.
      if canonical_record.payload ->> 'assignedTo' is distinct from field_identity.team_member_source_id then
        raise exception 'Only the assigned electrician may update this task'
          using errcode = '42501';
      end if;
      requested_task_status := record_payload ->> 'status';
      canonical_task_status := canonical_record.payload ->> 'status';
      if not (
        (canonical_task_status = 'Open' and requested_task_status in ('In progress', 'Completed'))
        or (canonical_task_status = 'In progress' and requested_task_status in ('Open', 'Completed'))
      ) then
        raise exception 'The requested task status is not permitted'
          using errcode = '22023';
      end if;
      safe_payload := canonical_record.payload || pg_catalog.jsonb_build_object(
        'status', requested_task_status,
        'completedAt', case
          when requested_task_status = 'Completed' then pg_catalog.to_jsonb(received_at)
          else 'null'::jsonb
        end,
        'updatedAt', received_at
      );
    else
      if canonical_record.created_by is distinct from field_identity.actor_user_id then
        raise exception 'Only the electrician who created this survey may update it'
          using errcode = '42501';
      end if;
      -- Survey projection omits labourRate. Merge the allowlisted field keys
      -- into the canonical payload so existing office-only pricing, photos and
      -- the original creation timestamp survive.
      safe_payload := canonical_record.payload || (
        safe_payload - array['photos', 'createdAt']::text[]
      );
    end if;

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

revoke execute on function public.jr_field_save_collection(text, text, integer, jsonb, uuid)
from public, anon, authenticated, service_role;
grant execute on function public.jr_field_save_collection(text, text, integer, jsonb, uuid)
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
    '20260826233120_revalidate_field_mutation_replays.sql'
  )
$$;

revoke execute on function public.jr_os_deployed_migration()
from public, anon, authenticated, service_role;
grant execute on function public.jr_os_deployed_migration()
to service_role;

notify pgrst, 'reload schema';
