import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const runnerSource = readFileSync(new URL("./run-supabase-rls.integration.mjs", import.meta.url), "utf8");

test("canonical live RLS runner retains actor-scoped timesheet coverage", () => {
  for (const phrase of [
    "Electrician should create their own assigned-job timesheet row",
    "Electrician should read their own timesheet row",
    "Electrician must not read another actor timesheet row",
    "Electrician should update their own assigned-job timesheet row",
    "Electrician must not update another actor timesheet row",
    "Filtered electrician updates must leave another actor timesheet unchanged",
    "Office should retain payroll update authority over field timesheets",
    "Customers must not read timesheets",
    "Another organisation must not read the timesheet row",
  ]) {
    assert.match(runnerSource, new RegExp(phrase.replaceAll(" ", "\\s+"), "i"));
  }

  assert.match(
    runnerSource,
    /typedRecord\(organisationA, actorTimesheetA, customerA, jobA,/,
    "The electrician-owned row must use the canonical assigned-job envelope",
  );
  assert.match(
    runnerSource,
    /typedRecord\(organisationA, officeTimesheetA, customerA, jobA,/,
    "The office comparison row must vary the actor rather than the relationship envelope",
  );
  assert.match(
    runnerSource,
    /id: actorTimesheetA, teamMemberId: fieldTeamA, customerId: customerA, jobId: jobA/,
    "Actor update payloads must retain the canonical relationship binding",
  );
  assert.doesNotMatch(
    runnerSource,
    /typedRecord\(organisationA, actorTimesheetA, null, null,/,
    "Actor coverage must not restore the obsolete unbound electrician fixture",
  );
});
