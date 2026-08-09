import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const identity = readFileSync(new URL("../lib/cloud/useCloudIdentity.ts", import.meta.url), "utf8");
const guard = readFileSync(new URL("../components/CloudAccessGuard.tsx", import.meta.url), "utf8");
const storage = readFileSync(new URL("../lib/storage.ts", import.meta.url), "utf8");
const repository = readFileSync(new URL("../lib/cloud/repository.ts", import.meta.url), "utf8");
const privateFiles = readFileSync(new URL("../lib/cloud/privateFiles.ts", import.meta.url), "utf8");

test("stale identity requests cannot reactivate a previous organisation", () => {
  assert.match(identity, /let identityRequestVersion = 0;/);
  assert.match(identity, /const requestVersion = \+\+identityRequestVersion;/);
  assert.match(identity, /if \(requestVersion === identityRequestVersion\) emit\(\{ identity, isReady: true \}\);/);
  assert.match(identity, /if \(identityRequest === request\) identityRequest = null;/);
  assert.match(identity, /identityRequestVersion \+= 1;\s*emit\(\{ identity: null, isReady: true \}\);/s);
});

test("identity changes move sync ownership to the latest resolved organisation and user", () => {
  assert.match(identity, /setActiveSyncIdentity\(next\.identity\?\.organisationId \?\? null, next\.identity\?\.userId \?\? null\)/);
  assert.match(identity, /emit\(\{ identity: null, isReady: false \}\);\s*return loadIdentity\(true\);/s);
  assert.match(identity, /event\.key === "jr-os-supabase-session"/);
  assert.match(repository, /const ACTIVE_ORGANISATION_KEY = "jr-os-active-organisation";/);
  assert.match(repository, /const ACTIVE_USER_KEY = "jr-os-active-user";/);
  assert.match(repository, /activeOrganisationId\(\) !== organisationId \|\| activeUserId\(\) !== userId/);
  assert.match(repository, /if \(activeOrganisationId\(\) === organisationId && activeUserId\(\) === userId\) syncStatus\.set\(statusForQueue\(activeRemaining\)\)/);
});

test("account and permission switches remount transient workspace state", () => {
  assert.match(guard, /const workspaceIdentityKey = JSON\.stringify\(\[[\s\S]*identity\.organisationId,[\s\S]*identity\.userId,[\s\S]*identity\.role,[\s\S]*identity\.customerSourceId \?\? ""/);
  assert.match(guard, /<Fragment key=\{workspaceIdentityKey\}>\{children\}<\/Fragment>/);
  assert.match(guard, /if \(!isReady\)/);
  assert.match(guard, /if \(!identity\)/);
});

test("every browser collection and private-file cache changes across authorisation identities", () => {
  assert.match(storage, /const cacheUserId = userId/);
  assert.doesNotMatch(storage, /identity\?\.role === "customer" \? userId : undefined/);
  assert.match(storage, /accountStorageKey\(key, organisationId, cacheUserId, cacheRole, cacheCustomerSourceId\)/);
  assert.match(storage, /\[activeStorageKey, cacheCustomerSourceId, cacheRole, cacheUserId, identityReady, key, mode, organisationId, target, userId\]/);
  assert.match(storage, /\[activeStorageKey, cacheCustomerSourceId, cacheRole, cacheUserId, isReady, items, key, mode, organisationId, target, userId\]/);
  assert.match(privateFiles, /privateSignedUrlCacheKey\(identity: CloudIdentity, sourceId: string\)/);
  assert.match(privateFiles, /return JSON\.stringify\(\[identity\.organisationId, identity\.userId, identity\.role, identity\.customerSourceId \?\? null, sourceId\]\)/);
  assert.match(privateFiles, /assertOrganisationPrivateObjectPath\(organisationId, objectPath\)/);
});

test("collections clear previous tenant data while identity is unresolved", () => {
  assert.match(
    storage,
    /useEffect\(\(\) => \{\s*if \(identityReady\) return;\s*suppressSyncRef\.current = true;\s*previousRef\.current = initialValueRef\.current;\s*setItems\(initialValueRef\.current\);\s*setIsReady\(false\);\s*\}, \[identityReady\]\);/,
  );
  const clearIndex = storage.indexOf("if (identityReady) return;");
  const loadIndex = storage.indexOf("async function loadCollection()");
  assert.ok(clearIndex !== -1 && loadIndex !== -1 && clearIndex < loadIndex, "collection state must clear before tenant loading begins");
});
