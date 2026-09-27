import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20260814091500_project_customer_portal_finance.sql", import.meta.url),
  "utf8",
);
const collections = readFileSync(new URL("../lib/cloud/collections.ts", import.meta.url), "utf8");
const recovery = readFileSync(new URL("../supabase/recovery/after_schema_only.sql", import.meta.url), "utf8");

function functionBody(name) {
  const start = migration.indexOf(`create or replace function private.${name}`);
  const end = migration.indexOf("$$;", start);
  assert.ok(start >= 0 && end > start, `Expected ${name}`);
  return migration.slice(start, end);
}

test("customer generic finance reads route through explicit projections", () => {
  assert.match(migration, /create table if not exists public\.customer_deposit_requirements/i);
  assert.match(migration, /create table if not exists public\.customer_portal_payment_links/i);
  assert.match(collections, /"jr-os-deposit-requirements": "customer_deposit_requirements"/i);
  assert.match(collections, /"jr-os-portal-payment-links": "customer_portal_payment_links"/i);
  for (const table of ["customer_deposit_requirements", "customer_portal_payment_links"]) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
    assert.match(migration, new RegExp(`grant select on table[\\s\\S]*public\\.${table}[\\s\\S]*to authenticated`, "i"));
  }
});

test("deposit scope is derived from one canonical pricing record, never the generic envelope", () => {
  const refresh = functionBody("refresh_jr_customer_portal_finance");
  assert.match(refresh, /from public\.pricing_documents pricing/i);
  assert.match(refresh, /pricing\.organisation_id = new\.organisation_id/i);
  assert.match(refresh, /pricing\.source_id = target_pricing_source_id/i);
  assert.match(refresh, /select pricing\.customer_source_id, pricing\.job_source_id/i);
  assert.match(refresh, /new\.customer_source_id is null[\s\S]*new\.job_source_id is null[\s\S]*or \([\s\S]*new\.customer_source_id is not distinct from pricing_customer_source_id[\s\S]*new\.job_source_id is not distinct from pricing_job_source_id/i);
  assert.match(refresh, /pricing_customer_source_id, pricing_job_source_id, new\.version/i);
});

test("deposit projection is strictly allowlisted and dynamically requires the exact Accepted document", () => {
  const payload = functionBody("jr_customer_deposit_requirement_payload");
  for (const field of ["id", "pricingDocumentId", "mode", "value", "dueRule", "dueDate", "createdAt", "updatedAt"]) {
    assert.match(payload, new RegExp(`'${field}'`, "i"));
  }
  for (const privateField of ["customerId", "jobId", "internalNote", "createdBy"]) {
    assert.doesNotMatch(payload, new RegExp(privateField, "i"));
  }
  assert.match(payload, /when record_payload ->> 'dueRule' = 'Specified date'[\s\S]*to_jsonb\(record_payload ->> 'dueDate'\)/i);
  assert.match(payload, /jsonb_typeof\(record_payload -> 'createdAt'\) = 'string'/i);
  assert.match(payload, /jsonb_typeof\(record_payload -> 'updatedAt'\) = 'string'/i);
  assert.match(migration, /case\s+when pg_catalog\.jsonb_typeof\(new\.payload -> 'value'\) = 'number' then[\s\S]*else false\s+end/i);
  assert.match(migration, /case\s+when pg_catalog\.jsonb_typeof\(deposit\.payload -> 'value'\) = 'number' then[\s\S]*else false\s+end/i);
  assert.match(migration, /payload ->> 'mode' <> 'Percentage'[\s\S]*payload ->> 'value'\)::numeric <= 100/i);
  assert.match(migration, /create or replace function private\.jr_customer_valid_iso_date[\s\S]*candidate !~ '\^\[0-9\]\{4\}-\[0-9\]\{2\}-\[0-9\]\{2\}\$'[\s\S]*exception when others[\s\S]*to_char\(parsed, 'YYYY-MM-DD'\) = candidate/i);
  assert.match(migration, /private\.jr_customer_valid_iso_date\((?:new|deposit)\.payload ->> 'dueDate'\)/i);
  const policy = /create policy customer_deposit_requirements_customer_select[\s\S]*?\n\);/i.exec(migration)?.[0] ?? "";
  assert.match(policy, /from public\.customer_pricing_documents pricing/i);
  assert.match(policy, /pricing\.customer_source_id = customer_deposit_requirements\.customer_source_id/i);
  assert.match(policy, /pricing\.job_source_id is not distinct from customer_deposit_requirements\.job_source_id/i);
  assert.match(policy, /pricing\.payload ->> 'status' = 'Accepted'/i);
  assert.match(migration, /create unique index if not exists customer_deposit_requirements_document_unique[\s\S]*payload ->> 'pricingDocumentId'/i);
  assert.match(migration, /having count\(\*\) > 1[\s\S]*Cannot secure duplicate deposit requirements/i);
});

test("payment-link projection exposes only the capability contract and keeps lifecycle checks dynamic", () => {
  const payload = functionBody("jr_customer_portal_payment_link_payload");
  for (const field of ["id", "customerId", "jobId", "invoiceId", "paymentUrl", "providerConfigured", "updatedAt"]) {
    assert.match(payload, new RegExp(`'${field}'`, "i"));
  }
  for (const privateField of ["providerName", "testRun", "internalNote"]) {
    assert.doesNotMatch(payload, new RegExp(privateField, "i"));
  }
  assert.match(payload, /jsonb_typeof\(record_payload -> 'updatedAt'\) = 'string'/i);
  assert.match(migration, /coalesce\(pg_catalog\.jsonb_typeof\(new\.payload -> 'paymentUrl'\), ''\) <> 'string'/i);
  const policy = /create policy customer_portal_payment_links_customer_select[\s\S]*?\n\);/i.exec(migration)?.[0] ?? "";
  assert.match(policy, /from public\.customer_invoices invoice/i);
  assert.match(policy, /invoice\.customer_source_id = customer_portal_payment_links\.customer_source_id/i);
  assert.match(policy, /invoice\.job_source_id is not distinct from customer_portal_payment_links\.job_source_id/i);
  assert.match(policy, /private\.jr_customer_invoice_has_outstanding_balance/i);
});

test("complete generic source rows and portal activity are office-only", () => {
  const finalPolicy = migration.slice(migration.lastIndexOf('drop policy if exists "cloud collections tenant read"'));
  assert.match(finalPolicy, /private\.can_manage_office_data\(\)/i);
  assert.doesNotMatch(finalPolicy, /current_jr_role\(\) = 'customer'/i);
  assert.doesNotMatch(finalPolicy, /jr-os-portal-activity|jr-os-deposit-requirements|jr-os-portal-payment-links/i);
});

test("projection functions are private and schema-only recovery publishes this exact migration", () => {
  assert.match(migration, /security definer[\s\S]*set search_path = ''/i);
  assert.match(migration, /revoke execute on function private\.refresh_jr_customer_portal_finance\(\)[\s\S]*from public, anon, authenticated/i);
  assert.match(recovery, /20260814091500_project_customer_portal_finance\.sql/i);
  assert.match(migration, /'migration',\s*'20260814091500_project_customer_portal_finance\.sql'/i);
});
