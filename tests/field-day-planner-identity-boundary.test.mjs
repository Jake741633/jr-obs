import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fieldOperatorMemberId } from "../lib/siteDiaryIdentity-core.mjs";

const page = readFileSync(new URL("../app/field/day-planner/page.tsx", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/20260813235633_secure_field_mutation_boundary.sql", import.meta.url), "utf8");

test("field timesheet RLS binds the record to the authenticated team member and assigned job", () => {
  assert.match(migration, /payload ->> 'teamMemberId' = private\.current_team_member_source_id\(\)/);
  assert.match(migration, /private\.jr_field_record_targets_assigned_job\(/);
});

test("field operator member id requires exactly one active cloud match", () => {
  const members = [
    { id: "field-1", name: "Field Engineer", email: "field@example.com", status: "Active", role: "Electrician" },
    { id: "former", name: "Former", email: "former@example.com", status: "Inactive", role: "Electrician" },
  ];
  assert.equal(fieldOperatorMemberId({ identity: { email: "FIELD@example.com" }, teamMembers: members, mode: "cloud" }), "field-1");
  assert.equal(fieldOperatorMemberId({ identity: { email: "former@example.com" }, teamMembers: members, mode: "cloud" }), "");
  assert.equal(fieldOperatorMemberId({ identity: { email: "missing@example.com" }, teamMembers: members, mode: "cloud" }), "");
  assert.equal(fieldOperatorMemberId({
    identity: { email: "field@example.com" },
    teamMembers: [...members, { id: "duplicate", name: "Duplicate", email: "field@example.com", status: "Active", role: "Electrician" }],
    mode: "cloud",
  }), "");
});

test("day planner saves time against the resolved field identity rather than the business owner", () => {
  assert.match(page, /useCloudIdentity\(\)/);
  assert.match(page, /fieldOperatorMemberId\(\{/);
  assert.match(page, /teamMemberId: operatorMemberId/);
  assert.doesNotMatch(page, /const owner =/);
  assert.doesNotMatch(page, /teamMemberId: owner\.id/);
  assert.match(page, /identityState\.isReady/);
});

test("day planner fails closed for unlinked cloud visits and unresolved identity", () => {
  assert.match(page, /cloudFieldMode && !entry\.jobId/);
  assert.match(page, /if \(!operatorMemberId\)/);
  assert.match(page, /cloudWriteLocked = cloudFieldMode && \(!entry\.jobId \|\| !operatorMemberId\)/);
});

test("arrival only advances a scheduled job to first fix", () => {
  assert.match(page, /normaliseJobStatus\(job\.status\) === "Scheduled"/);
  assert.match(page, /nextStatus: "First fix"/);
});
