import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../supabase/migrations/20260803_013_customer_profile_visibility.sql", import.meta.url), "utf8");

test("customers can always read their own profile", () => {
  assert.match(migration, /id = auth\.uid\(\)/i);
});

test("organisation profile enumeration is restricted to active staff roles", () => {
  assert.match(migration, /organisation_id = public\.current_organisation_id\(\)/i);
  assert.match(migration, /public\.current_role\(\) in \('owner','admin','office','electrician'\)/i);
  assert.doesNotMatch(migration, /public\.current_role\(\) in \([^)]*'customer'/i);
});

test("the broad tenant profile policy is replaced", () => {
  assert.match(migration, /drop policy if exists profiles_tenant_select on public\.profiles/i);
  assert.match(migration, /create policy profiles_tenant_select on public\.profiles[\s\S]*for select to authenticated/i);
  assert.doesNotMatch(migration, /or organisation_id = public\.current_organisation_id\(\)\s*\)/i);
});
