import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { collectionCloudMutationRoute } from "../lib/cloud/fieldMutationPolicy-core.mjs";

const page = readFileSync(new URL("../app/field/day-planner/page.tsx", import.meta.url), "utf8");
const fieldBoundary = readFileSync(new URL("../supabase/migrations/20260813235633_secure_field_mutation_boundary.sql", import.meta.url), "utf8");

test("day planner job-bound cloud restrictions apply only to electrician sessions", () => {
  assert.match(page, /identityState\.mode !== "local" && identityState\.identity\?\.role === "electrician"/);
  assert.doesNotMatch(page, /const cloudFieldMode = identityState\.mode !== "local";/);
});

test("planner and timesheet direct routes retain electrician RLS assignment binding", () => {
  assert.deepEqual(collectionCloudMutationRoute("planner_entries", "electrician"), { kind: "direct" });
  assert.deepEqual(collectionCloudMutationRoute("timesheets", "electrician"), { kind: "direct" });
  assert.match(fieldBoundary, /create policy planner_entries_field_insert[\s\S]*?private\.jr_field_record_targets_assigned_job\(/);
  assert.match(fieldBoundary, /create policy timesheets_field_insert[\s\S]*?payload ->> 'teamMemberId' = private\.current_team_member_source_id\(\)[\s\S]*?private\.jr_field_record_targets_assigned_job\(/);
});

test("job status writes remain RPC-bound for electricians and direct for office roles", () => {
  assert.deepEqual(collectionCloudMutationRoute("jobs", "electrician"), {
    kind: "rpc",
    functionName: "jr_field_update_job_status",
    resource: "jobs",
    allowedIntents: ["update"],
  });
  assert.deepEqual(collectionCloudMutationRoute("jobs", "admin"), { kind: "direct" });
});
