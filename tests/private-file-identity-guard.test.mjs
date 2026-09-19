import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20260803_023_private_file_identity_guard.sql", import.meta.url),
  "utf8",
);

test("private-file ownership and object identity are immutable after insert", () => {
  assert.match(migration, /create or replace function public\.guard_private_file_identity\(\)/i);
  assert.match(migration, /new\.organisation_id is distinct from old\.organisation_id/i);
  assert.match(migration, /new\.source_id is distinct from old\.source_id/i);
  assert.match(migration, /new\.customer_source_id is distinct from old\.customer_source_id/i);
  assert.match(migration, /new\.job_source_id is distinct from old\.job_source_id/i);
  assert.match(migration, /new\.bucket is distinct from old\.bucket/i);
  assert.match(migration, /new\.object_path is distinct from old\.object_path/i);
  assert.match(migration, /new\.created_by is distinct from old\.created_by/i);
  assert.match(migration, /before update on public\.private_files/i);
  assert.match(migration, /revoke all on function public\.guard_private_file_identity\(\) from public, anon, authenticated/i);
});
