import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  ELECTRICIAN_JOB_PROGRESS_CACHE_GENERATION,
  roleProjectionCacheGeneration,
  roleProjectionCachePolicy,
  sanitizeRoleProjectionCache,
} from "../lib/cloud/roleProjectionCache-core.mjs";
import {
  projectFieldMutationPayload,
  sanitizeQueuedFieldMutationProjection,
  validateFieldMutationResponse,
} from "../lib/cloud/repository-core.mjs";

const migrationName = "20260826144606_redact_field_job_progress_finance.sql";
const migration = readFileSync(new URL("../supabase/migrations/" + migrationName, import.meta.url), "utf8");
const originalProjection = readFileSync(new URL("../supabase/migrations/20260809_048_field_cloud_collection_projection.sql", import.meta.url), "utf8");
const workspace = readFileSync(new URL("../app/jobs/[id]/workspace/page.tsx", import.meta.url), "utf8");
const repository = readFileSync(new URL("../lib/cloud/repository.ts", import.meta.url), "utf8");
const cacheTypes = readFileSync(new URL("../lib/cloud/roleProjectionCache-core.d.mts", import.meta.url), "utf8");
const repositoryTypes = readFileSync(new URL("../lib/cloud/repository-core.d.mts", import.meta.url), "utf8");
const recovery = readFileSync(new URL("../supabase/recovery/after_schema_only.sql", import.meta.url), "utf8");
const setup = readFileSync(new URL("../docs/SUPABASE_SETUP.md", import.meta.url), "utf8");
const runner = readFileSync(new URL("./run-supabase-rls.integration.mjs", import.meta.url), "utf8");

function section(source, startText, endText) {
  const start = source.indexOf(startText);
  assert.ok(start >= 0, "Missing section start: " + startText);
  const end = source.indexOf(endText, start);
  assert.ok(end > start, "Missing section end: " + endText);
  return source.slice(start, end);
}

const fullProgress = {
  id: "progress-1",
  jobId: "job-1",
  manual: {
    overall: 40,
    firstFix: 60,
    secondFix: 20,
    testing: 10,
    certificates: 0,
    materials: 50,
    payments: 75,
  },
  suggestions: [{ metric: "testing", value: 25, reason: "Office plan" }],
  updatedBy: "JR OS Office",
  createdAt: "2026-08-26T09:00:00.000Z",
  updatedAt: "2026-08-26T09:00:00.000Z",
  privateNote: "remove me",
};

const safeProgress = {
  id: "progress-1",
  jobId: "job-1",
  manual: {
    overall: 40,
    firstFix: 60,
    secondFix: 20,
    testing: 10,
    certificates: 0,
    materials: 50,
  },
  updatedBy: "JR OS Office",
  createdAt: "2026-08-26T09:00:00.000Z",
  updatedAt: "2026-08-26T09:00:00.000Z",
};

test("field job progress projection keeps operational data and omits finance planning fields", () => {
  const branch = section(
    migration,
    "when 'jr-os-job-progress' then",
    "when 'jr-os-job-packs' then",
  );

  for (const key of [
    "id", "jobId", "manual", "overall", "firstFix", "secondFix",
    "testing", "certificates", "materials", "updatedBy", "createdAt", "updatedAt",
  ]) assert.match(branch, new RegExp("'" + key + "'"));
  assert.doesNotMatch(branch, /payments|suggestions/i);

  for (const retainedBranch of [
    "jr-os-surveys",
    "jr-os-job-packs",
    "jr-os-job-variations",
    "jr-os-job-timeline",
    "jr-os-job-material-usage",
  ]) assert.match(migration, new RegExp("when '" + retainedBranch + "' then"));
  assert.match(originalProjection, /private\.jr_field_cloud_payload\(new\.collection_key, new\.payload\)/);
  assert.match(
    migration,
    /where source\.collection_key = 'jr-os-job-progress'[\s\S]*projection\.payload is distinct from redacted\.payload/i,
  );
  assert.doesNotMatch(migration, /jr_field_cloud_collection_has_private_fields/i);
});

