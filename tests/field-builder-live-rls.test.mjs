import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

const runnerUrl = new URL("./run-supabase-rls.integration.mjs", import.meta.url);
const runnerSource = readFileSync(runnerUrl, "utf8");

test("live RLS runner retains assigned builder contact boundaries", () => {
  for (const phrase of [
    "Assigned electrician should retain the assigned builder contact",
    "Co-assigned electrician should retain the assigned builder contact",
    "Electrician must not read a builder linked only to unassigned jobs",
    "Electrician must not read a builder without a canonical job",
    "Assigned electrician must not read another organisation's field builder",
    "Tenant B assigned electrician should retain its own builder contact",
    "Customers must not read field builder contacts",
    "Electrician without an active field identity must not read builder contacts",
    "Duplicate active field identities must fail builder reads closed",
    "Unique active identity should restore assigned builder reads",
    "Electrician should read the builder while its job is active and assigned",
    "Electrician must not read a builder after its assigned job is deleted",
    "Office should retain unassigned builder access",
    "Field builder projection must omit relationship notes",
    "Electrician must not write the field builder projection",
    "Electrician must not write complete builder CRM records",
  ]) {
    assert.match(runnerSource, new RegExp(phrase.replaceAll(" ", "\\s+"), "i"));
  }
});

test("live RLS runner executes the builder assignment coverage", () => {
  const childEnvironment = { ...process.env };
  delete childEnvironment.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, [fileURLToPath(runnerUrl)], {
    cwd: process.cwd(),
    env: childEnvironment,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  assert.equal(result.status ?? 1, 0, "Builder live RLS runner should complete successfully");
});
