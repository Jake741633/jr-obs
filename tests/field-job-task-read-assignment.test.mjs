import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { collectionCloudMutationRoute } from "../lib/cloud/fieldMutationPolicy-core.mjs";
import {
  ELECTRICIAN_JOB_TASK_CACHE_GENERATION,
  roleProjectionCacheGeneration,
  roleProjectionCachePolicy,
} from "../lib/cloud/roleProjectionCache-core.mjs";

const migrationName = "20260826114300_scope_field_job_task_reads_to_assignments.sql";
const migration = readFileSync(new URL(`../supabase/migrations/${migrationName}`, import.meta.url), "utf8");
const fieldMutationBoundary = readFileSync(new URL("../supabase/migrations/20260813235633_secure_field_mutation_boundary.sql", import.meta.url), "utf8");
const recovery = readFileSync(new URL("../supabase/recovery/after_schema_only.sql", import.meta.url), "utf8");
const setup = readFileSync(new URL("../docs/SUPABASE_SETUP.md", import.meta.url), "utf8");
const collections = readFileSync(new URL("../lib/cloud/collections.ts", import.meta.url), "utf8");
const cache = readFileSync(new URL("../lib/cloud/roleProjectionCache-core.mjs", import.meta.url), "utf8");
const cacheTypes = readFileSync(new URL("../lib/cloud/roleProjectionCache-core.d.mts", import.meta.url), "utf8");
const adapter = readFileSync(new URL("../lib/cloud/adapter.ts", import.meta.url), "utf8");
const runner = readFileSync(new URL("./run-supabase-rls.integration.mjs", import.meta.url), "utf8");

function section(source, startText, endText) {
  const start = source.indexOf(startText);
  assert.ok(start >= 0, `Missing section start: ${startText}`);
  const end = source.indexOf(endText, start);
  assert.ok(end > start, `Missing section end: ${endText}`);
  return source.slice(start, end);
}

test("electrician task reads resolve through an active canonical job assignment", () => {
  const helper = section(
    migration,
    "create or replace function private.jr_field_task_targets_assigned_job",
    "revoke execute on function private.jr_field_task_targets_assigned_job",
  );

  assert.match(helper, /language sql[\s\S]*stable[\s\S]*security definer[\s\S]*set search_path = ''/i);
  assert.match(helper, /\(select auth\.uid\(\)\) is not null/i);
  assert.match(helper, /record_organisation_id = private\.current_organisation_id\(\)/i);
  assert.match(helper, /record_job_source_id is not null/i);
  assert.match(helper, /from private\.jr_active_field_identity\(\) field_identity/i);
  assert.match(helper, /join public\.jobs job[\s\S]*job\.source_id = record_job_source_id/i);
  assert.match(helper, /field_identity\.organisation_id = record_organisation_id/i);
  assert.match(helper, /job\.deleted_at is null/i);
  assert.match(
    helper,
    /record_customer_source_id is null[\s\S]*or job\.customer_source_id is not distinct from record_customer_source_id/i,
  );
  assert.match(
    helper,
    /private\.jr_job_is_assigned_to_team_member\(\s*job\.payload,\s*field_identity\.team_member_source_id\s*\)/i,
  );
  assert.match(
    migration,
    /revoke execute on function private\.jr_field_task_targets_assigned_job\(uuid, text, text\)[\s\S]*from public, anon, authenticated, service_role/i,
  );
  assert.match(
    migration,
    /grant execute on function private\.jr_field_task_targets_assigned_job\(uuid, text, text\)[\s\S]*to authenticated, service_role/i,
  );
});

test("the final field collection policy scopes tasks without weakening prior assignment branches", () => {
  const policy = section(
    migration,
    "create policy field_cloud_collections_electrician_select",
    "create or replace function public.jr_os_deployed_migration",
  );

  assert.match(policy, /deleted_at is null/i);
  assert.match(policy, /organisation_id = private\.current_organisation_id\(\)/i);
  assert.match(policy, /private\.current_jr_role\(\) = 'electrician'/i);
  assert.match(policy, /private\.jr_electrician_collection_is_readable\(collection_key\)/i);
  assert.match(
    policy,
    /when 'jr-os-job-tasks' then private\.jr_field_task_targets_assigned_job\(\s*organisation_id,\s*customer_source_id,\s*job_source_id\s*\)/i,
  );
  for (const retained of [
    /when 'jr-os-surveys' then private\.jr_field_record_targets_assigned_job/i,
    /when 'jr-os-job-variations' then private\.jr_field_variation_targets_assigned_job/i,
    /when 'jr-os-job-progress' then private\.jr_field_progress_targets_assigned_job/i,
    /when 'jr-os-job-material-usage' then private\.jr_field_material_usage_targets_assigned_job/i,
    /when 'jr-os-job-timeline' then private\.jr_field_timeline_targets_assigned_job/i,
    /when 'jr-os-site-diaries' then private\.jr_field_site_diary_targets_assigned_job/i,
    /when 'jr-os-site-diary' then private\.jr_field_site_diary_targets_assigned_job/i,
  ]) assert.match(policy, retained);
  assert.match(policy, /else true[\s\S]*end/i);
  assert.match(collections, /electrician:[\s\S]*cloud_collections: "field_cloud_collections"/i);
});

