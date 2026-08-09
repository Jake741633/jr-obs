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

const bindingLines = [
  '    const linkedTeamMemberA = source("timesheet-linked-team-a");',
  '    const duplicateTeamMemberA = source("timesheet-duplicate-team-a");',
  '    const missingTeamTimesheetA = source("timesheet-missing-team-a");',
  '    const validTimesheetA = source("timesheet-team-bound-a");',
  '    const wrongTeamTimesheetA = source("timesheet-wrong-team-a");',
  '    const duplicateTimesheetA = source("timesheet-duplicate-match-a");',
  '    const unrelatedTeamMemberA = source("timesheet-unrelated-team-a");',
  "",
  "    await expectDenied(",
  '      await insertRecord(accounts.A.electrician, "timesheets", typedRecord(organisationA, missingTeamTimesheetA, null, null, { teamMemberId: unrelatedTeamMemberA, workDate: "2026-08-09", startedAt: "08:00", finishedAt: "16:00", breakMinutes: 30, notes: "Missing team link", status: "Draft" })),',
  '      "Electrician timesheet creation must fail without a matching team identity",',
  "    );",
  "",
  "    await expectAllowed(",
  '      await insertRecord(accounts.A.office, "team_members", typedRecord(organisationA, linkedTeamMemberA, null, null, { name: "Linked field electrician", email: accounts.A.electrician.email, role: "Electrician", status: "Active" })),',
  '      "Office should create the authenticated electrician team identity",',
  "    );",
  "    await expectAllowed(",
  '      await insertRecord(accounts.A.electrician, "timesheets", typedRecord(organisationA, validTimesheetA, null, null, { teamMemberId: linkedTeamMemberA, workDate: "2026-08-09", startedAt: "08:00", finishedAt: "16:00", breakMinutes: 30, notes: "Valid linked timesheet", status: "Draft" })),',
  '      "Electrician should create a timesheet for their uniquely linked team identity",',
  "    );",
  "    await expectDenied(",
  '      await insertRecord(accounts.A.electrician, "timesheets", typedRecord(organisationA, wrongTeamTimesheetA, null, null, { teamMemberId: unrelatedTeamMemberA, workDate: "2026-08-10", startedAt: "08:00", finishedAt: "16:00", breakMinutes: 30, notes: "Wrong team identity", status: "Draft" })),',
  '      "Electrician must not create a timesheet for another team identity",',
  "    );",
  "",
  "    await expectAllowed(",
  '      await patchRecords(accounts.A.electrician, "timesheets", \\`source_id=eq.\\${validTimesheetA}\\`, { payload: { id: validTimesheetA, teamMemberId: linkedTeamMemberA, workDate: "2026-08-09", startedAt: "08:00", finishedAt: "16:30", breakMinutes: 30, notes: "Valid linked timesheet updated", status: "Submitted" } }),',
  '      "Electrician should update a timesheet while retaining their linked team identity",',
  "    );",
  "    await expectDenied(",
  '      await patchRecords(accounts.A.electrician, "timesheets", \\`source_id=eq.\\${validTimesheetA}\\`, { payload: { id: validTimesheetA, teamMemberId: unrelatedTeamMemberA, workDate: "2026-08-09", startedAt: "08:00", finishedAt: "16:30", breakMinutes: 30, notes: "Reattributed timesheet", status: "Submitted" } }),',
  '      "Electrician must not reattribute a timesheet to another team identity",',
  "    );",
  "",
  "    await expectAllowed(",
  '      await insertRecord(accounts.A.office, "team_members", typedRecord(organisationA, duplicateTeamMemberA, null, null, { name: "Duplicate linked electrician", email: accounts.A.electrician.email, role: "Electrician", status: "Active" })),',
  '      "Office should be able to create a duplicate-email team record for fail-closed testing",',
  "    );",
  "    await expectDenied(",
  '      await insertRecord(accounts.A.electrician, "timesheets", typedRecord(organisationA, duplicateTimesheetA, null, null, { teamMemberId: linkedTeamMemberA, workDate: "2026-08-11", startedAt: "08:00", finishedAt: "16:00", breakMinutes: 30, notes: "Duplicate identity match", status: "Draft" })),',
  '      "Electrician timesheet creation must fail when team identity matches are ambiguous",',
  "    );",
];

const bindingCoverage = `${anchor}\\n\\n${bindingLines.join("\\n")}`;

test("live RLS runner proves field timesheets bind to one team identity", () => {
  const occurrences = runnerSource.split(anchor).length - 1;
  assert.equal(occurrences, 1, `Expected one customer projection anchor, found ${occurrences}`);

  const patchedRunner = runnerSource.replace(anchor, bindingCoverage);
  for (const phrase of [
    "Electrician timesheet creation must fail without a matching team identity",
    "Electrician should create a timesheet for their uniquely linked team identity",
    "Electrician must not create a timesheet for another team identity",
    "Electrician should update a timesheet while retaining their linked team identity",
    "Electrician must not reattribute a timesheet to another team identity",
    "Electrician timesheet creation must fail when team identity matches are ambiguous",
  ]) {
    assert.match(patchedRunner, new RegExp(phrase.replaceAll(" ", "\\s+"), "i"));
  }

  const temporaryDirectory = mkdtempSync(join(tmpdir(), "jr-os-timesheet-team-binding-"));
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
    assert.equal(result.status ?? 1, 0, "Timesheet team-binding live RLS wrapper should complete successfully");
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});
