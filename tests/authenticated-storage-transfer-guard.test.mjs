import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20260809_041_require_authenticated_storage_transfers.sql", import.meta.url),
  "utf8",
);
const recovery = readFileSync(new URL("../supabase/recovery/after_schema_only.sql", import.meta.url), "utf8");
const client = readFileSync(new URL("../lib/cloud/client.ts", import.meta.url), "utf8");
const privateFiles = readFileSync(new URL("../lib/cloud/privateFiles.ts", import.meta.url), "utf8");
const setup = readFileSync(new URL("../docs/SUPABASE_SETUP.md", import.meta.url), "utf8");

function policyBody(name) {
  const match = new RegExp(`create policy ${name} on storage\\.objects([\\s\\S]*?)(?=\\ndrop policy|\\n-- A signed-upload|\\nnotify pgrst)`, "i").exec(migration);
  assert.ok(match, `${name} must be defined`);
  return match[1];
}

test("JR Storage migrations require operation-aware RLS support", () => {
  assert.match(migration, /to_regprocedure\('storage\.allow_only_operation\(text\)'\) is null/i);
  assert.match(migration, /to_regprocedure\('storage\.allow_any_operation\(text\[\]\)'\) is null/i);
  assert.match(migration, /does not expose operation-aware RLS helpers/i);
});

test("private and legacy reads allow authenticated transfers but not signing", () => {
  const privateSelect = policyBody("jr_private_select");
  assert.match(privateSelect, /storage\.object\.get_authenticated/i);
  assert.match(privateSelect, /storage\.object\.upload_update/i);
  assert.match(privateSelect, /private\.current_organisation_id\(\)/i);
  assert.match(privateSelect, /private\.current_customer_source_id\(\)/i);
  assert.doesNotMatch(privateSelect, /storage\.object\.sign(?:_many)?['"]/i);

  const legacySelect = policyBody("legacy_files_staff_select");
  assert.match(legacySelect, /storage\.object\.get_authenticated/i);
  assert.match(legacySelect, /storage\.object\.upload_update/i);
  assert.match(legacySelect, /private\.can_manage_field_data\(\)/i);
  assert.doesNotMatch(legacySelect, /storage\.object\.sign(?:_many)?['"]/i);
});

test("JR Storage writes are restricted to their exact authenticated operations", () => {
  for (const name of ["jr_private_insert", "legacy_files_staff_insert"]) {
    assert.match(policyBody(name), /storage\.allow_only_operation\('storage\.object\.upload'\)/i);
  }
  for (const name of ["jr_private_update", "legacy_files_staff_update"]) {
    assert.match(policyBody(name), /storage\.allow_only_operation\('storage\.object\.upload_update'\)/i);
  }
  for (const name of ["jr_private_delete", "legacy_files_admin_delete"]) {
    assert.match(policyBody(name), /storage\.allow_only_operation\('storage\.object\.delete'\)/i);
  }
});

test("pre-existing signed upload tokens are rejected at the Storage table", () => {
  assert.match(
    migration,
    /create or replace function private\.reject_jr_signed_storage_upload\(\)[\s\S]*new\.bucket_id in \('jr-os-private', 'jr-os-files'\)[\s\S]*storage\.allow_only_operation\('storage\.object\.upload_signed'\)[\s\S]*errcode = '42501'/i,
  );
  assert.match(
    migration,
    /create trigger jr_storage_reject_signed_upload[\s\S]*before insert or update on storage\.objects[\s\S]*private\.reject_jr_signed_storage_upload\(\)/i,
  );
});

test("the client uses live authenticated Storage requests only", () => {
  assert.match(client, /uploadPrivateObject[\s\S]*\/storage\/v1\/object\/\$\{cloudStorageBucket\}/);
  assert.match(client, /downloadPrivateObject[\s\S]*\/storage\/v1\/object\/authenticated\/\$\{cloudStorageBucket\}/);
  assert.match(client, /downloadPrivateObject[\s\S]*const session = cloudSession\.load\(\)/);
  assert.doesNotMatch(client, /\/storage\/v1\/object\/(?:upload\/)?sign\//);
  assert.doesNotMatch(client, /createSigned(?:Upload|Download)/);
  assert.match(privateFiles, /uploadPrivateObject\(item\.objectPath, blob, item\.mimeType\)/);
  assert.match(privateFiles, /downloadPrivateObject\(objectPath\)/);
});

test("schema-only recovery reapplies authenticated Storage enforcement", () => {
  assert.match(recovery, /20260809_041_require_authenticated_storage_transfers\.sql/i);
});

test("deployment guidance retains the one-time signed-download key rotation", () => {
  assert.match(setup, /ask Supabase Support to rotate the project's dedicated Storage signed-URL key/i);
  assert.match(setup, /signed download URLs issued before the migration remain valid until their chosen expiry/i);
  assert.match(setup, /do not mark the signed-token hardening complete until that rotation is confirmed/i);
});
