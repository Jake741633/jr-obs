import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20260809_045_restrict_electrician_pricing_reads.sql", import.meta.url),
  "utf8",
);
const customerPricingMigration = readFileSync(
  new URL("../supabase/migrations/20260809_042_protect_customer_pricing_details.sql", import.meta.url),
  "utf8",
);
const recovery = readFileSync(new URL("../supabase/recovery/after_schema_only.sql", import.meta.url), "utf8");
const setup = readFileSync(new URL("../docs/SUPABASE_SETUP.md", import.meta.url), "utf8");
const permissions = readFileSync(new URL("../lib/cloud/permissions.ts", import.meta.url), "utf8");

const policyStart = migration.indexOf("create policy pricing_documents_select");
const policyEnd = migration.indexOf("notify pgrst", policyStart);
const policy = migration.slice(policyStart, policyEnd);

test("full pricing documents are restricted to office-capable roles", () => {
  assert.match(migration, /drop policy if exists pricing_documents_select on public\.pricing_documents/i);
  assert.match(policy, /on public\.pricing_documents[\s\S]*for select to authenticated/i);
  assert.match(policy, /organisation_id = private\.current_organisation_id\(\)/i);
  assert.match(policy, /private\.can_manage_office_data\(\)/i);
  assert.doesNotMatch(policy, /electrician|customer/i);
});

test("the database boundary matches the application finance permission", () => {
  const financeStart = permissions.indexOf("export function canEditFinance");
  const financeEnd = permissions.indexOf("export function canEditFieldRecords", financeStart);
  const financePermission = permissions.slice(financeStart, financeEnd);
  assert.match(financePermission, /role === "owner"/i);
  assert.match(financePermission, /role === "admin"/i);
  assert.match(financePermission, /role === "office"/i);
  assert.doesNotMatch(financePermission, /electrician|customer/i);
});

test("customer pricing remains available only through the allowlisted projection", () => {
  assert.match(customerPricingMigration, /create table if not exists public\.customer_pricing_documents/i);
  assert.match(customerPricingMigration, /create policy customer_pricing_documents_customer_select/i);
  assert.match(customerPricingMigration, /private\.current_jr_role\(\) = 'customer'/i);
  assert.match(customerPricingMigration, /customer_source_id = private\.current_customer_source_id\(\)/i);
  assert.doesNotMatch(migration, /customer_pricing_documents_customer_select/i);
});

test("recovery order and deployment guidance retain the electrician pricing boundary", () => {
  const customerProjectionIndex = recovery.indexOf("20260809_042_protect_customer_pricing_details.sql");
  const restrictionIndex = recovery.indexOf("20260809_045_restrict_electrician_pricing_reads.sql");
  assert.ok(customerProjectionIndex >= 0, "customer pricing projection migration must be retained");
  assert.ok(restrictionIndex > customerProjectionIndex, "electrician pricing restriction must run after the projection migration");
  assert.match(setup, /electricians cannot read full pricing documents, internal costs, markup or margin data through typed APIs/i);
});
