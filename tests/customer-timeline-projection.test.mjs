import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../supabase/migrations/20260810_067_customer_timeline_projection.sql", import.meta.url), "utf8");
const collections = readFileSync(new URL("../lib/cloud/collections.ts", import.meta.url), "utf8");
const adapter = readFileSync(new URL("../lib/cloud/adapter.ts", import.meta.url), "utf8");
const recovery = readFileSync(new URL("../supabase/recovery/after_schema_only.sql", import.meta.url), "utf8");

const payloadFunction = migration.slice(
  migration.indexOf("create or replace function private.jr_customer_timeline_payload"),
  migration.indexOf("revoke execute on function private.jr_customer_timeline_payload"),
);
const latestPolicyStart = migration.lastIndexOf('drop policy if exists "cloud collections tenant read"');
const latestPolicyEnd = migration.indexOf("create or replace function public.jr_os_deployed_migration", latestPolicyStart);
const latestSourcePolicy = migration.slice(latestPolicyStart, latestPolicyEnd);

test("customer timeline projection is tenant, customer and live-job scoped", () => {
  assert.match(migration, /create table if not exists public\.customer_job_timeline/i);
  assert.match(migration, /organisation_id = private\.current_organisation_id\(\)/i);
  assert.match(migration, /private\.current_jr_role\(\) = 'customer'/i);
  assert.match(migration, /customer_source_id = private\.current_customer_source_id\(\)/i);
  assert.match(migration, /from public\.customer_jobs job/i);
  assert.match(migration, /job\.source_id = customer_job_timeline\.job_source_id/i);
});

test("customer timeline payload omits internal note and staff/source attribution", () => {
  assert.match(payloadFunction, /'milestone', record_payload -> 'milestone'/i);
  assert.match(payloadFunction, /'completedAt', record_payload -> 'completedAt'/i);
  assert.match(payloadFunction, /'note', pg_catalog\.to_jsonb\(''::text\)/i);
  assert.doesNotMatch(payloadFunction, /record_payload\s*->\s*'note'/i);
  assert.doesNotMatch(payloadFunction, /completedBy/i);
  assert.doesNotMatch(payloadFunction, /sourceId/i);
  assert.doesNotMatch(payloadFunction, /sourceType/i);
});

test("customer sessions cannot bypass the projection through the generic source table", () => {
  assert.ok(latestPolicyStart >= 0, "Expected the final cloud collection read policy");
  assert.ok(latestPolicyEnd > latestPolicyStart, "Expected a bounded final cloud collection read policy");
  assert.doesNotMatch(latestSourcePolicy, /'jr-os-job-timeline'/i);
  assert.match(latestSourcePolicy, /'jr-os-portal-activity'/i);
  assert.match(latestSourcePolicy, /'jr-os-deposit-requirements'/i);
  assert.match(latestSourcePolicy, /collection_key = 'jr-os-portal-payment-links'/i);
});

test("customer timeline repositories read the safe projection", () => {
  assert.match(collections, /"jr-os-job-timeline": "customer_job_timeline"/i);
  assert.match(collections, /collectionCloudReadTable\(table: string, role\?: string, collectionKey\?: string\)/i);
  assert.match(adapter, /collectionCloudReadTable\(table, cacheRole, collectionKey\)/i);
});

test("timeline projection is included in recovery and deployed migration verification", () => {
  assert.match(recovery, /20260810_067_customer_timeline_projection\.sql/i);
  assert.match(migration, /'migration',\s*'20260810_067_customer_timeline_projection\.sql'/i);
  assert.match(migration, /grant execute on function public\.jr_os_deployed_migration\(\)\s*to service_role/i);
});
