import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationName = "20260820153000_scope_field_job_document_reads_to_assignments.sql";
const migration = readFileSync(new URL(`../supabase/migrations/${migrationName}`, import.meta.url), "utf8");
const recovery = readFileSync(new URL("../supabase/recovery/after_schema_only.sql", import.meta.url), "utf8");
const setup = readFileSync(new URL("../docs/SUPABASE_SETUP.md", import.meta.url), "utf8");
const cache = readFileSync(new URL("../lib/cloud/roleProjectionCache-core.mjs", import.meta.url), "utf8");
const cacheTypes = readFileSync(new URL("../lib/cloud/roleProjectionCache-core.d.mts", import.meta.url), "utf8");
const adapter = readFileSync(new URL("../lib/cloud/adapter.ts", import.meta.url), "utf8");
const fieldMutationPolicy = readFileSync(new URL("../lib/cloud/fieldMutationPolicy-core.mjs", import.meta.url), "utf8");
const runner = readFileSync(new URL("./run-supabase-rls.integration.mjs", import.meta.url), "utf8");
const privateFileRunner = readFileSync(new URL("./private-file-role-live-rls.test.mjs", import.meta.url), "utf8");

function section(startText, endText) {
  const start = migration.indexOf(startText);
  assert.ok(start >= 0, `Missing section start: ${startText}`);
  const end = migration.indexOf(endText, start);
  assert.ok(end > start, `Missing section end: ${endText}`);
  return migration.slice(start, end);
}

