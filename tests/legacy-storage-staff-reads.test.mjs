import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../supabase/migrations/20260803_014_legacy_storage_staff_reads.sql", import.meta.url), "utf8");

test("legacy storage reads remain organisation scoped", () => {
  assert.match(migration, /bucket_id = 'jr-os-files'/i);
  assert.match(migration, /\(storage\.foldername\(name\)\)\[1\] = public\.current_organisation_id\(\)::text/i);
});

test("legacy storage reads require an active field-capable staff role", () => {
  assert.match(migration, /public\.can_manage_field_data\(\)/i);
  assert.doesNotMatch(migration, /public\.current_role\(\) = 'customer'/i);
});

test("the broad legacy organisation-member read policy is replaced", () => {
  assert.match(migration, /drop policy if exists "Members can view organisation files" on storage\.objects/i);
  assert.match(migration, /create policy legacy_files_staff_select on storage\.objects[\s\S]*for select to authenticated/i);
});
