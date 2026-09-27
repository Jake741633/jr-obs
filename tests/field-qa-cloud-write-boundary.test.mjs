import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../app/field/qa/page.tsx", import.meta.url), "utf8");
const policy = readFileSync(new URL("../lib/cloud/fieldMutationPolicy-core.mjs", import.meta.url), "utf8");

test("electrician QA inspection mutations remain default deny", () => {
  assert.doesNotMatch(policy, /"jr-os-job-qa-inspections"\s*:/);
  assert.match(policy, /newly registered browser collection/);
});

test("mobile QA is read-only in field cloud mode", () => {
  assert.match(page, /useCloudIdentity\(\)/);
  assert.match(page, /const cloudFieldMode = identityState\.mode !== "local"/);
  assert.match(page, /QA inspections are read-only for field cloud sessions/);
  assert.match(page, /QA cloud writes are currently locked/);
  assert.match(page, /disabled=\{cloudFieldMode \|\| inspection\.result !== "Pending"\}/);
  assert.match(page, /Pass\/fail changes are locked in field cloud mode/);
});

test("cloud QA guards all mutation entry points before optimistic writes", () => {
  for (const functionName of ["createInspection", "toggleCheck", "finishInspection"]) {
    const match = page.match(new RegExp(`function ${functionName}\\([^)]*\\) \\{([\\s\\S]*?)\\n  \\}`));
    assert.ok(match, `${functionName} should exist`);
    assert.match(match[1], /if \(cloudFieldMode\)/, `${functionName} should fail closed in cloud mode`);
  }
});

test("local QA mode retains the existing mutation workflow", () => {
  assert.match(page, /!cloudFieldMode \? <Card>/);
  assert.match(page, /inspections\.setItems/);
  assert.match(page, /tasks\.setItems/);
  assert.match(page, /timeline\.setItems/);
});
