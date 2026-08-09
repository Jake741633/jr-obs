import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const runnerSource = readFileSync(new URL("./run-supabase-rls.integration.mjs", import.meta.url), "utf8");
const integrationSourceUrl = new URL("./supabase-rls.integration.mjs", import.meta.url);

const anchor = [
  "    await expectDenied(",
  '      await patchRecords(accounts.A.customer, "portal_customers", \\`source_id=eq.\\${customerA}\\`, { payload: { id: customerA, name: "Forged portal update" } }),',
  '      "Customer must not write the portal customer projection",',
  "    );",
].join("\\n");

const plannerLines = [
  '    const plannerTeamA = source("planner-team-a");',
  '    const otherPlannerTeamA = source("planner-team-other-a");',
  '    const assignedPlannerA = source("planner-assigned-a");',
  '    const foreignPlannerA = source("planner-foreign-a");',
  '    const selfCreatedPlannerA = source("planner-self-created-a");',
  '    const unassignedFieldPlannerA = source("planner-unassigned-field-a");',
  "",
  "    await expectAllowed(",
  '      await insertRecord(accounts.A.office, "team_members", typedRecord(organisationA, plannerTeamA, null, null, { name: "Planner electrician", email: accounts.A.electrician.email, role: "Electrician", status: "Active" })),',
  '      "Office should create the planner team identity",',
  "    );",
  "    await expectAllowed(",
  '      await insertRecord(accounts.A.office, "team_members", typedRecord(organisationA, otherPlannerTeamA, null, null, { name: "Other planner worker", email: "other-planner@example.com", role: "Electrician", status: "Active" })),',
  '      "Office should create another planner team identity",',
  "    );",
  "    await expectAllowed(",
  '      await insertRecord(accounts.A.office, "planner_entries", typedRecord(organisationA, assignedPlannerA, customerA, jobA, { id: assignedPlannerA, title: "Assigned visit", type: "Job", date: "2026-08-10", startTime: "08:00", endTime: "16:00", customerId: customerA, jobId: jobA, teamMemberIds: [plannerTeamA], location: "1 Test Street", notes: "Assigned private site note", status: "Confirmed", createdAt: "2026-08-09T00:00:00.000Z", updatedAt: "2026-08-09T00:00:00.000Z" })),',
  '      "Office should create an assigned planner entry",',
  "    );",
  "    await expectAllowed(",
  '      await insertRecord(accounts.A.office, "planner_entries", typedRecord(organisationA, foreignPlannerA, customerA, jobA, { id: foreignPlannerA, title: "Other worker visit", type: "Job", date: "2026-08-10", startTime: "09:00", endTime: "17:00", customerId: customerA, jobId: jobA, teamMemberIds: [otherPlannerTeamA], location: "2 Private Street", notes: "Other engineer note", status: "Confirmed", createdAt: "2026-08-09T00:00:00.000Z", updatedAt: "2026-08-09T00:00:00.000Z" })),',
  '      "Office should create another worker planner entry",',
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
  "",
  "    await expectAllowed(",
  '      await patchRecords(accounts.A.electrician, "planner_entries", \\`source_id=eq.\\${assignedPlannerA}\\`, { payload: { id: assignedPlannerA, title: "Assigned visit updated", type: "Job", date: "2026-08-10", startTime: "08:00", endTime: "16:30", customerId: customerA, jobId: jobA, teamMemberIds: [plannerTeamA], location: "1 Test Street", notes: "Field update", status: "Complete", createdAt: "2026-08-09T00:00:00.000Z", updatedAt: "2026-08-09T12:00:00.000Z" } }),',
  '      "Electrician should update a planner entry while retaining their assignment",',
  "    );",
  "    await expectDenied(",
  '      await patchRecords(accounts.A.electrician, "planner_entries", \\`source_id=eq.\\${assignedPlannerA}\\`, { payload: { id: assignedPlannerA, title: "Reassigned visit", type: "Job", date: "2026-08-10", startTime: "08:00", endTime: "16:30", customerId: customerA, jobId: jobA, teamMemberIds: [otherPlannerTeamA], location: "1 Test Street", notes: "Removed self", status: "Complete", createdAt: "2026-08-09T00:00:00.000Z", updatedAt: "2026-08-09T12:00:00.000Z" } }),',
  '      "Electrician must not remove their assignment from a planner entry",',
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
  const occurrences = runnerSource.split(anchor).length - 1;
  assert.equal(occurrences, 1, `Expected one customer projection anchor, found ${occurrences}`);

  const patchedRunner = runnerSource.replace(anchor, plannerCoverage);
  for (const phrase of [
    "Electrician should read an entry assigned to their team identity",
    "Electrician must not read another worker planner entry",
    "Electrician should create a planner entry that includes their team identity",
    "Electrician must not create a planner entry without their team identity",
    "Electrician should update a planner entry while retaining their assignment",
    "Electrician must not remove their assignment from a planner entry",
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
    const result = spawnSync(process.execPath, [temporaryRunner], {
      cwd: process.cwd(),
      env: process.env,
      stdio: "inherit",
    });
    if (result.error) throw result.error;
    assert.equal(result.status ?? 1, 0, "Planner live RLS wrapper should complete successfully");
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});
