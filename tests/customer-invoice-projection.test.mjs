import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20260809_059_customer_invoice_projection.sql", import.meta.url),
  "utf8",
);
const collections = readFileSync(new URL("../lib/cloud/collections.ts", import.meta.url), "utf8");
const recovery = readFileSync(new URL("../supabase/recovery/after_schema_only.sql", import.meta.url), "utf8");

test("customer invoice reads route through a dedicated projection", () => {
  assert.match(migration, /create table if not exists public\.customer_invoices/i);
  assert.match(collections, /invoices:\s*"customer_invoices"/i);
  assert.match(migration, /private\.current_jr_role\(\) = 'customer'/i);
  assert.match(migration, /customer_source_id = private\.current_customer_source_id\(\)/i);
});

test("draft and cancelled invoices never enter the customer projection", () => {
  assert.match(migration, /not in \('Sent','Part paid','Paid','Overdue'\)/i);
  assert.match(migration, /in \('Sent','Part paid','Paid','Overdue'\)/i);
  assert.match(migration, /delete from public\.customer_invoices where id = new\.id/i);
});

test("customer invoice lines omit staff-only costing and supplier metadata", () => {
  const itemFunction = /create or replace function private\.jr_customer_invoice_items[\s\S]*?\$\$;/i.exec(migration)?.[0] ?? "";
  for (const field of ["id", "description", "category", "quantity", "unitPrice"]) {
    assert.match(itemFunction, new RegExp(`'${field}'`));
  }
  for (const privateField of [
    "unitCost",
    "supplier",
    "stockCode",
    "materialId",
    "labourRateId",
    "labourMode",
    "labourHours",
  ]) {
    assert.doesNotMatch(itemFunction, new RegExp(privateField, "i"));
  }
});

test("customer invoice payload contains only portal-facing invoice data", () => {
  const payloadFunction = /create or replace function private\.jr_customer_invoice_payload[\s\S]*?\$\$;/i.exec(migration)?.[0] ?? "";
  for (const field of [
    "number",
    "status",
    "customerId",
    "jobId",
    "title",
    "issueDate",
    "dueDate",
    "vatEnabled",
    "vatRate",
    "items",
    "amountPaid",
    "notes",
    "paymentDetails",
    "paymentTermsText",
  ]) {
    assert.match(payloadFunction, new RegExp(`'${field}'`));
  }
  for (const internalField of ["builderId", "quoteId", "variationIds", "paymentTermsTemplateId"]) {
    assert.doesNotMatch(payloadFunction, new RegExp(internalField, "i"));
  }
});

test("complete invoice rows are office-only after projection hardening", () => {
  const policy = /create policy invoices_select[\s\S]*?;\n/i.exec(migration)?.[0] ?? "";
  assert.match(policy, /private\.can_manage_office_data\(\)/i);
  assert.doesNotMatch(policy, /current_jr_role\(\) = 'customer'/i);
});

test("schema-only recovery reapplies customer-safe invoice projection", () => {
  assert.match(recovery, /20260809_059_customer_invoice_projection\.sql/i);
});
