import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const historicalMigration = readFileSync(
  new URL("../supabase/migrations/20260803_016_customer_generic_collection_reads.sql", import.meta.url),
  "utf8",
);
const finalMigration = readFileSync(
  new URL("../supabase/migrations/20260814091500_project_customer_portal_finance.sql", import.meta.url),
  "utf8",
);

const historicalCustomerBranch = historicalMigration.slice(
  historicalMigration.indexOf("customer_source_id = public.current_customer_source_id()"),
);
const finalPolicy = finalMigration.slice(finalMigration.lastIndexOf('drop policy if exists "cloud collections tenant read"'));

test("historical customer generic reads were tenant and customer scoped", () => {
  assert.match(historicalMigration, /public\.is_organisation_member\(organisation_id\)/i);
  assert.match(historicalCustomerBranch, /customer_source_id = public\.current_customer_source_id\(\)/i);
});

test("the historical allowlist documents the raw collections that required replacement", () => {
  for (const key of [
    "jr-os-job-timeline",
    "jr-os-portal-payment-links",
    "jr-os-portal-photo-shares",
    "jr-os-portal-activity",
    "jr-os-deposit-requirements",
  ]) {
    assert.match(historicalCustomerBranch, new RegExp(`'${key}'`));
  }
});

test("the historical policy excluded internal and demo access collections", () => {
  for (const key of [
    "jr-os-portal-access",
    "jr-os-business-settings",
    "jr-os-ai-learning-memory",
    "jr-os-crm-interactions",
    "jr-os-labour-rates",
  ]) {
    assert.doesNotMatch(historicalCustomerBranch, new RegExp(`'${key}'`));
  }
});

test("the final policy supersedes every historical raw customer branch", () => {
  assert.match(finalPolicy, /private\.is_organisation_member\(organisation_id\)/i);
  assert.match(finalPolicy, /private\.can_manage_office_data\(\)/i);
  assert.doesNotMatch(finalPolicy, /current_customer_source_id|current_jr_role\(\) = 'customer'|collection_key in \(/i);
  for (const key of ["jr-os-portal-activity", "jr-os-deposit-requirements", "jr-os-portal-payment-links"]) {
    assert.doesNotMatch(finalPolicy, new RegExp(key));
  }
});
