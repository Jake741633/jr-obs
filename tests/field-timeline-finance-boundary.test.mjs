import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { collectionCloudMutationRoute } from "../lib/cloud/fieldMutationPolicy-core.mjs";
import {
  ELECTRICIAN_JOB_TIMELINE_CACHE_GENERATION,
  roleProjectionCacheGeneration,
  roleProjectionCachePolicy,
  sanitizeRoleProjectionCache,
} from "../lib/cloud/roleProjectionCache-core.mjs";

const migrationName = "20260826123514_hide_field_finance_timeline_activity.sql";
const migration = readFileSync(new URL(`../supabase/migrations/${migrationName}`, import.meta.url), "utf8");
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

test("field timeline finance classification is exact, normalized and independent of note text", () => {
  const helper = section(
    migration,
    "create or replace function private.jr_field_timeline_is_financial",
    "revoke execute on function private.jr_field_timeline_is_financial",
  );

  assert.match(helper, /language sql[\s\S]*immutable[\s\S]*parallel safe[\s\S]*security invoker[\s\S]*set search_path = ''/i);
  assert.match(helper, /lower\(pg_catalog\.btrim\(coalesce\(record_payload ->> 'eventType', ''\)\)\) = 'financial'/i);
  assert.match(helper, /lower\(pg_catalog\.btrim\(coalesce\(record_payload ->> 'sourceType', ''\)\)\) = 'invoice'/i);
  for (const milestone of ["deposit received", "invoice created", "invoice sent", "payment received"]) {
    assert.match(helper, new RegExp(`'${milestone}'`, "i"));
  }
  assert.doesNotMatch(helper, /record_payload ->> 'note'/i);
  assert.doesNotMatch(helper, /sourceType'[\s\S]*= 'payment'/i);
  assert.match(
    migration,
    /revoke execute on function private\.jr_field_timeline_is_financial\(jsonb\)[\s\S]*from public, anon, authenticated, service_role/i,
  );
  assert.match(
    migration,
    /grant execute on function private\.jr_field_timeline_is_financial\(jsonb\)[\s\S]*to authenticated, service_role/i,
  );
});

test("final RLS keeps assignment binding and removes only classified finance timeline rows", () => {
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
    /when 'jr-os-job-timeline' then[\s\S]*private\.jr_field_timeline_targets_assigned_job\([\s\S]*organisation_id,[\s\S]*customer_source_id,[\s\S]*job_source_id[\s\S]*\)[\s\S]*and not private\.jr_field_timeline_is_financial\(payload\)/i,
  );
  for (const retained of [
    /when 'jr-os-surveys' then private\.jr_field_record_targets_assigned_job/i,
    /when 'jr-os-job-variations' then private\.jr_field_variation_targets_assigned_job/i,
    /when 'jr-os-job-progress' then private\.jr_field_progress_targets_assigned_job/i,
    /when 'jr-os-job-material-usage' then private\.jr_field_material_usage_targets_assigned_job/i,
    /when 'jr-os-job-tasks' then private\.jr_field_task_targets_assigned_job/i,
    /when 'jr-os-job-qa-inspections' then private\.jr_field_qa_inspection_targets_assigned_job/i,
    /when 'jr-os-site-diaries' then private\.jr_field_site_diary_targets_assigned_job/i,
    /when 'jr-os-site-diary' then private\.jr_field_site_diary_targets_assigned_job/i,
  ]) assert.match(policy, retained);
  assert.match(policy, /else true[\s\S]*end/i);
});

test("electrician offline timeline projection mirrors the server finance boundary", () => {
  const records = [
    { id: "operational", milestone: "Custom update", eventType: "Note", sourceType: "Payment", note: "Invoice equipment isolated" },
    { id: "deposit", milestone: "Deposit received", note: "Private deposit value" },
    { id: "created", milestone: "Invoice created", note: "Private invoice value" },
    { id: "sent", milestone: "Invoice sent", note: "Private invoice number" },
    { id: "payment", milestone: "Payment received", note: "Private payment value" },
    { id: "event", milestone: "Custom update", eventType: "  FINANCIAL  ", note: "Private finance event" },
    { id: "source", milestone: "Custom update", sourceType: "  INVOICE  ", note: "Private invoice event" },
  ];
  const sanitized = sanitizeRoleProjectionCache({
    storageKey: "jr-os-job-timeline",
    role: "electrician",
    mode: "cloud",
    records,
  });

  assert.deepEqual(sanitized.map((record) => record.id), ["operational"]);
  assert.equal(sanitized[0].note, "Invoice equipment isolated", "note text and Payment source types must not broaden classification");
  assert.equal(records.length, 7, "cache sanitation must not mutate the canonical source array");
  assert.match(cache, /FIELD_FINANCIAL_TIMELINE_MILESTONES[\s\S]*deposit received[\s\S]*invoice created[\s\S]*invoice sent[\s\S]*payment received/i);
  assert.match(cache, /eventType === "financial"[\s\S]*sourceType === "invoice"[\s\S]*FIELD_FINANCIAL_TIMELINE_MILESTONES\.has\(milestone\)/i);
  assert.match(cache, /storageKey === "jr-os-job-timeline"[\s\S]*return fieldTimelineRecords\(records\)/i);
});

