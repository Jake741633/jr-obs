import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20260810160830_guard_portal_approval_evidence.sql", import.meta.url),
  "utf8",
);
const recovery = readFileSync(new URL("../supabase/recovery/after_schema_only.sql", import.meta.url), "utf8");
const liveRls = readFileSync(new URL("./supabase-rls.integration.mjs", import.meta.url), "utf8");

test("portal approval evidence guard is private, definer-safe and not directly callable", () => {
  assert.match(
    migration,
    /create or replace function private\.guard_jr_portal_approval_evidence\(\)[\s\S]*language plpgsql[\s\S]*security definer[\s\S]*set search_path = ''/i,
  );
  assert.match(
    migration,
    /revoke execute on function private\.guard_jr_portal_approval_evidence\(\)[\s\S]*from public, anon, authenticated/i,
  );
  assert.doesNotMatch(migration, /grant execute[\s\S]*to authenticated/i);
});

test("privileged pricing lookups require a live exact actor membership first", () => {
  const actorGuard = migration.indexOf("actor_user_id := auth.uid()");
  const pricingLookup = migration.indexOf("from public.pricing_documents pricing");
  assert.ok(actorGuard >= 0 && pricingLookup > actorGuard);
  const guardedPrefix = migration.slice(actorGuard, pricingLookup);
  assert.match(guardedPrefix, /not private\.has_active_auth_session\(\)/i);
  assert.match(guardedPrefix, /from public\.profiles actor_profile[\s\S]*actor_profile\.id = actor_user_id[\s\S]*actor_profile\.active[\s\S]*actor_profile\.organisation_id = new\.organisation_id/i);
  assert.match(guardedPrefix, /actor_profile\.role in \('owner', 'admin', 'office'\)[\s\S]*actor_profile\.role = 'customer'[\s\S]*actor_profile\.customer_source_id is not distinct from new\.customer_source_id/i);
  assert.match(guardedPrefix, /new\.created_by is distinct from actor_user_id[\s\S]*new\.updated_by is distinct from actor_user_id/i);
  assert.match(guardedPrefix, /Portal approval authorization is invalid[\s\S]*errcode = '42501'/i);
});

test("portal approvals require complete, typed legal evidence", () => {
  for (const field of ["approvalName", "comments", "termsAccepted", "termsSnapshot", "decidedAt"]) {
    assert.match(migration, new RegExp(`jsonb_typeof\\(new\\.payload -> '${field}'\\)`, "i"));
  }
  assert.match(migration, /nullif\(btrim\(new\.payload ->> 'approvalName'\), ''\) is null/i);
  assert.match(migration, /Portal approval requires complete legal evidence[\s\S]*errcode = '23514'/i);
  assert.match(migration, /received_decision_time := \(new\.payload ->> 'decidedAt'\)::timestamptz/i);
  assert.match(migration, /Portal approval requires a valid decision timestamp[\s\S]*errcode = '23514'/i);
});

test("terms evidence is bound to the canonical same-customer pricing document", () => {
  assert.match(
    migration,
    /from public\.pricing_documents pricing[\s\S]*pricing\.organisation_id = new\.organisation_id[\s\S]*pricing\.source_id = new\.payload ->> 'documentId'[\s\S]*pricing\.customer_source_id is not distinct from new\.customer_source_id[\s\S]*from public\.jobs pricing_job[\s\S]*pricing_job\.customer_source_id is not distinct from new\.customer_source_id[\s\S]*pricing\.payload ->> 'type' = new\.payload ->> 'documentType'[\s\S]*pricing\.deleted_at is null/i,
  );
  assert.match(migration, /new\.payload ->> 'termsSnapshot' is distinct from canonical_terms[\s\S]*terms snapshot must match/i);
  assert.match(
    migration,
    /documentType' = 'Quote'[\s\S]*decision' = 'Accepted'[\s\S]*canonical_terms <> ''[\s\S]*termsAccepted' is distinct from 'true'::jsonb[\s\S]*explicitly accepted/i,
  );
});

test("approval receipt time is server-authored and recorded evidence is immutable", () => {
  assert.match(migration, /receipt_time := statement_timestamp\(\)/i);
  assert.match(migration, /jsonb_set\([\s\S]*'\{decidedAt\}'[\s\S]*to_jsonb\(to_char\(receipt_time at time zone 'UTC',[\s\S]*MS"Z"'\)\)[\s\S]*true/i);
  assert.match(migration, /new\.source_updated_at := receipt_time[\s\S]*new\.created_at := receipt_time[\s\S]*new\.updated_at := receipt_time/i);
  assert.match(
    migration,
    /if tg_op = 'UPDATE'[\s\S]*new\.payload is distinct from old\.payload[\s\S]*new\.created_at is distinct from old\.created_at[\s\S]*new\.created_by is distinct from old\.created_by[\s\S]*Portal approval evidence is immutable[\s\S]*errcode = '23514'/i,
  );
});

test("historical evidence is preflighted and the recovery path installs the trigger", () => {
  assert.match(
    migration,
    /from public\.portal_approvals approval[\s\S]*approvalName[\s\S]*comments[\s\S]*termsAccepted[\s\S]*termsSnapshot[\s\S]*decidedAt[\s\S]*Cannot secure portal approval/i,
  );
  assert.match(migration, /historical_decision_time := approval_record\.decided_at::timestamptz/i);
  assert.match(
    migration,
    /create trigger portal_approvals_evidence_guard\s+before insert or update on public\.portal_approvals\s+for each row execute function private\.guard_jr_portal_approval_evidence\(\)/is,
  );
  assert.match(recovery, /20260810160830_guard_portal_approval_evidence\.sql/i);
  assert.match(migration, /notify pgrst, 'reload schema'/i);
});

test("live Data API coverage proves allowed evidence and malicious evidence is denied", () => {
  for (const phrase of [
    "Customer should approve their own Sent pricing document",
    "Portal approval timestamp must be server-authored",
    "Customer must not submit a portal approval without a signer name",
    "Customer must not submit malformed portal approval comments",
    "Customer must explicitly accept nonempty quote terms",
    "Customer must not forge the portal approval terms snapshot",
    "Customer must not submit an invalid portal approval timestamp",
    "Customer must not probe another customer through a forged approval envelope",
    "Staff must not rewrite recorded portal approval evidence",
  ]) {
    assert.match(liveRls, new RegExp(phrase.replaceAll(" ", "\\s+"), "i"));
  }
  assert.match(liveRls, /approvalName: "\s+"[\s\S]*"23514"[\s\S]*without a signer name/i);
  assert.match(liveRls, /termsSnapshot: "Attacker-supplied replacement terms"[\s\S]*"23514"[\s\S]*must not forge/i);
  assert.match(liveRls, /approvalName: "Forged staff rewrite"[\s\S]*"23514"[\s\S]*must not rewrite/i);
});
