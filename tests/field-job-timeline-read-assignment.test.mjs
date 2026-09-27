import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationName = "20260820160000_scope_field_timeline_reads_to_assignments.sql";
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

test("electrician timeline reads resolve through an active canonical job assignment", () => {
  const helper = section(
    "create or replace function private.jr_field_timeline_targets_assigned_job",
    "revoke execute on function private.jr_field_timeline_targets_assigned_job",
  );

  assert.match(helper, /language sql[\s\S]*stable[\s\S]*security definer[\s\S]*set search_path = ''/i);
  assert.match(helper, /record_organisation_id = private\.current_organisation_id\(\)/i);
  assert.match(helper, /record_job_source_id is not null/i);
  assert.match(helper, /from private\.jr_active_field_identity\(\) field_identity/i);
  assert.match(helper, /join public\.jobs job[\s\S]*job\.organisation_id = field_identity\.organisation_id/i);
  assert.match(helper, /job\.source_id = record_job_source_id/i);
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
    /revoke execute on function private\.jr_field_timeline_targets_assigned_job\(uuid, text, text\)[\s\S]*from public, anon, authenticated, service_role/i,
  );
  assert.match(
    migration,
    /grant execute on function private\.jr_field_timeline_targets_assigned_job\(uuid, text, text\)[\s\S]*to authenticated, service_role/i,
  );
});

test("the final field collection policy scopes surveys and timeline rows independently", () => {
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
    /when 'jr-os-surveys' then private\.jr_field_record_targets_assigned_job\(\s*organisation_id,\s*customer_source_id,\s*job_source_id\s*\)/i,
  );
  assert.match(
    policy,
    /when 'jr-os-job-timeline' then private\.jr_field_timeline_targets_assigned_job\(\s*organisation_id,\s*customer_source_id,\s*job_source_id\s*\)/i,
  );
  assert.match(policy, /else true[\s\S]*end/i);
  assert.match(collections, /electrician:[\s\S]*cloud_collections: "field_cloud_collections"/i);
});

test("stale tenant-wide electrician timeline caches purge before offline fallback", () => {
  assert.match(cache, /ELECTRICIAN_JOB_TIMELINE_CACHE_GENERATION = "20260826123514"/);
  assert.match(
    cache,
    /role === "electrician" && storageKey === "jr-os-job-timeline"[\s\S]*return ELECTRICIAN_JOB_TIMELINE_CACHE_GENERATION/,
  );
  assert.match(cache, /expectedGeneration && generation !== expectedGeneration[\s\S]*return "purge"/);
  assert.match(cacheTypes, /ELECTRICIAN_JOB_TIMELINE_CACHE_GENERATION: "20260826123514"/);
  assert.match(adapter, /roleProjectionCachePolicy\(\{ storageKey, role: cacheRole, mode, generation: cachedGeneration \}\)/);
  assert.match(adapter, /if \(mode === "local" \|\| !navigator\.onLine\) return local/);
  assert.match(adapter, /roleProjectionCacheGeneration\(\{ storageKey, role: cacheRole \}\)/);
});

test("live RLS coverage retains assigned timeline rows and denies broader field reads", () => {
  for (const phrase of [
    "Assigned electrician should retain production-shaped null-customer timeline activity",
    "Co-assigned electrician should retain assigned job timeline activity",
    "Electrician must not read unassigned same-tenant timeline activity",
    "Another organisation must not read the field timeline projection",
    "Office should retain unassigned timeline activity",
    "Electrician should read timeline activity while the job is active and assigned",
    "Electrician must not read timeline activity for a soft-deleted job",
    "Office should retain canonical timeline activity after job deletion",
  ]) assert.match(runner, new RegExp(phrase.replaceAll(" ", "\\s+"), "i"));
});

test("recovery, guidance and deployment marker retain timeline assignment scoping", () => {
  const documentScope = recovery.indexOf("20260820153000_scope_field_job_document_reads_to_assignments.sql");
  const timelineScope = recovery.indexOf(migrationName);
  assert.ok(documentScope >= 0 && timelineScope > documentScope);
  assert.match(recovery.slice(timelineScope - 100, timelineScope + migrationName.length + 50), /begin;[\s\S]*\\ir[\s\S]*commit;/i);
  assert.match(setup, /surveys and their private photos are limited to assigned jobs/i);
  assert.match(
    setup,
    /timeline activity is assignment-scoped while invoice, payment and deposit finance activity remains office-only/i,
  );
  assert.match(migration, new RegExp(`'${migrationName.replaceAll(".", "\\.")}'`));
});
