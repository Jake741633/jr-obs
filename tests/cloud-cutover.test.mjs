import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const helper = await readFile(new URL("../lib/cloud/cutover.ts", import.meta.url), "utf8");
const page = await readFile(new URL("../app/cloud/cutover/page.tsx", import.meta.url), "utf8");
const navigation = await readFile(new URL("../components/navigation.ts", import.meta.url), "utf8");
const identityHook = await readFile(new URL("../lib/cloud/useCloudIdentity.ts", import.meta.url), "utf8");
const cloudSync = await readFile(new URL("../lib/cloudSync.ts", import.meta.url), "utf8");
const repository = await readFile(new URL("../lib/cloud/repository.ts", import.meta.url), "utf8");

function functionBody(source, name) {
  const start = source.indexOf(`export function ${name}`);
  assert.notEqual(start, -1, `${name} must exist`);
  const nextExport = source.indexOf("\nexport ", start + 1);
  return source.slice(start, nextExport === -1 ? source.length : nextExport);
}

test("cutover check reads Supabase directly while preserving local data", () => {
  assert.match(helper, /cloudSelect/);
  assert.match(helper, /organisation_id=eq\./);
  assert.match(helper, /deleted_at=is\.null/);
  assert.doesNotMatch(helper, /localStorage\.removeItem/);
  assert.doesNotMatch(helper, /localStorage\.clear/);
});

test("cutover report detects local-only records and unsafe queue states", () => {
  assert.match(helper, /localOnlyIds/);
  assert.match(helper, /Conflict/);
  assert.match(helper, /Failed/);
  assert.match(helper, /jr-os-private-file-upload-queue/);
  assert.match(helper, /readyForCloudMode: blockers\.length === 0/);
});

test("cutover readiness counts only the active organisation queues", () => {
  assert.match(helper, /function queueSummary\(organisationId: string\)/);
  assert.match(helper, /filter\(\(item\) => item\.organisationId === organisationId\)/);
  assert.match(helper, /const queue = queueSummary\(organisationId\)/);
  assert.match(helper, /readJson<PrivateFileUploadQueueItem\[]>\("jr-os-private-file-upload-queue", \[\]\)[\s\S]*filter\(\(item\) => item\.organisationId === organisationId\)\.length/);
  assert.doesNotMatch(helper, /readJson<unknown\[]>\("jr-os-private-file-upload-queue", \[\]\)\.length/);
});

test("cutover page refreshes and exposes the authenticated organisation", () => {
  assert.match(page, /identity\.organisationId/);
  assert.match(page, /refreshIdentity/);
  assert.match(page, /Refresh signed-in account/);
  assert.match(page, /runCloudCutoverCheck/);
  assert.match(page, /Check local against cloud/);
  assert.match(page, /Not ready for cloud mode/);
});

test("cutover page can retry the queue and immediately rerun readiness", () => {
  assert.match(page, /repairPendingQueue/);
  assert.match(page, /flushSyncQueue/);
  assert.match(page, /Retry and clear pending changes/);
  assert.match(page, /runCloudCutoverCheck\(identity\.organisationId\)/);
});

test("queue repair clears already-synchronised operations without rewriting cloud records", () => {
  assert.match(repository, /samePayload\(current\.payload, item\.payload\)/);
  assert.match(repository, /current && !current\.deleted_at/);
  assert.match(repository, /item\.operation === "delete" && \(!current \|\| current\.deleted_at\)/);
  assert.match(repository, /SyncQueueFlushResult/);
  assert.match(repository, /getSyncQueue/);
});

test("failed queue items show their exact record and error before any marker is cleared", () => {
  assert.match(page, /queueItemLabel/);
  assert.match(page, /item\.sourceId/);
  assert.match(page, /item\.table/);
  assert.match(page, /item\.error/);
  assert.match(page, /Clear stale marker/);
  assert.match(page, /No local or cloud business record was deleted/);
});

