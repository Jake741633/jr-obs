import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationName = "20260813235633_secure_field_mutation_boundary.sql";
const replayMigrationName = "20260826233120_revalidate_field_mutation_replays.sql";
const migration = readFileSync(
  new URL(`../supabase/migrations/${migrationName}`, import.meta.url),
  "utf8",
);
const replayMigration = readFileSync(
  new URL(`../supabase/migrations/${replayMigrationName}`, import.meta.url),
  "utf8",
);
const recovery = readFileSync(
  new URL("../supabase/recovery/after_schema_only.sql", import.meta.url),
  "utf8",
);
const setup = readFileSync(
  new URL("../docs/SUPABASE_SETUP.md", import.meta.url),
  "utf8",
);

function functionBody(name, next = "revoke execute on function", source = migration) {
  const start = source.indexOf(`create or replace function ${name}`);
  assert.notEqual(start, -1, `missing ${name}`);
  const end = source.indexOf(next, start);
  assert.notEqual(end, -1, `missing end of ${name}`);
  return source.slice(start, end);
}

const identity = functionBody("private.jr_active_field_identity");
const identityLock = functionBody("private.jr_lock_active_field_identity");
const assignedTarget = functionBody("private.jr_field_record_targets_assigned_job");
const writer = functionBody("private.jr_field_collection_write_payload");
const readProjection = functionBody("private.jr_field_cloud_payload");
const claim = functionBody("private.jr_claim_field_mutation");
const complete = functionBody("private.jr_complete_field_mutation");
const jobRpc = functionBody("public.jr_field_update_job_status", undefined, replayMigration);
const collectionRpc = functionBody("public.jr_field_save_collection", undefined, replayMigration);

