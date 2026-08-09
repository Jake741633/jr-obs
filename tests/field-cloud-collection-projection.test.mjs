import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20260809_048_field_cloud_collection_projection.sql", import.meta.url),
  "utf8",
);
const collections = readFileSync(new URL("../lib/cloud/collections.ts", import.meta.url), "utf8");
const recovery = readFileSync(new URL("../supabase/recovery/after_schema_only.sql", import.meta.url), "utf8");
const setup = readFileSync(new URL("../docs/SUPABASE_SETUP.md", import.meta.url), "utf8");
const runner = readFileSync(new URL("./run-supabase-rls.integration.mjs", import.meta.url), "utf8");

function section(startText, endText) {
  const start = migration.indexOf(startText);
  const end = migration.indexOf(endText, start);
  return migration.slice(start, end);
}

const payloadFunction = section(
  "create or replace function private.jr_field_cloud_payload",
  "revoke execute on function private.jr_field_cloud_payload",
);
const surveyProjection = section("when 'jr-os-surveys' then", "when 'jr-os-job-packs' then");
const packProjection = section("when 'jr-os-job-packs' then", "when 'jr-os-job-variations' then");
const variationProjection = section("when 'jr-os-job-variations' then", "when 'jr-os-job-material-usage' then");
const materialUsageProjection = section("when 'jr-os-job-material-usage' then", "else record_payload");
const mergeFunction = section(
  "create or replace function private.jr_merge_field_cloud_payload",
  "revoke execute on function private.jr_merge_field_cloud_payload",
);

test("electrician generic reads use a dedicated RLS projection", () => {
  assert.match(migration, /create table if not exists public\.field_cloud_collections/i);
  assert.match(migration, /alter table public\.field_cloud_collections enable row level security/i);
  assert.match(migration, /grant select on table public\.field_cloud_collections to authenticated/i);
  assert.match(migration, /private\.current_jr_role\(\) = 'electrician'/i);
  for (const key of [
    "jr-os-surveys",
    "jr-os-rams",
    "jr-os-job-packs",
    "jr-os-job-variations",
    "jr-os-job-timeline",
    "jr-os-site-diaries",
    "jr-os-job-material-usage",
    "jr-os-job-completion",
    "jr-os-job-qa-inspections",
    "jr-os-stock-locations",
  ]) {
    assert.match(migration, new RegExp(`'${key}'`));
  }
});

test("survey, job-pack, variation and material-usage projections remove pricing data", () => {
  assert.match(surveyProjection, /'labourHours'/i);
  assert.doesNotMatch(surveyProjection, /'labourRate'/i);

  assert.match(packProjection, /'labourHours'/i);
  assert.match(packProjection, /'materials'/i);
  assert.doesNotMatch(packProjection, /'labourRate'|'unitPrice'|'unitCost'/i);

  for (const safeKey of ["id", "jobId", "number", "title", "description", "status", "approvalMethod", "requestedBy", "photos", "customerNotes"]) {
    assert.match(variationProjection, new RegExp(`'${safeKey}'`));
  }
  for (const privateKey of ["labourHours", "labourRate", "labourCostRate", "materialCost", "materialCharge", "otherCost", "otherCharge", "fixedPrice", "internalNotes", "presentation", "auditHistory"]) {
    assert.doesNotMatch(variationProjection, new RegExp(`'${privateKey}'`));
  }

  assert.match(materialUsageProjection, /'quantity'/i);
  assert.match(materialUsageProjection, /'supplier'/i);
  assert.doesNotMatch(materialUsageProjection, /'unitCost'/i);
  assert.match(payloadFunction, /else record_payload/i);
});

test("electrician writes preserve hidden office pricing on sensitive generic records", () => {
  assert.match(migration, /private\.jr_field_cloud_collection_has_private_fields/i);
  assert.match(migration, /new\.payload := private\.jr_field_cloud_payload\(new\.collection_key, new\.payload\)/i);
  assert.match(migration, /new\.payload := private\.jr_merge_field_cloud_payload\(new\.collection_key, old\.payload, new\.payload\)/i);
  assert.match(mergeFunction, /old_payload \|\| private\.jr_field_cloud_payload/i);
  assert.match(mergeFunction, /old_material ->> 'id' = new_material ->> 'id'/i);
  assert.match(mergeFunction, /old_material[\s\S]*\|\| new_material/i);
});

test("complete generic rows no longer expose an electrician SELECT branch", () => {
  const basePolicyStart = migration.lastIndexOf('create policy "cloud collections tenant read"');
  const basePolicy = migration.slice(basePolicyStart, migration.indexOf("notify pgrst", basePolicyStart));
  assert.match(basePolicy, /private\.can_manage_office_data\(\)/i);
  assert.match(basePolicy, /private\.current_jr_role\(\) = 'customer'/i);
  assert.doesNotMatch(basePolicy, /current_jr_role\(\) = 'electrician'|can_read_cloud_collection/i);
});

test("electrician repositories route generic reads to the field projection", () => {
  assert.match(collections, /electrician:\s*\{[\s\S]*cloud_collections:\s*"field_cloud_collections"/i);
  assert.match(collections, /roleReadTables\[role\]\?\.\[table\] \?\? table/i);
});

test("live RLS runner covers generic base denial and sensitive redaction", () => {
  for (const phrase of [
    "Electrician must not read complete generic field records",
    "Electrician should retain projected field collection reads",
    "Field survey projection must omit labour rates",
    "Field job pack projection must omit labour rates",
    "Field job pack projection must omit material prices",
    "Field variation projection must omit labour rates",
    "Field variation projection must omit material costs",
    "Field material usage projection must omit unit costs",
    "Field job-pack updates must preserve hidden labour rates",
    "Field job-pack updates must preserve hidden material prices",
  ]) {
    assert.match(runner, new RegExp(phrase.replaceAll(" ", "\\s+"), "i"));
  }
});

test("recovery and deployment guidance retain generic field pricing privacy", () => {
  const jobIndex = recovery.indexOf("20260809_047_job_role_projections.sql");
  const genericIndex = recovery.indexOf("20260809_048_field_cloud_collection_projection.sql");
  assert.ok(jobIndex >= 0 && genericIndex > jobIndex, "field generic projection must follow job role projection hardening");
  assert.match(setup, /electrician generic field reads use a sanitised projection/i);
  assert.match(setup, /survey rates, job-pack prices, variation pricing and material unit costs stay office-only/i);
});
