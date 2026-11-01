import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20260809_030_private_authorization_helpers.sql", import.meta.url),
  "utf8",
);

const helpers = [
  ["current_jr_role", ""],
  ["current_customer_source_id", ""],
  ["is_organisation_member", "uuid"],
  ["current_organisation_id", ""],
  ["\"current_role\"", ""],
  ["can_manage_business", ""],
  ["can_manage_office_data", ""],
  ["can_manage_field_data", ""],
  ["can_write_cloud_collection", "text"],
];

function escaped(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test("authorization helpers move from public into a private schema", () => {
  assert.match(migration, /create schema if not exists private/i);
  assert.match(migration, /revoke all on schema private from public, anon, authenticated, service_role/i);
  assert.match(migration, /grant usage on schema private to authenticated, service_role/i);

  for (const [name, signature] of helpers) {
    assert.match(
      migration,
      new RegExp(`alter function public\\.${escaped(name)}\\(${signature}\\) set schema private`, "i"),
    );
  }
});

test("private helper execution is explicit and future functions default closed", () => {
  assert.match(
    migration,
    /alter default privileges for role postgres in schema private[\s\S]*revoke execute on functions from public, anon, authenticated, service_role/i,
  );
  assert.match(migration, /revoke execute on function[\s\S]*from public, anon/i);
  assert.match(migration, /grant execute on function[\s\S]*to authenticated, service_role/i);
});

test("stored function bodies are rebound to private helpers", () => {
  for (const name of ["can_manage_business", "can_manage_office_data", "can_manage_field_data", "can_write_cloud_collection"]) {
    assert.match(migration, new RegExp(`create or replace function private\\.${name}\\(`, "i"));
  }
  assert.match(migration, /private\."current_role"\(\)/i);
  assert.match(migration, /private\.current_jr_role\(\)/i);
  assert.match(migration, /guard_jr_tombstone_transition\(\)[\s\S]*private\.can_manage_business\(\)/i);
  assert.doesNotMatch(migration, /set search_path\s*=\s*public/i);
});

test("PostgREST refreshes after the public RPC surface is removed", () => {
  assert.match(migration, /notify pgrst, 'reload schema'/i);
});
