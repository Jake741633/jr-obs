import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20260809_031_public_grant_least_privilege.sql", import.meta.url),
  "utf8",
);

const operationalTables = [
  "ai_recommendation_evidence",
  "app_records",
  "builders",
  "certificates",
  "cloud_collections",
  "customers",
  "electrical_testing_records",
  "expenses",
  "invoices",
  "job_documents",
  "jobs",
  "materials",
  "migration_markers",
  "payments",
  "planner_entries",
  "portal_approvals",
  "portal_requests",
  "pricing_documents",
  "private_files",
  "purchase_lists",
  "stock_items",
  "stock_movements",
  "team_members",
  "timesheets",
];

test("future public objects default to no Data API grants", () => {
  assert.match(migration, /alter default privileges for role postgres in schema public[\s\S]*revoke all on tables from anon, authenticated, service_role/i);
  assert.match(migration, /alter default privileges for role postgres in schema public[\s\S]*revoke all on sequences from anon, authenticated, service_role/i);
  assert.match(migration, /alter default privileges for role postgres in schema public[\s\S]*revoke all on functions from public, anon, authenticated, service_role/i);
});

test("anonymous business-data access is removed at schema and object boundaries", () => {
  assert.match(migration, /revoke usage on schema public from public, anon/i);
  assert.match(migration, /revoke all privileges on all tables in schema public from anon, authenticated/i);
  assert.match(migration, /revoke all privileges on all sequences in schema public from anon, authenticated/i);
  assert.match(migration, /revoke all privileges on all functions in schema public from anon, authenticated/i);
});

test("authenticated read-only and profile grants are explicit", () => {
  assert.match(migration, /grant select on table\s+public\.organisations,\s+public\.audit_log\s+to authenticated/is);
  assert.match(migration, /grant select, update on table public\.profiles to authenticated/i);
  assert.doesNotMatch(migration, /grant all/i);
});

test("every operational table receives CRUD and no non-API privilege", () => {
  const match = migration.match(/grant select, insert, update, delete on table([\s\S]*?)to authenticated;/i);
  assert.ok(match, "operational CRUD grant must exist");
  const grantedTables = [...match[1].matchAll(/public\.([a-z_]+)/g)]
    .map((entry) => entry[1])
    .sort();
  assert.deepEqual(grantedTables, [...operationalTables].sort());
  assert.doesNotMatch(migration, /grant[^;]*(truncate|references|trigger)/i);
});

test("PostgREST reloads after the grant surface changes", () => {
  assert.match(migration, /notify pgrst, 'reload schema'/i);
});