test("electrician job-document rows require the canonical assigned job", () => {
  const helper = section(
    "create or replace function private.jr_field_can_read_job_document",
    "revoke execute on function private.jr_field_can_read_job_document",
  );
  assert.match(helper, /language sql[\s\S]*stable[\s\S]*security definer[\s\S]*set search_path = ''/i);
  assert.match(helper, /record_organisation_id = private\.current_organisation_id\(\)/i);
  assert.match(helper, /record_job_source_id is not null/i);
  assert.match(helper, /private\.current_team_member_source_id\(\) is not null/i);
  assert.match(helper, /from public\.job_documents document[\s\S]*join public\.jobs job/i);
  assert.match(helper, /document\.source_id = record_source_id/i);
  assert.match(helper, /document\.job_source_id is not distinct from record_job_source_id/i);
  assert.match(helper, /document\.deleted_at is null[\s\S]*job\.deleted_at is null/i);
  assert.match(
    helper,
    /document\.customer_source_id is null[\s\S]*or job\.customer_source_id is not distinct from document\.customer_source_id/i,
  );
  assert.match(
    helper,
    /record_customer_source_id is null[\s\S]*or job\.customer_source_id is not distinct from record_customer_source_id/i,
  );
  assert.match(helper, /private\.jr_job_is_assigned_to_team_member\([\s\S]*job\.payload/i);

  const policy = section(
    "create policy job_documents_select",
    "create or replace function private.jr_can_read_private_file",
  );
  assert.match(policy, /deleted_at is null/i);
  assert.match(policy, /organisation_id = private\.current_organisation_id\(\)/i);
  assert.match(policy, /private\.current_jr_role\(\) in \('owner', 'admin', 'office'\)/i);
  assert.match(policy, /private\.current_jr_role\(\) = 'electrician'/i);
  assert.match(
    policy,
    /private\.jr_field_can_read_job_document\(\s*organisation_id,\s*source_id,\s*customer_source_id,\s*job_source_id\s*\)/i,
  );
  assert.doesNotMatch(policy, /private\.current_jr_role\(\) = 'customer'/i);
});

test("job-document metadata and object reads use the same assignment envelope", () => {
  const helper = section(
    "create or replace function private.jr_can_read_private_file",
    "revoke execute on function private.jr_can_read_private_file",
  );
  assert.match(helper, /language sql[\s\S]*stable[\s\S]*security definer[\s\S]*set search_path = ''/i);
  assert.match(helper, /private\.can_manage_office_data\(\)/i);
  assert.match(
    helper,
    /storage_key_value = 'jr-os-job-documents'[\s\S]*private\.jr_field_can_read_job_document\(\s*record_organisation_id,\s*record_source_id,\s*customer_source_id_value,\s*job_source_id_value\s*\)/i,
  );
  assert.match(
    helper,
    /storage_key_value = 'jr-os-surveys'[\s\S]*private\.jr_field_record_targets_assigned_job\(\s*record_organisation_id,\s*customer_source_id_value,\s*job_source_id_value\s*\)/i,
  );
  assert.match(
    migration,
    /revoke execute on function private\.jr_can_read_private_file\(text, uuid, text, text, text\)[\s\S]*from public, anon, authenticated, service_role/i,
  );
  assert.match(
    migration,
    /grant execute on function private\.jr_can_read_private_file\(text, uuid, text, text, text\)[\s\S]*to authenticated, service_role/i,
  );
  assert.match(
    migration,
    /drop function if exists private\.jr_can_read_private_file\(text, uuid, text, text\)/i,
  );
  assert.match(
    migration,
    /create policy private_files_role_select[\s\S]*private\.jr_can_read_private_file\(\s*storage_key,\s*organisation_id,\s*source_id,\s*customer_source_id,\s*job_source_id\s*\)/i,
  );
  assert.match(
    migration,
    /create policy jr_private_select[\s\S]*private\.jr_can_read_private_file\(\s*file\.storage_key,\s*file\.organisation_id,\s*file\.source_id,\s*file\.customer_source_id,\s*file\.job_source_id\s*\)/i,
  );
});

test("field document writes remain default-deny", () => {
  assert.doesNotMatch(fieldMutationPolicy, /DIRECT_ELECTRICIAN_TABLES[\s\S]*job_documents/i);
  assert.match(fieldMutationPolicy, /canonical reads must never imply writes[\s\S]*documents/i);
  assert.match(fieldMutationPolicy, /return \{ kind: "deny" \};/i);
});

test("stale electrician job-document caches purge before offline fallback", () => {
  assert.match(cache, /ELECTRICIAN_JOB_DOCUMENT_CACHE_GENERATION = "20260820153000"/);
  assert.match(
    cache,
    /role === "electrician" && storageKey === "jr-os-job-documents"[\s\S]*return ELECTRICIAN_JOB_DOCUMENT_CACHE_GENERATION/,
  );
  assert.match(cache, /expectedGeneration && generation !== expectedGeneration[\s\S]*return "purge"/);
  assert.match(cacheTypes, /ELECTRICIAN_JOB_DOCUMENT_CACHE_GENERATION: "20260820153000"/);
  assert.match(adapter, /roleProjectionCachePolicy\(\{ storageKey, role: cacheRole, mode, generation: cachedGeneration \}\)/);
  assert.match(adapter, /if \(mode === "local" \|\| !navigator\.onLine\) return local/);
  assert.match(adapter, /roleProjectionCacheGeneration\(\{ storageKey, role: cacheRole \}\)/);
});

test("live RLS coverage retains assigned documents and denies broader field reads", () => {
  for (const phrase of [
    "Assigned electrician should retain the production-shaped null-customer job document",
    "Co-assigned electrician should retain the assigned job document",
    "Electrician must not read an unassigned same-tenant job document",
    "Electrician must not read a deleted job document",
    "Assigned electrician must not read another organisation's job document",
    "Office should retain unassigned job document access",
  ]) assert.match(runner, new RegExp(phrase.replaceAll(" ", "\\s+"), "i"));

  for (const phrase of [
    "Electrician should read assigned job-document metadata",
    "Co-assigned electrician should read assigned job-document metadata",
    "Electrician must not read metadata for a soft-deleted job document",
    "Electrician must not download a soft-deleted job document",
    "Office should retain metadata for a soft-deleted job document",
    "Electrician should regain assigned metadata only after document restoration",
    "Electrician should regain the assigned download only after document restoration",
    "Electrician must not read unassigned job-document metadata",
    "Electrician must not download an unassigned job document",
    "Office should retain unassigned job-document download access",
    "Assigned electrician must not download another organisation's job document",
  ]) assert.match(privateFileRunner, new RegExp(phrase.replaceAll(" ", "\\s+"), "i"));
});

test("recovery, guidance and deployment marker retain document assignment scoping", () => {
  const customerScope = recovery.indexOf("20260820150000_scope_field_customer_reads_to_assignments.sql");
  const documentScope = recovery.indexOf(migrationName);
  assert.ok(customerScope >= 0 && documentScope > customerScope);
  assert.match(recovery.slice(documentScope - 120, documentScope + migrationName.length + 50), /begin;[\s\S]*\\ir[\s\S]*commit;/i);
  assert.match(setup, /job documents, private-file metadata and authenticated object downloads are limited to jobs assigned/i);
  assert.match(migration, new RegExp(`'${migrationName.replaceAll(".", "\\.")}'`));
});
