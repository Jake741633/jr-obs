import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../app/field/materials/page.tsx", import.meta.url), "utf8");
const policy = readFileSync(new URL("../lib/cloud/fieldMutationPolicy-core.mjs", import.meta.url), "utf8");

test("electrician materials mutations remain default deny", () => {
  for (const collectionKey of [
    "jr-os-stock-items",
    "jr-os-stock-movements",
    "jr-os-purchase-lists",
    "jr-os-job-material-usage",
  ]) {
    assert.doesNotMatch(policy, new RegExp(`"${collectionKey}"\\s*:`));
  }
  assert.match(policy, /stock movements/);
  assert.match(policy, /newly registered browser collection/);
});

test("mobile materials is read-only for unsupported cloud writes", () => {
  assert.match(page, /useCloudIdentity\(\)/);
  assert.match(page, /const cloudFieldMode = identityState\.mode !== "local"/);
  assert.match(page, /Materials cloud writes are currently locked/);
  assert.match(page, /Stock deductions are read-only for field cloud sessions/);
  assert.match(page, /Purchase requests are read-only for field cloud sessions/);
  assert.match(page, /!cloudFieldMode \? <Card>/);
});

test("cloud materials guards mutation entry points before optimistic writes", () => {
  for (const functionName of ["useMaterial", "createPurchaseRequest"]) {
    const match = page.match(new RegExp(`function ${functionName}\\([^)]*\\) \\{([\\s\\S]*?)\\n  \\}`));
    assert.ok(match, `${functionName} should exist`);
    assert.match(match[1], /if \(cloudFieldMode\)/, `${functionName} should fail closed in cloud mode`);
  }
});

test("materials scanning remains available while local mode retains mutation workflow", () => {
  assert.match(page, /function findByScanCode/);
  assert.match(page, /onClick=\{findByScanCode\}/);
  assert.match(page, /stock\.setItems/);
  assert.match(page, /movements\.setItems/);
  assert.match(page, /jobUsage\.setItems/);
  assert.match(page, /purchases\.setItems/);
});
