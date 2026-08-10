import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const runnerSource = readFileSync(new URL("./run-supabase-rls.integration.mjs", import.meta.url), "utf8");
const integrationSourceUrl = new URL("./supabase-rls.integration.mjs", import.meta.url);
const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

const anchor = "    // Field identity fixtures are complete.";

const plannerLines = [
  "    const plannerTeamA = fieldTeamA;",
  '    const otherPlannerTeamA = source("planner-team-other-a");',
  '    const assignedPlannerA = source("planner-assigned-a");',
  '    const foreignPlannerA = source("planner-foreign-a");',
  '    const selfCreatedPlannerA = source("planner-self-created-a");',
  '    const unassignedFieldPlannerA = source("planner-unassigned-field-a");',
  '    const forgedCoworkerPlannerA = source("planner-forged-coworker-a");',
  '    const forgedMissingPlannerA = source("planner-forged-missing-a");',
  '    const forgedCrossTenantPlannerA = source("planner-forged-cross-tenant-a");',
  '    const forgedPaddedPlannerA = source("planner-forged-padded-a");',
  '    const officeMultiPlannerA = source("planner-office-multi-a");',
  '    const deletablePlannerTeamA = source("planner-deletable-team-a");',
  '    const deletablePlannerA = source("planner-deletable-a");',
  '    const deletedMemberPlannerA = source("planner-deleted-member-a");',
  '    const historicalPlannerTeamA = source("planner-historical-team-a");',
  '    const historicalPlannerA = source("planner-historical-a");',
  '    const crossTenantPlannerTeamB = source("planner-team-b");',
  "",
  "    await expectAllowed(",
  '      await insertRecord(accounts.A.office, "team_members", typedRecord(organisationA, otherPlannerTeamA, null, null, { name: "Other planner worker", email: "other-planner@example.com", role: "Electrician", status: "Active" })),',
  '      "Office should create another planner team identity",',
  "    );",
  "    await expectAllowed(",
  '      await insertRecord(accounts.B.office, "team_members", typedRecord(organisationB, crossTenantPlannerTeamB, null, null, { name: "Tenant B planner worker", email: accounts.B.electrician.email, role: "Electrician", status: "Active" })),',
  '      "Tenant B office should create its planner team identity",',
  "    );",
  "    await expectAllowed(",
  '      await insertRecord(accounts.A.office, "team_members", typedRecord(organisationA, deletablePlannerTeamA, null, null, { name: "Reassign before deletion", email: "deletable-planner@example.com", role: "Electrician", status: "Active" })),',
  '      "Office should create a team member for assignment-deletion testing",',
  "    );",
  "    await expectAllowed(",
  '      await insertRecord(accounts.A.office, "team_members", typedRecord(organisationA, historicalPlannerTeamA, null, null, { name: "Historical planner worker", email: "historical-planner@example.com", role: "Electrician", status: "Active" })),',
  '      "Office should create a team member for planner history",',
  "    );",
  "    await expectAllowed(",
  '      await insertRecord(accounts.A.office, "planner_entries", typedRecord(organisationA, assignedPlannerA, customerA, jobA, { id: assignedPlannerA, title: "Assigned visit", type: "Job", date: "2026-08-10", startTime: "08:00", endTime: "16:00", customerId: customerA, jobId: jobA, teamMemberIds: [plannerTeamA], location: "1 Test Street", notes: "Assigned private site note", status: "Confirmed", createdAt: "2026-08-09T00:00:00.000Z", updatedAt: "2026-08-09T00:00:00.000Z" })),',
  '      "Office should create an assigned planner entry",',
  "    );",
  "    await expectAllowed(",
  '      await insertRecord(accounts.A.office, "planner_entries", typedRecord(organisationA, foreignPlannerA, customerA, jobA, { id: foreignPlannerA, title: "Other worker visit", type: "Job", date: "2026-08-10", startTime: "09:00", endTime: "17:00", customerId: customerA, jobId: jobA, teamMemberIds: [otherPlannerTeamA], location: "2 Private Street", notes: "Other engineer note", status: "Confirmed", createdAt: "2026-08-09T00:00:00.000Z", updatedAt: "2026-08-09T00:00:00.000Z" })),',
  '      "Office should create another worker planner entry",',
  "    );",
  "    await expectAllowed(",
  '      await insertRecord(accounts.A.office, "planner_entries", typedRecord(organisationA, officeMultiPlannerA, customerA, jobA, { id: officeMultiPlannerA, title: "Two worker visit", type: "Job", date: "2026-08-12", startTime: "08:00", endTime: "16:00", customerId: customerA, jobId: jobA, teamMemberIds: [plannerTeamA, otherPlannerTeamA], location: "1 Test Street", notes: "Office assigned team", status: "Confirmed", createdAt: "2026-08-09T00:00:00.000Z", updatedAt: "2026-08-09T00:00:00.000Z" })),',
  '      "Office should create a valid multi-person planner assignment",',
  "    );",
  "    await expectAllowed(",
  '      await insertRecord(accounts.A.office, "planner_entries", typedRecord(organisationA, deletablePlannerA, customerA, jobA, { id: deletablePlannerA, title: "Reassignment required", type: "Job", date: "2026-08-13", startTime: "08:00", endTime: "10:00", customerId: customerA, jobId: jobA, teamMemberIds: [deletablePlannerTeamA], location: "1 Test Street", notes: "Active assignment", status: "Confirmed", createdAt: "2026-08-09T00:00:00.000Z", updatedAt: "2026-08-09T00:00:00.000Z" })),',
  '      "Office should create an entry for team deletion protection",',
  "    );",
  "    await expectAllowed(",
  '      await insertRecord(accounts.A.office, "planner_entries", typedRecord(organisationA, historicalPlannerA, customerA, jobA, { id: historicalPlannerA, title: "Historical visit", type: "Job", date: "2026-08-01", startTime: "08:00", endTime: "10:00", customerId: customerA, jobId: jobA, teamMemberIds: [historicalPlannerTeamA], location: "1 Test Street", notes: "Completed history", status: "Complete", createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T10:00:00.000Z" })),',
  '      "Office should create a planner entry that will become history",',
  "    );",
  "",
  '    const officePlannerRead = await listRecords(accounts.A.office, "planner_entries", "select=source_id");',
  '    await expectAllowed(officePlannerRead, "Office planner query should execute");',
  '    assert.ok(officePlannerRead.payload.some((row) => row.source_id === assignedPlannerA), "Office should read assigned entries");',
  '    assert.ok(officePlannerRead.payload.some((row) => row.source_id === foreignPlannerA), "Office should read other worker entries");',
  "",
  '    const electricianAssignedPlanner = await listRecords(accounts.A.electrician, "planner_entries", \\`select=source_id,payload&source_id=eq.\\${assignedPlannerA}\\`);',
  '    await expectAllowed(electricianAssignedPlanner, "Electrician assigned planner query should execute");',
  '    assert.equal(electricianAssignedPlanner.payload.length, 1, "Electrician should read an entry assigned to their team identity");',
  '    const electricianForeignPlanner = await listRecords(accounts.A.electrician, "planner_entries", \\`select=source_id&source_id=eq.\\${foreignPlannerA}\\`);',
  '    await expectAllowed(electricianForeignPlanner, "Electrician foreign planner query should fail closed");',
  '    assert.deepEqual(electricianForeignPlanner.payload, [], "Electrician must not read another worker planner entry");',
  "",
  "    await expectAllowed(",
  '      await insertRecord(accounts.A.electrician, "planner_entries", typedRecord(organisationA, selfCreatedPlannerA, customerA, jobA, { id: selfCreatedPlannerA, title: "Field follow-up", type: "Job", date: "2026-08-11", startTime: "08:00", endTime: "10:00", customerId: customerA, jobId: jobA, teamMemberIds: [plannerTeamA], location: "1 Test Street", notes: "Self assigned", status: "Planned", createdAt: "2026-08-09T00:00:00.000Z", updatedAt: "2026-08-09T00:00:00.000Z" })),',
  '      "Electrician should create a planner entry that includes their team identity",',
  "    );",
  "    await expectDenied(",
  '      await insertRecord(accounts.A.electrician, "planner_entries", typedRecord(organisationA, unassignedFieldPlannerA, customerA, jobA, { id: unassignedFieldPlannerA, title: "Forged coworker visit", type: "Job", date: "2026-08-11", startTime: "10:00", endTime: "12:00", customerId: customerA, jobId: jobA, teamMemberIds: [otherPlannerTeamA], location: "2 Private Street", notes: "Not self assigned", status: "Planned", createdAt: "2026-08-09T00:00:00.000Z", updatedAt: "2026-08-09T00:00:00.000Z" })),',
  '      "Electrician must not create a planner entry without their team identity",',
  "    );",
  "    await expectDenied(",
  '      await insertRecord(accounts.A.electrician, "planner_entries", typedRecord(organisationA, forgedCoworkerPlannerA, customerA, jobA, { id: forgedCoworkerPlannerA, title: "Forged shared visit", type: "Job", date: "2026-08-11", startTime: "12:00", endTime: "13:00", customerId: customerA, jobId: jobA, teamMemberIds: [plannerTeamA, otherPlannerTeamA], location: "1 Test Street", notes: "Added coworker", status: "Planned", createdAt: "2026-08-09T00:00:00.000Z", updatedAt: "2026-08-09T00:00:00.000Z" })),',
  '      "Electrician must not add a coworker while retaining their own assignment",',
  "    );",
  "    await expectDenied(",
  '      await insertRecord(accounts.A.electrician, "planner_entries", typedRecord(organisationA, forgedMissingPlannerA, customerA, jobA, { id: forgedMissingPlannerA, title: "Missing worker visit", type: "Job", date: "2026-08-11", startTime: "13:00", endTime: "14:00", customerId: customerA, jobId: jobA, teamMemberIds: [plannerTeamA, source("missing-planner-team")], location: "1 Test Street", notes: "Missing worker", status: "Planned", createdAt: "2026-08-09T00:00:00.000Z", updatedAt: "2026-08-09T00:00:00.000Z" })),',
  '      "Electrician must not add a nonexistent team assignment",',
  "    );",
  "    await expectDenied(",
  '      await insertRecord(accounts.A.electrician, "planner_entries", typedRecord(organisationA, forgedCrossTenantPlannerA, customerA, jobA, { id: forgedCrossTenantPlannerA, title: "Cross-tenant worker visit", type: "Job", date: "2026-08-11", startTime: "14:00", endTime: "15:00", customerId: customerA, jobId: jobA, teamMemberIds: [plannerTeamA, crossTenantPlannerTeamB], location: "1 Test Street", notes: "Foreign worker", status: "Planned", createdAt: "2026-08-09T00:00:00.000Z", updatedAt: "2026-08-09T00:00:00.000Z" })),',
  '      "Electrician must not add a cross-tenant team assignment",',
  "    );",
  "    await expectDenied(",
  '      await insertRecord(accounts.A.office, "planner_entries", typedRecord(organisationA, forgedPaddedPlannerA, customerA, jobA, { id: forgedPaddedPlannerA, title: "Padded worker identity", type: "Job", date: "2026-08-11", startTime: "15:00", endTime: "16:00", customerId: customerA, jobId: jobA, teamMemberIds: [" " + otherPlannerTeamA + " "], location: "1 Test Street", notes: "Noncanonical identity", status: "Planned", createdAt: "2026-08-09T00:00:00.000Z", updatedAt: "2026-08-09T00:00:00.000Z" })),',
  '      "Office must not create a whitespace-padded team assignment",',
  "    );",
  "",
  "    await expectAllowed(",
  '      await patchRecords(accounts.A.electrician, "planner_entries", \\`source_id=eq.\\${assignedPlannerA}\\`, { payload: { id: assignedPlannerA, title: "Assigned visit updated", type: "Job", date: "2026-08-10", startTime: "08:00", endTime: "16:30", customerId: customerA, jobId: jobA, teamMemberIds: [plannerTeamA], location: "1 Test Street", notes: "Field update", status: "Complete", createdAt: "2026-08-09T00:00:00.000Z", updatedAt: "2026-08-09T12:00:00.000Z" } }),',
  '      "Electrician should update a planner entry while retaining their assignment",',
  "    );",
  "    await expectAllowed(",
  '      await patchRecords(accounts.A.electrician, "planner_entries", "source_id=eq." + officeMultiPlannerA, { payload: { id: officeMultiPlannerA, title: "Two worker visit updated", type: "Job", date: "2026-08-12", startTime: "08:00", endTime: "16:30", customerId: customerA, jobId: jobA, teamMemberIds: [plannerTeamA, otherPlannerTeamA], location: "1 Test Street", notes: "Operational update only", status: "Complete", createdAt: "2026-08-09T00:00:00.000Z", updatedAt: "2026-08-09T12:00:00.000Z" } }),',
  '      "Electrician should update operational fields while preserving an office multi-person assignment",',
  "    );",
  "    await expectDenied(",
  '      await patchRecords(accounts.A.electrician, "planner_entries", "source_id=eq." + assignedPlannerA, { payload: { id: assignedPlannerA, title: "Assigned visit updated", type: "Job", date: "2026-08-10", startTime: "08:00", endTime: "16:30", customerId: customerA, jobId: jobA, teamMemberIds: [plannerTeamA, otherPlannerTeamA], location: "1 Test Street", notes: "Forged coworker", status: "Complete", createdAt: "2026-08-09T00:00:00.000Z", updatedAt: "2026-08-09T12:00:00.000Z" } }),',
  '      "Electrician must not add a coworker to an existing planner assignment",',
  "    );",
  "    await expectDenied(",
  '      await patchRecords(accounts.A.electrician, "planner_entries", \\`source_id=eq.\\${assignedPlannerA}\\`, { payload: { id: assignedPlannerA, title: "Reassigned visit", type: "Job", date: "2026-08-10", startTime: "08:00", endTime: "16:30", customerId: customerA, jobId: jobA, teamMemberIds: [otherPlannerTeamA], location: "1 Test Street", notes: "Removed self", status: "Complete", createdAt: "2026-08-09T00:00:00.000Z", updatedAt: "2026-08-09T12:00:00.000Z" } }),',
  '      "Electrician must not remove their assignment from a planner entry",',
  "    );",
  "    await expectAllowed(",
  '      await patchRecords(accounts.A.office, "planner_entries", "source_id=eq." + officeMultiPlannerA, { payload: { id: officeMultiPlannerA, title: "Single worker visit", type: "Job", date: "2026-08-12", startTime: "08:00", endTime: "16:30", customerId: customerA, jobId: jobA, teamMemberIds: [plannerTeamA], location: "1 Test Street", notes: "Office reassigned", status: "Confirmed", createdAt: "2026-08-09T00:00:00.000Z", updatedAt: "2026-08-09T13:00:00.000Z" } }),',
  '      "Office should update a planner team assignment to another valid set",',
  "    );",
  '    const canonicalPlannerAfterDeniedUpdate = await listRecords(accounts.A.office, "planner_entries", "select=payload&source_id=eq." + assignedPlannerA);',
  '    await expectAllowed(canonicalPlannerAfterDeniedUpdate, "Office should inspect the canonical planner assignment after denied field writes");',
  '    assert.deepEqual(canonicalPlannerAfterDeniedUpdate.payload[0]?.payload?.teamMemberIds, [plannerTeamA], "Denied electrician writes must leave the canonical assignment unchanged");',
  "",
  "    await expectDenied(",
  '      await patchRecords(accounts.A.owner, "team_members", "source_id=eq." + deletablePlannerTeamA, { deleted_at: new Date().toISOString() }),',
  '      "An actively assigned team member must not be deleted",',
  "    );",
  "    await expectAllowed(",
  '      await patchRecords(accounts.A.office, "planner_entries", "source_id=eq." + deletablePlannerA, { payload: { id: deletablePlannerA, title: "Reassigned visit", type: "Job", date: "2026-08-13", startTime: "08:00", endTime: "10:00", customerId: customerA, jobId: jobA, teamMemberIds: [otherPlannerTeamA], location: "1 Test Street", notes: "Safely reassigned", status: "Confirmed", createdAt: "2026-08-09T00:00:00.000Z", updatedAt: "2026-08-09T14:00:00.000Z" } }),',
  '      "Office should reassign an active planner entry before deleting a team member",',
  "    );",
  "    await expectAllowed(",
  '      await patchRecords(accounts.A.owner, "team_members", "source_id=eq." + deletablePlannerTeamA, { deleted_at: new Date().toISOString() }),',
  '      "Owner should delete a team member after active planner reassignment",',
  "    );",
  "    await expectDenied(",
  '      await insertRecord(accounts.A.office, "planner_entries", typedRecord(organisationA, deletedMemberPlannerA, customerA, jobA, { id: deletedMemberPlannerA, title: "Deleted worker visit", type: "Job", date: "2026-08-14", startTime: "08:00", endTime: "10:00", customerId: customerA, jobId: jobA, teamMemberIds: [deletablePlannerTeamA], location: "1 Test Street", notes: "Deleted assignment", status: "Planned", createdAt: "2026-08-09T00:00:00.000Z", updatedAt: "2026-08-09T15:00:00.000Z" })),',
  '      "Office must not assign a deleted team member to an active planner entry",',
  "    );",
  "    await expectAllowed(",
  '      await patchRecords(accounts.A.owner, "planner_entries", "source_id=eq." + historicalPlannerA, { deleted_at: new Date().toISOString() }),',
  '      "Owner should preserve planner history as a tombstone",',
  "    );",
  "    await expectAllowed(",
  '      await patchRecords(accounts.A.owner, "team_members", "source_id=eq." + historicalPlannerTeamA, { deleted_at: new Date().toISOString() }),',
  '      "Owner should delete a team member referenced only by planner history",',
  "    );",
  "",
  '    const customerPlannerRead = await listRecords(accounts.A.customer, "planner_entries", \\`select=source_id&source_id=eq.\\${assignedPlannerA}\\`);',
  '    await expectAllowed(customerPlannerRead, "Customer planner query should fail closed");',
  '    assert.deepEqual(customerPlannerRead.payload, [], "Customers must not read internal planner entries");',
  '    const crossTenantPlannerRead = await listRecords(accounts.B.electrician, "planner_entries", \\`select=source_id&source_id=eq.\\${assignedPlannerA}\\`);',
  '    await expectAllowed(crossTenantPlannerRead, "Cross-tenant planner query should execute safely");',
  '    assert.deepEqual(crossTenantPlannerRead.payload, [], "Another organisation must not read the planner entry");',
];

