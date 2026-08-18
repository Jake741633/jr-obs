import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../app/field/testing/page.tsx", import.meta.url), "utf8");
const policy = readFileSync(new URL("../lib/cloud/fieldMutationPolicy-core.mjs", import.meta.url), "utf8");

test("electrician certificate writes remain default deny", () => {
  assert.match(policy, /canonical reads must never imply writes for certificates, testing/);
  assert.doesNotMatch(policy, /jr-os-certificates["']?\s*:/);
});

test("mobile testing does not optimistically mutate a linked certificate", () => {
  assert.doesNotMatch(page, /certificates\.setItems\(/);
  assert.doesNotMatch(page, /sendSummaryToCertificate/);
  assert.match(page, /prepareCertificateSummary/);
  assert.match(page, /The certificate has not been changed/);
  assert.match(page, /Field testing does not directly modify certificate records/);
  assert.match(page, />Prepare for linked certificate</);
});

test("certificate handoff only persists the local testing evidence", () => {
  const functionBody = page.match(/function prepareCertificateSummary\(\) \{([\s\S]*?)\n  \}\n\n  const ready/);
  assert.ok(functionBody, "certificate preparation function should exist");
  assert.match(functionBody[1], /persistRecord\(record\)/);
  assert.match(functionBody[1], /status: "Ready for certificate"/);
  assert.doesNotMatch(functionBody[1], /certificates\.setItems/);
});
