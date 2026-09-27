import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20260803_017_customer_typed_table_reads.sql", import.meta.url),
  "utf8",
);

const staffOnlySection = migration.slice(
  migration.indexOf("'builders'"),
  migration.indexOf("foreach t in array array[", migration.indexOf("'builders'") + 1),
);
const customerFacingSection = migration.slice(migration.indexOf("'customers'"));

test("sensitive typed tables require an active staff role", () => {
  for (const table of [
    "builders",
    "expenses",
    "materials",
    "stock_items",
    "stock_movements",
    "purchase_lists",
    "team_members",
    "timesheets",
    "electrical_testing_records",
    "ai_recommendation_evidence",
  ]) {
    assert.match(staffOnlySection, new RegExp(`'${table}'`));
  }
  assert.match(staffOnlySection, /current_jr_role\(\) in \(''owner'',''admin'',''office'',''electrician''\)/i);
  assert.doesNotMatch(staffOnlySection, /current_customer_source_id\(\)/i);
});

test("customer-facing typed reads remain tenant and customer scoped", () => {
  for (const table of [
    "customers",
    "jobs",
    "pricing_documents",
    "invoices",
    "payments",
    "planner_entries",
    "certificates",
    "job_documents",
    "portal_approvals",
    "portal_requests",
  ]) {
    assert.match(customerFacingSection, new RegExp(`'${table}'`));
  }
  assert.match(migration, /organisation_id = public\.current_organisation_id\(\)/i);
  assert.match(customerFacingSection, /customer_source_id = public\.current_customer_source_id\(\)/i);
});

test("every original typed select policy is replaced", () => {
  assert.match(migration, /drop policy if exists %I on public\.%I/i);
  assert.match(migration, /t\|\|'_select'/i);
});
