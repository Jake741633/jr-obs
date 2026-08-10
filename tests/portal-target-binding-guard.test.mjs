import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20260810_062_guard_portal_target_bindings.sql", import.meta.url),
  "utf8",
);
const recovery = readFileSync(new URL("../supabase/recovery/after_schema_only.sql", import.meta.url), "utf8");
const liveRls = readFileSync(new URL("./supabase-rls.integration.mjs", import.meta.url), "utf8");

test("portal target guard is private, definer-safe and not directly callable", () => {
  assert.match(
    migration,
    /create or replace function private\.guard_jr_portal_target_binding\(\)[\s\S]*language plpgsql[\s\S]*security definer[\s\S]*set search_path = ''/i,
  );
  assert.match(
    migration,
    /revoke execute on function private\.guard_jr_portal_target_binding\(\)[\s\S]*from public, anon, authenticated/i,
  );
  assert.match(
    migration,
    /create or replace function private\.guard_jr_portal_record_binding\(\)[\s\S]*security definer[\s\S]*set search_path = ''[\s\S]*from public\.jobs job[\s\S]*job\.organisation_id = new\.organisation_id[\s\S]*job\.source_id = new\.job_source_id[\s\S]*job\.customer_source_id is not distinct from new\.customer_source_id/i,
  );
  const approvalPolicy = migration.slice(
    migration.indexOf("create policy portal_approvals_customer_insert"),
    migration.indexOf("drop policy if exists portal_requests_customer_insert"),
  );
  const requestPolicy = migration.slice(
    migration.indexOf("create policy portal_requests_customer_insert"),
    migration.indexOf("create or replace function private.guard_jr_portal_target_binding"),
  );
  for (const policy of [approvalPolicy, requestPolicy]) {
    assert.match(policy, /organisation_id = public\.current_organisation_id\(\)/i);
    assert.match(policy, /customer_source_id = public\.current_customer_source_id\(\)/i);
    assert.match(policy, /created_by = auth\.uid\(\)[\s\S]*updated_by = auth\.uid\(\)/i);
    assert.doesNotMatch(policy, /from public\.jobs/i);
  }
});

test("portal approvals require an eligible pricing target in the same customer scope", () => {
  assert.match(migration, /jsonb_typeof\(new\.payload -> 'documentId'\)[\s\S]*jsonb_typeof\(new\.payload -> 'documentType'\)/i);
  assert.match(migration, /target_document_type not in \('Quote', 'Estimate'\)/i);
  assert.match(migration, /target_decision not in \('Accepted', 'Declined'\)/i);
  assert.match(migration, /if new\.customer_source_id is null[\s\S]*Portal approval requires a valid pricing document target[\s\S]*errcode = '23514'/i);
  assert.match(
    migration,
    /from public\.pricing_documents pricing[\s\S]*pricing\.organisation_id = new\.organisation_id[\s\S]*pricing\.source_id = target_document_id[\s\S]*pricing\.customer_source_id is not distinct from new\.customer_source_id[\s\S]*from public\.jobs pricing_job[\s\S]*pricing_job\.customer_source_id is not distinct from new\.customer_source_id[\s\S]*pricing\.payload ->> 'type' = target_document_type/i,
  );
  assert.match(
    migration,
    /tg_op <> 'INSERT'[\s\S]*pricing\.deleted_at is null[\s\S]*pricing\.payload ->> 'status' = 'Sent'[\s\S]*pricing\.payload ->> 'status' = target_decision/i,
  );
  assert.match(migration, /Portal approval document must be eligible[\s\S]*errcode = '23503'/i);
  assert.doesNotMatch(migration, /from public\.customer_pricing_documents/i);
});