test("progress RPC preserves office canonical data but projects fresh and replayed field responses", () => {
  const rpc = section(
    migration,
    "create or replace function public.jr_field_save_job_progress",
    "revoke execute on function public.jr_field_save_job_progress",
  );

  assert.match(rpc, /'payments', canonical_payment/);
  assert.match(rpc, /'suggestions', canonical_suggestions/);
  assert.match(rpc, /'overall', 'firstFix', 'secondFix', 'testing',[\s\S]*'certificates', 'materials', 'payments'/);
  assert.match(
    rpc,
    /return mutation_result \|\| pg_catalog\.jsonb_build_object\([\s\S]*private\.jr_field_cloud_payload\([\s\S]*'jr-os-job-progress',[\s\S]*mutation_result -> 'payload'/i,
  );
  assert.match(
    rpc,
    /'payload', private\.jr_field_cloud_payload\([\s\S]*saved_record\.collection_key,[\s\S]*saved_record\.payload/i,
  );
  const assignmentCheck = rpc.indexOf("if canonical_job.id is null");
  const receiptClaim = rpc.indexOf("private.jr_claim_field_mutation");
  const replayReturn = rpc.indexOf("return mutation_result ||");
  assert.ok(
    receiptClaim >= 0 && assignmentCheck > receiptClaim && replayReturn > assignmentCheck,
    "receipt claim must preserve lock order while replay return follows current assignment validation",
  );
  assert.match(rpc, /private\.jr_job_is_assigned_to_team_member\([\s\S]*canonical_job\.payload,[\s\S]*field_identity\.team_member_source_id/i);
  assert.doesNotMatch(rpc, /'payload', saved_record\.payload/);
});

test("field progress caches, queued mutations and reconciled receipts use the same allowlist", () => {
  const source = structuredClone(fullProgress);
  const sanitized = sanitizeRoleProjectionCache({
    storageKey: "jr-os-job-progress",
    role: "electrician",
    mode: "cloud",
    records: [source],
  });
  assert.deepEqual(sanitized, [safeProgress]);
  assert.equal(source.manual.payments, 75, "cache sanitation must not mutate the source");
  assert.equal(source.suggestions.length, 1, "cache sanitation must not mutate office suggestions");
  assert.strictEqual(
    sanitizeRoleProjectionCache({
      storageKey: "jr-os-job-progress",
      role: "electrician",
      mode: "local",
      records: [source],
    })[0],
    source,
  );

  assert.equal(ELECTRICIAN_JOB_PROGRESS_CACHE_GENERATION, "20260826144606");
  assert.equal(
    roleProjectionCacheGeneration({ storageKey: "jr-os-job-progress", role: "electrician" }),
    ELECTRICIAN_JOB_PROGRESS_CACHE_GENERATION,
  );
  assert.equal(
    roleProjectionCachePolicy({
      storageKey: "jr-os-job-progress",
      role: "electrician",
      mode: "cloud",
      generation: "20260826104958",
    }),
    "purge",
  );
  assert.equal(
    roleProjectionCachePolicy({
      storageKey: "jr-os-job-progress",
      role: "electrician",
      mode: "cloud",
      generation: ELECTRICIAN_JOB_PROGRESS_CACHE_GENERATION,
    }),
    "keep",
  );

  assert.deepEqual(
    projectFieldMutationPayload({
      collectionKey: "jr-os-job-progress",
      role: "electrician",
      payload: fullProgress,
    }),
    safeProgress,
  );

  const unsent = {
    id: "queue-unsent",
    role: "electrician",
    collectionKey: "jr-os-job-progress",
    payload: fullProgress,
  };
  assert.deepEqual(sanitizeQueuedFieldMutationProjection(unsent).payload, safeProgress);
  const now = Date.parse("2026-08-26T14:00:00.000Z");
  const recentSent = { ...unsent, sentAt: "2026-08-26T13:00:00.000Z" };
  assert.strictEqual(
    sanitizeQueuedFieldMutationProjection(recentSent, now),
    recentSent,
    "recent sent payloads must remain byte-for-byte stable for receipt replay",
  );
  const expiredSent = { ...unsent, sentAt: "2026-07-01T13:00:00.000Z" };
  assert.deepEqual(sanitizeQueuedFieldMutationProjection(expiredSent, now).payload, safeProgress);
  const officeQueue = { ...unsent, role: "office" };
  assert.strictEqual(sanitizeQueuedFieldMutationProjection(officeQueue, now), officeQueue);

  assert.match(repository, /readAllSyncQueue\(\)[\s\S]*sanitizeQueuedFieldMutationProjection\(item\)/);
  assert.match(repository, /const safeItem = sanitizeQueuedFieldMutationProjection\(item\)/);
  assert.match(repository, /shouldReconcileFieldMutationPayload[\s\S]*projectFieldMutationPayload\(\{/);
  assert.match(repositoryTypes, /sanitizeQueuedFieldMutationProjection/);
  assert.match(cacheTypes, /ELECTRICIAN_JOB_PROGRESS_CACHE_GENERATION: "20260826144606"/);
});

test("client response validation rejects any finance-bearing progress receipt", () => {
  const response = {
    status: "applied",
    resource: "cloud_collections",
    sourceId: "progress-1",
    collectionKey: "jr-os-job-progress",
    version: 2,
    sourceUpdatedAt: "2026-08-26T09:01:00.000Z",
    payload: safeProgress,
  };
  const expected = {
    resource: "cloud_collections",
    sourceId: "progress-1",
    collectionKey: "jr-os-job-progress",
  };
  assert.strictEqual(validateFieldMutationResponse(response, expected), response);
  assert.throws(
    () => validateFieldMutationResponse({
      ...response,
      payload: { ...safeProgress, manual: { ...safeProgress.manual, payments: 75 } },
    }, expected),
    /private job progress/i,
  );
  assert.throws(
    () => validateFieldMutationResponse({
      ...response,
      payload: { ...safeProgress, suggestions: [{ reason: "Office plan" }] },
    }, expected),
    /private job progress/i,
  );
});

test("field workspace omits finance from its UI and optimistic mutation shape", () => {
  assert.match(workspace, /const fieldManual = \{[\s\S]*overall:[\s\S]*materials:/);
  assert.match(workspace, /manual: fieldWorkspace \? fieldManual : normalised/);
  assert.match(workspace, /fieldWorkspace \? \{\} : \{ suggestions: progressRecord\?\.suggestions \?\? \[\] \}/);
  assert.match(
    workspace,
    /!fieldWorkspace \? <div[^>]*>\{progressBar\("Payments \(office controlled\)", progressValue\.payments\)\}<\/div> : null/,
  );
  assert.doesNotMatch(workspace, /payments: progressValue\.payments/);
  assert.match(workspace, /Office payment progress remains private/);
});

test("live RLS coverage proves field redaction, canonical preservation and replay assignment binding", () => {
  for (const phrase of [
    "Assigned field progress must hide office payment percentage",
    "Assigned field progress must hide office suggestions",
    "Office should retain canonical assigned payment progress",
    "Office should retain canonical assigned progress suggestions",
    "Progress RPC response must hide canonical payment percentage",
    "Progress RPC response must hide office suggestions",
    "Exact progress replay must return the same field-safe receipt",
    "Progress receipt replay must hide canonical payment percentage",
    "Progress receipt replay must hide office suggestions",
    "Progress receipt replay must revalidate the active job assignment",
    "Progress RPC must preserve the canonical payment percentage",
    "Progress RPC must preserve office suggestions",
  ]) assert.match(runner, new RegExp(phrase.replaceAll(" ", "\\s+"), "i"));
});

test("recovery, guidance and deployment marker publish the final progress finance boundary", () => {
  const previous = recovery.indexOf("20260826132500_scope_field_builder_reads_to_assignments.sql");
  const current = recovery.indexOf(migrationName);
  assert.ok(previous >= 0 && current > previous);
  assert.match(
    recovery.slice(current - 140, current + migrationName.length + 50),
    /begin;[\s\S]*\\ir[\s\S]*commit;/i,
  );
  assert.match(
    setup,
    /job progress is assignment-scoped, payment percentages and office suggestions remain office-only, mutation receipts revalidate the active assignment/i,
  );
  assert.match(migration, new RegExp("'" + migrationName.replaceAll(".", "\\.") + "'"));
});
