import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationName = "20260826230416_bind_field_survey_photo_reads.sql";
const migration = readFileSync(new URL(`../supabase/migrations/${migrationName}`, import.meta.url), "utf8");
const recovery = readFileSync(new URL("../supabase/recovery/after_schema_only.sql", import.meta.url), "utf8");
const setup = readFileSync(new URL("../docs/SUPABASE_SETUP.md", import.meta.url), "utf8");
const privateFileRunner = readFileSync(new URL("./private-file-role-live-rls.test.mjs", import.meta.url), "utf8");

function section(source, startText, endText) {
  const start = source.indexOf(startText);
  assert.ok(start >= 0, `Missing section start: ${startText}`);
  const end = source.indexOf(endText, start);
  assert.ok(end > start, `Missing section end: ${endText}`);
  return source.slice(start, end);
}

test("field survey-photo reads require the exact live canonical photo", () => {
  const helper = section(
    migration,
    "create or replace function private.jr_field_can_read_survey_photo",
    "revoke execute on function private.jr_field_can_read_survey_photo",
  );

  assert.match(helper, /stable[\s\S]*security definer[\s\S]*set search_path = ''/i);
  assert.match(helper, /survey\.collection_key = 'jr-os-surveys'/i);
  assert.match(helper, /survey\.deleted_at is null/i);
  assert.match(helper, /survey\.customer_source_id is not distinct from record_customer_source_id/i);
  assert.match(helper, /survey\.job_source_id is not distinct from record_job_source_id/i);
  assert.match(helper, /private\.jr_field_record_targets_assigned_job\(/i);
  assert.match(helper, /jsonb_typeof\(survey\.payload -> 'photos'\) = 'array'/i);
  assert.match(helper, /survey_photo\.photo ->> 'id' = record_source_id/i);
});

test("private metadata and Storage downloads share the canonical survey-photo helper", () => {
  const helper = section(
    migration,
    "create or replace function private.jr_can_read_private_file(",
    "revoke execute on function private.jr_can_read_private_file",
  );

  assert.match(helper, /storage_key_value = 'jr-os-job-documents'[\s\S]*private\.jr_field_can_read_job_document\(/i);
  assert.match(
    helper,
    /storage_key_value = 'jr-os-surveys'[\s\S]*private\.jr_field_can_read_survey_photo\(\s*record_organisation_id,\s*record_source_id,\s*customer_source_id_value,\s*job_source_id_value\s*\)/i,
  );
  assert.match(
    migration,
    /revoke execute on function private\.jr_can_read_private_file\(text, uuid, text, text, text\)[\s\S]*from public, anon, authenticated, service_role/i,
  );
  assert.match(
    migration,
    /grant execute on function private\.jr_can_read_private_file\(text, uuid, text, text, text\)[\s\S]*to authenticated, service_role/i,
  );
});

test("live private-file coverage rejects orphaned and deleted survey photos", () => {
  for (const phrase of [
    "Office should create the canonical assigned survey photo fixture",
    "Electrician should read assigned survey photo metadata",
    "Electrician must not read orphaned survey photo metadata",
    "Electrician must not download an orphaned survey photo",
    "Electrician must not read metadata for a soft-deleted survey photo",
    "Electrician must not download a soft-deleted survey photo",
    "Office should retain soft-deleted survey photo metadata",
    "Office should retain soft-deleted survey photo download access",
    "Electrician should regain survey photo metadata only after survey restoration",
    "Electrician should regain the survey photo download only after survey restoration",
  ]) assert.match(privateFileRunner, new RegExp(phrase.replaceAll(" ", "\\s+"), "i"));
});

test("recovery, guidance and deployment marker bind survey photos canonically", () => {
  const prior = recovery.indexOf("20260826144606_redact_field_job_progress_finance.sql");
  const photoBoundary = recovery.indexOf(migrationName);
  assert.ok(prior >= 0 && photoBoundary > prior);
  assert.match(recovery.slice(photoBoundary - 120, photoBoundary + migrationName.length + 50), /begin;[\s\S]*\\ir[\s\S]*commit;/i);
  assert.match(setup, /private-photo metadata and downloads require the exact photo to belong to a live canonical survey/i);
  assert.match(migration, new RegExp(`'${migrationName.replaceAll(".", "\\.")}'`));
});
