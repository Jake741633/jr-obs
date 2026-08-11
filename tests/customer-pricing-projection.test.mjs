import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20260809_042_protect_customer_pricing_details.sql", import.meta.url),
  "utf8",
);
const statusMigration = readFileSync(
  new URL("../supabase/migrations/20260811_068_hide_customer_draft_pricing.sql", import.meta.url),
  "utf8",
);
const recovery = readFileSync(new URL("../supabase/recovery/after_schema_only.sql", import.meta.url), "utf8");
const collections = readFileSync(new URL("../lib/cloud/collections.ts", import.meta.url), "utf8");
const adapter = readFileSync(new URL("../lib/cloud/adapter.ts", import.meta.url), "utf8");
const portalCore = readFileSync(new URL("../lib/customerPortal.ts", import.meta.url), "utf8");
const liveRls = readFileSync(new URL("./supabase-rls.integration.mjs", import.meta.url), "utf8");
const statusLiveRls = readFileSync(new URL("./customer-pricing-status-live-rls.test.mjs", import.meta.url), "utf8");

test("customer pricing reads use a dedicated RLS projection", () => {
  assert.match(migration, /create table if not exists public\.customer_pricing_documents/i);
  assert.match(migration, /alter table public\.customer_pricing_documents enable row level security/i);
  assert.match(
    statusMigration,
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

test("customer pricing projections exclude unsent malformed and orphaned documents", () => {
  assert.match(statusMigration, /create or replace function private\.jr_customer_pricing_status_is_visible/i);
  assert.match(statusMigration, /\('Sent', 'Accepted', 'Declined', 'Expired'\)/i);
  assert.match(
    statusMigration,
    /new\.customer_source_id is null[\s\S]*new\.deleted_at is not null[\s\S]*not private\.jr_customer_pricing_status_is_visible\(new\.payload\)[\s\S]*delete from public\.customer_pricing_documents where id = new\.id/i,
  );
  assert.match(
    statusMigration,
    /delete from public\.customer_pricing_documents projection[\s\S]*where not exists \([\s\S]*pricing\.id = projection\.id[\s\S]*pricing\.customer_source_id is not null[\s\S]*pricing\.deleted_at is null[\s\S]*private\.jr_customer_pricing_status_is_visible\(pricing\.payload\)/i,
  );
  assert.match(
    statusMigration,
    /from public\.pricing_documents pricing[\s\S]*pricing\.customer_source_id is not null[\s\S]*pricing\.deleted_at is null[\s\S]*private\.jr_customer_pricing_status_is_visible\(pricing\.payload\)/i,
  );
  assert.match(
    statusMigration,
    /customer_pricing_documents_visible_status_check[\s\S]*coalesce\([\s\S]*jsonb_typeof\(payload -> 'status'\) = 'string'[\s\S]*payload ->> 'status' in \('Sent', 'Accepted', 'Declined', 'Expired'\)[\s\S]*false[\s\S]*\)/i,
  );
  assert.match(
    statusMigration,
    /create policy customer_pricing_documents_customer_select[\s\S]*payload ->> 'status' in \('Sent', 'Accepted', 'Declined', 'Expired'\)/i,
  );
  assert.doesNotMatch(statusMigration, /payload ->> 'status' in \([^)]*'Draft'/i);
});

test("local and demo portal reads also remove Draft pricing documents", () => {
  assert.match(portalCore, /"type" in item/);
  assert.match(portalCore, /item\.type === "Quote" \|\| item\.type === "Estimate"/);
  assert.match(portalCore, /item\.status === "Draft"/);
});

test("the projection is trigger-maintained and internal helpers are not RPCs", () => {
  assert.match(statusMigration, /security definer[\s\S]*set search_path = ''/i);
  assert.match(statusMigration, /after insert or update or delete on public\.pricing_documents/i);
  assert.match(statusMigration, /private\.jr_customer_pricing_payload\(new\.payload\)/i);
  assert.match(statusMigration, /on conflict \(id\) do update/i);
  assert.match(
    statusMigration,
    /revoke execute on function private\.jr_customer_pricing_status_is_visible\(jsonb\)[\s\S]*from public, anon, authenticated, service_role/i,
  );
  assert.match(
    statusMigration,
    /revoke execute on function private\.refresh_jr_customer_pricing_document\(\)[\s\S]*from public, anon, authenticated/i,
  );
});

test("customer clients read the projection while other roles keep role-specific read routing", () => {
  assert.match(collections, /customer:\s*\{[\s\S]*pricing_documents:\s*"customer_pricing_documents"/i);
  assert.match(collections, /roleReadTables\[role\]\?\.\[table\] \?\? table/i);
  assert.match(adapter, /const readTable = collectionCloudReadTable\(table, cacheRole, collectionKey\)/);
  assert.match(adapter, /cloudSelect<CloudEnvelope<T>>\(readTable,/);
});

test("recovery deployment and live RLS coverage retain the status boundary", () => {
  assert.match(recovery, /20260809_042_protect_customer_pricing_details\.sql/i);
  assert.match(recovery, /20260811_068_hide_customer_draft_pricing\.sql/i);
  assert.match(statusMigration, /'migration',\s*'20260811_068_hide_customer_draft_pricing\.sql'/i);
  assert.match(statusLiveRls, /const anchor = '    const secondQuoteA = source\("quote-a-second-sent"\);'/);
  assert.match(statusLiveRls, /Customer pricing status live RLS wrapper should complete successfully/);
  for (const phrase of [
    "Draft pricing must not appear in the customer projection",
    "Sent pricing should enter the customer projection",
    "Status projection must retain staff-only redaction",
    "Returning pricing to Draft must remove the customer projection row",
    "Accepted pricing should remain customer visible",
  ]) {
    assert.match(statusLiveRls, new RegExp(phrase.replaceAll(" ", "\\s+"), "i"));
  }
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
