import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../app/field/materials/page.tsx", import.meta.url), "utf8");
const policy = readFileSync(new URL("../lib/cloud/fieldMutationPolicy-core.mjs", import.meta.url), "utf8");
const permissions = readFileSync(new URL("../lib/cloud/permissions.ts", import.meta.url), "utf8");
const fieldLookup = readFileSync(new URL("../app/field/material-lookup/page.tsx", import.meta.url), "utf8");

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

test("mobile field materials needs no canonical stock movement history", () => {
  const match = page.match(/function useMaterial\([^)]*\) \{([\s\S]*?)\n  \}/);
  assert.ok(match, "useMaterial should exist");
  const guardIndex = match[1].indexOf("if (cloudFieldMode)");
  const writeIndex = match[1].indexOf("movements.setItems");
  assert.ok(guardIndex >= 0 && writeIndex > guardIndex, "the cloud guard must run before the movement write");
  assert.doesNotMatch(page, /movements\.items/, "the field page must not consume canonical movement history");
});

test("materials scanning remains available while local mode retains mutation workflow", () => {
  assert.match(page, /function findByScanCode/);
  assert.match(page, /onClick=\{findByScanCode\}/);
  assert.match(page, /stock\.setItems/);
  assert.match(page, /movements\.setItems/);
  assert.match(page, /jobUsage\.setItems/);
  assert.match(page, /purchases\.setItems/);
});

test("cloud field material shortcuts stay on permitted field routes", () => {
  const fieldLinks = page.match(/const cloudFieldMaterialLinks = \[([\s\S]*?)\] as const;/);
  const officeLinks = page.match(/const officeMaterialLinks = \[([\s\S]*?)\] as const;/);
  const electricianPages = permissions.match(/electrician:\s*\[([^\]]+)\]/);

  assert.ok(fieldLinks, "cloud field material links should be declared");
  assert.match(fieldLinks[1], /href: "\/field\/material-lookup"/);
  assert.doesNotMatch(fieldLinks[1], /href: "\/(?:materials|stock|purchases)"/);
  assert.ok(officeLinks, "office material links should be declared");
  for (const href of ["/materials", "/stock", "/purchases"]) {
    assert.match(officeLinks[1], new RegExp(`href: "${href}"`));
  }
  assert.match(page, /cloudFieldMode \? cloudFieldMaterialLinks : officeMaterialLinks/);
  assert.ok(electricianPages, "electrician route allowlist should exist");
  assert.match(electricianPages[1], /"\/field"/);
  assert.doesNotMatch(electricianPages[1], /"\/(?:materials|stock|purchases)"/);
  assert.match(fieldLookup, /export default function/);
});
