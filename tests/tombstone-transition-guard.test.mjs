import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../supabase/migrations/20260803_021_tombstone_transition_guard.sql", import.meta.url), "utf8");

test("soft delete and restore transitions require business authority", () => {
  assert.match(migration, /new\.deleted_at is distinct from old\.deleted_at/i);
  assert.match(migration, /public\.can_manage_business\(\)/i);
  assert.match(migration, /Only an owner or admin can delete or restore records/i);
});

test("non privileged users cannot insert pre-deleted records", () => {
  assert.match(migration, /tg_op = 'INSERT'/i);
  assert.match(migration, /new\.deleted_at is not null/i);
});

test("the guard covers generic and typed cloud records", () => {
  for (const table of [
    "cloud_collections",
    "customers",
    "jobs",
    "pricing_documents",
    "invoices",
    "job_documents",
    "portal_approvals",
    "portal_requests",
  ]) {
    assert.match(migration, new RegExp(`'${table}'`));
  }
  assert.match(migration, /before insert or update of deleted_at/i);
});

test("clients cannot invoke the tombstone guard directly", () => {
  assert.match(migration, /revoke all on function public\.guard_jr_tombstone_transition\(\) from public, anon, authenticated/i);
});