test("portal requests bind optional planner targets to the same customer and job", () => {
  assert.match(migration, /if new\.payload \? 'plannerEntryId' then/i);
  assert.match(
    migration,
    /from public\.planner_entries planner[\s\S]*planner\.organisation_id = new\.organisation_id[\s\S]*planner\.source_id = target_planner_id[\s\S]*new\.job_source_id is not null[\s\S]*planner\.job_source_id is not distinct from new\.job_source_id[\s\S]*planner\.customer_source_id is null[\s\S]*planner\.customer_source_id is not distinct from new\.customer_source_id/i,
  );
  assert.match(
    migration,
    /tg_op <> 'INSERT'[\s\S]*planner\.deleted_at is null[\s\S]*planner\.payload ->> 'status' in \('Planned', 'Confirmed'\)/i,
  );
  assert.match(migration, /Portal request planner entry must be eligible[\s\S]*errcode = '23503'/i);
});

test("portal workflow targets cannot be retargeted after insert", () => {
  assert.match(
    migration,
    /tg_op = 'UPDATE'[\s\S]*new\.payload -> 'documentId' is distinct from old\.payload -> 'documentId'[\s\S]*new\.payload -> 'documentType' is distinct from old\.payload -> 'documentType'[\s\S]*document bindings are immutable/i,
  );
  assert.match(
    migration,
    /tg_op = 'UPDATE'[\s\S]*new\.payload -> 'plannerEntryId' is distinct from old\.payload -> 'plannerEntryId'[\s\S]*planner binding is immutable/i,
  );
  assert.match(migration, /document bindings are immutable'[\s\S]*errcode = '23514'/i);
  assert.match(migration, /planner binding is immutable'[\s\S]*errcode = '23514'/i);
});

test("existing target relationships are preflighted and both portal tables install the guard", () => {
  assert.match(
    migration,
    /from public\.portal_approvals approval[\s\S]*approval\.customer_source_id is null[\s\S]*Cannot secure portal approval/i,
  );
  assert.match(
    migration,
    /from public\.portal_requests request[\s\S]*request\.customer_source_id is null[\s\S]*Cannot secure portal request/i,
  );
  for (const table of ["portal_approvals", "portal_requests"]) {
    assert.match(
      migration,
      new RegExp(`create trigger ${table}_target_binding_guard\\s+before insert or update on public\\.${table}\\s+for each row execute function private\\.guard_jr_portal_target_binding\\(\\)`, "is"),
    );
  }
  assert.match(recovery, /20260810_062_guard_portal_target_bindings\.sql/);
  assert.match(migration, /notify pgrst, 'reload schema'/i);
});

test("live RLS coverage exercises valid, cross-scope, missing, inactive and retargeted references", () => {
  for (const phrase of [
    "Customer should approve their own Sent pricing document",
    "Customer approval should tolerate the matching final status arriving first",
    "Customer must not approve another customer's pricing document",
    "Customer must not approve another tenant's pricing document",
    "Customer must not approve a nonexistent pricing document",
    "Customer must not approve a Draft pricing document",
    "Customer must not approve an Expired pricing document",
    "Customer must not approve a soft-deleted pricing document",
    "Customer must not approve a pricing document under the wrong type",
    "Customer must not record a decision that conflicts with the final pricing status",
    "Customer should create a request for their own active planner entry",
    "Customer must not target another customer's planner entry",
    "Customer must not target another tenant's planner entry",
    "Customer must not target a nonexistent planner entry",
    "Customer must not target a cancelled planner entry",
    "Customer must not target a soft-deleted planner entry",
    "Staff must not retarget an existing portal approval",
    "Staff must not retarget an existing portal request",
  ]) {
    assert.match(liveRls, new RegExp(phrase.replaceAll(" ", "\\s+"), "i"));
  }
  assert.match(liveRls, /expectDeniedWithCode\([\s\S]*"23503"[\s\S]*Customer must not approve another customer's pricing document/i);
  assert.match(liveRls, /documentId: secondQuoteA[\s\S]*"23514"[\s\S]*Staff must not retarget an existing portal approval/i);
  assert.match(liveRls, /plannerEntryId: secondPortalPlannerA[\s\S]*"23514"[\s\S]*Staff must not retarget an existing portal request/i);
});
