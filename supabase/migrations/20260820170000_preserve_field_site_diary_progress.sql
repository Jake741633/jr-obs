-- Preserve useful operational site-diary detail without admitting browser-
-- authored signatures, customer acknowledgements, summaries or attachments.

create or replace function private.jr_field_site_diary_write_payload(
  record_payload jsonb,
  team_member_source_id text,
  actor_name text,
  received_at timestamptz
)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
    'id', record_payload -> 'id',
    'jobId', record_payload -> 'jobId',
    'customerId', record_payload -> 'customerId',
    'workDate', record_payload -> 'workDate',
    'startedAt', record_payload -> 'startedAt',
    'finishedAt', record_payload -> 'finishedAt',
    'breakMinutes', record_payload -> 'breakMinutes',
    'completedBy', pg_catalog.to_jsonb(actor_name),
    'staffPresent', pg_catalog.jsonb_build_array(team_member_source_id),
    'otherStaffPresent', pg_catalog.to_jsonb(
      pg_catalog.left(
        pg_catalog.btrim(coalesce(record_payload ->> 'otherStaffPresent', '')),
        500
      )
    ),
    'workCompleted', record_payload -> 'workCompleted',
    'delays', record_payload -> 'delays',
    'builderInstructions', record_payload -> 'builderInstructions',
    'customerRequests', record_payload -> 'customerRequests',
    'customerInstructions', record_payload -> 'customerInstructions',
    'materialsUsed', record_payload -> 'materialsUsed',
    'materialsRequired', record_payload -> 'materialsRequired',
    'plantAndEquipment', case
      when pg_catalog.jsonb_typeof(record_payload -> 'plantAndEquipment') = 'string'
        then pg_catalog.to_jsonb(pg_catalog.left(pg_catalog.btrim(record_payload ->> 'plantAndEquipment'), 4000))
      else null
    end,
    'deliveriesReceived', case
      when pg_catalog.jsonb_typeof(record_payload -> 'deliveriesReceived') = 'string'
        then pg_catalog.to_jsonb(pg_catalog.left(pg_catalog.btrim(record_payload ->> 'deliveriesReceived'), 4000))
      else null
    end,
    'toolboxTalks', case
      when pg_catalog.jsonb_typeof(record_payload -> 'toolboxTalks') = 'string'
        then pg_catalog.to_jsonb(pg_catalog.left(pg_catalog.btrim(record_payload ->> 'toolboxTalks'), 4000))
      else null
    end,
    'voiceNotes', record_payload -> 'voiceNotes',
    'voiceNoteTranscript', record_payload -> 'voiceNoteTranscript',
    'weather', record_payload -> 'weather',
    'issuesAndRisks', record_payload -> 'issuesAndRisks',
    'followUpActions', record_payload -> 'followUpActions',
    'createdAt', pg_catalog.to_jsonb(received_at),
    'updatedAt', pg_catalog.to_jsonb(received_at)
  ))
$$;

revoke execute on function private.jr_field_site_diary_write_payload(jsonb, text, text, timestamptz)
from public, anon, authenticated, service_role;

-- Replace the generic writer only to delegate the existing diary branch to
-- the narrower helper above. Survey, task and timeline contracts stay intact.
create or replace function private.jr_field_collection_write_payload(
  collection_key_value text,
  record_payload jsonb,
  team_member_source_id text,
  actor_name text,
  received_at timestamptz
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
        'status', case
          when record_payload ->> 'status' in ('Draft', 'In progress', 'Complete')
            then record_payload -> 'status'
          else pg_catalog.to_jsonb('Draft'::text)
        end,
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
        'photos', '[]'::jsonb,
        'defects', record_payload -> 'defects',
        'risks', record_payload -> 'risks',
        'recommendations', record_payload -> 'recommendations',
        'voiceNotes', record_payload -> 'voiceNotes',
        'surveyNotes', record_payload -> 'surveyNotes',
        'labourHours', record_payload -> 'labourHours',
        'healthScore', record_payload -> 'healthScore',
        'createdAt', pg_catalog.to_jsonb(received_at),
        'updatedAt', pg_catalog.to_jsonb(received_at)
      ))
    when 'jr-os-site-diaries' then
      private.jr_field_site_diary_write_payload(
        record_payload,
        team_member_source_id,
        actor_name,
        received_at
      )
    when 'jr-os-job-tasks' then
      pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
        'id', record_payload -> 'id',
        'jobId', record_payload -> 'jobId',
        'customerId', record_payload -> 'customerId',
        'type', record_payload -> 'type',
        'title', record_payload -> 'title',
        'description', record_payload -> 'description',
        'category', record_payload -> 'category',
        'priority', record_payload -> 'priority',
        'assignedTo', pg_catalog.to_jsonb(team_member_source_id),
        'dueDate', record_payload -> 'dueDate',
        'status', pg_catalog.to_jsonb('Open'::text),
        'photos', '[]'::jsonb,
        'notes', record_payload -> 'notes',
        'completedAt', null,
        'createdAt', pg_catalog.to_jsonb(received_at),
        'updatedAt', pg_catalog.to_jsonb(received_at)
      ))
    when 'jr-os-job-timeline' then
      pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
        'id', record_payload -> 'id',
        'jobId', record_payload -> 'jobId',
        'customerId', record_payload -> 'customerId',
        'milestone', pg_catalog.to_jsonb('Custom update'::text),
        'eventType', pg_catalog.to_jsonb('Note'::text),
        'note', pg_catalog.to_jsonb(
          pg_catalog.left(pg_catalog.btrim(coalesce(record_payload ->> 'note', '')), 2000)
        ),
        'completedBy', pg_catalog.to_jsonb(actor_name),
        'completedAt', pg_catalog.to_jsonb(received_at),
        'createdAt', pg_catalog.to_jsonb(received_at)
      ))
    else null
  end
$$;

revoke execute on function private.jr_field_collection_write_payload(text, jsonb, text, text, timestamptz)
from public, anon, authenticated, service_role;

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
    '20260820170000_preserve_field_site_diary_progress.sql'
  )
$$;

revoke execute on function public.jr_os_deployed_migration()
from public, anon, authenticated, service_role;
grant execute on function public.jr_os_deployed_migration()
to service_role;

notify pgrst, 'reload schema';
