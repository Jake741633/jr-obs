import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  activeCloudPageOperationMatches,
  assertCloudPageOperationCurrent,
  canRetainSettledCloudIdentity,
  clearSubmittedValue,
  cloudPageIdentityKey,
  createCloudPageOperationCoordinator,
  matchedCloudPageIdentity,
  normalCloudPageSessionUserId,
  ownedCloudPageValue,
} from "../lib/cloud/cloudPageIdentity-core.mjs";
import {
  capturedSupabaseLogoutRequest,
  globalSupabaseSignOutOwnsSession,
  sameSupabaseSession,
  sameSupabaseSessionOwnership,
  supabaseSessionFingerprint,
  supabaseSessionUserId,
} from "../lib/supabase/sessionOwnership-core.mjs";

const page = readFileSync(new URL("../app/cloud/page.tsx", import.meta.url), "utf8");
const cloudSync = readFileSync(new URL("../lib/cloudSync.ts", import.meta.url), "utf8");
const repository = readFileSync(new URL("../lib/cloud/repository.ts", import.meta.url), "utf8");
const identityHook = readFileSync(new URL("../lib/cloud/useCloudIdentity.ts", import.meta.url), "utf8");
const recoveryGate = readFileSync(new URL("../components/PasswordRecoveryGate.tsx", import.meta.url), "utf8");
const supabaseClient = readFileSync(new URL("../lib/supabase/client.ts", import.meta.url), "utf8");
const cloudClient = readFileSync(new URL("../lib/cloud/client.ts", import.meta.url), "utf8");

const accountUser = { id: "user-a", email: "stale@example.com" };
const identity = {
  organisationId: "org-a",
  userId: "user-a",
  role: "owner",
  customerSourceId: undefined,
  email: " Fresh@Example.com ",
};
const normalSession = { access_token: "token-a", user: { id: "user-a", email: "fresh@example.com" } };

test("the account page settles only a matching full identity and prefers its fresh email", () => {
  assert.equal(matchedCloudPageIdentity(identity, { ...accountUser, id: "user-b" }, normalSession), null);
  const matched = matchedCloudPageIdentity(identity, accountUser, normalSession);
  assert.equal(matched.email, "Fresh@Example.com");
  assert.equal(matched.key, JSON.stringify(["org-a", "user-a", "owner", null, "fresh@example.com"]));
});

test("cached identity fails closed without the exact current normal session", () => {
  for (const session of [
    null,
    { access_token: "" , user: { id: "user-a" } },
    { access_token: "token-a", is_password_recovery: true, user: { id: "user-a" } },
    { access_token: "legacy-token-without-user" },
  ]) {
    assert.equal(matchedCloudPageIdentity(identity, accountUser, session), null);
    assert.equal(normalCloudPageSessionUserId(session), null);
  }
  const differentUserSession = { access_token: "token-b", user: { id: "user-b" } };
  assert.equal(matchedCloudPageIdentity(identity, accountUser, differentUserSession), null);
  assert.equal(normalCloudPageSessionUserId(differentUserSession), "user-b");
  assert.equal(normalCloudPageSessionUserId(normalSession), "user-a");
});

