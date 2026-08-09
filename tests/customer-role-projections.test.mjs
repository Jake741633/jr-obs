import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20260809_051_customer_role_projections.sql", import.meta.url),
  "utf8",
);
const collections = readFileSync(new URL("../lib/cloud/collections.ts", import.meta.url), "utf8");
const recovery = readFileSync(new URL("../supabase/recovery/after_schema_only.sql", import.meta.url), "utf8");

function functionBody(name) {
  const start = migration.indexOf(`create or replace function ${name}`);
  const end = migration.indexOf("revoke execute on function", start);
  return migration.slice(start, end);
}

const contactPayload = functionBody("private.jr_customer_contact_payload");

test("restricted customer reads use dedicated RLS projections", () => {
  for (const table of ["field_customers", "portal_customers"]) {
    assert.match(migration, new RegExp(`create table if not exists public\\.${table}`, "i"));
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
  }
  assert.match(migration, /create policy field_customers_electrician_select[\s\S]*private\.current_jr_role\(\) = 'electrician'/i);
  assert.match(migration, /create policy portal_customers_customer_select[\s\S]*private\.current_jr_role\(\) = 'customer'[\s\S]*customer_source_id = private\.current_customer_source_id\(\)/i);
  assert.match(migration, /grant select on table public\.field_customers, public\.portal_customers to authenticated/i);
  assert.doesNotMatch(migration, /grant (?:insert|update|delete)[^;]*(?:field_customers|portal_customers) to authenticated/i);
});

test("customer contact projections omit internal CRM notes", () => {
  for (const key of ["id", "name", "email", "phone", "address", "createdAt", "updatedAt"]) {
    assert.match(contactPayload, new RegExp(`'${key}'`));
  }
  assert.doesNotMatch(contactPayload, /'notes'/i);
});

test("complete customer source records are office-only", () => {
  const policy = migration.slice(migration.lastIndexOf("create policy customers_select"));
  assert.match(policy, /organisation_id = private\.current_organisation_id\(\)/i);
  assert.match(policy, /private\.can_manage_office_data\(\)/i);
  assert.doesNotMatch(policy, /current_customer_source_id|= 'customer'|= 'electrician'/i);
});

test("restricted clients route customer reads to the safe projections", () => {
  assert.match(collections, /customer:\s*\{[\s\S]*customers:\s*"portal_customers"/i);
  assert.match(collections, /electrician:\s*\{[\s\S]*customers:\s*"field_customers"/i);
  assert.match(collections, /roleReadTables\[role\]\?\.\[table\] \?\? table/i);
});

test("customer projections are trigger-maintained and recovery-safe", () => {
  assert.match(migration, /after insert or update or delete on public\.customers/i);
  assert.match(migration, /private\.jr_customer_contact_payload\(new\.payload\)/i);
  assert.match(migration, /on conflict \(id\) do update/i);
  assert.match(migration, /revoke execute on function private\.jr_customer_contact_payload\(jsonb\)[\s\S]*from public, anon, authenticated, service_role/i);
  assert.match(migration, /revoke execute on function private\.refresh_jr_customer_role_projections\(\)[\s\S]*from public, anon, authenticated/i);
  assert.match(recovery, /20260809_051_customer_role_projections\.sql/i);
});