test("stale marker removal updates only the active identity queue and recalculates sync status", () => {
  const discardBody = functionBody(repository, "discardSyncQueueItem");
  assert.match(discardBody, /queue\.filter\(\(entry\) => entry\.id !== itemId\)/);
  assert.match(discardBody, /activeRemaining = next\.filter\(\(entry\) => queueItemMatchesAuthorization\(entry, authorization\)\)/);
  assert.match(discardBody, /statusForQueue\(activeRemaining\)/);
  assert.doesNotMatch(discardBody, /cloudPatch/);
  assert.doesNotMatch(discardBody, /cloudUpsert/);
  assert.doesNotMatch(discardBody, /cloudSelect/);
});

test("failed marker can only be cleared after readiness confirms the record exists in cloud", () => {
  assert.match(page, /cloudContainsRecord/);
  assert.match(page, /collection\.cloudCount > 0/);
  assert.match(page, /!collection\.localOnlyIds\.includes\(item\.sourceId\)/);
  assert.match(page, /cannot be cleared safely/);
});

test("shared identity reloads a persisted session and observes account changes", () => {
  assert.match(identityHook, /readSupabaseSession/);
  assert.match(identityHook, /hasPersistedSession/);
  assert.match(identityHook, /refreshCloudIdentity/);
  assert.match(identityHook, /jr-os-cloud-identity-changed/);
  assert.match(identityHook, /visibilitychange/);
  assert.match(identityHook, /jr-os-supabase-session/);
});

test("visible tabs always revalidate and clear stale in-memory identity first", () => {
  assert.match(
    identityHook,
    /function handleVisibilityChange\(\) \{\s*if \(document\.visibilityState === "visible"\) void refreshCloudIdentity\(\);\s*\}/,
  );
  assert.match(
    identityHook,
    /export function refreshCloudIdentity\(\) \{\s*emit\(\{ identity: null, isReady: false \}\);\s*return loadIdentity\(true\);\s*\}/,
  );
  assert.match(identityHook, /setActiveSyncIdentity\([\s\S]*next\.identity\?\.organisationId[\s\S]*next\.identity\?\.userId[\s\S]*next\.identity\?\.role[\s\S]*next\.identity\?\.customerSourceId/);
});

test("cross-tab session changes still trigger the same identity revalidation path", () => {
  assert.match(
    identityHook,
    /function handleStorageChange\(event: StorageEvent\) \{\s*if \(event\.key === "jr-os-supabase-session"\) void refreshCloudIdentity\(\);\s*\}/,
  );
  assert.match(identityHook, /window\.addEventListener\("storage", handleStorageChange\)/);
  assert.match(identityHook, /window\.removeEventListener\("storage", handleStorageChange\)/);
});

test("identity refresh errors fail closed without overwriting a newer request", () => {
  assert.match(
    identityHook,
    /catch \{\s*if \(requestVersion === identityRequestVersion\) emit\(\{ identity: null, isReady: true \}\);\s*return null;\s*\}/,
  );
  assert.match(identityHook, /if \(requestVersion === identityRequestVersion\) emit\(\{ identity, isReady: true \}\)/);
  assert.match(identityHook, /if \(identityRequest === request\) identityRequest = null/);
});

test("typed import records the common successful upload timestamp", () => {
  assert.match(cloudSync, /recordSuccessfulCloudUpload/);
  assert.match(cloudSync, /jr-os-last-cloud-sync/);
  assert.match(cloudSync, /jr-os-last-typed-cloud-sync/);
  assert.match(cloudSync, /organisationStorageKey\(typed \? LAST_TYPED_CLOUD_SYNC_STORAGE_KEY : LAST_CLOUD_SYNC_STORAGE_KEY, organisationId\)/);
  assert.doesNotMatch(cloudSync, /localStorage\.setItem\("jr-os-last-(?:typed-)?cloud-sync"/);
});

test("cloud cutover page is reachable from navigation", () => {
  assert.match(navigation, /Cloud Cutover Check/);
  assert.match(navigation, /\/cloud\/cutover/);
});