test("late authentication responses cannot overwrite a replacement session", () => {
  const first = { access_token: "token-a", refresh_token: "refresh-a", user: { id: "user-a" } };
  const replacement = { access_token: "token-b", refresh_token: "refresh-b", user: { id: "user-b" } };
  assert.equal(sameSupabaseSession(first, { ...first, user: { id: "user-a" } }), true);
  assert.equal(sameSupabaseSession(first, { ...first, user: undefined }), true);
  assert.equal(sameSupabaseSession(first, { ...first, is_password_recovery: true }), false);
  assert.equal(sameSupabaseSession(first, replacement), false);
  assert.notEqual(supabaseSessionFingerprint(first), supabaseSessionFingerprint(replacement));
  assert.match(cloudSync, /signInWithEmail[\s\S]*const startingOwnership = captureSupabaseSessionOwnership\(\)[\s\S]*assertCloudPageOperationCurrent\(operationIsCurrent\)[\s\S]*assertActiveSession\(startingOwnership\)[\s\S]*saveSupabaseSession\(session\)/);
  assert.match(cloudSync, /signUpWithEmail[\s\S]*const startingOwnership = captureSupabaseSessionOwnership\(\)[\s\S]*assertCloudPageOperationCurrent\(operationIsCurrent\)[\s\S]*assertActiveSession\(startingOwnership\)[\s\S]*if \(result\.access_token\)/);
  assert.match(cloudSync, /getCurrentCloudUser[\s\S]*activeSessionMatches\(startingOwnership\)[\s\S]*return null/);
  assert.match(cloudSync, /if \(!startingSession\.user\?\.id && user\?\.id\) \{[\s\S]*saveSupabaseSession\(\{ \.\.\.activeSession, user: \{ id: user\.id, email: user\.email \} \}\)/);
  assert.match(cloudSync, /signOutCloudUser\([\s\S]*operationIsCurrent\?: CloudOperationOwnershipGuard,[\s\S]*expectedUserId\?: string,[\s\S]*activeSessionOwnedByGlobalSignOut\(expectedOwnership, expectedUserId\)/);
  assert.match(page, /signInWithEmail\(submittedEmail\.trim\(\), submittedPassword, operationIsCurrent\)/);
  assert.match(page, /signUpWithEmail\(submittedEmail\.trim\(\), submittedPassword, operationIsCurrent\)/);
  assert.match(page, /completeEmailVerificationFromUrl\(verificationIsCurrent\)/);
  assert.match(recoveryGate, /completeEmailVerificationFromUrl\(\(\) => active && sessionBoundaryVersionRef\.current === startingBoundaryVersion\)/);
});

test("every full authorisation component and normalized email owns a different page state", () => {
  const base = cloudPageIdentityKey(identity);
  for (const changed of [
    { ...identity, organisationId: "org-b" },
    { ...identity, userId: "user-b" },
    { ...identity, role: "admin" },
    { ...identity, customerSourceId: "customer-a" },
    { ...identity, email: "other@example.com" },
  ]) {
    assert.notEqual(cloudPageIdentityKey(changed), base);
  }
  assert.equal(cloudPageIdentityKey({ ...identity, email: "fresh@example.COM" }), base);
});

test("only a transient refresh with the same normal session can retain settled UI", () => {
  const settled = matchedCloudPageIdentity(identity, accountUser, normalSession);
  const sameSession = normalSession;
  assert.equal(canRetainSettledCloudIdentity(settled, false, sameSession), true);
  assert.equal(canRetainSettledCloudIdentity(settled, true, sameSession), false);
  assert.equal(canRetainSettledCloudIdentity(settled, false, { ...sameSession, user: { id: "user-b" } }), false);
  assert.equal(canRetainSettledCloudIdentity(settled, false, { ...sameSession, is_password_recovery: true }), false);
  assert.equal(canRetainSettledCloudIdentity(settled, false, null), false);
});

test("late cleanup preserves newly entered credentials and stale leases cannot match", () => {
  assert.equal(clearSubmittedValue("submitted-secret", "submitted-secret", 1, 1), "");
  assert.equal(clearSubmittedValue("new-secret", "submitted-secret", 2, 1), "new-secret");
  assert.equal(clearSubmittedValue("same-secret", "same-secret", 2, 1), "same-secret");

  const first = { token: 1, action: "typed-import", ownerKey: "owner-a" };
  assert.equal(activeCloudPageOperationMatches(first, { ...first }), true);
  assert.equal(activeCloudPageOperationMatches({ ...first, token: 2 }, first), false);
  assert.equal(activeCloudPageOperationMatches({ ...first, ownerKey: "owner-b" }, first), false);
});

test("operation coordination rejects overlap and stale async completion after account replacement", async () => {
  const coordinator = createCloudPageOperationCoordinator();
  const first = coordinator.begin("typed-import", "owner-a");
  assert.ok(first);
  assert.equal(coordinator.begin("sign-out"), null);

  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const staleCompletion = pending.then(() => coordinator.isCurrent(first));
  assert.deepEqual(coordinator.invalidate(), first);

  const second = coordinator.begin("legacy-restore", "owner-b");
  assert.ok(second);
  release();
  assert.equal(await staleCompletion, false);
  assert.equal(coordinator.finish(first), false);
  assert.deepEqual(coordinator.current(), second);
  assert.equal(coordinator.finish(second), true);
  assert.equal(coordinator.current(), null);
});

test("authentication epochs reject A-to-B-to-A and null-to-B-to-null session ABA", () => {
  for (const startingSession of [null, normalSession]) {
    const coordinator = createCloudPageOperationCoordinator();
    const operation = coordinator.begin("sign-in");
    assert.ok(operation);
    const startingFingerprint = supabaseSessionFingerprint(startingSession);

    // A cross-tab replacement event invalidates the page lease. Returning the
    // stored session to its starting value cannot make the late response current.
    coordinator.invalidate();
    const returnedSession = startingSession ? { ...startingSession } : null;
    assert.equal(supabaseSessionFingerprint(returnedSession), startingFingerprint);
    assert.equal(sameSupabaseSession(returnedSession, startingSession), true);
    assert.equal(sameSupabaseSessionOwnership(returnedSession, "epoch-2", startingSession, "epoch-0"), false);
    assert.equal(sameSupabaseSessionOwnership(returnedSession, "epoch-0", startingSession, "epoch-0"), true);
    assert.equal(coordinator.isCurrent(operation), false);
  }
  assert.match(cloudSync, /sameSupabaseSessionOwnership\([\s\S]*readSupabaseSessionOwnershipEpoch\(\)[\s\S]*expected\.epoch/);
  assert.match(supabaseClient, /const sessionOwnershipEpochKey = "jr-os-supabase-session-epoch"/);
  assert.match(supabaseClient, /function rotateSessionOwnershipEpoch\(\)[\s\S]*localStorage\.setItem\(sessionOwnershipEpochKey, nextSessionOwnershipEpoch\(\)\)/);
  assert.match(supabaseClient, /saveSupabaseSession[\s\S]*previousFingerprint !== supabaseSessionFingerprint\(session\)\) rotateSessionOwnershipEpoch\(\)/);
});

test("captured global logout revokes A without clearing replacement B", () => {
  const recoveryA = { access_token: "recovery-token-a", is_password_recovery: true, user: { id: "user-a" } };
  const replacementB = { access_token: "normal-token-b", user: { id: "user-b" } };
  const request = capturedSupabaseLogoutRequest({ session: recoveryA, epoch: "epoch-a" }, "global");

  assert.deepEqual(request, {
    path: "/auth/v1/logout?scope=global",
    headers: { Authorization: "Bearer recovery-token-a" },
  });
  assert.equal(
    globalSupabaseSignOutOwnsSession(replacementB, "epoch-b", recoveryA, "epoch-a", "user-a"),
    false,
  );
  assert.throws(
    () => capturedSupabaseLogoutRequest({ session: recoveryA, epoch: "epoch-a" }, "others"),
    /Unsupported Supabase logout scope/,
  );
});

test("global logout clears exact and same-user replacement sessions", () => {
  const recoveryWithoutUser = { access_token: "recovery-token-a", is_password_recovery: true };
  const sameUserReplacement = { access_token: "normal-token-a-2", user: { id: "user-a" } };
  const differentUserReplacement = { access_token: "normal-token-b", user: { id: "user-b" } };
  const tokenFor = (subject) => `header.${Buffer.from(JSON.stringify({ sub: subject })).toString("base64url")}.signature`;
  const sameUserRecoveryWithoutUser = { access_token: tokenFor("user-a"), is_password_recovery: true };
  const differentUserRecoveryWithoutUser = { access_token: tokenFor("user-b"), is_password_recovery: true };

  assert.equal(
    globalSupabaseSignOutOwnsSession(recoveryWithoutUser, "epoch-a", recoveryWithoutUser, "epoch-a"),
    true,
  );
  assert.equal(
    globalSupabaseSignOutOwnsSession(sameUserReplacement, "epoch-a-2", recoveryWithoutUser, "epoch-a", "user-a"),
    true,
  );
  assert.equal(
    globalSupabaseSignOutOwnsSession(differentUserReplacement, "epoch-b", recoveryWithoutUser, "epoch-a", "user-a"),
    false,
  );
  assert.equal(
    globalSupabaseSignOutOwnsSession(sameUserRecoveryWithoutUser, "epoch-a-3", recoveryWithoutUser, "epoch-a", "user-a"),
    true,
  );
  assert.equal(
    globalSupabaseSignOutOwnsSession(differentUserRecoveryWithoutUser, "epoch-b-2", recoveryWithoutUser, "epoch-a", "user-a"),
    false,
  );
  assert.equal(supabaseSessionUserId(sameUserRecoveryWithoutUser), "user-a");
  assert.equal(supabaseSessionUserId({ ...sameUserRecoveryWithoutUser, user: { id: "user-b" } }), "user-a");
  assert.equal(supabaseSessionUserId({ access_token: "not-a-jwt" }), null);
  assert.equal(
    globalSupabaseSignOutOwnsSession({ ...sameUserReplacement, access_token: "recovery-token-a" }, "epoch-returned", recoveryWithoutUser, "epoch-a", "user-a"),
    true,
  );
  assert.equal(capturedSupabaseLogoutRequest({ session: null, epoch: "epoch-a" }, "global"), null);
  assert.match(cloudSync, /signOutCloudUser[\s\S]*activeSessionOwnedByGlobalSignOut\(expectedOwnership, expectedUserId\)[\s\S]*clearActiveCloudReplayOwnership\(\)[\s\S]*revokeCapturedCloudSession\(expectedOwnership, "global"\)[\s\S]*activeSessionOwnedByGlobalSignOut\(expectedOwnership, expectedUserId\)[\s\S]*saveSupabaseSession\(null\)/);
  assert.match(recoveryGate, /const updatedUser = await supabaseFetch\("\/auth\/v1\/user"[\s\S]*signOutCloudUser\(startingOwnership, undefined, updatedUser\?\.id\)/);
});

test("legacy cloud auth uses the same epoch-aware canonical session boundary", () => {
  assert.doesNotMatch(cloudClient, /localStorage\.(?:setItem|removeItem)\([^\n]*jr-os-supabase-session/);
  assert.doesNotMatch(cloudClient, /const SESSION_KEY = "jr-os-supabase-session"/);
  assert.match(cloudClient, /load\(\): CloudSession \| null \{\s*return normalizeSession\(readSupabaseSession\(\)\)/);
  assert.match(cloudClient, /save\(session: CloudSession \| null\) \{\s*saveSupabaseSession\(session \? storedSession\(session\) : null\);\s*identityChanged\(\)/);
  assert.match(cloudClient, /signInWithPassword[\s\S]*startingOwnership = captureSupabaseSessionOwnership\(\)[\s\S]*assertActiveSessionOwnership\(startingOwnership\)[\s\S]*cloudSession\.save\(session\)/);
  assert.match(cloudClient, /signOut[\s\S]*startingOwnership = captureSupabaseSessionOwnership\(\)[\s\S]*activeSessionOwnershipMatches\(startingOwnership\)\) cloudSession\.save\(null\)/);
  assert.match(cloudClient, /refreshSession[\s\S]*startingOwnership = captureSupabaseSessionOwnership\(\)[\s\S]*assertActiveSessionOwnership\(startingOwnership\)[\s\S]*cloudSession\.save\(refreshed\)/);
});

test("owner-tagged state disappears on account change and cancelled guards stop work", () => {
  const owned = { ownerKey: "owner-a", value: { imported: 4 } };
  assert.deepEqual(ownedCloudPageValue(owned, "owner-a", null), { imported: 4 });
  assert.equal(ownedCloudPageValue(owned, "owner-b", null), null);
  assert.equal(ownedCloudPageValue(owned, null, null), null);
  assert.doesNotThrow(() => assertCloudPageOperationCurrent(() => true));
  assert.throws(
    () => assertCloudPageOperationCurrent(() => false),
    /active JR OS account changed before the cloud operation could continue/,
  );
});

test("async account and migration state is bound to an operation lease and owner key", () => {
  assert.match(page, /createCloudPageOperationCoordinator\(\)/);
  assert.match(page, /operationCoordinatorRef\.current\?\.begin\(action, ownerKey\)/);
  assert.match(page, /operationCoordinatorRef\.current\?\.isCurrent\(operation\)/);
  assert.match(page, /ownedOperationIsCurrent\(operationLease\)/);
  assert.match(page, /setImportProgress\(\{ ownerKey: owner\.key, value: progress \}\)/);
  assert.match(page, /actionResults\["typed-import"\]\?\.ownerKey === displayOwnerKey/);
  assert.match(page, /const operationBusy = activeOperation !== null/);
  assert.equal((page.match(/disabled=\{migrationUnavailable\}/g) ?? []).length, 3);
  assert.match(page, /disabled=\{retryUnavailable\}/);
  assert.match(page, /disabled=\{operationBusy\}/);
});

test("session changes and stale account-user requests cannot preserve the previous tenant", () => {
  assert.match(page, /window\.addEventListener\("jr-os-cloud-identity-changed", handleSessionChange\)/);
  assert.match(page, /event\.key === "jr-os-supabase-session"/);
  assert.match(page, /requestVersion === accountUserRequestVersionRef\.current/);
  assert.match(page, /canRetainSettledCloudIdentity\(settledIdentity, identityReady, identitySession\)/);
  assert.match(page, /matchedCloudPageIdentity\(identity, accountUser, identitySession\)/);
  assert.match(page, /const clearAccountInputs = useCallback\(\(\) => \{[\s\S]*setEmail\(""\)[\s\S]*setPassword\(""\)/);
  assert.match(page, /const handleSessionChange = \(\) => \{[\s\S]*clearOwnedState\(\)[\s\S]*refreshAccountUser\(\)/);
  assert.match(page, /operationCoordinatorRef\.current\?\.invalidate\(\)/);
  assert.match(page, /if \(!identityReady\) \{[\s\S]*invalidateActiveOperation\(\)[\s\S]*return/);
});

test("long-running migration paths receive and recheck the ownership guard", () => {
  assert.match(page, /migrateTypedLocalDataToCloud\(onProgress, operationIsCurrent, owner\)/);
  assert.match(page, /migrateLocalDataToCloud\(operationIsCurrent, owner\)/);
  assert.match(page, /restoreCloudDataToLocal\(operationIsCurrent, owner\)/);
  assert.match(cloudSync, /getCloudContext\(operationIsCurrent, expectedContext\)/);
  assert.ok((cloudSync.match(/assertCloudPageOperationCurrent\(operationIsCurrent\)/g) ?? []).length >= 12);
  assert.match(cloudSync, /importLocalCollection\([^)]*operationIsCurrent\)/s);
  assert.ok((repository.match(/assertCloudPageOperationCurrent\(operationIsCurrent\)/g) ?? []).length >= 5);
  assert.match(cloudSync, /expectedContext && !sameAccountStorageContext\(expectedContext,/);
  assert.match(cloudSync, /getCloudContext[\s\S]*const startingOwnership = captureSupabaseSessionOwnership\(\)[\s\S]*getProfile\(user\.id\)[\s\S]*assertActiveSession\(startingOwnership\)/);
  assert.match(identityHook, /const startingOwnership = captureSupabaseSessionOwnership\(\)[\s\S]*sameSupabaseSessionOwnership\([\s\S]*startingOwnership\.epoch[\s\S]*getCurrentCloudUser\(\)[\s\S]*supabaseFetch/);
});

test("sync events and upload markers remain bound to the settled organisation", () => {
  assert.match(page, /if \(!owner \|\| !activeSyncAuthorizationMatches\(owner\)\) return/);
  assert.match(page, /readLastCloudSync\(candidateIdentity\.organisationId\)/);
  assert.match(cloudSync, /organisationStorageKey\(typed \? LAST_TYPED_CLOUD_SYNC_STORAGE_KEY : LAST_CLOUD_SYNC_STORAGE_KEY, organisationId\)/);
  assert.match(cloudSync, /recordSuccessfulCloudUpload\(organisationId, operationIsCurrent\)/);
  assert.doesNotMatch(cloudSync, /localStorage\.setItem\("jr-os-last-(?:typed-)?cloud-sync"/);
  assert.doesNotMatch(page, /localStorage\.getItem\("jr-os-last-cloud-sync"/);
});
