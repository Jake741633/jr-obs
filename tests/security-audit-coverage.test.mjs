import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const requiredSuites = [
  "operator-permissions.test.mjs",
  "operator-navigation.test.mjs",
  "customer-portal-tenant-boundary.test.mjs",
  "offline-queue-tenant-isolation.test.mjs",
  "background-sync-tenant-isolation.test.mjs",
  "private-file-ownership-isolation.test.mjs",
  "audit-log-tenant-boundary.test.mjs",
  "audit-policy-integrity.test.mjs",
  "multi-tenant-penetration-regression.test.mjs",
  "forged-browser-session-rejection.test.mjs",
];

const testsDirectory = new URL("./", import.meta.url);

for (const suite of requiredSuites) {
  test(`security audit retains ${suite}`, () => {
    assert.equal(existsSync(new URL(suite, testsDirectory)), true);
  });
}

test("penetration suite retains every final attack class", () => {
  const penetration = readFileSync(new URL("multi-tenant-penetration-regression.test.mjs", testsDirectory), "utf8");

  for (const requiredPhrase of [
    "record enumeration",
    "browser cache tampering",
    "offline queue replay",
    "stale identity responses",
    "backup payloads",
    "private file path and signed URL tampering",
    "customer sessions",
    "tenant-sensitive state",
    "forged or expired browser sessions",
  ]) {
    assert.match(penetration, new RegExp(requiredPhrase.replaceAll(" ", "\\s+"), "i"));
  }
});