test("field identity is derived from one active same-tenant team member", () => {
  assert.match(identity, /profile\.id = \(select auth\.uid\(\)\)/i);
  assert.match(identity, /join auth\.users user_account[\s\S]*user_account\.id = profile\.id/i);
  assert.match(identity, /coalesce\(user_account\.email, ''\)/i);
  assert.doesNotMatch(identity, /auth\.jwt\(\)[\s\S]*email/i);
  assert.match(identity, /profile\.active/i);
  assert.match(identity, /profile\.role = 'electrician'/i);
  assert.match(identity, /private\.has_active_auth_session\(\)/i);
  assert.match(identity, /member\.organisation_id = actor\.organisation_id/i);
  assert.match(identity, /member\.deleted_at is null/i);
  assert.match(identity, /lower\([\s\S]*member\.payload ->> 'email'/i);
  assert.match(identity, /lower\([\s\S]*member\.payload ->> 'status'[\s\S]*= 'active'/i);
  assert.match(identity, /where \(select count\(\*\) from matching_team_members\) = 1/i);
  assert.doesNotMatch(identity, /max\s*\(/i);
  const legacyWorkerIdentity = functionBody("private.current_team_member_source_id");
  assert.match(legacyWorkerIdentity, /from private\.jr_active_field_identity\(\)/i);
});

test("remaining planner and timesheet writes require the actor's assigned canonical job", () => {
  assert.doesNotMatch(assignedTarget, /team_member_source_id text/i);
  assert.match(assignedTarget, /private\.current_team_member_source_id\(\)/i);
  assert.match(assignedTarget, /record_job_source_id is not null/i);
  assert.match(assignedTarget, /job\.organisation_id = record_organisation_id/i);
  assert.match(assignedTarget, /job\.source_id = record_job_source_id/i);
  assert.match(assignedTarget, /job\.customer_source_id is not distinct from record_customer_source_id/i);
  assert.match(assignedTarget, /job\.deleted_at is null/i);
  assert.match(assignedTarget, /private\.jr_job_is_assigned_to_team_member/i);
  for (const policy of [
    "planner_entries_field_insert",
    "planner_entries_field_update",
    "timesheets_field_insert",
    "timesheets_field_update",
  ]) {
    const start = migration.indexOf(`create policy ${policy}`);
    assert.ok(start >= 0, `missing ${policy}`);
    const end = migration.indexOf(";", start);
    assert.match(
      migration.slice(start, end),
      /private\.jr_field_record_targets_assigned_job/i,
      `${policy} must require a canonical assigned job`,
    );
  }
});

test("RPCs lock and revalidate the exact active profile/team identity", () => {
  assert.match(identityLock, /from public\.profiles profile[\s\S]*profile\.active[\s\S]*profile\.role = 'electrician'/i);
  assert.match(identityLock, /profile\.organisation_id = record_organisation_id/i);
  assert.match(identityLock, /private\.has_active_auth_session\(\)/i);
  assert.match(identityLock, /private\.jr_profile_scope_is_live/i);
  assert.match(identityLock, /for share of profile/i);
  assert.match(identityLock, /join auth\.users user_account/i);
  assert.match(identityLock, /member\.deleted_at is null/i);
  assert.match(identityLock, /member\.payload ->> 'status'[\s\S]*= 'active'/i);
  assert.match(identityLock, /for share of member, user_account/i);
  assert.match(identityLock, /matching_member_count = 1/i);
  assert.match(identityLock, /matching_member_source_id is not distinct from record_team_member_source_id/i);
  for (const body of [jobRpc, collectionRpc]) {
    assert.match(body, /private\.jr_lock_active_field_identity\([\s\S]*field_identity\.team_member_source_id/i);
  }
});

test("public field RPCs have one unambiguous mutation-id signature and fixed privileges", () => {
  assert.match(
    migration,
    /create or replace function public\.jr_field_update_job_status\(\s*record_source_id text,\s*expected_version integer,\s*requested_status text,\s*mutation_id uuid\s*\)/is,
  );
  assert.match(
    migration,
    /create or replace function public\.jr_field_save_collection\(\s*collection_key_value text,\s*record_source_id text,\s*expected_version integer,\s*record_payload jsonb,\s*mutation_id uuid\s*\)/is,
  );
  for (const body of [jobRpc, collectionRpc]) {
    assert.match(body, /security definer/i);
    assert.match(body, /set search_path = ''/i);
  }
  assert.match(migration, /revoke execute on function public\.jr_field_update_job_status\(text, integer, text, uuid\)[\s\S]*from public, anon, authenticated, service_role;[\s\S]*grant execute[\s\S]*to authenticated;/i);
  assert.match(migration, /revoke execute on function public\.jr_field_save_collection\(text, text, integer, jsonb, uuid\)[\s\S]*from public, anon, authenticated, service_role;[\s\S]*grant execute[\s\S]*to authenticated;/i);
});

test("mutation receipts provide exact response-loss replay and reject UUID reuse", () => {
  const receiptTable = migration.slice(
    migration.indexOf("create table if not exists private.jr_field_mutation_receipts"),
    migration.indexOf("create or replace function private.jr_claim_field_mutation"),
  );
  assert.match(receiptTable, /primary key \(organisation_id, actor_user_id, mutation_id\)/i);
  assert.match(receiptTable, /request_fingerprint jsonb not null/i);
  assert.match(receiptTable, /result jsonb/i);
  assert.match(receiptTable, /revoke all privileges[\s\S]*from public, anon, authenticated, service_role/i);
  assert.match(claim, /record_mutation_id is null/i);
  assert.match(claim, /octet_length\(record_request::text\) > 131072/i);
  assert.match(claim, /pg_advisory_xact_lock\([\s\S]*record_organisation_id::text[\s\S]*record_actor_user_id::text/i);
  assert.match(claim, /result is not null[\s\S]*created_at < pg_catalog\.now\(\) - interval '30 days'/i);
  assert.match(claim, /receipt_count >= 2000[\s\S]*mutation_id = record_mutation_id/i);
  assert.match(claim, /errcode = '54000'/i);
  assert.match(claim, /on conflict \(organisation_id, actor_user_id, mutation_id\) do nothing/i);
  assert.match(claim, /for update/i);
  assert.match(claim, /receipt\.request_fingerprint <> record_request/i);
  assert.match(claim, /errcode = 'PT409'/i);
  assert.match(claim, /return receipt\.result/i);
  assert.doesNotMatch(claim, /digest\s*\(/i);
  assert.match(complete, /mutation_receipt\.result is null/i);
  assert.match(complete, /get diagnostics affected_rows = row_count/i);
  assert.match(complete, /affected_rows <> 1[\s\S]*errcode = 'PT409'/i);
  for (const body of [jobRpc, collectionRpc]) {
    assert.match(body, /private\.jr_claim_field_mutation/i);
    assert.match(body, /if mutation_result is not null then\s*return mutation_result/i);
    assert.match(body, /private\.jr_complete_field_mutation/i);
  }
});

test("completed receipt replays revalidate the current canonical job assignment", () => {
  const jobClaim = jobRpc.indexOf("private.jr_claim_field_mutation(");
  const jobLock = jobRpc.indexOf("from public.jobs job");
  const jobAvailability = jobRpc.indexOf("canonical_job.id is null");
  const jobAssignment = jobRpc.indexOf("if not private.jr_job_is_assigned_to_team_member(");
  const jobReplay = jobRpc.indexOf("if mutation_result is not null then");
  const jobWrite = jobRpc.indexOf("update public.jobs");
  assert.ok(
    jobClaim >= 0
      && jobLock > jobClaim
      && jobAvailability > jobLock
      && jobAssignment > jobAvailability
      && jobReplay > jobAssignment
      && jobWrite > jobReplay,
    "job receipt replay must follow claim, canonical lock, availability and assignment checks",
  );
  assert.match(jobRpc.slice(jobLock, jobAvailability), /for update/i);
  assert.match(jobRpc.slice(jobAvailability, jobAssignment), /mutation_result is null[\s\S]*canonical_job\.version <> expected_version/i);

  const collectionClaim = collectionRpc.indexOf("private.jr_claim_field_mutation(");
  const collectionJobParse = collectionRpc.indexOf("requested_job_source_id := case");
  const collectionJobLock = collectionRpc.indexOf("from public.jobs job");
  const collectionAssignment = collectionRpc.indexOf("The field record is not bound to an assigned active job");
  const collectionReplay = collectionRpc.indexOf("if mutation_result is not null then");
  const collectionRecordLock = collectionRpc.indexOf("from public.cloud_collections cloud_record");
  assert.ok(
    collectionClaim >= 0
      && collectionJobParse > collectionClaim
      && collectionJobLock > collectionJobParse
      && collectionAssignment > collectionJobLock
      && collectionReplay > collectionAssignment
      && collectionRecordLock > collectionReplay,
    "collection receipt replay must follow claim, request job parsing, canonical lock and assignment checks",
  );
  assert.match(collectionRpc.slice(collectionJobLock, collectionAssignment), /for share/i);
});

test("job status mutation locks the assigned canonical job and enforces the field graph", () => {
  assert.match(jobRpc, /expected_version is null or expected_version <= 0/i);
  assert.match(jobRpc, /from public\.jobs job[\s\S]*for update/i);
  assert.match(jobRpc, /canonical_job\.version <> expected_version/i);
  assert.match(jobRpc, /canonical_job\.deleted_at is not null/i);
  assert.match(jobRpc, /private\.jr_job_is_assigned_to_team_member\([\s\S]*field_identity\.team_member_source_id/i);
  assert.match(jobRpc, /current_status = 'In progress' then 'First fix'/i);
  assert.match(jobRpc, /normalized_status text := case[\s\S]*when 'In progress' then 'First fix'/i);
  for (const transition of [
    /Scheduled' and normalized_status = 'First fix'/i,
    /First fix' and normalized_status in \('Awaiting builder', 'Second fix'\)/i,
    /Awaiting builder' and normalized_status in \('First fix', 'Second fix'\)/i,
    /Second fix' and normalized_status = 'Testing'/i,
    /Testing' and normalized_status in \('Snagging', 'Complete'\)/i,
    /Snagging' and normalized_status in \('Testing', 'Complete'\)/i,
  ]) assert.match(jobRpc, transition);
  for (const forbidden of ["On hold", "Invoiced", "Paid", "Cancelled"]) {
    assert.doesNotMatch(jobRpc, new RegExp(`normalized_status[^;]{0,120}'${forbidden}'`, "i"));
  }
  assert.match(jobRpc, /current_status = normalized_status[\s\S]*errcode = 'PT409'/i);
});

test("job status mutation changes only lifecycle state and writes authoritative evidence atomically", () => {
  assert.match(jobRpc, /payload = canonical_job\.payload \|\|[\s\S]*'status', normalized_status,[\s\S]*'updatedAt', received_at/i);
  assert.match(jobRpc, /insert into public\.cloud_collections/i);
  assert.match(jobRpc, /'jr-os-job-timeline'/i);
  assert.match(jobRpc, /'eventType', 'Status change'/i);
  assert.match(jobRpc, /'fromStatus', current_status/i);
  assert.match(jobRpc, /'toStatus', normalized_status/i);
  assert.match(jobRpc, /'completedBy', field_identity\.team_member_name/i);
  assert.match(jobRpc, /timeline_source_id := 'field-status-'[\s\S]*field_identity\.actor_user_id::text \|\| '-' \|\| mutation_id::text/i);
  assert.doesNotMatch(jobRpc, /gen_random_uuid/i);
  assert.match(jobRpc, /'payload', private\.jr_field_job_payload\(updated_job\.payload\)/i);
});

test("generic mutation allowlist is the deliberately minimal v1 matrix", () => {
  const allowlist = collectionRpc.slice(
    collectionRpc.indexOf("if collection_key_value is null or collection_key_value not in"),
    collectionRpc.indexOf(
      "then",
      collectionRpc.indexOf("if collection_key_value is null or collection_key_value not in"),
    ),
  );
  for (const key of ["jr-os-surveys", "jr-os-site-diaries", "jr-os-job-tasks", "jr-os-job-timeline"]) {
    assert.match(allowlist, new RegExp(`'${key}'`));
  }
  for (const denied of [
    "jr-os-site-diary",
    "jr-os-rams",
    "jr-os-job-packs",
    "jr-os-job-variations",
    "jr-os-job-qa-inspections",
    "jr-os-job-progress",
    "jr-os-job-material-usage",
    "jr-os-job-completion",
    "jr-os-stock-locations",
  ]) assert.doesNotMatch(allowlist, new RegExp(`'${denied}'`));
  assert.match(collectionRpc, /expected_version is null or expected_version < 0/i);
  assert.match(collectionRpc, /octet_length\(record_payload::text\) > 131072[\s\S]*errcode = '22023'/i);
  assert.match(collectionRpc, /from public\.jobs job[\s\S]*for share/i);
  assert.match(collectionRpc, /from public\.cloud_collections cloud_record[\s\S]*for update/i);
  assert.match(collectionRpc, /if expected_version = 0 then[\s\S]*canonical_record\.id is not null[\s\S]*errcode = 'PT409'/i);
  assert.match(collectionRpc, /exception[\s\S]*when unique_violation then[\s\S]*errcode = 'PT409'/i);
  assert.match(collectionRpc, /canonical_record\.version <> expected_version/i);
  assert.match(collectionRpc, /canonical_record\.job_source_id is distinct from canonical_job\.source_id/i);
  assert.match(collectionRpc, /collection_key_value in \('jr-os-site-diaries', 'jr-os-job-timeline'\)[\s\S]*insert-only/i);
});

test("collection payloads bind actor/job/customer and exclude attachment and evidence forgery", () => {
  assert.match(collectionRpc, /'customerId', canonical_job\.customer_source_id/i);
  assert.match(collectionRpc, /'builderId', canonical_job\.payload -> 'builderId'/i);
  for (const sectionStart of ["when 'jr-os-site-diaries'", "when 'jr-os-job-tasks'", "when 'jr-os-job-timeline'"]) {
    const start = writer.indexOf(sectionStart);
    const end = writer.indexOf("when '", start + sectionStart.length);
    assert.match(writer.slice(start, end < 0 ? undefined : end), /'customerId', record_payload -> 'customerId'/i);
  }
  assert.match(writer, /'photos', '\[\]'::jsonb/i);
  assert.doesNotMatch(writer, /'photoDocumentIds'/i);

  const diary = writer.slice(writer.indexOf("when 'jr-os-site-diaries'"), writer.indexOf("when 'jr-os-job-tasks'"));
  assert.match(diary, /'completedBy', pg_catalog\.to_jsonb\(actor_name\)/i);
  assert.match(diary, /'staffPresent', pg_catalog\.jsonb_build_array\(team_member_source_id\)/i);
  assert.match(diary, /'otherStaffPresent'[\s\S]*pg_catalog\.left\([\s\S]*500/i);

  const task = writer.slice(writer.indexOf("when 'jr-os-job-tasks'"), writer.indexOf("when 'jr-os-job-timeline'"));
  assert.match(task, /'assignedTo', pg_catalog\.to_jsonb\(team_member_source_id\)/i);
  assert.match(task, /'status', pg_catalog\.to_jsonb\('Open'::text\)/i);
  assert.match(task, /'photos', '\[\]'::jsonb/i);
  assert.doesNotMatch(task, /customerConfirmedAt|Customer confirmed/i);
  assert.match(collectionRpc, /Field-created tasks must start open/i);
  assert.match(collectionRpc, /Only the assigned electrician may update this task/i);
  assert.match(collectionRpc, /safe_payload := canonical_record\.payload \|\| pg_catalog\.jsonb_build_object\([\s\S]*'status', requested_task_status/i);
  assert.match(collectionRpc, /collection_key_value = 'jr-os-job-tasks'[\s\S]*canonical_record\.customer_source_id is not null[\s\S]*canonical_record\.customer_source_id is distinct from requested_customer_source_id/i);
  assert.match(collectionRpc, /Existing office-created tasks predate the relational customer envelope/i);

  const timeline = writer.slice(writer.indexOf("when 'jr-os-job-timeline'"), writer.indexOf("else null"));
  assert.match(timeline, /'milestone', pg_catalog\.to_jsonb\('Custom update'::text\)/i);
  assert.match(timeline, /'eventType', pg_catalog\.to_jsonb\('Note'::text\)/i);
  assert.match(timeline, /pg_catalog\.left\([\s\S]*2000/i);
  assert.doesNotMatch(timeline, /sourceId|sourceType|fromStatus|toStatus|variation|financial|certificate|qa/i);
  assert.match(writer, /Every client classification is untrusted[\s\S]*server-authored plain[\s\S]*Note semantics/i);
  const timelineProjection = readProjection.slice(
    readProjection.indexOf("when 'jr-os-job-timeline'"),
    readProjection.indexOf("when 'jr-os-job-material-usage'"),
  );
  assert.match(timelineProjection, /'customerId', record_payload -> 'customerId'/i);
  assert.match(migration, /update public\.field_cloud_collections projection[\s\S]*source\.collection_key = 'jr-os-job-timeline'/i);
});

test("survey and task updates preserve canonical office and attachment data", () => {
  assert.match(collectionRpc, /safe_payload - array\['photos', 'createdAt'\]::text\[\]/i);
  assert.match(collectionRpc, /canonical_record\.payload \|\|/i);
  assert.doesNotMatch(writer.slice(writer.indexOf("when 'jr-os-surveys'"), writer.indexOf("when 'jr-os-site-diaries'")), /'labourRate'/i);
  assert.match(collectionRpc, /requested survey status is not permitted/i);
  assert.match(collectionRpc, /canonical_record\.created_by is distinct from field_identity\.actor_user_id/i);
  assert.match(collectionRpc, /Only the electrician who created this survey may update it/i);
  assert.match(collectionRpc, /task type, category or priority is not permitted/i);
});

test("raw field mutation policies fail closed while assigned planner/timesheet workflows remain", () => {
  assert.match(migration, /create policy jobs_office_insert[\s\S]*private\.can_manage_office_data\(\)/i);
  assert.match(migration, /create policy jobs_office_update[\s\S]*private\.can_manage_office_data\(\)/i);
  assert.match(migration, /create policy "cloud collections staff insert"[\s\S]*private\.can_manage_office_data\(\)/i);
  assert.match(migration, /create policy "cloud collections staff update"[\s\S]*private\.can_manage_office_data\(\)/i);
  assert.match(functionBody("private.can_write_cloud_collection"), /private\.can_manage_office_data\(\)/i);
  for (const table of [
    "materials",
    "stock_items",
    "stock_movements",
    "purchase_lists",
    "certificates",
    "electrical_testing_records",
    "job_documents",
  ]) assert.match(migration, new RegExp(`'${table}'`));
  assert.match(migration, /create policy planner_entries_field_insert[\s\S]*jr_field_record_targets_assigned_job/i);
  assert.match(migration, /create policy timesheets_field_insert[\s\S]*jr_field_record_targets_assigned_job/i);
});

test("field file metadata and Storage writes fail closed until assigned upload intents exist", () => {
  const fileWriter = functionBody("private.jr_can_write_private_file");
  assert.match(fileWriter, /private\.can_manage_office_data\(\)/i);
  assert.doesNotMatch(fileWriter, /electrician|can_manage_field_data/i);
  const objectInsert = migration.slice(
    migration.indexOf("drop policy if exists jr_private_insert on storage.objects"),
    migration.indexOf("do $$", migration.indexOf("drop policy if exists jr_private_insert on storage.objects")),
  );
  assert.match(objectInsert, /create policy jr_private_insert/i);
  assert.match(objectInsert, /bucket_id = 'jr-os-private'/i);
  assert.match(objectInsert, /private\.can_manage_office_data\(\)/i);
  assert.doesNotMatch(objectInsert, /private\.can_manage_field_data\(\)/i);
  for (const policy of ["legacy_files_staff_insert", "legacy_files_staff_update"]) {
    const start = migration.indexOf(`create policy ${policy}`);
    assert.ok(start >= 0, `missing ${policy}`);
    const end = migration.indexOf(";", start);
    const body = migration.slice(start, end);
    assert.match(body, /bucket_id = 'jr-os-files'/i);
    assert.match(body, /private\.can_manage_office_data\(\)/i);
    assert.doesNotMatch(body, /private\.can_manage_field_data\(\)/i);
  }
});

test("recovery, guidance and deployed marker include assignment-bound receipt replay", () => {
  const confidentiality = recovery.indexOf("20260813230319_protect_field_job_confidentiality.sql");
  const boundary = recovery.indexOf(migrationName);
  const replayBoundary = recovery.indexOf(replayMigrationName);
  assert.ok(confidentiality >= 0 && boundary > confidentiality && replayBoundary > boundary);
  assert.match(recovery.slice(replayBoundary - 120, replayBoundary + replayMigrationName.length + 50), /begin;[\s\S]*\\ir[\s\S]*commit;/i);
  assert.match(setup, /job-status, generic field-collection and progress receipt replays revalidate the current active job assignment/i);
  assert.ok(replayMigration.includes(`'migration',\n    '${replayMigrationName}'`));
});
