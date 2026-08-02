import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const repository = readFileSync(new URL("../lib/cloud/repository.ts", import.meta.url), "utf8");
const identity = readFileSync(new URL("../lib/cloud/useCloudIdentity.ts", import.meta.url), "utf8");

test("automatic reconnect sync remains bound to the active organisation", () => {
  assert.match(repository, /window\.addEventListener\("online", \(\) => void flushSyncQueue\(\)\)/);
  assert.match(repository, /const organisationId = activeOrganisationId\(\);/);
  assert.match(repository, /if \(!organisationId\) return \{ processed: 0, cleared: 0, remaining: 0, conflicts: 0, failed: 0 \};/);
  assert.match(repository, /const queue = allQueue\.filter\(\(item\) => item\.organisationId === organisationId\)/);
});

test("in-flight background replay aborts when identity ownership changes", () => {
  const ownershipChecks = repository.match(/activeOrganisationId\(\) !== organisationId/g) ?? [];
  assert.ok(ownershipChecks.length >= 2, "background replay must recheck tenant ownership before and after remote reads");
  assert.match(repository, /remaining\.push\(\.\.\.queue\.slice\(processed\)\);\s*break;/s);
  assert.match(repository, /remaining\.push\(item, \.\.\.queue\.slice\(processed\)\);\s*break;/s);
  assert.match(repository, /if \(activeOrganisationId\(\) === organisationId\) syncStatus\.set\(statusForQueue\(activeRemaining\)\)/);
});

test("failed background retries retain their originating tenant and cannot migrate", () => {
  assert.match(repository, /remaining\.push\(\{ \.\.\.item, attempts: item\.attempts \+ 1, state: "Failed"/);
  assert.match(repository, /const untouched = liveQueue\.filter\(\(item\) => item\.organisationId !== organisationId \|\| !originalIds\.has\(item\.id\)\)/);
  assert.match(repository, /const retained = remaining\.filter\(\(item\) => liveIds\.has\(item\.id\)\)/);
  assert.doesNotMatch(repository, /organisationId:\s*activeOrganisationId\(\)/);
});

test("identity refresh updates background sync ownership before replay", () => {
  assert.match(identity, /setActiveSyncOrganisation\(next\.identity\?\.organisationId \?\? null\)/);
  assert.match(identity, /emit\(\{ identity: null, isReady: false \}\);\s*return loadIdentity\(true\);/s);
  assert.match(identity, /identityRequestVersion \+= 1;\s*emit\(\{ identity: null, isReady: true \}\);/s);
});