test("stale electrician timeline caches purge before offline fallback", () => {
  assert.equal(ELECTRICIAN_JOB_TIMELINE_CACHE_GENERATION, "20260826123514");
  assert.equal(
    roleProjectionCacheGeneration({ storageKey: "jr-os-job-timeline", role: "electrician" }),
    ELECTRICIAN_JOB_TIMELINE_CACHE_GENERATION,
  );
  assert.equal(
    roleProjectionCachePolicy({ storageKey: "jr-os-job-timeline", role: "electrician", mode: "cloud", generation: "20260820" }),
    "purge",
  );
  assert.equal(
    roleProjectionCachePolicy({ storageKey: "jr-os-job-timeline", role: "electrician", mode: "cloud", generation: ELECTRICIAN_JOB_TIMELINE_CACHE_GENERATION }),
    "keep",
  );
  assert.equal(
    roleProjectionCachePolicy({ storageKey: "jr-os-job-timeline", role: "electrician", mode: "cloud" }),
    "purge",
  );
  assert.equal(
    roleProjectionCachePolicy({ storageKey: "jr-os-job-timeline", role: "electrician", mode: "local" }),
    "keep",
  );
  assert.match(cacheTypes, /ELECTRICIAN_JOB_TIMELINE_CACHE_GENERATION: "20260826123514"/);
  assert.match(adapter, /roleProjectionCachePolicy\(\{ storageKey, role: cacheRole, mode, generation: cachedGeneration \}\)/);
  assert.match(adapter, /if \(mode === "local" \|\| !navigator\.onLine\) return local/);
  assert.match(adapter, /sanitizeRoleProjectionCache\(\{ storageKey, role: cacheRole, mode, records: cloudRecords \}\)/);
});

test("field timeline writes stay on the existing bounded create-only RPC", () => {
  assert.deepEqual(
    collectionCloudMutationRoute("cloud_collections", "electrician", "jr-os-job-timeline"),
    {
      kind: "rpc",
      functionName: "jr_field_save_collection",
      resource: "cloud_collections",
      allowedIntents: ["create"],
    },
  );
  assert.deepEqual(
    collectionCloudMutationRoute("cloud_collections", "admin", "jr-os-job-timeline"),
    { kind: "direct" },
  );
  assert.doesNotMatch(migration, /jr_field_save_collection/i);
});

test("live RLS coverage denies every proven finance classification and retains office records", () => {
  for (const phrase of [
    "Assigned electrician should retain production-shaped null-customer timeline activity",
    "Field timeline projection must mask variation financial notes",
    "Electrician must not read milestone-only deposit finance timeline activity",
    "Electrician must not read milestone-only invoice-created timeline activity",
    "Electrician must not read milestone-only invoice-sent timeline activity",
    "Electrician must not read milestone-only payment timeline activity",
    "Electrician must not read normalized Financial timeline activity",
    "Electrician must not read normalized Invoice-source timeline activity",
    "Co-assigned electrician must not read financial timeline activity",
    "Office should retain canonical financial timeline activity",
    "Office should retain canonical financial timeline notes",
  ]) assert.match(runner, new RegExp(phrase.replaceAll(" ", "\\s+"), "i"));
});

test("recovery, guidance and deployment marker keep field finance activity office-only", () => {
  const completionBoundary = recovery.indexOf("20260826121246_keep_field_completion_records_office_only.sql");
  const financeBoundary = recovery.indexOf(migrationName);
  assert.ok(completionBoundary >= 0 && financeBoundary > completionBoundary);
  assert.match(
    recovery.slice(financeBoundary - 120, financeBoundary + migrationName.length + 50),
    /begin;[\s\S]*\\ir[\s\S]*commit;/i,
  );
  assert.match(setup, /timeline activity is assignment-scoped[^;]*invoice, payment and deposit finance activity remains office-only/i);
  assert.match(migration, new RegExp(`'${migrationName.replaceAll(".", "\\.")}'`));
});
