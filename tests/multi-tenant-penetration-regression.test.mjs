import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const adapter = readFileSync(new URL("../lib/cloud/adapter.ts", import.meta.url), "utf8");
const repository = readFileSync(new URL("../lib/cloud/repository.ts", import.meta.url), "utf8");
const identity = readFileSync(new URL("../lib/cloud/useCloudIdentity.ts", import.meta.url), "utf8");
const storage = readFileSync(new URL("../lib/storage.ts", import.meta.url), "utf8");
const privateFiles = readFileSync(new URL("../lib/cloud/privateFiles.ts", import.meta.url), "utf8");
const appData = readFileSync(new URL("../lib/appData.ts", import.meta.url), "utf8");
const portal = readFileSync(new URL("../app/customer-portal/page.tsx", import.meta.url), "utf8");
const guard = readFileSync(new URL("../components/CloudAccessGuard.tsx", import.meta.url), "utf8");
const client = readFileSync(new URL("../lib/cloud/client.ts", import.meta.url), "utf8");

test("record enumeration cannot remove the organisation filter", () => {
  assert.match(adapter, /cloudSelect<CloudEnvelope<T>>\(table, `select=\*&organisation_id=eq\.\$\{encodeURIComponent\(organisationId\)\}\$\{collectionFilter\}&deleted_at=is\.null`\)/);
  assert.match(adapter, /collection_key=eq\.\$\{encodeURIComponent\(collectionKey\)\}/);
  assert.match(adapter, /queueChange\(\{ table, storageKey: scopedStorageKey, operation: "upsert", organisationId, sourceId: record\.id/);
  assert.match(adapter, /queueChange\(\{ table, storageKey: scopedStorageKey, operation: "delete", organisationId, sourceId/);
});

test("browser cache tampering cannot alias two organisations or authenticated users", () => {
  assert.match(adapter, /return `\$\{storageKey\}:organisation:\$\{JSON\.stringify\(\[organisationId\]\)\}`/);
  assert.match(adapter, /:account:\$\{JSON\.stringify\(\[userId\]\)\}/);
  assert.match(storage, /accountStorageKey\(key, organisationId, cacheUserId\)/);
  assert.match(storage, /const cacheUserId = userId/);
  assert.doesNotMatch(storage, /identity\?\.role === "customer" \? userId : undefined/);
  assert.doesNotMatch(storage, /localStorage\.setItem\(key, JSON\.stringify\(items\)\)/);
});

test("offline queue replay cannot process another organisation or user after a switch", () => {
  assert.match(repository, /return readAllSyncQueue\(\)\.filter\(\(item\) => item\.organisationId === organisationId && \(!userId \|\| item\.userId === userId\)\)/);
  assert.match(repository, /if \(activeOrganisationId\(\) !== organisationId \|\| activeUserId\(\) !== userId\)/);
  assert.match(repository, /const untouched = liveQueue\.filter\(\(item\) => item\.organisationId !== organisationId \|\| item\.userId !== userId \|\| !originalIds\.has\(item\.id\)\)/);
  assert.match(repository, /entry\.id === itemId && entry\.organisationId === organisationId && \(!userId \|\| entry\.userId === userId\)/);
  assert.doesNotMatch(repository, /readAllSyncQueue\(\)\.forEach/);
});

test("stale identity responses cannot restore an earlier tenant", () => {
  assert.match(identity, /let identityRequestVersion = 0/);
  assert.match(identity, /const requestVersion = \+\+identityRequestVersion/);
  assert.match(identity, /requestVersion === identityRequestVersion/);
  assert.match(identity, /identityRequestVersion \+= 1/);
  assert.match(guard, /key=\{identity\.organisationId\}/);
});

test("backup payloads cannot inject another tenant or internal sync state", () => {
  assert.match(appData, /parsed\.organisationId !== organisationId/);
  assert.match(appData, /This backup belongs to a different JR OS organisation/);
  assert.match(appData, /key\.includes\(ORGANISATION_MARKER\)/);
  assert.match(appData, /excludedBackupKeys/);
  assert.match(appData, /jr-os-cloud-sync-queue/);
  assert.match(appData, /organisationStorageKey\(key, organisationId\)/);
});

test("private file path and signed URL tampering fail organisation and user checks", () => {
  assert.match(privateFiles, /isOrganisationPrivateObjectPath/);
  assert.match(privateFiles, /assertOrganisationPrivateObjectPath\(organisationId, objectPath\)/);
  assert.match(privateFiles, /The private file does not belong to the active organisation/);
  assert.match(privateFiles, /privateSignedUrlCacheKey\(organisationId: string, sourceId: string\)/);
  assert.match(privateFiles, /return JSON\.stringify\(\[organisationId, readSupabaseSession\(\)\?\.user\?\.id \?\? "", sourceId\]\)/);
});

test("customer sessions cannot select or mutate another customer record", () => {
  assert.match(portal, /identity\?\.role === "customer"/);
  assert.match(portal, /identity\.customerSourceId/);
  assert.match(portal, /const activeCustomerId = customerSession \? authenticatedCustomerId : selectedCustomerId/);
  assert.match(portal, /!customerPricing\.some\(\(item\) => item\.id === document\.id\)/);
  assert.match(portal, /requestJobId && !jobIds\.has\(requestJobId\)/);
  assert.doesNotMatch(portal, /customerSession \? selectedCustomerId/);
});

test("tenant-sensitive state is invalidated across identity and workspace changes", () => {
  assert.match(identity, /emit\(\{ identity: null, isReady: false \}\)/);
  assert.match(identity, /setActiveSyncIdentity\(next\.identity\?\.organisationId \?\? null, next\.identity\?\.userId \?\? null\)/);
  assert.match(guard, /<Fragment key=\{identity\.userId\}>/);
  assert.match(guard, /<Fragment key=\{identity\.organisationId\}>/);
  assert.match(storage, /\[activeStorageKey, cacheUserId, identityReady, key, mode, organisationId, target, userId\]/);
});

test("forged or expired browser sessions cannot reach cloud requests", () => {
  assert.match(client, /if \(session\.expiresAt <= Date\.now\(\)\) \{/);
  assert.match(client, /window\.localStorage\.removeItem\(SESSION_KEY\);\s*return null;/s);
  assert.match(client, /catch \{\s*window\.localStorage\.removeItem\(SESSION_KEY\);\s*return null;\s*\}/s);
  assert.match(client, /cloudSelect[\s\S]*cloudSession\.load\(\) \|\| undefined/);
  assert.match(client, /createSignedUpload[\s\S]*cloudSession\.load\(\) \|\| undefined/);
  assert.match(client, /createSignedDownload[\s\S]*cloudSession\.load\(\) \|\| undefined/);
});
