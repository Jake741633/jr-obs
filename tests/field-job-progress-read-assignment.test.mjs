import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { collectionCloudMutationRoute } from "../lib/cloud/fieldMutationPolicy-core.mjs";
import {
  ELECTRICIAN_JOB_PROGRESS_CACHE_GENERATION,
  roleProjectionCacheGeneration,
  roleProjectionCachePolicy,
} from "../lib/cloud/roleProjectionCache-core.mjs";

const migrationName = "20260826104958_scope_field_job_progress_reads_to_assignments.sql";
const migration = readFileSync(new URL(`../supabase/migrations/${migrationName}`, import.meta.url), "utf8");
const recovery = readFileSync(new URL("../supabase/recovery/after_schema_only.sql", import.meta.url), "utf8");
const setup = readFileSync(new URL("../docs/SUPABASE_SETUP.md", import.meta.url), "utf8");
const collections = readFileSync(new URL("../lib/cloud/collections.ts", import.meta.url), "utf8");
const cache = readFileSync(new URL("../lib/cloud/roleProjectionCache-core.mjs", import.meta.url), "utf8");
const cacheTypes = readFileSync(new URL("../lib/cloud/roleProjectionCache-core.d.mts", import.meta.url), "utf8");
const adapter = readFileSync(new URL("../lib/cloud/adapter.ts", import.meta.url), "utf8");
const runner = readFileSync(new URL("./run-supabase-rls.integration.mjs", import.meta.url), "utf8");

function section(startText, endText) {
  const start = migration.indexOf(startText);
  assert.ok(start >= 0, `Missing section start: ${startText}`);
  const end = migration.indexOf(endText, start);
  assert.ok(end > start, `Missing section end: ${endText}`);
  return migration.slice(start, end);
}

test("electrician progress reads resolve through an active canonical job assignment", () => {
  const helper = section(
    "create or replace function private.jr_field_progress_targets_assigned_job",
    "revoke execute on function private.jr_field_progress_targets_assigned_job",
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
    /revoke execute on function private\.jr_field_progress_targets_assigned_job\(uuid, text, text\)[\s\S]*from public, anon, authenticated, service_role/i,
  );
  assert.match(
    migration,
    /grant execute on function private\.jr_field_progress_targets_assigned_job\(uuid, text, text\)[\s\S]*to authenticated, service_role/i,
  );
});

test("the final field collection policy scopes progress without weakening prior assignment branches", () => {
  const policy = section(
    "create policy field_cloud_collections_electrician_select",
    "create or replace function public.jr_os_deployed_migration",
  );

  assert.match(policy, /deleted_at is null/i);
  assert.match(policy, /organisation_id = private\.current_organisation_id\(\)/i);
  assert.match(policy, /private\.current_jr_role\(\) = 'electrician'/i);
  assert.match(policy, /private\.jr_electrician_collection_is_readable\(collection_key\)/i);
  assert.match(
    policy,
    /when 'jr-os-job-progress' then private\.jr_field_progress_targets_assigned_job\(\s*organisation_id,\s*customer_source_id,\s*job_source_id\s*\)/i,
  );
  for (const retained of [
    /when 'jr-os-surveys' then private\.jr_field_record_targets_assigned_job/i,
    /when 'jr-os-job-variations' then private\.jr_field_variation_targets_assigned_job/i,
    /when 'jr-os-job-timeline' then private\.jr_field_timeline_targets_assigned_job/i,
    /when 'jr-os-site-diaries' then private\.jr_field_site_diary_targets_assigned_job/i,
    /when 'jr-os-site-diary' then private\.jr_field_site_diary_targets_assigned_job/i,
  ]) assert.match(policy, retained);
  assert.match(policy, /else true[\s\S]*end/i);
  assert.match(collections, /electrician:[\s\S]*cloud_collections: "field_cloud_collections"/i);
});

test("stale tenant-wide electrician progress caches purge before offline fallback", () => {
  assert.equal(ELECTRICIAN_JOB_PROGRESS_CACHE_GENERATION, "20260826144606");
  assert.equal(
    roleProjectionCacheGeneration({ storageKey: "jr-os-job-progress", role: "electrician" }),
    ELECTRICIAN_JOB_PROGRESS_CACHE_GENERATION,
  );
  assert.equal(
    roleProjectionCachePolicy({
      storageKey: "jr-os-job-progress",
      role: "electrician",
      mode: "cloud",
      generation: "20260814",
    }),
    "purge",
  );
  assert.equal(
    roleProjectionCachePolicy({
      storageKey: "jr-os-job-progress",
      role: "electrician",
      mode: "cloud",
      generation: ELECTRICIAN_JOB_PROGRESS_CACHE_GENERATION,
    }),
    "keep",
  );
  assert.match(cache, /ELECTRICIAN_JOB_PROGRESS_CACHE_GENERATION = "20260826144606"/);
  assert.match(
    cache,
    /role === "electrician" && storageKey === "jr-os-job-progress"[\s\S]*return ELECTRICIAN_JOB_PROGRESS_CACHE_GENERATION/,
  );
  assert.match(cache, /expectedGeneration && generation !== expectedGeneration[\s\S]*return "purge"/);
  assert.match(cacheTypes, /ELECTRICIAN_JOB_PROGRESS_CACHE_GENERATION: "20260826144606"/);
  assert.match(adapter, /roleProjectionCachePolicy\(\{ storageKey, role: cacheRole, mode, generation: cachedGeneration \}\)/);
  assert.match(adapter, /if \(mode === "local" \|\| !navigator\.onLine\) return local/);
  assert.match(adapter, /roleProjectionCacheGeneration\(\{ storageKey, role: cacheRole \}\)/);
});

test("progress writes retain the dedicated assigned-job RPC contract", () => {
  assert.deepEqual(
    collectionCloudMutationRoute("cloud_collections", "electrician", "jr-os-job-progress"),
    {
      kind: "rpc",
      functionName: "jr_field_save_job_progress",
      resource: "cloud_collections",
      allowedIntents: ["create", "update"],
    },
  );
});

test("live RLS coverage retains assigned progress and rejects wider field reads", () => {
  for (const phrase of [
    "Assigned electrician should retain null-customer job progress",
    "Co-assigned electrician should retain assigned job progress",
    "Electrician must not read unassigned same-tenant job progress",
    "Assigned electrician must not read another organisation's job progress",
    "Electrician must not read progress without a canonical job",
    "Electrician without an active field identity must not read job progress",
    "Office should retain unassigned job progress access",
    "Electrician should read job progress while the job is active and assigned",
    "Electrician must not read job progress for a soft-deleted job",
    "Office should retain canonical job progress after job deletion",
  ]) assert.match(runner, new RegExp(phrase.replaceAll(" ", "\\s+"), "i"));
});

test("recovery, guidance and deployment marker retain progress assignment scoping", () => {
  const variationScope = recovery.indexOf("20260826101908_scope_field_variation_reads_to_assignments.sql");
  const progressScope = recovery.indexOf(migrationName);
  assert.ok(variationScope >= 0 && progressScope > variationScope);
  assert.match(recovery.slice(progressScope - 120, progressScope + migrationName.length + 50), /begin;[\s\S]*\\ir[\s\S]*commit;/i);
  assert.match(setup, /job progress is assignment-scoped/i);
  assert.match(migration, new RegExp(`'${migrationName.replaceAll(".", "\\.")}'`));
});
