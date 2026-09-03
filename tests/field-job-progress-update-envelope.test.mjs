import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { collectionCloudMutationRoute } from "../lib/cloud/fieldMutationPolicy-core.mjs";

const migrationName = "20260826112805_align_field_progress_update_customer_envelopes.sql";
const migration = readFileSync(new URL(`../supabase/migrations/${migrationName}`, import.meta.url), "utf8");
const readScope = readFileSync(new URL("../supabase/migrations/20260826104958_scope_field_job_progress_reads_to_assignments.sql", import.meta.url), "utf8");
const recovery = readFileSync(new URL("../supabase/recovery/after_schema_only.sql", import.meta.url), "utf8");
const setup = readFileSync(new URL("../docs/SUPABASE_SETUP.md", import.meta.url), "utf8");
const runner = readFileSync(new URL("./run-supabase-rls.integration.mjs", import.meta.url), "utf8");

function section(startText, endText) {
  const start = migration.indexOf(startText);
  assert.ok(start >= 0, `Missing section start: ${startText}`);
  const end = migration.indexOf(endText, start);
  assert.ok(end > start, `Missing section end: ${endText}`);
  return migration.slice(start, end);
}

test("progress updates accept only null or canonical customer envelopes", () => {
  const rpc = section(
    "create or replace function public.jr_field_save_job_progress",
    "revoke execute on function public.jr_field_save_job_progress",
  );
  const updateValidation = section(
    "if expected_version = 0 then",
    "canonical_payment := case",
  );

  assert.match(rpc, /language plpgsql[\s\S]*security definer[\s\S]*set search_path = ''/i);
  assert.match(rpc, /select \* into field_identity from private\.jr_active_field_identity\(\)/i);
  assert.match(rpc, /private\.jr_lock_active_field_identity\(/i);
  assert.match(
    rpc,
    /private\.jr_job_is_assigned_to_team_member\(\s*canonical_job\.payload,\s*field_identity\.team_member_source_id\s*\)/i,
  );
  assert.match(updateValidation, /canonical_record\.customer_source_id is not null[\s\S]*canonical_record\.customer_source_id is distinct from canonical_job\.customer_source_id/i);
  assert.doesNotMatch(updateValidation, /or canonical_record\.customer_source_id is distinct from canonical_job\.customer_source_id/i);
  assert.match(rpc, /canonical_record\.job_source_id is distinct from canonical_job\.source_id/i);
  assert.match(rpc, /canonical_record\.payload ->> 'jobId' is distinct from canonical_job\.source_id/i);
  assert.match(rpc, /canonical_record\.version <> expected_version/i);
});

test("progress sanitisation and assignment boundaries remain unchanged", () => {
  assert.match(migration, /canonical_job\.customer_source_id, canonical_job\.source_id, 1/i);
  assert.match(migration, /'payments', canonical_payment/i);
  assert.match(migration, /'suggestions', canonical_suggestions/i);
  assert.match(migration, /'updatedBy', field_identity\.team_member_name/i);
  assert.match(migration, /pg_catalog\.octet_length\(record_payload::text\) > 32768/i);
  assert.match(migration, /cloud_collections_job_progress_active_job_unique|An active progress record already exists for this job/i);
  assert.doesNotMatch(migration, /create policy|alter policy/i);
  assert.match(
    migration,
    /revoke execute on function public\.jr_field_save_job_progress\(text, text, integer, jsonb, uuid\)[\s\S]*from public, anon, authenticated, service_role/i,
  );
  assert.match(
    migration,
    /grant execute on function public\.jr_field_save_job_progress\(text, text, integer, jsonb, uuid\)[\s\S]*to authenticated/i,
  );
  assert.deepEqual(
    collectionCloudMutationRoute("cloud_collections", "electrician", "jr-os-job-progress"),
    {
      kind: "rpc",
      functionName: "jr_field_save_job_progress",
      resource: "cloud_collections",
      allowedIntents: ["create", "update"],
    },
  );
});

test("progress read and update contracts share nullable-customer semantics", () => {
  assert.match(
    readScope,
    /record_customer_source_id is null[\s\S]*or job\.customer_source_id is not distinct from record_customer_source_id/i,
  );
  assert.match(migration, /canonical_record\.customer_source_id is not null[\s\S]*canonical_record\.customer_source_id is distinct from canonical_job\.customer_source_id/i);
});

test("live RLS coverage proves null progress updates without widening assignment", () => {
  for (const phrase of [
    "Assigned electrician should update office-created null-customer job progress",
    "Progress RPC must preserve a legitimate null customer envelope",
    "Progress RPC must preserve the canonical payment percentage",
    "Progress RPC must preserve office suggestions",
    "Wrong non-null progress customer envelope must fail closed",
    "Electrician must not update unassigned job progress",
  ]) assert.match(runner, new RegExp(phrase.replaceAll(" ", "\\s+"), "i"));
});

test("recovery, guidance and deployment marker publish the aligned update contract", () => {
  const materialScope = recovery.indexOf("20260826110301_scope_field_material_usage_reads_to_assignments.sql");
  const updateScope = recovery.indexOf(migrationName);
  assert.ok(materialScope >= 0 && updateScope > materialScope);
  assert.match(recovery.slice(updateScope - 140, updateScope + migrationName.length + 50), /begin;[\s\S]*\\ir[\s\S]*commit;/i);
  assert.match(setup, /office-created null-customer progress remains updatable through the assigned-job RPC/i);
  assert.match(migration, new RegExp(`'${migrationName.replaceAll(".", "\\.")}'`));
});
