import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20260809_052_field_builder_projection.sql", import.meta.url),
  "utf8",
);
const collections = readFileSync(new URL("../lib/cloud/collections.ts", import.meta.url), "utf8");
const recovery = readFileSync(new URL("../supabase/recovery/after_schema_only.sql", import.meta.url), "utf8");

function functionBody(name) {
  const start = migration.indexOf(`create or replace function ${name}`);
  const end = migration.indexOf("revoke execute on function", start);
  return migration.slice(start, end);
}

const fieldPayload = functionBody("private.jr_field_builder_payload");

test("field builder projection is an RLS-protected read-only surface", () => {
  assert.match(migration, /create table if not exists public\.field_builders/i);
  assert.match(migration, /alter table public\.field_builders enable row level security/i);
  assert.match(migration, /grant select on table public\.field_builders to authenticated/i);
  assert.doesNotMatch(migration, /grant (?:insert|update|delete)[^;]*field_builders to authenticated/i);
  assert.match(migration, /create policy field_builders_electrician_select[\s\S]*organisation_id = private\.current_organisation_id\(\)[\s\S]*private\.current_jr_role\(\) = 'electrician'/i);
});

test("field builder payload keeps contact data and omits relationship notes", () => {
  for (const key of ["id", "companyName", "contactName", "email", "phone", "address", "createdAt", "updatedAt"]) {
    assert.match(fieldPayload, new RegExp(`'${key}'`));
  }
  assert.doesNotMatch(fieldPayload, /'notes'/i);
});

test("complete builder source rows are office-only", () => {
  const policy = migration.slice(migration.lastIndexOf("create policy builders_select"));
  assert.match(policy, /organisation_id = private\.current_organisation_id\(\)/i);
  assert.match(policy, /private\.can_manage_office_data\(\)/i);
  assert.doesNotMatch(policy, /= 'electrician'|current_customer_source_id/i);
});

test("electrician builder repositories route through the field projection", () => {
  assert.match(collections, /electrician:\s*\{[\s\S]*builders:\s*"field_builders"/i);
  assert.match(collections, /roleReadTables\[role\]\?\.\[table\] \?\? table/i);
});

test("field builder projection is trigger-maintained and recovery-safe", () => {
  assert.match(migration, /after insert or update or delete on public\.builders/i);
  assert.match(migration, /private\.jr_field_builder_payload\(new\.payload\)/i);
  assert.match(migration, /on conflict \(id\) do update/i);
  assert.match(migration, /revoke execute on function private\.jr_field_builder_payload\(jsonb\)[\s\S]*from public, anon, authenticated, service_role/i);
  assert.match(migration, /revoke execute on function private\.refresh_jr_field_builder_projection\(\)[\s\S]*from public, anon, authenticated/i);
  assert.match(recovery, /20260809_052_field_builder_projection\.sql/i);
});
