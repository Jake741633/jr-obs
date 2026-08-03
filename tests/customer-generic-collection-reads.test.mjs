import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../supabase/migrations/20260803_016_customer_generic_collection_reads.sql", import.meta.url), "utf8");

const customerBranch = migration.slice(
  migration.indexOf("customer_source_id = public.current_customer_source_id()"),
);

test("customer generic collection reads remain tenant and customer scoped", () => {
  assert.match(migration, /public\.is_organisation_member\(organisation_id\)/i);
  assert.match(customerBranch, /customer_source_id = public\.current_customer_source_id\(\)/i);
});

test("customers can read only authenticated portal-facing generic collections", () => {
  for (const key of [
    "jr-os-job-timeline",
    "jr-os-portal-payment-links",
    "jr-os-portal-photo-shares",
    "jr-os-portal-activity",
    "jr-os-deposit-requirements",
  ]) {
    assert.match(customerBranch, new RegExp(`'${key}'`));
  }
});

test("internal and demo access collections are not customer readable", () => {
  for (const key of [
    "jr-os-portal-access",
    "jr-os-business-settings",
    "jr-os-ai-learning-memory",
    "jr-os-crm-interactions",
    "jr-os-labour-rates",
  ]) {
    assert.doesNotMatch(customerBranch, new RegExp(`'${key}'`));
  }
});

test("the previous unrestricted customer collection read policy is replaced", () => {
  assert.match(migration, /drop policy if exists "cloud collections tenant read"/i);
  assert.match(migration, /collection_key in \(/i);
});
