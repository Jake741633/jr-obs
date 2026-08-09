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

const timesheetLines = [
  '    const electricianTimesheetA = source("timesheet-electrician-a");',
  '    const officeTimesheetA = source("timesheet-office-a");',
  '    const electricianTeamRef = source("timesheet-team-electrician-a");',
  '    const officeTeamRef = source("timesheet-team-office-a");',
  "    await expectAllowed(",
  '      await insertRecord(accounts.A.electrician, "timesheets", typedRecord(organisationA, electricianTimesheetA, null, null, {',
  '        teamMemberId: electricianTeamRef, workDate: "2026-08-09", startedAt: "08:00", finishedAt: "16:00", breakMinutes: 30, notes: "Own field timesheet", status: "Draft",',
  "      })),",
  '      "Electrician should create their own timesheet row",',
  "    );",
  "    await expectAllowed(",
  '      await insertRecord(accounts.A.office, "timesheets", typedRecord(organisationA, officeTimesheetA, null, null, {',
  '        teamMemberId: officeTeamRef, workDate: "2026-08-09", startedAt: "09:00", finishedAt: "17:00", breakMinutes: 30, notes: "Office-created payroll row", status: "Draft",',
  "      })),",
  '      "Office should create another timesheet row",',
  "    );",
  "",
  '    const officeOwnTimesheetRead = await listRecords(accounts.A.office, "timesheets", \\`select=source_id&source_id=eq.\\${officeTimesheetA}\\`);',
  '    await expectAllowed(officeOwnTimesheetRead, "Office own timesheet query should execute");',
  '    assert.equal(officeOwnTimesheetRead.payload.length, 1, "Office should read office-created timesheets");',
  '    const officeFieldTimesheetRead = await listRecords(accounts.A.office, "timesheets", \\`select=source_id&source_id=eq.\\${electricianTimesheetA}\\`);',
  '    await expectAllowed(officeFieldTimesheetRead, "Office field timesheet query should execute");',
  '    assert.equal(officeFieldTimesheetRead.payload.length, 1, "Office should read electrician-created timesheets");',
  "",
  '    const electricianOwnTimesheetRead = await listRecords(accounts.A.electrician, "timesheets", \\`select=source_id,payload&source_id=eq.\\${electricianTimesheetA}\\`);',
  '    await expectAllowed(electricianOwnTimesheetRead, "Electrician own timesheet query should execute");',
  '    assert.equal(electricianOwnTimesheetRead.payload.length, 1, "Electrician should read their own timesheet row");',
  '    const electricianForeignTimesheetRead = await listRecords(accounts.A.electrician, "timesheets", \\`select=source_id&source_id=eq.\\${officeTimesheetA}\\`);',
  '    await expectAllowed(electricianForeignTimesheetRead, "Electrician foreign timesheet query should fail closed");',
  '    assert.deepEqual(electricianForeignTimesheetRead.payload, [], "Electrician must not read another actor timesheet row");',
  "",
  "    await expectAllowed(",
  '      await patchRecords(accounts.A.electrician, "timesheets", \\`source_id=eq.\\${electricianTimesheetA}\\`, { payload: { id: electricianTimesheetA, teamMemberId: electricianTeamRef, workDate: "2026-08-09", startedAt: "08:00", finishedAt: "16:30", breakMinutes: 30, notes: "Own field timesheet updated", status: "Submitted" } }),',
  '      "Electrician should update their own timesheet row",',
  "    );",
  "    await expectDenied(",
  '      await patchRecords(accounts.A.electrician, "timesheets", \\`source_id=eq.\\${officeTimesheetA}\\`, { payload: { id: officeTimesheetA, teamMemberId: officeTeamRef, workDate: "2026-08-09", startedAt: "09:00", finishedAt: "18:00", breakMinutes: 30, notes: "Forged update", status: "Submitted" } }),',
  '      "Electrician must not update another actor timesheet row",',
  "    );",
  "    await expectAllowed(",
  '      await patchRecords(accounts.A.office, "timesheets", \\`source_id=eq.\\${electricianTimesheetA}\\`, { payload: { id: electricianTimesheetA, teamMemberId: electricianTeamRef, workDate: "2026-08-09", startedAt: "08:00", finishedAt: "16:30", breakMinutes: 30, notes: "Office approved", status: "Approved" } }),',
  '      "Office should retain payroll update authority over field timesheets",',
  "    );",
  "",
  '    const customerTimesheetRead = await listRecords(accounts.A.customer, "timesheets", \\`select=source_id&source_id=eq.\\${electricianTimesheetA}\\`);',
  '    await expectAllowed(customerTimesheetRead, "Customer timesheet query should fail closed");',
  '    assert.deepEqual(customerTimesheetRead.payload, [], "Customers must not read timesheets");',
  '    const crossTenantTimesheetRead = await listRecords(accounts.B.electrician, "timesheets", \\`select=source_id&source_id=eq.\\${electricianTimesheetA}\\`);',
  '    await expectAllowed(crossTenantTimesheetRead, "Cross-tenant timesheet query should execute safely");',
  '    assert.deepEqual(crossTenantTimesheetRead.payload, [], "Another organisation must not read the timesheet row");',
];

const timesheetCoverage = `${anchor}\\n\\n${timesheetLines.join("\\n")}`;

test("live RLS runner proves timesheets are actor-scoped for electricians", () => {
  const occurrences = runnerSource.split(anchor).length - 1;
  assert.equal(occurrences, 1, `Expected one customer projection anchor, found ${occurrences}`);

  const patchedRunner = runnerSource.replace(anchor, timesheetCoverage);
  for (const phrase of [
    "Electrician should read their own timesheet row",
    "Electrician must not read another actor timesheet row",
    "Electrician should update their own timesheet row",
    "Electrician must not update another actor timesheet row",
    "Office should retain payroll update authority over field timesheets",
    "Customers must not read timesheets",
    "Another organisation must not read the timesheet row",
  ]) {
    assert.match(patchedRunner, new RegExp(phrase.replaceAll(" ", "\\s+"), "i"));
  }

  const temporaryDirectory = mkdtempSync(join(tmpdir(), "jr-os-timesheet-rls-"));
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
    assert.equal(result.status ?? 1, 0, "Timesheet live RLS wrapper should complete successfully");
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});
