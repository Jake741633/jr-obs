import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20260803_025_legacy_app_record_identity_guard.sql", import.meta.url),
  "utf8",
);

test("legacy app record updates cannot rewrite stable identity", () => {
  assert.match(migration, /create or replace function public\.guard_legacy_app_record_identity\(\)/);
  assert.match(migration, /new\.organisation_id is distinct from old\.organisation_id/);
  assert.match(migration, /new\.id is distinct from old\.id/);
  assert.match(migration, /new\.collection is distinct from old\.collection/);
  assert.match(migration, /new\.created_by is distinct from old\.created_by/);
  assert.match(migration, /before update on public\.app_records/);
  assert.match(migration, /revoke all on function public\.guard_legacy_app_record_identity\(\) from public, anon, authenticated/);
});
