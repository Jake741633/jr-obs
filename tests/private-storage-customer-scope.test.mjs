import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../supabase/migrations/20260803_012_private_storage_customer_scope.sql", import.meta.url), "utf8");

test("private storage reads remain bound to the authenticated organisation path", () => {
  assert.match(migration, /bucket_id = 'jr-os-private'/i);
  assert.match(migration, /\(storage\.foldername\(name\)\)\[1\] = public\.current_organisation_id\(\)::text/i);
});

test("staff retain tenant-scoped private storage reads", () => {
  assert.match(migration, /public\.current_role\(\) <> 'customer'/i);
});

test("customer storage reads require matching private file metadata", () => {
  assert.match(migration, /or exists \([\s\S]*from public\.private_files file/i);
  assert.match(migration, /file\.organisation_id = public\.current_organisation_id\(\)/i);
  assert.match(migration, /file\.object_path = name/i);
  assert.match(migration, /file\.customer_source_id = \([\s\S]*profile\.customer_source_id[\s\S]*profile\.id = auth\.uid\(\)/i);
});

test("the legacy organisation-only storage read policy is replaced", () => {
  assert.match(migration, /drop policy if exists jr_private_select on storage\.objects/i);
  assert.match(migration, /create policy jr_private_select on storage\.objects[\s\S]*for select to authenticated/i);
  assert.doesNotMatch(migration, /using \(bucket_id='jr-os-private' and \(storage\.foldername\(name\)\)\[1\]=public\.current_organisation_id\(\)::text\);/i);
});
