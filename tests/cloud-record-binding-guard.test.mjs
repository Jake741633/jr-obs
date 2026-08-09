import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20260809_039_guard_cloud_record_bindings.sql", import.meta.url),
  "utf8",
);
const recovery = readFileSync(
  new URL("../supabase/recovery/after_schema_only.sql", import.meta.url),
  "utf8",
);
const cloudSync = readFileSync(new URL("../lib/cloudSync.ts", import.meta.url), "utf8");
const repository = readFileSync(new URL("../lib/cloud/repository.ts", import.meta.url), "utf8");

test("cloud envelopes must match their stable payload identity and links", () => {
  assert.match(migration, /record_payload ->> 'id' = record_source_id/i);
  assert.match(migration, /record_table = 'customers'[\s\S]*record_customer_source_id is null or record_customer_source_id = record_source_id/i);
  assert.match(migration, /record_table <> 'customers'[\s\S]*record_customer_source_id is not distinct from payload_links\.customer_source_id/i);
  assert.match(migration, /record_table in \('customers', 'jobs'\)[\s\S]*record_job_source_id is null[\s\S]*payload_links\.job_source_id is null/i);
  assert.match(migration, /record_table not in \('customers', 'jobs'\)[\s\S]*record_job_source_id is not distinct from payload_links\.job_source_id/i);
});

test("customer and job references must resolve inside the envelope organisation", () => {
  assert.match(
    migration,
    /from public\.customers customer[\s\S]*customer\.organisation_id = record_organisation_id[\s\S]*customer\.source_id = record_customer_source_id/i,
  );
  assert.match(
    migration,
    /from public\.jobs job[\s\S]*job\.organisation_id = record_organisation_id[\s\S]*job\.source_id = record_job_source_id[\s\S]*job\.customer_source_id is not distinct from record_customer_source_id/i,
  );
});

test("every typed and generic record write uses the binding guard", () => {
  for (const table of [
    "cloud_collections", "customers", "builders", "jobs", "pricing_documents", "invoices", "payments",
    "expenses", "materials", "stock_items", "stock_movements", "purchase_lists", "planner_entries",
    "team_members", "timesheets", "certificates", "electrical_testing_records", "job_documents",
    "portal_approvals", "portal_requests", "ai_recommendation_evidence",
  ]) {
    assert.match(migration, new RegExp(`'${table}'`, "i"));
  }
  assert.match(migration, /before insert or update[\s\S]*private\.guard_jr_cloud_record_binding\(\)/i);
  assert.match(migration, /where not private\.jr_cloud_record_binding_is_valid[\s\S]*limit 1/i);
});

test("binding validation is private, recovery-safe and migration-order safe", () => {
  assert.match(migration, /security definer[\s\S]*set search_path = ''/i);
  assert.match(
    migration,
    /revoke execute on function private\.jr_cloud_record_binding_is_valid[\s\S]*from public, anon, authenticated, service_role/i,
  );
  assert.match(recovery, /20260809_039_guard_cloud_record_bindings\.sql/i);
  assert.match(cloudSync, /function typedMigrationPriority[\s\S]*jr-os-customers[\s\S]*return 0[\s\S]*jr-os-jobs[\s\S]*return 1/i);
  assert.match(cloudSync, /\.sort\(\(left, right\) => typedMigrationPriority\(left\) - typedMigrationPriority\(right\)\)/i);
  assert.equal(repository.match(/recordTable: (?:item\.table|table)/g)?.length, 2);
});
