import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20260809_061_customer_job_timeline_projection.sql", import.meta.url),
  "utf8",
);
const collections = readFileSync(new URL("../lib/cloud/collections.ts", import.meta.url), "utf8");
const adapter = readFileSync(new URL("../lib/cloud/adapter.ts", import.meta.url), "utf8");
const recovery = readFileSync(new URL("../supabase/recovery/after_schema_only.sql", import.meta.url), "utf8");

function section(startText, endText) {
  const start = migration.indexOf(startText);
  assert.ok(start >= 0, `missing section start: ${startText}`);
  const end = migration.indexOf(endText, start);
  assert.ok(end > start, `missing section end: ${endText}`);
  return migration.slice(start, end);
}

test("customer timeline uses a dedicated job-derived RLS projection", () => {
  assert.match(migration, /create table if not exists public\.customer_job_timeline/i);
  assert.match(migration, /alter table public\.customer_job_timeline enable row level security/i);
  assert.match(migration, /grant select on table public\.customer_job_timeline to authenticated/i);
  assert.match(migration, /private\.current_jr_role\(\) = 'customer'/i);
  assert.match(migration, /customer_source_id = private\.current_customer_source_id\(\)/i);
  assert.match(migration, /select\s+job\.customer_source_id[\s\S]*from public\.jobs job/i);
});

test("customer timeline payload omits internal actor and source metadata", () => {
  const projectionTable = section(
    "create table if not exists public.customer_job_timeline",
    "create index if not exists customer_job_timeline_scope_idx",
  );
  assert.doesNotMatch(projectionTable, /created_by|updated_by/i);

  const payload = section(
    "create or replace function private.jr_customer_job_timeline_payload",
    "revoke execute on function private.jr_customer_job_timeline_payload",
  );
  for (const safeKey of ["id", "jobId", "milestone", "eventType", "note", "completedAt", "createdAt"]) {
    assert.match(payload, new RegExp(`'${safeKey}'`));
  }
  for (const privateKey of ["completedBy", "sourceId", "sourceType", "fromStatus", "toStatus"]) {
    assert.doesNotMatch(payload, new RegExp(`'${privateKey}'`));
  }
  assert.match(payload, /'note',\s*to_jsonb\(''::text\)/i);
});

test("timeline scope refreshes when the bound job changes customer or is deleted", () => {
  const jobRefresh = section(
    "create or replace function private.refresh_jr_customer_job_timeline_for_job",
    "revoke execute on function private.refresh_jr_customer_job_timeline_for_job",
  );
  assert.match(jobRefresh, /target_customer_source_id/i);
  assert.match(jobRefresh, /delete from public\.customer_job_timeline/i);
  assert.match(jobRefresh, /from public\.cloud_collections timeline/i);
  assert.match(jobRefresh, /timeline\.job_source_id = target_job_source_id/i);
  assert.match(jobRefresh, /on conflict \(id\) do update set[\s\S]*customer_source_id = excluded\.customer_source_id/i);
  assert.match(migration, /create trigger customer_job_timeline_job_scope_projection[\s\S]*on public\.jobs/i);
});

test("raw customer cloud reads no longer include job timeline records", () => {
  const policyStart = migration.lastIndexOf('create policy "cloud collections tenant read"');
  assert.ok(policyStart >= 0);
  const policy = migration.slice(policyStart, migration.indexOf("notify pgrst", policyStart));
  assert.match(policy, /jr-os-portal-payment-links/i);
  assert.match(policy, /jr-os-portal-activity/i);
  assert.match(policy, /jr-os-deposit-requirements/i);
  assert.doesNotMatch(policy, /jr-os-job-timeline/i);
});

test("customer repository routes only timeline collection reads to the safe projection", () => {
  assert.match(collections, /roleCollectionReadTables[\s\S]*customer[\s\S]*"jr-os-job-timeline":\s*"customer_job_timeline"/i);
  assert.match(collections, /collectionCloudReadTable\(table: string, role\?: string, collectionKey\?: string\)/i);
  assert.match(adapter, /collectionCloudReadTable\(table, cacheRole, collectionKey\)/i);
  assert.match(adapter, /collection_key=eq\.\$\{encodeURIComponent\(collectionKey\)\}/i);
});

test("schema-only recovery applies the timeline projection after customer payment hardening", () => {
  const paymentIndex = recovery.indexOf("20260809_060_customer_payment_projection.sql");
  const timelineIndex = recovery.indexOf("20260809_061_customer_job_timeline_projection.sql");
  assert.ok(paymentIndex >= 0 && timelineIndex > paymentIndex);
});