const plannerCoverage = `${anchor}\\n\\n${plannerLines.join("\\n")}`;

test("live RLS runner proves planner entries are assignment scoped", () => {
  assert.equal(
    packageJson.scripts["test:rls"],
    "node --test tests/planner-team-live-rls.test.mjs",
    "The disposable Supabase workflow must execute the planner penetration wrapper",
  );
  const occurrences = runnerSource.split(anchor).length - 1;
  assert.equal(occurrences, 1, `Expected one completed field identity anchor, found ${occurrences}`);

  const patchedRunner = runnerSource.replace(anchor, plannerCoverage);
  for (const phrase of [
    "Electrician should read an entry assigned to their team identity",
    "Electrician must not read another worker planner entry",
    "Electrician should create a planner entry that includes their team identity",
    "Electrician must not create a planner entry without their team identity",
    "Electrician must not add a coworker while retaining their own assignment",
    "Electrician must not add a nonexistent team assignment",
    "Electrician must not add a cross-tenant team assignment",
    "Office must not create a whitespace-padded team assignment",
    "Electrician should update a planner entry while retaining their assignment",
    "Electrician should update operational fields while preserving an office multi-person assignment",
    "Electrician must not add a coworker to an existing planner assignment",
    "Electrician must not remove their assignment from a planner entry",
    "Office should create a valid multi-person planner assignment",
    "Office should update a planner team assignment to another valid set",
    "An actively assigned team member must not be deleted",
    "Office should reassign an active planner entry before deleting a team member",
    "Owner should delete a team member after active planner reassignment",
    "Office must not assign a deleted team member to an active planner entry",
    "Owner should preserve planner history as a tombstone",
    "Owner should delete a team member referenced only by planner history",
    "Denied electrician writes must leave the canonical assignment unchanged",
    "Customers must not read internal planner entries",
    "Another organisation must not read the planner entry",
  ]) {
    assert.match(patchedRunner, new RegExp(phrase.replaceAll(" ", "\\s+"), "i"));
  }

  const temporaryDirectory = mkdtempSync(join(tmpdir(), "jr-os-planner-rls-"));
  const temporaryRunner = join(temporaryDirectory, "run-supabase-rls.integration.mjs");
  const temporaryIntegration = join(temporaryDirectory, "supabase-rls.integration.mjs");
  try {
    writeFileSync(temporaryRunner, patchedRunner, "utf8");
    copyFileSync(integrationSourceUrl, temporaryIntegration);
    const childEnvironment = { ...process.env };
    delete childEnvironment.NODE_TEST_CONTEXT;
    const result = spawnSync(process.execPath, [temporaryRunner], {
      cwd: process.cwd(),
      env: childEnvironment,
      stdio: "inherit",
    });
    if (result.error) throw result.error;
    assert.equal(result.status ?? 1, 0, "Planner live RLS wrapper should complete successfully");
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});
