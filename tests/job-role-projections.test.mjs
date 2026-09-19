import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20260809_047_job_role_projections.sql", import.meta.url),
  "utf8",
);
const boundary = readFileSync(
  new URL("../supabase/migrations/20260813235633_secure_field_mutation_boundary.sql", import.meta.url),
  "utf8",
);
const collections = readFileSync(new URL("../lib/cloud/collections.ts", import.meta.url), "utf8");
const recovery = readFileSync(new URL("../supabase/recovery/after_schema_only.sql", import.meta.url), "utf8");
const setup = readFileSync(new URL("../docs/SUPABASE_SETUP.md", import.meta.url), "utf8");
const runner = readFileSync(new URL("./run-supabase-rls.integration.mjs", import.meta.url), "utf8");

function functionBody(name) {
  const start = migration.indexOf(`create or replace function ${name}`);
  const end = migration.indexOf("revoke execute on function", start);
  return migration.slice(start, end);
}

const fieldPayload = functionBody("private.jr_field_job_payload");
const customerPayload = functionBody("private.jr_customer_job_payload");
const guard = functionBody("private.guard_jr_electrician_job_payload");

test("job reads use dedicated electrician and customer projections", () => {
  for (const table of ["field_jobs", "customer_jobs"]) {
    assert.match(migration, new RegExp(`create table if not exists public\\.${table}`, "i"));
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
  }
  assert.match(migration, /private\.current_jr_role\(\) = 'electrician'/i);
  assert.match(migration, /private\.current_jr_role\(\) = 'customer'/i);
  assert.match(migration, /customer_source_id = private\.current_customer_source_id\(\)/i);
});

test("electrician job projection omits every commercial field", () => {
  for (const key of ["id", "title", "customerId", "builderId", "siteAddress", "status", "startDate", "targetCompletionDate", "priority", "assignedTo", "contacts", "requiredCertificateTypes", "notes"]) {
    assert.match(fieldPayload, new RegExp(`'${key}'`));
  }
  for (const key of ["sourceQuoteId", "quoteSnapshot", "retentionPercent", "retentionDueDate", "originalContractValue", "value", "profitability", "internalNotes"]) {
    assert.doesNotMatch(fieldPayload, new RegExp(`'${key}'`));
  }
});

test("customer job projection is smaller than the electrician projection", () => {
  for (const key of ["id", "title", "customerId", "siteAddress", "status", "startDate", "targetCompletionDate"]) {
    assert.match(customerPayload, new RegExp(`'${key}'`));
  }
  for (const key of ["builderId", "priority", "assignedTo", "contacts", "requiredCertificateTypes", "notes", "sourceQuoteId", "quoteSnapshot", "retentionPercent", "retentionDueDate", "originalContractValue", "value"]) {
    assert.doesNotMatch(customerPayload, new RegExp(`'${key}'`));
  }
});

test("historical direct-write guard preserved hidden office data before the RPC boundary", () => {
  assert.match(guard, /private\.current_jr_role\(\) <> 'electrician'/i);
  assert.match(guard, /new\.customer_source_id is distinct from old\.customer_source_id/i);
  assert.match(guard, /Electricians cannot rebind a job to another customer/i);
  assert.match(guard, /new\.payload := private\.jr_field_job_payload\(new\.payload\)/i);
  assert.match(guard, /new\.payload := old\.payload \|\| private\.jr_field_job_payload\(new\.payload\)/i);
});

test("final boundary replaces direct electrician job writes with the assigned status RPC", () => {
  assert.match(boundary, /create policy jobs_office_insert[\s\S]*private\.can_manage_office_data\(\)/i);
  assert.match(boundary, /create policy jobs_office_update[\s\S]*private\.can_manage_office_data\(\)/i);
  assert.match(boundary, /create or replace function public\.jr_field_update_job_status/i);
});

test("complete jobs are office-only and repositories route restricted roles to projections", () => {
  const policyStart = migration.indexOf("create policy jobs_select");
  const basePolicy = migration.slice(policyStart, migration.indexOf("notify pgrst", policyStart));
  assert.match(basePolicy, /private\.can_manage_office_data\(\)/i);
  assert.doesNotMatch(basePolicy, /electrician|customer/i);
  assert.match(collections, /customer:\s*\{[\s\S]*jobs:\s*"customer_jobs"/i);
  assert.match(collections, /electrician:\s*\{[\s\S]*jobs:\s*"field_jobs"/i);
});

test("live RLS runner covers job redaction, tenant scope and RPC-only field updates", () => {
  for (const phrase of [
    "Electrician must not read complete commercial job records",
    "Electrician should retain field-safe job reads",
    "Field job projection must omit contract value",
    "Customer must not read complete commercial job records",
    "Customer should retain portal-safe job reads",
    "Customer job projection must omit private job notes",
    "Another customer must not read the portal job projection",
    "Another organisation must not read the portal job projection",
    "Electrician direct job updates must fail closed",
    "Assigned electrician should apply a valid job status transition through the RPC",
    "Field RPC updates must preserve hidden commercial job data",
  ]) {
    assert.match(runner, new RegExp(phrase.replaceAll(" ", "\\s+"), "i"));
  }
});

test("recovery and deployment guidance retain job role projection hardening", () => {
  const teamIndex = recovery.indexOf("20260809_046_field_team_member_projection.sql");
  const jobIndex = recovery.indexOf("20260809_047_job_role_projections.sql");
  assert.ok(teamIndex >= 0 && jobIndex > teamIndex, "job role projections must follow prior role hardening");
  assert.match(setup, /electricians and customers never read complete job commercial payloads/i);
  assert.match(setup, /field updates preserve hidden office-only job pricing/i);
});
