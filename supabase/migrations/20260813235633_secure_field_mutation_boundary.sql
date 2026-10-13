-- Field roles read sanitised projections, so direct source-table UPDATEs either
-- affect zero rows (PostgreSQL also requires SELECT visibility) or encourage
-- broad policies that reopen confidential payloads. Expose two narrowly
-- validated, optimistic-concurrency RPCs instead. Every tenant, actor and
-- relationship binding is derived from the active authenticated session.

create or replace function private.jr_active_field_identity()
returns table (
  actor_user_id uuid,
  organisation_id uuid,
  team_member_source_id text,
  team_member_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  with actor as (
    select
      profile.id as actor_user_id,
      profile.organisation_id,
      pg_catalog.lower(pg_catalog.btrim(coalesce(user_account.email, ''))) as email
    from public.profiles profile
    join auth.users user_account
      on user_account.id = profile.id
    where profile.id = (select auth.uid())
      and profile.active
      and profile.role = 'electrician'
      and private.has_active_auth_session()
      and private.jr_profile_scope_is_live(
        profile.organisation_id,
        profile.role,
        profile.customer_source_id
      )
  ), matching_team_members as (
    select
      actor.actor_user_id,
      actor.organisation_id,
      member.source_id,
      coalesce(
        nullif(pg_catalog.btrim(member.payload ->> 'name'), ''),
        member.source_id
      ) as member_name
    from actor
    join public.team_members member
      on member.organisation_id = actor.organisation_id
     and member.deleted_at is null
     and actor.email <> ''
     and pg_catalog.lower(pg_catalog.btrim(coalesce(member.payload ->> 'email', ''))) = actor.email
     and pg_catalog.lower(pg_catalog.btrim(coalesce(member.payload ->> 'status', ''))) = 'active'
  )
  select
    matching_team_members.actor_user_id,
    matching_team_members.organisation_id,
    matching_team_members.source_id,
    matching_team_members.member_name
  from matching_team_members
  where (select count(*) from matching_team_members) = 1
$$;

revoke execute on function private.jr_active_field_identity()
from public, anon, authenticated, service_role;

-- Lock and revalidate the exact identity row used by a mutation. A concurrent
-- office offboarding UPDATE/DELETE must wait for the mutation transaction (or
-- win first and make this function fail) rather than racing after identity
-- resolution. The authoritative auth.users email is checked again under lock.
create or replace function private.jr_lock_active_field_identity(
  record_actor_user_id uuid,
  record_organisation_id uuid,
  record_team_member_source_id text
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  locked_profile_id uuid;
  matching_member record;
  matching_member_count integer := 0;
  matching_member_source_id text;
begin
  select profile.id into locked_profile_id
  from public.profiles profile
  where profile.id = record_actor_user_id
    and profile.id = (select auth.uid())
    and profile.organisation_id = record_organisation_id
    and profile.active
    and profile.role = 'electrician'
    and private.has_active_auth_session()
    and private.jr_profile_scope_is_live(
      profile.organisation_id,
      profile.role,
      profile.customer_source_id
    )
  for share of profile;

  if locked_profile_id is null then
    return false;
  end if;

  for matching_member in
    select member.source_id
    from public.team_members member
    join auth.users user_account
      on user_account.id = record_actor_user_id
    where member.organisation_id = record_organisation_id
    and member.deleted_at is null
    and pg_catalog.lower(pg_catalog.btrim(coalesce(member.payload ->> 'status', ''))) = 'active'
    and pg_catalog.btrim(coalesce(user_account.email, '')) <> ''
    and pg_catalog.lower(pg_catalog.btrim(coalesce(member.payload ->> 'email', '')))
      = pg_catalog.lower(pg_catalog.btrim(user_account.email))
    order by member.id
    for share of member, user_account
  loop
    matching_member_count := matching_member_count + 1;
    matching_member_source_id := matching_member.source_id;
  end loop;

  return matching_member_count = 1
    and matching_member_source_id is not distinct from record_team_member_source_id;
end;
$$;

revoke execute on function private.jr_lock_active_field_identity(uuid, uuid, text)
from public, anon, authenticated, service_role;

-- Reuse the same active, unique identity for the remaining deliberately narrow
-- planner/timesheet policies. Inactive, deleted or duplicate team bindings are
-- therefore offboarded consistently across every field write surface.
create or replace function private.current_team_member_source_id()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select field_identity.team_member_source_id
  from private.jr_active_field_identity() field_identity
$$;

revoke execute on function private.current_team_member_source_id()
from public, anon;
grant execute on function private.current_team_member_source_id()
to authenticated, service_role;

create or replace function private.jr_job_is_assigned_to_team_member(
  record_payload jsonb,
  team_member_source_id text
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when pg_catalog.jsonb_typeof(record_payload -> 'assignedTo') = 'array' then exists (
      select 1
      from pg_catalog.jsonb_array_elements_text(record_payload -> 'assignedTo') assignment(value)
      where assignment.value = team_member_source_id
    )
    else false
  end
$$;

revoke execute on function private.jr_job_is_assigned_to_team_member(jsonb, text)
from public, anon, authenticated, service_role;

-- The legacy planner and timesheet routes remain intentionally available, but
-- their direct RLS policies must not let an electrician attach a record to an
-- arbitrary same-organisation job. Require the relational envelope to resolve
-- to the canonical, active job currently assigned to the authenticated team
-- identity. Exact customer matching also prevents changing the envelope to a
-- different valid customer/job pair during UPDATE.
create or replace function private.jr_field_record_targets_assigned_job(
  record_organisation_id uuid,
  record_customer_source_id text,
  record_job_source_id text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    record_organisation_id = private.current_organisation_id()
    and record_job_source_id is not null
    and private.current_team_member_source_id() is not null
    and exists (
      select 1
      from public.jobs job
      where job.organisation_id = record_organisation_id
        and job.source_id = record_job_source_id
        and job.customer_source_id is not distinct from record_customer_source_id
        and job.deleted_at is null
        and private.jr_job_is_assigned_to_team_member(
          job.payload,
          private.current_team_member_source_id()
        )
    ),
    false
  )
$$;

revoke execute on function private.jr_field_record_targets_assigned_job(uuid, text, text)
from public, anon;
grant execute on function private.jr_field_record_targets_assigned_job(uuid, text, text)
to authenticated, service_role;

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
        -- Survey photos are stored through the private-file workflow. Never
        -- copy browser data URLs or arbitrary external objects into this RPC.
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
      pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
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
        'voiceNotes', record_payload -> 'voiceNotes',
        'voiceNoteTranscript', record_payload -> 'voiceNoteTranscript',
        'weather', record_payload -> 'weather',
        'issuesAndRisks', record_payload -> 'issuesAndRisks',
        'followUpActions', record_payload -> 'followUpActions',
        'createdAt', pg_catalog.to_jsonb(received_at),
        'updatedAt', pg_catalog.to_jsonb(received_at)
      ))
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
      -- Every client classification is untrusted. Preserve only bounded note
      -- text and replace milestone/event/actor/time with server-authored plain
      -- Note semantics; source and status evidence keys are never copied.
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

-- The relationship trigger compares the generic envelope with payload
-- customerId. Keep that server-derived key in the field timeline projection;
-- the previous projection dropped it before the binding trigger ran.
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

create table if not exists private.jr_field_mutation_receipts (
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  mutation_id uuid not null,
  -- JSONB has a canonical object representation. Retaining it lets retries
  -- compare the complete request without a hash collision or a dependency on
  -- whichever schema happens to own pgcrypto on the target project.
  request_fingerprint jsonb not null,
  result jsonb,
  created_at timestamptz not null default pg_catalog.now(),
  constraint jr_field_mutation_receipts_result_object check (
    result is null or pg_catalog.jsonb_typeof(result) = 'object'
  ),
  primary key (organisation_id, actor_user_id, mutation_id)
);

create index if not exists jr_field_mutation_receipts_actor_created_idx
on private.jr_field_mutation_receipts (
  organisation_id,
  actor_user_id,
  created_at
)
where result is not null;

revoke all privileges on table private.jr_field_mutation_receipts
from public, anon, authenticated, service_role;

create or replace function private.jr_claim_field_mutation(
  record_organisation_id uuid,
  record_actor_user_id uuid,
  record_mutation_id uuid,
  record_request jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  receipt private.jr_field_mutation_receipts%rowtype;
  receipt_count integer;
begin
  if record_mutation_id is null then
    raise exception 'A mutation id is required'
      using errcode = '22023';
  end if;

  if pg_catalog.jsonb_typeof(record_request) is distinct from 'object' then
    raise exception 'A canonical mutation request object is required'
      using errcode = '22023';
  end if;

  -- Bound both a single persisted fingerprint and an actor's durable receipt
  -- set. Never remove an in-flight NULL-result row. Opportunistic cleanup
  -- makes the 30-day replay window self-maintaining without a scheduler.
  if pg_catalog.octet_length(record_request::text) > 131072 then
    raise exception 'The field mutation request is too large'
      using errcode = '22023';
  end if;

  -- Serialize quota accounting for one tenant/actor without blocking another
  -- field worker. This complements (rather than replaces) the TeamMember row
  -- lock held by the public RPC.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      record_organisation_id::text || ':' || record_actor_user_id::text,
      0
    )
  );

  delete from private.jr_field_mutation_receipts mutation_receipt
  where mutation_receipt.organisation_id = record_organisation_id
    and mutation_receipt.actor_user_id = record_actor_user_id
    and mutation_receipt.result is not null
    and mutation_receipt.created_at < pg_catalog.now() - interval '30 days';

  select count(*) into receipt_count
  from private.jr_field_mutation_receipts mutation_receipt
  where mutation_receipt.organisation_id = record_organisation_id
    and mutation_receipt.actor_user_id = record_actor_user_id;

  if receipt_count >= 2000 and not exists (
    select 1
    from private.jr_field_mutation_receipts mutation_receipt
    where mutation_receipt.organisation_id = record_organisation_id
      and mutation_receipt.actor_user_id = record_actor_user_id
      and mutation_receipt.mutation_id = record_mutation_id
  ) then
    raise exception 'The field mutation receipt quota has been reached'
      using errcode = '54000';
  end if;

  insert into private.jr_field_mutation_receipts (
    organisation_id,
    actor_user_id,
    mutation_id,
    request_fingerprint
  ) values (
    record_organisation_id,
    record_actor_user_id,
    record_mutation_id,
    record_request
  )
  on conflict (organisation_id, actor_user_id, mutation_id) do nothing;

  select * into receipt
  from private.jr_field_mutation_receipts mutation_receipt
  where mutation_receipt.organisation_id = record_organisation_id
    and mutation_receipt.actor_user_id = record_actor_user_id
    and mutation_receipt.mutation_id = record_mutation_id
  for update;

  if receipt.request_fingerprint <> record_request then
    raise exception 'A mutation id cannot be reused for a different request'
      using errcode = 'PT409';
  end if;

  return receipt.result;
