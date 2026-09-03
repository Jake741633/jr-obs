import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationName = "20260820143000_scope_field_job_reads_to_assignments.sql";
const migration = readFileSync(new URL(`../supabase/migrations/${migrationName}`, import.meta.url), "utf8");
const recovery = readFileSync(new URL("../supabase/recovery/after_schema_only.sql", import.meta.url), "utf8");
const setup = readFileSync(new URL("../docs/SUPABASE_SETUP.md", import.meta.url), "utf8");
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

test("electrician field job reads require the canonical assigned job", () => {
  const policy = section(
    "create policy field_jobs_electrician_select",
    "create or replace function public.jr_os_deployed_migration",
  );
  assert.match(policy, /deleted_at is null/i);
  assert.match(policy, /organisation_id = private\.current_organisation_id\(\)/i);
  assert.match(policy, /private\.current_jr_role\(\) = 'electrician'/i);
  assert.match(
    policy,
    /private\.jr_field_record_targets_assigned_job\(\s*organisation_id,\s*customer_source_id,\s*source_id\s*\)/i,
  );
  assert.doesNotMatch(policy, /jr_field_record_targets_assigned_job\([\s\S]*job_source_id/i);
});

test("stale electrician job projection caches purge before offline fallback", () => {
  assert.match(cache, /ELECTRICIAN_JOB_PROJECTION_CACHE_GENERATION = "20260820143000"/);
  assert.match(
    cache,
    /role === "electrician" && storageKey === "jr-os-jobs"[\s\S]*return ELECTRICIAN_JOB_PROJECTION_CACHE_GENERATION/,
  );
  assert.match(cache, /expectedGeneration && generation !== expectedGeneration[\s\S]*return "purge"/);
  assert.match(cacheTypes, /ELECTRICIAN_JOB_PROJECTION_CACHE_GENERATION: "20260820143000"/);
  assert.match(adapter, /roleProjectionCachePolicy\(\{ storageKey, role: cacheRole, mode, generation: cachedGeneration \}\)/);
  assert.match(adapter, /if \(mode === "local" \|\| !navigator\.onLine\) return local/);
  assert.match(adapter, /roleProjectionCacheGeneration\(\{ storageKey, role: cacheRole \}\)/);
});

test("live RLS coverage retains assigned, co-assigned and denied field jobs", () => {
  for (const phrase of [
    "Electrician should retain field-safe job reads",
    "Co-assigned electrician should retain the assigned job",
    "Electrician must not read an unassigned same-tenant job",
    "Another organisation must not read the assigned field job",
  ]) assert.match(runner, new RegExp(phrase.replaceAll(" ", "\\s+"), "i"));
});

test("recovery, guidance and deployment marker retain field job assignment scoping", () => {
  const surveyScope = recovery.indexOf("20260820130000_scope_field_survey_reads_to_assignments.sql");
  const jobScope = recovery.indexOf(migrationName);
  assert.ok(surveyScope >= 0 && jobScope > surveyScope);
  assert.match(recovery.slice(jobScope - 100, jobScope + migrationName.length + 50), /begin;[\s\S]*\\ir[\s\S]*commit;/i);
  assert.match(setup, /electricians receive only jobs assigned to their active field identity/i);
  assert.match(migration, new RegExp(`'${migrationName.replaceAll(".", "\\.")}'`));
});
