import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20260809_032_constrain_legacy_storage_uploads.sql", import.meta.url),
  "utf8",
);

const allowedMimeTypes = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "text/plain",
  "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

test("legacy storage remains private and enforces the 10 MB boundary", () => {
  assert.match(migration, /update storage\.buckets[\s\S]*public = false/i);
  assert.match(migration, /file_size_limit = 10485760/i);
  assert.match(migration, /where id = 'jr-os-files'/i);
});

test("legacy storage accepts only the audited attachment MIME allowlist", () => {
  const match = migration.match(/allowed_mime_types = array\[([\s\S]*?)\]::text\[\]/i);
  assert.ok(match, "legacy bucket MIME allowlist must exist");
  const actual = [...match[1].matchAll(/'([^']+)'/g)].map((entry) => entry[1]);
  assert.deepEqual(actual, allowedMimeTypes);
  assert.doesNotMatch(match[1], /\*|application\/octet-stream|application\/x-msdownload/i);
});

test("JR storage objects cannot move between legacy and current buckets", () => {
  assert.match(
    migration,
    /create or replace function private\.guard_jr_storage_bucket_identity\(\)[\s\S]*new\.bucket_id is distinct from old\.bucket_id[\s\S]*old\.bucket_id in \('jr-os-files', 'jr-os-private'\)[\s\S]*new\.bucket_id in \('jr-os-files', 'jr-os-private'\)[\s\S]*errcode = '42501'/i,
  );
  assert.match(
    migration,
    /revoke execute on function private\.guard_jr_storage_bucket_identity\(\)[\s\S]*from public, anon, authenticated/i,
  );
  assert.match(
    migration,
    /create trigger jr_storage_object_bucket_identity_guard[\s\S]*before update of bucket_id on storage\.objects[\s\S]*execute function private\.guard_jr_storage_bucket_identity\(\)/i,
  );
});

test("legacy inserts require an authenticated field-capable tenant path", () => {
  assert.match(
    migration,
    /create policy legacy_files_staff_insert on storage\.objects[\s\S]*for insert to authenticated[\s\S]*with check \([\s\S]*bucket_id = 'jr-os-files'[\s\S]*\(storage\.foldername\(name\)\)\[1\] = private\.current_organisation_id\(\)::text[\s\S]*private\.can_manage_field_data\(\)[\s\S]*\);/i,
  );
});

test("legacy updates enforce the same boundary before and after mutation", () => {
  const match = migration.match(
    /create policy legacy_files_staff_update on storage\.objects([\s\S]*?)notify pgrst/i,
  );
  assert.ok(match, "legacy update policy must exist");
  for (const clause of [
    /using \([\s\S]*bucket_id = 'jr-os-files'[\s\S]*private\.current_organisation_id\(\)::text[\s\S]*private\.can_manage_field_data\(\)/i,
    /with check \([\s\S]*bucket_id = 'jr-os-files'[\s\S]*private\.current_organisation_id\(\)::text[\s\S]*private\.can_manage_field_data\(\)/i,
  ]) {
    assert.match(match[1], clause);
  }
});

test("PostgREST reloads after the legacy storage boundary changes", () => {
  assert.match(migration, /notify pgrst, 'reload schema'/i);
});