test("stale tenant-wide electrician task caches purge before offline fallback", () => {
  assert.equal(ELECTRICIAN_JOB_TASK_CACHE_GENERATION, "20260826114300");
  assert.equal(
    roleProjectionCacheGeneration({ storageKey: "jr-os-job-tasks", role: "electrician" }),
    ELECTRICIAN_JOB_TASK_CACHE_GENERATION,
  );
  assert.equal(
    roleProjectionCachePolicy({
      storageKey: "jr-os-job-tasks",
      role: "electrician",
      mode: "cloud",
      generation: "20260809",
    }),
    "purge",
  );
  assert.equal(
    roleProjectionCachePolicy({
      storageKey: "jr-os-job-tasks",
      role: "electrician",
      mode: "cloud",
      generation: ELECTRICIAN_JOB_TASK_CACHE_GENERATION,
    }),
    "keep",
  );
  assert.equal(
    roleProjectionCachePolicy({
      storageKey: "jr-os-job-tasks",
      role: "electrician",
      mode: "cloud",
    }),
    "purge",
  );
  assert.equal(
    roleProjectionCachePolicy({
      storageKey: "jr-os-job-tasks",
      role: "electrician",
      mode: "local",
    }),
    "keep",
  );
  assert.match(cache, /ELECTRICIAN_JOB_TASK_CACHE_GENERATION = "20260826114300"/);
  assert.match(
    cache,
    /role === "electrician" && storageKey === "jr-os-job-tasks"[\s\S]*return ELECTRICIAN_JOB_TASK_CACHE_GENERATION/,
  );
  assert.match(cache, /expectedGeneration && generation !== expectedGeneration[\s\S]*return "purge"/);
  assert.match(cacheTypes, /ELECTRICIAN_JOB_TASK_CACHE_GENERATION: "20260826114300"/);
  assert.match(adapter, /roleProjectionCachePolicy\(\{ storageKey, role: cacheRole, mode, generation: cachedGeneration \}\)/);
  assert.match(adapter, /if \(mode === "local" \|\| !navigator\.onLine\) return local/);
  assert.match(adapter, /roleProjectionCacheGeneration\(\{ storageKey, role: cacheRole \}\)/);
});

test("task writes retain the narrow assigned-job mutation RPC", () => {
  const rpc = section(
    fieldMutationBoundary,
    "create or replace function public.jr_field_save_collection",
    "revoke execute on function public.jr_field_save_collection",
  );
  const writeProjection = section(
    fieldMutationBoundary,
    "create or replace function private.jr_field_collection_write_payload",
    "revoke execute on function private.jr_field_collection_write_payload",
  );

  assert.deepEqual(
    collectionCloudMutationRoute("cloud_collections", "electrician", "jr-os-job-tasks"),
    {
      kind: "rpc",
      functionName: "jr_field_save_collection",
      resource: "cloud_collections",
      allowedIntents: ["create", "update"],
    },
  );
  assert.match(rpc, /private\.jr_active_field_identity\(\)/i);
  assert.match(rpc, /private\.jr_lock_active_field_identity\(/i);
  assert.match(rpc, /private\.jr_job_is_assigned_to_team_member\(/i);
  assert.match(rpc, /collection_key_value = 'jr-os-job-tasks'[\s\S]*canonical_record\.customer_source_id is not null/i);
  assert.match(rpc, /Only the assigned electrician may update this task/i);
  assert.match(rpc, /canonical_task_status = 'Open'[\s\S]*canonical_task_status = 'In progress'/i);
  assert.match(writeProjection, /when 'jr-os-job-tasks' then[\s\S]*'assignedTo', pg_catalog\.to_jsonb\(team_member_source_id\)[\s\S]*'photos', '\[\]'::jsonb/i);
  assert.match(rpc, /safe_payload := canonical_record\.payload \|\| pg_catalog\.jsonb_build_object\([\s\S]*'status', requested_task_status/i);
});

test("live RLS coverage retains assigned tasks and rejects wider field reads", () => {
  for (const phrase of [
    "Assigned electrician should retain a server-bound field-created task",
    "Field-created task must retain its server-bound customer",
    "Assigned electrician should retain production-shaped null-customer job tasks",
    "Co-assigned electrician should retain assigned job task details",
    "Electrician must not read unassigned same-tenant job tasks",
    "Assigned electrician must not read another organisation's job tasks",
    "Electrician must not read task without a canonical job",
    "Wrong customer task envelope must fail closed",
    "Electrician without an active field identity must not read job tasks",
    "Office should retain unassigned job task access",
    "Assigned task projection should retain operational notes and attachments",
    "Electrician should read job tasks while the job is active and assigned",
    "Electrician must not read job tasks for a soft-deleted job",
    "Office should retain canonical job tasks after job deletion",
  ]) assert.match(runner, new RegExp(phrase.replaceAll(" ", "\\s+"), "i"));
});

test("recovery, guidance and deployment marker retain task assignment scoping", () => {
  const updateEnvelope = recovery.indexOf("20260826112805_align_field_progress_update_customer_envelopes.sql");
  const taskScope = recovery.indexOf(migrationName);
  assert.ok(updateEnvelope >= 0 && taskScope > updateEnvelope);
  assert.match(
    recovery.slice(taskScope - 110, taskScope + migrationName.length + 50),
    /begin;[\s\S]*\\ir[\s\S]*commit;/i,
  );
  assert.match(setup, /job tasks and their operational notes and attachments are assignment-scoped/i);
  assert.match(migration, new RegExp(`'${migrationName.replaceAll(".", "\\.")}'`));
});
