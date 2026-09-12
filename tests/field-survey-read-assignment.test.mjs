import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationName = "20260820130000_scope_field_survey_reads_to_assignments.sql";
const migration = readFileSync(new URL(`../supabase/migrations/${migrationName}`, import.meta.url), "utf8");
const recovery = readFileSync(new URL("../supabase/recovery/after_schema_only.sql", import.meta.url), "utf8");
const setup = readFileSync(new URL("../docs/SUPABASE_SETUP.md", import.meta.url), "utf8");
const runner = readFileSync(new URL("./run-supabase-rls.integration.mjs", import.meta.url), "utf8");
const privateFileRunner = readFileSync(new URL("./private-file-role-live-rls.test.mjs", import.meta.url), "utf8");

function section(startText, endText) {
  const start = migration.indexOf(startText);
  assert.ok(start >= 0, `Missing section start: ${startText}`);
  const end = migration.indexOf(endText, start);
  assert.ok(end > start, `Missing section end: ${endText}`);
  return migration.slice(start, end);
}

test("electrician survey projections require an assigned canonical job", () => {
  const policy = section(
    "create policy field_cloud_collections_electrician_select",
    "create or replace function private.jr_can_read_private_file",
  );
  assert.match(policy, /organisation_id = private\.current_organisation_id\(\)/i);
  assert.match(policy, /private\.current_jr_role\(\) = 'electrician'/i);
  assert.match(policy, /private\.jr_electrician_collection_is_readable\(collection_key\)/i);
  assert.match(
    policy,
    /collection_key <> 'jr-os-surveys'[\s\S]*or private\.jr_field_record_targets_assigned_job\(\s*organisation_id,\s*customer_source_id,\s*job_source_id\s*\)/i,
  );
});

test("survey private-file metadata and downloads use the same assignment envelope", () => {
  const helper = section(
    "create or replace function private.jr_can_read_private_file",
    "revoke execute on function private.jr_can_read_private_file(text, uuid, text, text)",
  );
  assert.match(helper, /stable[\s\S]*security definer[\s\S]*set search_path = ''/i);
  assert.match(helper, /private\.can_manage_office_data\(\)/i);
  assert.match(helper, /storage_key_value = 'jr-os-job-documents'/i);
  assert.match(
    helper,
    /storage_key_value = 'jr-os-surveys'[\s\S]*private\.jr_field_record_targets_assigned_job\(\s*record_organisation_id,\s*customer_source_id_value,\s*job_source_id_value\s*\)/i,
  );
  assert.match(migration, /drop function if exists private\.jr_can_read_private_file\(text, text\)/i);
  assert.match(
    migration,
    /create policy private_files_role_select[\s\S]*private\.jr_can_read_private_file\(\s*storage_key,\s*organisation_id,\s*customer_source_id,\s*job_source_id\s*\)/i,
  );
  assert.match(
    migration,
    /create policy jr_private_select[\s\S]*private\.jr_can_read_private_file\(\s*file\.storage_key,\s*file\.organisation_id,\s*file\.customer_source_id,\s*file\.job_source_id\s*\)/i,
  );
});

test("live RLS coverage retains assigned and unassigned survey boundaries", () => {
  for (const phrase of [
    "Assigned electrician should read the assigned survey projection",
    "Electrician must not read an unassigned same-tenant survey",
  ]) assert.match(runner, new RegExp(phrase.replaceAll(" ", "\\s+"), "i"));

  for (const phrase of [
    "Electrician should read assigned survey photo metadata",
    "Electrician must not read unassigned survey photo metadata",
    "Electrician must not download an unassigned survey photo",
  ]) assert.match(privateFileRunner, new RegExp(phrase.replaceAll(" ", "\\s+"), "i"));
});

test("recovery, guidance and deployment marker retain survey assignment scoping", () => {
  const progress = recovery.indexOf("20260814114500_secure_field_job_progress_updates.sql");
  const assignment = recovery.indexOf(migrationName);
  assert.ok(progress >= 0 && assignment > progress);
  assert.match(recovery.slice(assignment - 100, assignment + migrationName.length + 50), /begin;[\s\S]*\\ir[\s\S]*commit;/i);
  assert.match(setup, /surveys and their private photos are limited to assigned jobs/i);
  assert.match(migration, new RegExp(`'${migrationName.replaceAll(".", "\\.")}'`));
});
