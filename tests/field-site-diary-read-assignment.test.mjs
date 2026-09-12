import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationName = "20260820163000_scope_field_site_diary_reads_to_assignments.sql";
const migration = readFileSync(new URL(`../supabase/migrations/${migrationName}`, import.meta.url), "utf8");
const recovery = readFileSync(new URL("../supabase/recovery/after_schema_only.sql", import.meta.url), "utf8");
const setup = readFileSync(new URL("../docs/SUPABASE_SETUP.md", import.meta.url), "utf8");
const collections = readFileSync(new URL("../lib/cloud/collections.ts", import.meta.url), "utf8");
const coreCollections = readFileSync(new URL("../lib/cloud/coreBusinessCollections.ts", import.meta.url), "utf8");
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

test("electrician site-diary reads resolve through an active canonical job assignment", () => {
  const helper = section(
    "create or replace function private.jr_field_site_diary_targets_assigned_job",
    "revoke execute on function private.jr_field_site_diary_targets_assigned_job",
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
    /revoke execute on function private\.jr_field_site_diary_targets_assigned_job\(uuid, text, text\)[\s\S]*from public, anon, authenticated, service_role/i,
  );
  assert.match(
    migration,
    /grant execute on function private\.jr_field_site_diary_targets_assigned_job\(uuid, text, text\)[\s\S]*to authenticated, service_role/i,
  );
});

test("the final field collection policy scopes both site-diary aliases without weakening prior branches", () => {
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
  for (const key of ["jr-os-site-diaries", "jr-os-site-diary"]) {
    assert.match(
      policy,
      new RegExp(`when '${key}' then private\\.jr_field_site_diary_targets_assigned_job\\(\\s*organisation_id,\\s*customer_source_id,\\s*job_source_id\\s*\\)`, "i"),
    );
  }
  assert.match(policy, /else true[\s\S]*end/i);
  assert.match(collections, /electrician:[\s\S]*cloud_collections: "field_cloud_collections"/i);
});

test("both diary aliases purge stale tenant-wide electrician caches before offline fallback", () => {
  assert.match(coreCollections, /siteDiaries: "jr-os-site-diaries"/);
  assert.match(coreCollections, /legacySiteDiaries: "jr-os-site-diary"/);
  assert.match(cache, /ELECTRICIAN_SITE_DIARY_CACHE_GENERATION = "20260820163000"/);
  assert.match(
    cache,
    /role === "electrician" && \(storageKey === "jr-os-site-diaries" \|\| storageKey === "jr-os-site-diary"\)[\s\S]*return ELECTRICIAN_SITE_DIARY_CACHE_GENERATION/,
  );
  assert.match(cache, /expectedGeneration && generation !== expectedGeneration[\s\S]*return "purge"/);
  assert.match(cacheTypes, /ELECTRICIAN_SITE_DIARY_CACHE_GENERATION: "20260820163000"/);
  assert.match(adapter, /roleProjectionCachePolicy\(\{ storageKey, role: cacheRole, mode, generation: cachedGeneration \}\)/);
  assert.match(adapter, /if \(mode === "local" \|\| !navigator\.onLine\) return local/);
  assert.match(adapter, /roleProjectionCacheGeneration\(\{ storageKey, role: cacheRole \}\)/);
});

test("live RLS coverage retains assigned diary history and denies broader field reads for both aliases", () => {
  for (const phrase of [
    "Assigned electrician should retain a null-customer current site diary",
    "Co-assigned electrician should retain a null-customer current site diary",
    "Electrician must not read an unassigned current site diary",
    "Assigned electrician must not read another organisation's current site diary",
    "Assigned electrician should retain a null-customer legacy site diary",
    "Co-assigned electrician should retain a null-customer legacy site diary",
    "Electrician must not read an unassigned legacy site diary",
    "Assigned electrician must not read another organisation's legacy site diary",
    "Electrician must not read a diary without a canonical job",
    "Electrician should read current and legacy diaries while the job is active and assigned",
    "Electrician must not read current or legacy diaries for a soft-deleted job",
    "Office should retain canonical current and legacy site diaries after job deletion",
    "Electrician should read the canonical diary created through the field RPC",
  ]) assert.match(runner, new RegExp(phrase.replaceAll(" ", "\\s+"), "i"));
});

test("recovery, guidance and deployment marker retain site-diary assignment scoping", () => {
  const timelineScope = recovery.indexOf("20260820160000_scope_field_timeline_reads_to_assignments.sql");
  const diaryScope = recovery.indexOf(migrationName);
  assert.ok(timelineScope >= 0 && diaryScope > timelineScope);
  assert.match(recovery.slice(diaryScope - 120, diaryScope + migrationName.length + 50), /begin;[\s\S]*\\ir[\s\S]*commit;/i);
  assert.match(setup, /current and legacy site diaries are assignment-scoped too/i);
  assert.match(migration, new RegExp(`'${migrationName.replaceAll(".", "\\.")}'`));
});
