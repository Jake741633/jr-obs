import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20260809_042_protect_customer_pricing_details.sql", import.meta.url),
  "utf8",
);
const recovery = readFileSync(new URL("../supabase/recovery/after_schema_only.sql", import.meta.url), "utf8");
const collections = readFileSync(new URL("../lib/cloud/collections.ts", import.meta.url), "utf8");
const adapter = readFileSync(new URL("../lib/cloud/adapter.ts", import.meta.url), "utf8");
const liveRls = readFileSync(new URL("./supabase-rls.integration.mjs", import.meta.url), "utf8");

test("customer pricing reads use a dedicated RLS projection", () => {
  assert.match(migration, /create table if not exists public\.customer_pricing_documents/i);
  assert.match(migration, /alter table public\.customer_pricing_documents enable row level security/i);
  assert.match(
    migration,
    /create policy customer_pricing_documents_customer_select[\s\S]*deleted_at is null[\s\S]*organisation_id = private\.current_organisation_id\(\)[\s\S]*private\.current_jr_role\(\) = 'customer'[\s\S]*customer_source_id = private\.current_customer_source_id\(\)/i,
  );
  assert.match(migration, /grant select on table public\.customer_pricing_documents to authenticated/i);
  assert.doesNotMatch(migration, /grant (?:insert|update|delete)[^;]*customer_pricing_documents to authenticated/i);
});

test("the complete pricing table is no longer customer-readable", () => {
  const policy = migration.slice(migration.lastIndexOf("create policy pricing_documents_select"));
  assert.match(policy, /private\.current_jr_role\(\) in \('owner', 'admin', 'office', 'electrician'\)/i);
  assert.doesNotMatch(policy, /current_customer_source_id|= 'customer'/i);
});

test("the customer payload is allowlisted and strips staff-only pricing data", () => {
  const start = migration.indexOf("create or replace function private.jr_customer_pricing_payload");
  const end = migration.indexOf("revoke execute on function private.jr_customer_pricing_payload", start);
  const projection = migration.slice(start, end);

  for (const safeKey of ["id", "number", "type", "status", "customerId", "jobId", "title", "items", "unitPrice", "terms"]) {
    assert.match(projection, new RegExp(`'${safeKey}'`));
  }
  for (const privateKey of ["unitCost", "pricingSettings", "profitability", "internalNotes", "revisions", "lastFollowUpAt", "nextFollowUpDate"]) {
    assert.doesNotMatch(projection, new RegExp(`'${privateKey}'`));
  }
});

test("the projection is trigger-maintained and internal helpers are not RPCs", () => {
  assert.match(migration, /security definer[\s\S]*set search_path = ''/i);
  assert.match(migration, /after insert or update or delete on public\.pricing_documents/i);
  assert.match(migration, /private\.jr_customer_pricing_payload\(new\.payload\)/i);
  assert.match(migration, /on conflict \(id\) do update/i);
  assert.match(migration, /revoke execute on function private\.jr_customer_pricing_payload\(jsonb\)[\s\S]*from public, anon, authenticated, service_role/i);
  assert.match(migration, /revoke execute on function private\.refresh_jr_customer_pricing_document\(\)[\s\S]*from public, anon, authenticated/i);
});

test("customer clients read the projection while other roles keep role-specific read routing", () => {
  assert.match(collections, /customer:\s*\{[\s\S]*pricing_documents:\s*"customer_pricing_documents"/i);
  assert.match(collections, /roleReadTables\[role\]\?\.\[table\] \?\? table/i);
  assert.match(adapter, /const readTable = collectionCloudReadTable\(table, cacheRole, collectionKey\)/);
  assert.match(adapter, /cloudSelect<CloudEnvelope<T>>\(readTable,/);
});

test("recovery and live penetration coverage retain the customer pricing boundary", () => {
  assert.match(recovery, /20260809_042_protect_customer_pricing_details\.sql/i);
  for (const phrase of [
    "Customer base pricing query should fail closed",
    "Customer pricing projection must omit staff-only profitability",
    "Another customer must not read the pricing projection",
    "Another organisation must not read the pricing projection",
    "Customer must not write the pricing projection",
  ]) {
    assert.match(liveRls, new RegExp(phrase.replaceAll(" ", "\\s+"), "i"));
  }
});