end;
$$;

revoke execute on function private.jr_claim_field_mutation(uuid, uuid, uuid, jsonb)
from public, anon, authenticated, service_role;

create or replace function private.jr_complete_field_mutation(
  record_organisation_id uuid,
  record_actor_user_id uuid,
  record_mutation_id uuid,
  mutation_result jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected_rows integer;
begin
  if mutation_result is null
    or pg_catalog.jsonb_typeof(mutation_result) <> 'object' then
    raise exception 'A mutation result object is required'
      using errcode = '22023';
  end if;

  update private.jr_field_mutation_receipts mutation_receipt
  set result = mutation_result
  where mutation_receipt.organisation_id = record_organisation_id
    and mutation_receipt.actor_user_id = record_actor_user_id
    and mutation_receipt.mutation_id = record_mutation_id
    and mutation_receipt.result is null;

  get diagnostics affected_rows = row_count;
  if affected_rows <> 1 then
    raise exception 'The field mutation receipt could not be completed'
      using errcode = 'PT409';
  end if;
end;
$$;

revoke execute on function private.jr_complete_field_mutation(uuid, uuid, uuid, jsonb)
from public, anon, authenticated, service_role;

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
  if mutation_result is not null then
    return mutation_result;
  end if;

  select * into canonical_job
  from public.jobs job
  where job.organisation_id = field_identity.organisation_id
    and job.source_id = record_source_id
  for update;

  if canonical_job.id is null
    or canonical_job.deleted_at is not null
    or canonical_job.version <> expected_version then
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
  if mutation_result is not null then
    return mutation_result;
  end if;

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

-- Keep the established planner/timesheet field workflows, but require every
-- field write to target the actor's currently assigned canonical job. The
-- existing planner trigger additionally enforces exactly-self assignment on
-- INSERT and immutable team assignments on electrician UPDATE.
drop policy if exists planner_entries_field_insert on public.planner_entries;
create policy planner_entries_field_insert
on public.planner_entries for insert to authenticated
with check (
  organisation_id = private.current_organisation_id()
  and created_by = (select auth.uid())
  and updated_by = (select auth.uid())
  and (
    private.can_manage_office_data()
    or (
      private.current_jr_role() = 'electrician'
      and private.planner_entry_includes_current_team_member(payload)
      and private.jr_field_record_targets_assigned_job(
        organisation_id,
        customer_source_id,
        job_source_id
      )
    )
  )
);

drop policy if exists planner_entries_field_update on public.planner_entries;
create policy planner_entries_field_update
on public.planner_entries for update to authenticated
using (
  organisation_id = private.current_organisation_id()
  and (
    private.can_manage_office_data()
    or (
      private.current_jr_role() = 'electrician'
      and private.planner_entry_includes_current_team_member(payload)
      and private.jr_field_record_targets_assigned_job(
        organisation_id,
        customer_source_id,
        job_source_id
      )
    )
  )
)
with check (
  organisation_id = private.current_organisation_id()
  and (
    private.can_manage_office_data()
    or (
      private.current_jr_role() = 'electrician'
      and private.planner_entry_includes_current_team_member(payload)
      and private.jr_field_record_targets_assigned_job(
        organisation_id,
        customer_source_id,
        job_source_id
      )
    )
  )
);

drop policy if exists timesheets_field_insert on public.timesheets;
create policy timesheets_field_insert
on public.timesheets for insert to authenticated
with check (
  organisation_id = private.current_organisation_id()
  and created_by = (select auth.uid())
  and updated_by = (select auth.uid())
  and (
    private.can_manage_office_data()
    or (
      private.current_jr_role() = 'electrician'
      and payload ->> 'teamMemberId' = private.current_team_member_source_id()
      and private.jr_field_record_targets_assigned_job(
        organisation_id,
        customer_source_id,
        job_source_id
      )
    )
  )
);

drop policy if exists timesheets_field_update on public.timesheets;
create policy timesheets_field_update
on public.timesheets for update to authenticated
using (
  organisation_id = private.current_organisation_id()
  and (
    private.can_manage_office_data()
    or (
      private.current_jr_role() = 'electrician'
      and created_by = (select auth.uid())
      and private.jr_field_record_targets_assigned_job(
        organisation_id,
        customer_source_id,
        job_source_id
      )
    )
  )
)
with check (
  organisation_id = private.current_organisation_id()
  and (
    private.can_manage_office_data()
    or (
      private.current_jr_role() = 'electrician'
      and created_by = (select auth.uid())
      and payload ->> 'teamMemberId' = private.current_team_member_source_id()
      and private.jr_field_record_targets_assigned_job(
        organisation_id,
        customer_source_id,
        job_source_id
      )
    )
  )
);

-- Direct writes are reserved for office roles. Field mutations must pass
-- through the RPCs above; other operational surfaces fail closed until a
-- workflow-specific server boundary is added.
drop policy if exists jobs_field_insert on public.jobs;
drop policy if exists jobs_field_update on public.jobs;
drop policy if exists jobs_insert on public.jobs;
drop policy if exists jobs_update on public.jobs;
drop policy if exists jobs_office_insert on public.jobs;
drop policy if exists jobs_office_update on public.jobs;
create policy jobs_office_insert
on public.jobs for insert to authenticated
with check (
  organisation_id = private.current_organisation_id()
  and private.can_manage_office_data()
  and created_by = (select auth.uid())
  and updated_by = (select auth.uid())
);
create policy jobs_office_update
on public.jobs for update to authenticated
using (
  organisation_id = private.current_organisation_id()
  and private.can_manage_office_data()
)
with check (
  organisation_id = private.current_organisation_id()
  and private.can_manage_office_data()
  and updated_by = (select auth.uid())
);

drop policy if exists "cloud collections staff insert" on public.cloud_collections;
create policy "cloud collections staff insert"
on public.cloud_collections for insert to authenticated
with check (
  organisation_id = private.current_organisation_id()
  and private.can_manage_office_data()
  and created_by = (select auth.uid())
  and updated_by = (select auth.uid())
);
drop policy if exists "cloud collections staff update" on public.cloud_collections;
create policy "cloud collections staff update"
on public.cloud_collections for update to authenticated
using (
  organisation_id = private.current_organisation_id()
  and private.can_manage_office_data()
)
with check (
  organisation_id = private.current_organisation_id()
  and private.can_manage_office_data()
  and updated_by = (select auth.uid())
);

create or replace function private.can_write_cloud_collection(collection_key_value text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.can_manage_office_data(), false)
$$;

revoke execute on function private.can_write_cloud_collection(text)
from public, anon;
grant execute on function private.can_write_cloud_collection(text)
to authenticated, service_role;

-- File metadata and object writes cannot safely prove assigned-job ownership
-- yet. Keep the existing role-scoped read projection, but fail field writes
-- closed until a dedicated upload-intent RPC can mint an assigned path.
create or replace function private.jr_can_write_private_file(storage_key_value text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.can_manage_office_data(), false)
$$;

revoke execute on function private.jr_can_write_private_file(text)
from public, anon;
grant execute on function private.jr_can_write_private_file(text)
to authenticated, service_role;

drop policy if exists jr_private_insert on storage.objects;
create policy jr_private_insert
on storage.objects
for insert to authenticated
with check (
  storage.allow_only_operation('storage.object.upload')
  and bucket_id = 'jr-os-private'
  and (storage.foldername(name))[1] = private.current_organisation_id()::text
  and private.can_manage_office_data()
);

drop policy if exists legacy_files_staff_insert on storage.objects;
create policy legacy_files_staff_insert
on storage.objects
for insert to authenticated
with check (
  storage.allow_only_operation('storage.object.upload')
  and bucket_id = 'jr-os-files'
  and (storage.foldername(name))[1] = private.current_organisation_id()::text
  and private.can_manage_office_data()
);

drop policy if exists legacy_files_staff_update on storage.objects;
create policy legacy_files_staff_update
on storage.objects
for update to authenticated
using (
  storage.allow_only_operation('storage.object.upload_update')
  and bucket_id = 'jr-os-files'
  and (storage.foldername(name))[1] = private.current_organisation_id()::text
  and private.can_manage_office_data()
)
with check (
  storage.allow_only_operation('storage.object.upload_update')
  and bucket_id = 'jr-os-files'
  and (storage.foldername(name))[1] = private.current_organisation_id()::text
  and private.can_manage_office_data()
);

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'materials',
    'stock_items',
    'stock_movements',
    'purchase_lists',
    'certificates',
    'electrical_testing_records',
    'job_documents'
  ] loop
    execute pg_catalog.format('drop policy if exists %I on public.%I', table_name || '_field_insert', table_name);
    execute pg_catalog.format('drop policy if exists %I on public.%I', table_name || '_field_update', table_name);
    execute pg_catalog.format('drop policy if exists %I on public.%I', table_name || '_insert', table_name);
    execute pg_catalog.format('drop policy if exists %I on public.%I', table_name || '_update', table_name);
    execute pg_catalog.format('drop policy if exists %I on public.%I', table_name || '_office_insert', table_name);
    execute pg_catalog.format('drop policy if exists %I on public.%I', table_name || '_office_update', table_name);
    execute pg_catalog.format(
      'create policy %I on public.%I for insert to authenticated with check (
        organisation_id = private.current_organisation_id()
        and private.can_manage_office_data()
        and created_by = (select auth.uid())
        and updated_by = (select auth.uid())
      )',
      table_name || '_office_insert',
      table_name
    );
    execute pg_catalog.format(
      'create policy %I on public.%I for update to authenticated using (
        organisation_id = private.current_organisation_id()
        and private.can_manage_office_data()
      ) with check (
        organisation_id = private.current_organisation_id()
        and private.can_manage_office_data()
        and updated_by = (select auth.uid())
      )',
      table_name || '_office_update',
      table_name
    );
  end loop;
end
$$;

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
    '20260813235633_secure_field_mutation_boundary.sql'
  )
$$;

revoke execute on function public.jr_os_deployed_migration()
from public, anon, authenticated, service_role;
grant execute on function public.jr_os_deployed_migration()
to service_role;

notify pgrst, 'reload schema';
