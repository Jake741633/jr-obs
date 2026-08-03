import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../supabase/migrations/20260803_015_private_file_metadata_delete_guard.sql", import.meta.url), "utf8");

test("the broad private file metadata write policy is removed", () => {
  assert.match(migration, /drop policy if exists files_write on public\.private_files/i);
  assert.doesNotMatch(migration, /create policy files_write[\s\S]*for all/i);
});

test("field-capable staff can insert and update metadata inside their organisation", () => {
  assert.match(migration, /create policy private_files_staff_insert[\s\S]*for insert/i);
  assert.match(migration, /create policy private_files_staff_update[\s\S]*for update/i);
  assert.match(migration, /organisation_id = public\.current_organisation_id\(\)/i);
  assert.match(migration, /public\.can_manage_field_data\(\)/i);
});

test("metadata actors are bound to the authenticated user", () => {
  assert.match(migration, /created_by = auth\.uid\(\)/i);
  assert.match(migration, /updated_by = auth\.uid\(\)/i);
});

test("private file metadata deletion requires owner or admin authority", () => {
  assert.match(migration, /create policy private_files_admin_delete[\s\S]*for delete/i);
  assert.match(migration, /public\.can_manage_business\(\)/i);
  assert.doesNotMatch(migration, /private_files_admin_delete[\s\S]*can_manage_field_data\(\)/i);
});
