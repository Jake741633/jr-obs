import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20260803_026_migration_marker_identity_guard.sql", import.meta.url),
  "utf8",
);

test("migration marker identity fields cannot be rewritten", () => {
  assert.match(migration, /create or replace function public\.guard_jr_migration_marker_identity\(\)/i);
  assert.match(migration, /new\.id is distinct from old\.id/i);
  assert.match(migration, /new\.organisation_id is distinct from old\.organisation_id/i);
  assert.match(migration, /new\.storage_key is distinct from old\.storage_key/i);
  assert.match(migration, /new\.source_id is distinct from old\.source_id/i);
  assert.match(migration, /Migration marker identity fields are immutable/i);
});

test("migration marker identity guard runs before every update", () => {
  assert.match(migration, /create trigger migration_markers_identity_guard\s+before update on public\.migration_markers\s+for each row execute function public\.guard_jr_migration_marker_identity\(\)/is);
  assert.match(migration, /revoke all on function public\.guard_jr_migration_marker_identity\(\) from public, anon, authenticated/i);
});
