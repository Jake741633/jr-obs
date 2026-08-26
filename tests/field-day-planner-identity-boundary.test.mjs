import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildCloudEnvelope } from "../lib/cloud/repository-core.mjs";
import { fieldOperatorMemberId } from "../lib/siteDiaryIdentity-core.mjs";

const page = readFileSync(new URL("../app/field/day-planner/page.tsx", import.meta.url), "utf8");
const models = readFileSync(new URL("../lib/models.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/20260813235633_secure_field_mutation_boundary.sql", import.meta.url), "utf8");
const runner = readFileSync(new URL("./run-supabase-rls.integration.mjs", import.meta.url), "utf8");

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

test("day planner binds field timesheets to the canonical job customer", () => {
  const saveTime = page.slice(page.indexOf("function saveTime"), page.indexOf("\n  return <div"));
  const linkedJobGuard = saveTime.indexOf("if (cloudFieldMode && !linkedJob)");
  assert.ok(linkedJobGuard >= 0);
  assert.ok(linkedJobGuard < saveTime.indexOf("timesheets.setItems"));
  assert.ok(linkedJobGuard < saveTime.indexOf("planner.setItems"));
  assert.ok(linkedJobGuard < saveTime.indexOf("saved for"));
  assert.match(models, /interface TimesheetEntry \{[^}]*customerId\?: EntityId;[^}]*jobId\?: EntityId;/);
  assert.match(page, /const linkedJob = entry\.jobId \? jobsById\.get\(entry\.jobId\) : undefined;/);
  assert.match(page, /if \(cloudFieldMode && !linkedJob\)/);
  assert.match(page, /customerId: linkedJob\?\.customerId,[\s\S]*jobId: linkedJob\?\.id \|\| entry\.jobId \|\| undefined,/);
  assert.doesNotMatch(page, /customerId: entry\.customerId/);

  const envelope = buildCloudEnvelope({
    organisationId: "organisation-a",
    sourceId: "timesheet-a",
    recordTable: "timesheets",
    payload: { id: "timesheet-a", teamMemberId: "field-a", customerId: "customer-a", jobId: "job-a" },
    version: 1,
  });
  assert.equal(envelope.customer_source_id, "customer-a");
  assert.equal(envelope.job_source_id, "job-a");
  const nullCustomerEnvelope = buildCloudEnvelope({
    organisationId: "organisation-a",
    sourceId: "timesheet-null-customer",
    recordTable: "timesheets",
    payload: { id: "timesheet-null-customer", teamMemberId: "field-a", customerId: undefined, jobId: "job-null-customer" },
    version: 1,
  });
  assert.equal(nullCustomerEnvelope.customer_source_id, null);
  assert.equal(nullCustomerEnvelope.job_source_id, "job-null-customer");

  const assignmentHelper = migration.slice(
    migration.indexOf("create or replace function private.jr_field_record_targets_assigned_job"),
    migration.indexOf("create or replace function private.jr_field_collection_write_payload"),
  );
  assert.match(assignmentHelper, /job\.customer_source_id is not distinct from record_customer_source_id/i);
  assert.match(runner, /Field timesheet should retain its canonical customer and job envelope/);
  assert.match(runner, /Electrician should retain an assigned null-customer timesheet/);
  assert.match(runner, /Electrician timesheet must include the canonical linked customer/);
  assert.match(runner, /Electrician timesheet must not claim another customer for its assigned job/);
});

test("day planner fails closed for unlinked cloud visits and unresolved identity", () => {
  assert.match(page, /cloudFieldMode && !entry\.jobId/);
  assert.match(page, /if \(!operatorMemberId\)/);
  assert.match(page, /cloudWriteLocked = cloudFieldMode && \(!entry\.jobId \|\| !job \|\| !operatorMemberId\)/);
});

test("arrival only advances a scheduled job to first fix", () => {
  assert.match(page, /if \(cloudFieldMode && !linkedJob\)[\s\S]*return;/);
  assert.match(page, /normaliseJobStatus\(linkedJob\.status\) === "Scheduled"/);
  assert.match(page, /nextStatus: "First fix"/);
});
