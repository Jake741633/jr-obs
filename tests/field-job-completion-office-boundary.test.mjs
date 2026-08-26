import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { collectionCloudMutationRoute } from "../lib/cloud/fieldMutationPolicy-core.mjs";
import {
  ELECTRICIAN_JOB_COMPLETION_CACHE_GENERATION,
  roleProjectionCacheGeneration,
  roleProjectionCachePolicy,
} from "../lib/cloud/roleProjectionCache-core.mjs";

const migrationName = "20260826121246_keep_field_completion_records_office_only.sql";
const migration = readFileSync(new URL(`../supabase/migrations/${migrationName}`, import.meta.url), "utf8");
const priorPolicy = readFileSync(new URL("../supabase/migrations/20260826120037_scope_field_job_qa_reads_to_assignments.sql", import.meta.url), "utf8");
const recovery = readFileSync(new URL("../supabase/recovery/after_schema_only.sql", import.meta.url), "utf8");
const setup = readFileSync(new URL("../docs/SUPABASE_SETUP.md", import.meta.url), "utf8");
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

test("canonical completion evidence is absent from the electrician-readable allowlist", () => {
  const allowlist = section(
    migration,
    "create or replace function private.jr_electrician_collection_is_readable",
    "revoke execute on function private.jr_electrician_collection_is_readable",
  );

  assert.match(allowlist, /language sql[\s\S]*immutable[\s\S]*set search_path = ''/i);
  assert.doesNotMatch(allowlist, /jr-os-job-completion/i);
  for (const retained of [
    "jr-os-surveys",
    "jr-os-rams",
    "jr-os-job-packs",
    "jr-os-job-variations",
    "jr-os-job-timeline",
    "jr-os-site-diaries",
    "jr-os-site-diary",
    "jr-os-job-tasks",
    "jr-os-job-progress",
    "jr-os-job-material-usage",
    "jr-os-job-qa-inspections",
    "jr-os-stock-locations",
    "jr-os-fleet",
    "jr-os-certificate-defaults",
  ]) assert.match(allowlist, new RegExp(`'${retained}'`));
  assert.match(
    migration,
    /revoke execute on function private\.jr_electrician_collection_is_readable\(text\)[\s\S]*from public, anon/i,
  );
  assert.match(
    migration,
    /grant execute on function private\.jr_electrician_collection_is_readable\(text\)[\s\S]*to authenticated, service_role/i,
  );
  assert.match(
    priorPolicy,
    /private\.jr_electrician_collection_is_readable\(collection_key\)[\s\S]*case collection_key/i,
  );
});

test("stale electrician completion caches purge before offline fallback", () => {
  assert.equal(ELECTRICIAN_JOB_COMPLETION_CACHE_GENERATION, "20260826121246");
  assert.equal(
    roleProjectionCacheGeneration({ storageKey: "jr-os-job-completion", role: "electrician" }),
    ELECTRICIAN_JOB_COMPLETION_CACHE_GENERATION,
  );
  assert.equal(
    roleProjectionCachePolicy({
      storageKey: "jr-os-job-completion",
      role: "electrician",
      mode: "cloud",
      generation: "20260809",
    }),
    "purge",
  );
  assert.equal(
    roleProjectionCachePolicy({
      storageKey: "jr-os-job-completion",
      role: "electrician",
      mode: "cloud",
      generation: ELECTRICIAN_JOB_COMPLETION_CACHE_GENERATION,
    }),
    "keep",
  );
  assert.equal(
    roleProjectionCachePolicy({
      storageKey: "jr-os-job-completion",
      role: "electrician",
      mode: "cloud",
    }),
    "purge",
  );
  assert.equal(
    roleProjectionCachePolicy({
      storageKey: "jr-os-job-completion",
      role: "electrician",
      mode: "local",
    }),
    "keep",
  );
  assert.match(cache, /ELECTRICIAN_JOB_COMPLETION_CACHE_GENERATION = "20260826121246"/);
  assert.match(
    cache,
    /role === "electrician" && storageKey === "jr-os-job-completion"[\s\S]*return ELECTRICIAN_JOB_COMPLETION_CACHE_GENERATION/,
  );
  assert.match(cache, /expectedGeneration && generation !== expectedGeneration[\s\S]*return "purge"/);
  assert.match(cacheTypes, /ELECTRICIAN_JOB_COMPLETION_CACHE_GENERATION: "20260826121246"/);
  assert.match(adapter, /roleProjectionCachePolicy\(\{ storageKey, role: cacheRole, mode, generation: cachedGeneration \}\)/);
  assert.match(adapter, /if \(mode === "local" \|\| !navigator\.onLine\) return local/);
  assert.match(adapter, /roleProjectionCacheGeneration\(\{ storageKey, role: cacheRole \}\)/);
});

test("completion writes remain default-denied for cloud electricians", () => {
  assert.deepEqual(
    collectionCloudMutationRoute("cloud_collections", "electrician", "jr-os-job-completion"),
    { kind: "deny" },
  );
  assert.deepEqual(
    collectionCloudMutationRoute("cloud_collections", "admin", "jr-os-job-completion"),
    { kind: "direct" },
  );
});

test("live RLS coverage denies completion evidence across every field relationship", () => {
  for (const phrase of [
    "Assigned electrician must not read canonical job completion evidence",
    "Co-assigned electrician must not read canonical job completion evidence",
    "Electrician must not read unassigned same-tenant job completion evidence",
    "Electrician must not read another organisation's job completion evidence",
    "Electrician must not read unbound job completion evidence",
    "Mismatched customer completion envelopes must fail at canonical binding validation",
    "Wrong customer completion envelope must remain field-inaccessible",
    "Electrician without an active field identity must not read job completion evidence",
    "Office should retain assigned job completion evidence",
    "Office should retain unassigned job completion evidence",
    "Field completion projection must not expose customer sign-off or invoice linkage",
    "Electrician must not read completion evidence before or after job deletion",
    "Office should retain canonical job completion evidence after job deletion",
    "Electrician direct completion writes must fail closed",
  ]) assert.match(runner, new RegExp(phrase.replaceAll(" ", "\\s+"), "i"));
});

test("recovery, guidance and deployment marker keep completion evidence office-only", () => {
  const qaScope = recovery.indexOf("20260826120037_scope_field_job_qa_reads_to_assignments.sql");
  const completionBoundary = recovery.indexOf(migrationName);
  assert.ok(qaScope >= 0 && completionBoundary > qaScope);
  assert.match(
    recovery.slice(completionBoundary - 120, completionBoundary + migrationName.length + 50),
    /begin;[\s\S]*\\ir[\s\S]*commit;/i,
  );
  assert.match(setup, /canonical completion records, customer sign-offs and final-invoice links remain office-only/i);
  assert.match(migration, new RegExp(`'${migrationName.replaceAll(".", "\\.")}'`));
});
