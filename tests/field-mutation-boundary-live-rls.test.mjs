import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const runnerPath = new URL("./run-supabase-rls.integration.mjs", import.meta.url);
const runner = readFileSync(runnerPath, "utf8");

test("generated live RLS runner retains the secure assigned-field mutation matrix", () => {
  for (const phrase of [
    "Anonymous field mutation RPC calls must fail",
    "Office sessions must not use the electrician mutation RPC",
    "Customer sessions must not use the electrician mutation RPC",
    "Oversized field payloads must be rejected before receipt persistence",
    "Assigned electrician should apply a valid job status transition through the RPC",
    "Assigned electrician must not apply an unsupported canonical job status transition",
    "Rejected field status must not advance the canonical job version",
    "Rejected field status must not change the canonical job",
    "Rejected field status must not create authoritative timeline evidence",
    "A response-loss retry should return the exact prior job mutation result",
    "A mutation id must not be reused with changed job arguments",
    "Electrician must not mutate an unassigned same-tenant job",
    "Status evidence must bind the canonical linked customer",
    "Legacy In progress request should canonicalize through the status RPC",
    "Legacy requested status must return the canonical lifecycle state",
    "Assigned electrician should create a survey through the field RPC",
    "Survey response-loss retry should return the exact prior result",
    "Generic mutation id reuse with changed payload must fail",
    "Create-only retry with a fresh mutation id must collide",
    "Exactly one simultaneous field create must apply",
    "Concurrent field create loser must use the conflict contract",
    "Electrician must not update an office or coworker-owned survey",
    "Co-assigned electrician should create their own survey",
    "Electrician must not update a co-assigned coworker survey",
    "Duplicate active team identities must fail closed",
    "Inactive team identities must fail closed",
    "Survey update must preserve office labour rate",
    "Survey update must preserve canonical attachments",
    "Stale survey version must fail",
    "Diary RPC must bind staff presence to the actor",
    "Diary RPC must preserve bounded plant and equipment detail",
    "Diary RPC must preserve bounded delivery detail",
    "Diary RPC must preserve bounded toolbox-talk detail",
    "Diary RPC must discard browser-authored acknowledgement evidence",
    "Diary response-loss retry should return the exact prior result",
    "Diary mutation id reuse with changed payload must fail",
    "Diary create-only retry with a fresh mutation id must collide",
    "Field site diaries must remain insert-only",
    "Assigned electrician should create an actor-bound task",
    "Assigned electrician should update task status only",
    "Task update must preserve canonical content",
    "Legacy null-customer task should remain status-updatable",
    "Legacy task update must preserve its canonical null envelope",
    "Assigned electrician should create a plain field note",
    "Field note must not forge authoritative evidence classification",
    "Field note must discard client status-evidence fields",
    "Field note output must always remain a plain server-authored note",
    "Read-only field collections must remain denied",
    "Electrician direct generic write must fail closed",
    "Electrician direct write must fail closed",
    "Electrician must not create a planner entry for an unassigned same-tenant job",
    "Electrician must not create a timesheet for an unassigned same-tenant job",
    "Electrician private object upload must fail closed without an assigned upload intent",
  ]) {
    assert.match(runner, new RegExp(phrase.replaceAll(" ", "\\s+"), "i"));
  }

  assert.match(runner, /\/rest\/v1\/rpc\/jr_field_update_job_status/i);
  assert.match(runner, /\/rest\/v1\/rpc\/jr_field_save_collection/i);
  assert.match(runner, /mutation_id:\s*(jobStatusMutationId|surveyMutationId|crypto\.randomUUID\(\))/i);
});

test("generated field-boundary live RLS program builds and completes", () => {
  const result = spawnSync(process.execPath, [fileURLToPath(runnerPath)], {
    cwd: process.cwd(),
    env: process.env,
    encoding: "utf8",
  });
  if (result.error) throw result.error;
  assert.equal(
    result.status ?? 1,
    0,
    `Generated live RLS runner failed:\n${result.stdout}\n${result.stderr}`,
  );
});
