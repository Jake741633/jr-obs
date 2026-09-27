import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const runnerSource = readFileSync(new URL("./run-supabase-rls.integration.mjs", import.meta.url), "utf8");

test("canonical live RLS runner retains timesheet team-identity coverage", () => {
  for (const phrase of [
    "Electrician timesheet creation must fail without a matching team identity",
    "Electrician should create a timesheet for their uniquely linked team identity",
    "Electrician must not create a timesheet for another team identity",
    "Electrician should update a timesheet while retaining their linked team identity",
    "Electrician must not reattribute a timesheet to another team identity",
    "Electrician timesheet creation must fail when team identity matches are ambiguous",
    "Owner should remove the duplicate timesheet team identity fixture",
    "Unique team identity should restore electrician timesheet creation",
  ]) {
    assert.match(runnerSource, new RegExp(phrase.replaceAll(" ", "\\s+"), "i"));
  }

  for (const sourceId of ["missingTeamTimesheetA", "teamBoundTimesheetA", "wrongTeamTimesheetA", "duplicateTimesheetA"]) {
    assert.match(
      runnerSource,
      new RegExp(`typedRecord\\(organisationA, ${sourceId}, customerA, jobA,`),
      `${sourceId} must exercise team identity against the canonical assigned-job envelope`,
    );
  }
  assert.match(
    runnerSource,
    /id: teamBoundTimesheetA, teamMemberId: fieldTeamA, customerId: customerA, jobId: jobA/,
    "Allowed team-bound updates must retain every relationship field",
  );
  assert.match(
    runnerSource,
    /id: teamBoundTimesheetA, teamMemberId: fieldTeamCoworkerA, customerId: customerA, jobId: jobA/,
    "Denied reattribution must vary only the team identity",
  );
  assert.match(
    runnerSource,
    /patchRecords\(accounts\.A\.owner, "team_members", "source_id=eq\." \+ duplicateTeamMemberA, \{ deleted_at:/,
    "The duplicate active identity fixture must be removed before later live cases",
  );
});
