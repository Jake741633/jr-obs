import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath = new URL(
  "../supabase/migrations/20260803_022_migration_marker_delete_guard.sql",
  import.meta.url,
);

test("migration marker policies bind actors and reserve deletion for owner/admin", async () => {
  const sql = await readFile(migrationPath, "utf8");

  assert.match(sql, /drop policy if exists markers_manage/i);
  assert.match(sql, /migration_markers_office_insert[\s\S]*imported_by\s*=\s*auth\.uid\(\)/i);
  assert.match(sql, /migration_markers_office_update[\s\S]*imported_by\s*=\s*auth\.uid\(\)/i);

  const deletePolicy = sql.match(
    /create policy migration_markers_admin_delete[\s\S]*?;\s*$/i,
  )?.[0];
  assert.ok(deletePolicy, "expected an explicit migration marker delete policy");
  assert.match(deletePolicy, /public\.can_manage_business\(\)/i);
  assert.doesNotMatch(deletePolicy, /public\.can_manage_office_data\(\)/i);
});
