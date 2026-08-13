import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationFilename = "20260813222646_make_portal_approval_atomic.sql";
const migration = readFileSync(
  new URL(`../supabase/migrations/${migrationFilename}`, import.meta.url),
  "utf8",
);
const recovery = readFileSync(new URL("../supabase/recovery/after_schema_only.sql", import.meta.url), "utf8");
const portal = readFileSync(new URL("../app/customer-portal/page.tsx", import.meta.url), "utf8");
const repositoryCore = readFileSync(new URL("../lib/cloud/repository-core.mjs", import.meta.url), "utf8");
const liveRls = readFileSync(new URL("./supabase-rls.integration.mjs", import.meta.url), "utf8");

test("portal approval finalisation locks the canonical same-customer pricing row", () => {
  assert.match(
    migration,
    /create or replace function private\.guard_jr_portal_approval_evidence\(\)[\s\S]*language plpgsql[\s\S]*security definer[\s\S]*set search_path = ''/i,
  );
  assert.match(
    migration,
    /from public\.pricing_documents pricing[\s\S]*pricing\.organisation_id = new\.organisation_id[\s\S]*pricing\.source_id = new\.payload ->> 'documentId'[\s\S]*pricing\.customer_source_id is not distinct from new\.customer_source_id[\s\S]*pricing_job\.customer_source_id is not distinct from new\.customer_source_id[\s\S]*pricing\.deleted_at is null[\s\S]*for update of pricing/i,
  );
  assert.match(migration, /submitted_document_version is distinct from canonical_version[\s\S]*document version is no longer current[\s\S]*errcode = '23503'/i);
  assert.match(migration, /canonical_status is distinct from 'Sent'[\s\S]*no longer awaiting a decision[\s\S]*errcode = '23503'/i);
  assert.match(migration, /revoke execute on function private\.guard_jr_portal_approval_evidence\(\)[\s\S]*from public, anon, authenticated/i);
  assert.doesNotMatch(migration, /grant execute[\s\S]*guard_jr_portal_approval_evidence[\s\S]*to authenticated/i);
});

test("one approval insert authors evidence and finalises pricing in the same transaction", () => {
  assert.match(migration, /jsonb_typeof\(new\.payload -> 'documentVersion'\)[\s\S]*submitted_document_version := \(new\.payload ->> 'documentVersion'\)::integer/i);
  assert.match(migration, /bind_jr_customer_pricing_document_version[\s\S]*'\{documentVersion\}'[\s\S]*to_jsonb\(new\.version\)/i);
  assert.match(migration, /receipt_time := statement_timestamp\(\)/i);
  assert.match(migration, /'\{decidedAt\}'[\s\S]*to_jsonb\(receipt_time_text\)/i);
  assert.match(
    migration,
    /if canonical_status = 'Sent' then[\s\S]*update public\.pricing_documents pricing[\s\S]*'\{status\}'[\s\S]*to_jsonb\(target_decision\)[\s\S]*'\{updatedAt\}'[\s\S]*source_updated_at = receipt_time[\s\S]*pricing\.id = canonical_pricing_id/i,
  );
  assert.match(migration, /pricing\.updated_at <= approval\.created_at[\s\S]*approval\.created_at = approval\.updated_at[\s\S]*approval\.created_at = approval\.source_updated_at[\s\S]*date_trunc\('milliseconds', approval\.created_at\)[\s\S]*= \(approval\.payload ->> 'decidedAt'\)::timestamptz/i);
  assert.match(migration, /pricing\.payload ->> 'status' is distinct from approval\.payload ->> 'decision'[\s\S]*pricing\.payload ->> 'status' in \('Accepted', 'Declined'\)[\s\S]*or pricing\.updated_at <= approval\.created_at[\s\S]*conflicts with its historical decision/i);
  assert.match(
    migration,
    /pricing\.payload ->> 'status' = 'Sent'[\s\S]*pricing\.updated_at <= approval\.created_at[\s\S]*date_trunc\('milliseconds', approval\.created_at\)/i,
    "Only a demonstrably unchanged historical Sent revision is auto-finalised; a later re-sent revision remains pending",
  );
  assert.match(migration, /drop trigger if exists portal_approvals_target_binding_guard on public\.portal_approvals/i);
});

test("historical ambiguity fails closed and each document version has one decision", () => {
  assert.match(
    migration,
    /from public\.portal_approvals approval[\s\S]*group by approval\.organisation_id, approval\.payload ->> 'documentId'[\s\S]*having count\(\*\) > 1[\s\S]*multiple historical decisions/i,
  );
  assert.match(
    migration,
    /update public\.pricing_documents pricing[\s\S]*from public\.portal_approvals approval[\s\S]*pricing\.payload ->> 'status' = 'Sent'[\s\S]*approval\.payload ->> 'decision' in \('Accepted', 'Declined'\)/i,
  );
  assert.match(
    migration,
    /create unique index if not exists portal_approvals_document_version_unique[\s\S]*organisation_id[\s\S]*payload ->> 'documentId'[\s\S]*payload -> 'documentVersion'[\s\S]*jsonb_typeof\(payload -> 'documentVersion'\) = 'number'/i,
  );
});

test("customer cloud writes queue only the approval or request evidence", () => {
  assert.match(portal, /approvals\.setItems\([\s\S]*if \(!customerSession\) \{ documents\.setItems\([\s\S]*activity\.setItems/i);
  assert.match(portal, /requests\.setItems\([\s\S]*if \(!customerSession\) activity\.setItems/i);
  assert.match(portal, /effectivePortalPricingStatus\(document, customerApprovals\) !== "Sent"/i);
  assert.match(portal, /const currentApproval = portalApprovalForCurrentDocument\(customerApprovals, document\)/i);
  assert.doesNotMatch(repositoryCore, /delete (?:currentEvidence|queuedEvidence)\.documentVersion/i);
});

test("recovery and live coverage retain atomic sequential and concurrent decisions", () => {
  assert.match(recovery, new RegExp(migrationFilename.replaceAll(".", "\\."), "i"));
  assert.match(recovery, /begin;\s*\\ir \.\.\/migrations\/20260813222646_make_portal_approval_atomic\.sql\s*commit;/i);
  assert.match(migration, new RegExp(`jr_os_deployed_migration[\\s\\S]*${migrationFilename.replaceAll(".", "\\.")}`, "i"));
  assert.match(migration, /notify pgrst, 'reload schema'/i);

  for (const phrase of [
    "Portal approval must atomically finalise the canonical pricing document",
    "Portal approval projection must reflect the atomic final status",
    "Customer must not repeat the same decision for one pricing version",
    "Customer must not record an opposite decision for one pricing version",
    "Concurrent opposite portal decisions must produce exactly one winner",
    "Concurrent portal decisions must leave exactly one evidence row",
    "Canonical pricing status must equal the winning concurrent decision",
    "Stale portal approval must not finalise an unseen pricing revision",
    "Stale portal approval must not create legal evidence",
    "Customer pricing projection version must advance after an office revision",
    "Concurrent matching portal decisions must produce exactly one winner",
  ]) {
    assert.match(liveRls, new RegExp(phrase.replaceAll(" ", "\\s+"), "i"));
  }
});
