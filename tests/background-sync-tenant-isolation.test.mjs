import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const repository = readFileSync(new URL("../lib/cloud/repository.ts", import.meta.url), "utf8");
const identity = readFileSync(new URL("../lib/cloud/useCloudIdentity.ts", import.meta.url), "utf8");

test("automatic reconnect sync remains bound to live authorisation", () => {
  assert.match(repository, /window\.addEventListener\("online", \(\) => void flushSyncQueue\(\)\)/);
  assert.match(repository, /const authorization = currentSyncAuthorization\(\);/);
  assert.match(repository, /if \(!authorization\) return \{ processed: 0, cleared: 0, remaining: 0, conflicts: 0, failed: 0 \};/);
  assert.match(repository, /const queue = allQueue\.filter\(\(item\) => queueItemMatchesAuthorization\(item, authorization\)\)/);
  assert.match(repository, /await revalidateSyncAuthorization\(authorization\)/);
});

test("in-flight background replay aborts when identity ownership changes", () => {
  const ownershipChecks = repository.match(/!activeSyncAuthorizationMatches\(authorization\)/g) ?? [];
  assert.ok(ownershipChecks.length >= 2, "background replay must recheck complete authorisation before and after remote reads");
  assert.match(repository, /remaining\.push\(\.\.\.queue\.slice\(processed\)\);\s*break;/s);
  assert.match(repository, /remaining\.push\(item, \.\.\.queue\.slice\(processed\)\);\s*break;/s);
  assert.match(repository, /if \(activeSyncAuthorizationMatches\(authorization\)\) syncStatus\.set\(statusForQueue\(activeRemaining\)\)/);
});

test("failed background retries retain their originating identity and cannot migrate", () => {
  assert.match(repository, /remaining\.push\(\{ \.\.\.item, attempts: item\.attempts \+ 1, state: "Failed"/);
  assert.match(repository, /const untouched = liveQueue\.filter\(\(item\) => !queueItemMatchesAuthorization\(item, authorization\) \|\| !originalIds\.has\(item\.id\)\)/);
  assert.match(repository, /const retained = remaining\.filter\(\(item\) => liveIds\.has\(item\.id\)\)/);
  assert.doesNotMatch(repository, /organisationId:\s*activeOrganisationId\(\)/);
});

test("identity refresh updates background sync ownership before replay", () => {
  assert.match(identity, /setActiveSyncIdentity\([\s\S]*next\.identity\?\.organisationId[\s\S]*next\.identity\?\.userId[\s\S]*next\.identity\?\.role[\s\S]*next\.identity\?\.customerSourceId/);
  assert.match(identity, /emit\(\{ identity: null, isReady: false \}\);\s*return loadIdentity\(true\);/s);
  assert.match(identity, /identityRequestVersion \+= 1;\s*emit\(\{ identity: null, isReady: true \}\);/s);
});
