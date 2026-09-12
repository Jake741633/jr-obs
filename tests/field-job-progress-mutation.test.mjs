import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../supabase/migrations/20260814114500_secure_field_job_progress_updates.sql", import.meta.url), "utf8");
const policy = readFileSync(new URL("../lib/cloud/fieldMutationPolicy-core.mjs", import.meta.url), "utf8");

test("field job progress uses a dedicated optimistic RPC route", () => {
  assert.match(policy, /"jr-os-job-progress"[\s\S]*functionName: "jr_field_save_job_progress"[\s\S]*allowedIntents: \["create", "update"\]/);
  assert.match(migration, /create or replace function public\.jr_field_save_job_progress\(\s*collection_key_value text,\s*record_source_id text,\s*expected_version integer,\s*record_payload jsonb,\s*mutation_id uuid\s*\)/i);
  assert.match(migration, /language plpgsql[\s\S]*security definer[\s\S]*set search_path = ''/i);
  assert.match(migration, /private\.jr_claim_field_mutation/);
  assert.match(migration, /canonical_record\.version <> expected_version/);
  assert.match(migration, /using errcode = 'PT409'/);
});

test("field job progress is restricted to active assigned electricians", () => {
  assert.match(migration, /private\.jr_active_field_identity\(\)/);
  assert.match(migration, /private\.jr_lock_active_field_identity/);
  assert.match(migration, /private\.jr_job_is_assigned_to_team_member/);
  assert.match(migration, /collection_key_value is distinct from 'jr-os-job-progress'/);
  assert.match(migration, /cloud_record\.organisation_id = field_identity\.organisation_id/);
  assert.match(migration, /canonical_record\.job_source_id is distinct from canonical_job\.source_id/);
});

test("field writes cannot alter payment progress or inject unsupported payload keys", () => {
  assert.match(migration, /jsonb_typeof\(requested_manual\) is distinct from 'object'/);
  assert.match(migration, /requested_manual - array\[[\s\S]*'payments'[\s\S]*\]::text\[\] is distinct from '\{\}'::jsonb/);
  assert.match(migration, /jsonb_typeof\(requested_manual -> metric_name\) is distinct from 'number'/);
  for (const metric of ["overall", "firstFix", "secondFix", "testing", "certificates", "materials"]) {
    assert.match(migration, new RegExp(`'${metric}'`));
  }
  assert.match(migration, /canonical_payment := case/);
  assert.match(migration, /'payments', canonical_payment/);
  assert.match(migration, /'suggestions', canonical_suggestions/);
  assert.match(migration, /'updatedBy', field_identity\.team_member_name/);
});

test("one active progress record is enforced per job and only authenticated may execute", () => {
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /create unique index if not exists cloud_collections_job_progress_active_job_unique/);
  assert.match(migration, /duplicate_record\.collection_key = 'jr-os-job-progress'/);
  assert.match(migration, /duplicate_record\.job_source_id = canonical_job\.source_id/);
  assert.match(migration, /revoke execute on function public\.jr_field_save_job_progress\(text, text, integer, jsonb, uuid\)[\s\S]*from public, anon, authenticated, service_role/i);
  assert.match(migration, /grant execute on function public\.jr_field_save_job_progress\(text, text, integer, jsonb, uuid\)[\s\S]*to authenticated/i);
  assert.doesNotMatch(migration, /grant\s+(insert|update|delete)[\s\S]*cloud_collections/i);
});
