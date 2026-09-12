import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20260809_060_customer_payment_projection.sql", import.meta.url),
  "utf8",
);
const collections = readFileSync(new URL("../lib/cloud/collections.ts", import.meta.url), "utf8");
const recovery = readFileSync(new URL("../supabase/recovery/after_schema_only.sql", import.meta.url), "utf8");

test("customer payment reads route through a dedicated projection", () => {
  assert.match(migration, /create table if not exists public\.customer_payments/i);
  assert.match(collections, /payments:\s*"customer_payments"/i);
  assert.match(migration, /private\.current_jr_role\(\) = 'customer'/i);
  assert.match(migration, /customer_source_id = private\.current_customer_source_id\(\)/i);
});

test("customer payment payload omits office reconciliation data", () => {
  const payloadFunction = /create or replace function private\.jr_customer_payment_payload[\s\S]*?\$\$;/i.exec(migration)?.[0] ?? "";
  for (const field of ["id", "customerId", "invoiceId", "paymentDate", "amount", "method", "type", "createdAt"]) {
    assert.match(payloadFunction, new RegExp(`'${field}'`));
  }
  for (const privateField of ["reference", "notes", "reconciliationStatus"]) {
    assert.doesNotMatch(payloadFunction, new RegExp(privateField, "i"));
  }
});

test("only payments allocated to a same-customer invoice enter the projection", () => {
  const bindingFunction = /create or replace function private\.jr_payment_matches_customer_invoice[\s\S]*?\$\$;/i.exec(migration)?.[0] ?? "";
  assert.match(bindingFunction, /jsonb_typeof\(record_payload -> 'invoiceId'\) = 'string'/i);
  assert.match(bindingFunction, /from public\.invoices invoice/i);
  assert.match(bindingFunction, /invoice\.organisation_id = record_organisation_id/i);
  assert.match(bindingFunction, /invoice\.customer_source_id = record_customer_source_id/i);
  assert.match(bindingFunction, /invoice\.deleted_at is null/i);
});

test("customer payment visibility follows the customer-visible invoice projection", () => {
  const policy = /create policy customer_payments_customer_select[\s\S]*?;\n/i.exec(migration)?.[0] ?? "";
  assert.match(policy, /from public\.customer_invoices invoice/i);
  assert.match(policy, /invoice\.source_id = customer_payments\.payload ->> 'invoiceId'/i);
  assert.match(policy, /invoice\.customer_source_id = customer_payments\.customer_source_id/i);
});

test("complete payment rows become office-only", () => {
  const policy = /create policy payments_select[\s\S]*?;\n/i.exec(migration)?.[0] ?? "";
  assert.match(policy, /private\.can_manage_office_data\(\)/i);
  assert.doesNotMatch(policy, /current_jr_role\(\) = 'customer'/i);
});

test("schema-only recovery reapplies customer-safe payment projection", () => {
  assert.match(recovery, /20260809_060_customer_payment_projection\.sql/i);
});
