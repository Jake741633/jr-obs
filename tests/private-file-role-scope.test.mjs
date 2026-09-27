import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20260809_056_private_file_role_scope.sql", import.meta.url),
  "utf8",
);
const privateFiles = readFileSync(new URL("../lib/cloud/privateFiles.ts", import.meta.url), "utf8");
const recovery = readFileSync(new URL("../supabase/recovery/after_schema_only.sql", import.meta.url), "utf8");

function policyBody(name, tableMarker = "create policy") {
  const start = migration.indexOf(`${tableMarker} ${name}`);
  const nextDrop = migration.indexOf("drop policy if exists", start);
  return migration.slice(start, nextDrop === -1 ? migration.length : nextDrop);
}

test("private file metadata carries an allowlisted source collection", () => {
  assert.match(migration, /add column if not exists storage_key text/i);
  for (const key of ["jr-os-job-documents", "jr-os-expenses", "jr-os-surveys"]) {
    assert.match(migration, new RegExp(key));
  }
  assert.match(privateFiles, /storage_key: string;/i);
  assert.match(privateFiles, /storage_key: item\.storageKey/i);
});

test("known historical private files are backfilled without guessing unknown rows", () => {
  assert.match(migration, /set storage_key = 'jr-os-expenses'[\s\S]*from public\.expenses/i);
  assert.match(migration, /set storage_key = 'jr-os-job-documents'[\s\S]*from public\.job_documents/i);
  assert.match(migration, /set storage_key = 'jr-os-surveys'[\s\S]*survey\.collection_key = 'jr-os-surveys'[\s\S]*photo ->> 'id' = file\.source_id/i);
  assert.doesNotMatch(migration, /set storage_key = 'jr-os-(?:expenses|job-documents|surveys)'\s*where file\.storage_key is null\s*;/i);
});

test("private-file read helper mirrors office field and customer collection access", () => {
  assert.match(migration, /create or replace function private\.jr_can_read_private_file/i);
  assert.match(migration, /private\.can_manage_office_data\(\)/i);
  assert.match(migration, /private\.current_jr_role\(\) = 'electrician'[\s\S]*storage_key_value in \('jr-os-job-documents','jr-os-surveys'\)/i);
  assert.match(migration, /private\.current_jr_role\(\) = 'customer'[\s\S]*storage_key_value = 'jr-os-job-documents'[\s\S]*customer_source_id_value = private\.current_customer_source_id\(\)/i);
  assert.doesNotMatch(migration, /private\.current_jr_role\(\) = 'customer'[\s\S]*jr-os-expenses/i);
});

test("private-file metadata writes block expense receipts from field roles", () => {
  assert.match(migration, /create or replace function private\.jr_can_write_private_file/i);
  assert.match(migration, /private\.current_jr_role\(\) = 'electrician'[\s\S]*storage_key_value in \('jr-os-job-documents','jr-os-surveys'\)/i);
  const insertPolicy = policyBody("private_files_staff_insert");
  const updatePolicy = policyBody("private_files_staff_update");
  assert.match(insertPolicy, /private\.jr_can_write_private_file\(storage_key\)/i);
  assert.match(insertPolicy, /created_by = \(select auth\.uid\(\)\)/i);
  assert.match(updatePolicy, /using \([\s\S]*private\.jr_can_write_private_file\(storage_key\)/i);
  assert.match(updatePolicy, /with check \([\s\S]*private\.jr_can_write_private_file\(storage_key\)/i);
});

test("authenticated private downloads and overwrites require role-safe metadata", () => {
  const selectPolicy = policyBody("jr_private_select");
  const updatePolicy = policyBody("jr_private_update");
  assert.match(selectPolicy, /storage\.object\.get_authenticated/i);
  assert.match(selectPolicy, /from public\.private_files file[\s\S]*file\.object_path = name[\s\S]*private\.jr_can_read_private_file\(file\.storage_key, file\.customer_source_id\)/i);
  assert.match(selectPolicy, /storage\.object\.upload_update[\s\S]*private\.jr_can_write_private_file\(file\.storage_key\)/i);
  assert.match(updatePolicy, /using \([\s\S]*private\.jr_can_write_private_file\(file\.storage_key\)/i);
  assert.match(updatePolicy, /with check \([\s\S]*private\.jr_can_write_private_file\(file\.storage_key\)/i);
});

test("legacy private storage is office-only because it lacks source metadata", () => {
  for (const policyName of ["legacy_files_staff_select", "legacy_files_staff_insert", "legacy_files_staff_update"]) {
    const policy = policyBody(policyName);
    assert.match(policy, /bucket_id = 'jr-os-files'/i);
    assert.match(policy, /private\.can_manage_office_data\(\)/i);
    assert.doesNotMatch(policy, /private\.can_manage_field_data\(\)/i);
  }
});

test("private file role helpers are hidden from anonymous callers and recovery reapplies the boundary", () => {
  assert.match(migration, /revoke execute on function private\.jr_can_read_private_file\(text,text\)[\s\S]*from public, anon/i);
  assert.match(migration, /revoke execute on function private\.jr_can_write_private_file\(text\)[\s\S]*from public, anon/i);
  assert.match(recovery, /20260809_056_private_file_role_scope\.sql/i);
});
