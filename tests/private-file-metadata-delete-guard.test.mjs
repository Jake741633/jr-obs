import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../supabase/migrations/20260809_029_consolidate_private_file_policies.sql", import.meta.url), "utf8");

function policyBody(name) {
  const start = migration.indexOf(`create policy ${name}`);
  assert.notEqual(start, -1);
  const next = migration.indexOf("create policy ", start + 14);
  return migration.slice(start, next === -1 ? undefined : next);
}

test("legacy and duplicate private-file write policies are removed", () => {
  for (const policy of [
    "files_write",
    "files_staff_insert",
    "files_staff_update",
    "files_admin_delete",
    "private_files_staff_insert",
    "private_files_staff_update",
    "private_files_admin_delete",
  ]) {
    assert.match(migration, new RegExp(`drop policy if exists ${policy} on public\\.private_files`, "i"));
  }
  assert.equal([...migration.matchAll(/create policy /gi)].length, 3);
});

test("one insert policy requires tenant, role, path, bucket, MIME and actor together", () => {
  const insertPolicy = policyBody("private_files_staff_insert");
  assert.match(insertPolicy, /for insert to authenticated/i);
  assert.match(insertPolicy, /organisation_id = public\.current_organisation_id\(\)/i);
  assert.match(insertPolicy, /public\.can_manage_field_data\(\)/i);
  assert.match(insertPolicy, /storage\.foldername\(object_path\)/i);
  assert.match(insertPolicy, /bucket = 'jr-os-private'/i);
  assert.match(insertPolicy, /mime_type in/i);
  assert.match(insertPolicy, /created_by = auth\.uid\(\)/i);
  assert.match(insertPolicy, /updated_by = auth\.uid\(\)/i);
});

test("one update policy preserves path, content and authenticated attribution", () => {
  const updatePolicy = policyBody("private_files_staff_update");
  assert.match(updatePolicy, /for update to authenticated/i);
  assert.match(updatePolicy, /using \([\s\S]*organisation_id = public\.current_organisation_id\(\)/i);
  assert.match(updatePolicy, /with check \([\s\S]*storage\.foldername\(object_path\)/i);
  assert.match(updatePolicy, /bucket = 'jr-os-private'/i);
  assert.match(updatePolicy, /mime_type in/i);
  assert.match(updatePolicy, /updated_by = auth\.uid\(\)/i);
});

test("private file metadata deletion requires owner or admin authority", () => {
  const deletePolicy = policyBody("private_files_admin_delete");
  assert.match(deletePolicy, /for delete to authenticated/i);
  assert.match(deletePolicy, /public\.can_manage_business\(\)/i);
  assert.doesNotMatch(deletePolicy, /can_manage_field_data\(\)/i);
});
