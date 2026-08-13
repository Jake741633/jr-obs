"use client";

import { exportLegacyJrOsData, JR_OS_STORAGE_PREFIX } from "./appData";
import { accountStorageKey, organisationStorageKey } from "./cloud/adapter";
import { collectionCloudTarget } from "./cloud/collections";
import {
  backupStorageScope,
  claimLegacyMigrationStorage,
  isLegacyAggregateStorageKey,
  migrateClaimedLegacyStorageValues,
  sameAccountStorageContext,
  typedLegacyMigrationStorageKeys,
} from "./cloud/migrationStoragePolicy-core.mjs";
import { assertCloudPageOperationCurrent } from "./cloud/cloudPageIdentity-core.mjs";
import { importLocalCollection } from "./cloud/repository";
import {
  captureSupabaseSessionOwnership,
  readSupabaseSession,
  readSupabaseSessionOwnershipEpoch,
  saveSupabaseSession,
  supabaseFetch,
  type SupabaseSession,
  type SupabaseSessionOwnership,
} from "./supabase/client";
import {
  capturedSupabaseLogoutRequest,
  globalSupabaseSignOutOwnsSession,
  sameSupabaseSessionOwnership,
} from "./supabase/sessionOwnership-core.mjs";

export interface CloudSyncResult { uploaded: number; skipped: number; errors: string[]; }
export interface EmailVerificationResult {
  user: { id: string; email?: string } | null;
  requiresPasswordSignIn: boolean;
}
export interface TypedMigrationProgress {
  currentCollection: string;
  completedCollections: number;
  totalCollections: number;
  imported: number;
  skipped: number;
  failed: number;
  latestError?: string;
}
export type TypedMigrationProgressHandler = (progress: TypedMigrationProgress) => void;
export type CloudOperationOwnershipGuard = () => boolean;
export interface CloudOperationExpectedContext {
  organisationId: string;
  userId: string;
  role: string;
  customerSourceId?: string;
}

const cloudMigrationRoles = ["owner", "admin", "office"] as const;
export const LAST_CLOUD_SYNC_STORAGE_KEY = "jr-os-last-cloud-sync";
export const LAST_TYPED_CLOUD_SYNC_STORAGE_KEY = "jr-os-last-typed-cloud-sync";

export function canManageCloudMigration(role: string | undefined) {
  return Boolean(role && cloudMigrationRoles.some((allowedRole) => allowedRole === role));
}

function assertCloudMigrationRole(role: string | undefined) {
  if (!canManageCloudMigration(role)) {
    throw new Error("Only owner, admin or office users can access organisation migration backups.");
  }
}

function identityChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event("jr-os-cloud-identity-changed"));
}

const accountChangedMessage = "The active JR OS account changed before the authentication request completed.";

function activeSessionMatches(expected: SupabaseSessionOwnership) {
  return sameSupabaseSessionOwnership(
    readSupabaseSession(),
    readSupabaseSessionOwnershipEpoch(),
    expected.session,
    expected.epoch,
  );
}

function assertActiveSession(expected: SupabaseSessionOwnership) {
  if (!activeSessionMatches(expected)) throw new Error(accountChangedMessage);
}

async function revokeCapturedCloudSession(expectedOwnership: SupabaseSessionOwnership, scope: "global" | "local") {
  const request = capturedSupabaseLogoutRequest(expectedOwnership, scope);
  if (!request) return false;
  await supabaseFetch(request.path, {
    method: "POST",
    headers: request.headers,
  }, false);
  return true;
}

function activeSessionOwnedByGlobalSignOut(expectedOwnership: SupabaseSessionOwnership, expectedUserId?: string) {
  const currentOwnership = captureSupabaseSessionOwnership();
  return globalSupabaseSignOutOwnsSession(
    currentOwnership.session,
    currentOwnership.epoch,
    expectedOwnership.session,
    expectedOwnership.epoch,
    expectedUserId,
  );
}

function clearActiveCloudReplayOwnership() {
  if (typeof window === "undefined") return;
  ["jr-os-active-organisation", "jr-os-active-user", "jr-os-active-role", "jr-os-active-customer-source"]
    .forEach((key) => window.localStorage.removeItem(key));
}

async function signOutTemporaryCloudSession(expectedOwnership: SupabaseSessionOwnership) {
  let cleared = false;
  try { await revokeCapturedCloudSession(expectedOwnership, "local"); }
  catch { /* a local verification session must still be removed */ }
  finally {
    if (activeSessionMatches(expectedOwnership)) {
      saveSupabaseSession(null);
      identityChanged();
      cleared = true;
    }
  }
  return cleared;
}

function clearAuthParamsFromUrl() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.delete("code");
  url.searchParams.delete("error");
  url.searchParams.delete("error_code");
  url.searchParams.delete("error_description");
  url.searchParams.delete("type");
  url.hash = "";
  window.history.replaceState({}, document.title, `${url.pathname}${url.search}`);
}

function normaliseAuthEmail(email: string) {
  return email.trim().toLowerCase();
}

/**
 * Account changes must never delete browser-resident business records. Authenticated
 * collections are isolated by organisation-scoped keys and reload after identity
 * changes. This helper is retained for compatibility and intentionally preserves
 * legacy, scoped, queued and versioned data.
 */
export function clearLocalJrOsAccountData() {
  return 0;
}

export function cloudSyncTimestampStorageKey(organisationId: string, typed = false) {
  return organisationStorageKey(typed ? LAST_TYPED_CLOUD_SYNC_STORAGE_KEY : LAST_CLOUD_SYNC_STORAGE_KEY, organisationId);
}

export function readLastCloudSync(organisationId: string) {
  if (typeof window === "undefined") return null;
  migrateClaimedLegacyStorageValues(window.localStorage, organisationId, [
    { legacyKey: LAST_CLOUD_SYNC_STORAGE_KEY, scopedKey: cloudSyncTimestampStorageKey(organisationId) },
    { legacyKey: LAST_TYPED_CLOUD_SYNC_STORAGE_KEY, scopedKey: cloudSyncTimestampStorageKey(organisationId, true) },
  ]);
  return window.localStorage.getItem(cloudSyncTimestampStorageKey(organisationId));
}

function recordSuccessfulCloudUpload(organisationId: string, operationIsCurrent?: CloudOperationOwnershipGuard) {
  assertCloudPageOperationCurrent(operationIsCurrent);
  const completedAt = new Date().toISOString();
  window.localStorage.setItem(cloudSyncTimestampStorageKey(organisationId), completedAt);
  window.localStorage.setItem(cloudSyncTimestampStorageKey(organisationId, true), completedAt);
  window.localStorage.removeItem(LAST_CLOUD_SYNC_STORAGE_KEY);
  window.localStorage.removeItem(LAST_TYPED_CLOUD_SYNC_STORAGE_KEY);
}

async function getProfile(userId: string) {
  const rows = await supabaseFetch(`/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&active=eq.true&select=organisation_id,role,customer_source_id,active`);
  const profile = Array.isArray(rows) ? rows[0] : null;
  if (!profile?.active || !profile?.organisation_id || !profile?.role) throw new Error("Your JR OS organisation profile is not active or ready yet.");
  if (profile.role === "customer" && !profile.customer_source_id) throw new Error("Your JR OS customer portal access is not active or ready yet.");
  return profile as { organisation_id: string; role: string; customer_source_id: string | null; active: true };
}

export async function getCurrentCloudUser() {
  const startingOwnership = captureSupabaseSessionOwnership();
  const startingSession = startingOwnership.session;
  if (!startingSession?.access_token || startingSession.is_password_recovery) return null;
  try {
    const user = await supabaseFetch("/auth/v1/user", { method: "GET" }) as { id: string; email?: string };
    if (!activeSessionMatches(startingOwnership)) return null;
    if (!startingSession.user?.id && user?.id) {
      const activeSession = readSupabaseSession();
      if (!activeSession || !activeSessionMatches(startingOwnership)) return null;
      saveSupabaseSession({ ...activeSession, user: { id: user.id, email: user.email } });
    }
    return user;
  } catch {
    if (activeSessionMatches(startingOwnership)) {
      saveSupabaseSession(null);
      identityChanged();
    }
    return null;
  }
}

export async function completeEmailVerificationFromUrl(operationIsCurrent?: CloudOperationOwnershipGuard) {
  if (typeof window === "undefined") return null;
  const startingOwnership = captureSupabaseSessionOwnership();
  const url = new URL(window.location.href);
  const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
  const accessToken = hash.get("access_token");
  const refreshToken = hash.get("refresh_token");
  const expiresIn = Number(hash.get("expires_in") || 0);
  const tokenType = hash.get("token_type") || "bearer";
  const authType = hash.get("type") || url.searchParams.get("type");
  const code = url.searchParams.get("code");
  const errorDescription = url.searchParams.get("error_description") || url.searchParams.get("error");

  if (errorDescription) {
    clearAuthParamsFromUrl();
    throw new Error(errorDescription);
  }

  if (!accessToken && !code) return null;

  let session: SupabaseSession;
  if (accessToken && refreshToken) {
    const expiresAt = expiresIn ? Math.floor(Date.now() / 1000) + expiresIn : undefined;
    session = {
      access_token: accessToken,
      refresh_token: refreshToken,
      token_type: tokenType,
      expires_in: expiresIn || undefined,
      expires_at: expiresAt,
    } as SupabaseSession;
  } else {
    session = await supabaseFetch("/auth/v1/token?grant_type=pkce", {
      method: "POST",
      body: JSON.stringify({ auth_code: code }),
    }, false) as SupabaseSession;
  }

  const storedSession: SupabaseSession = authType === "recovery"
    ? { ...session, is_password_recovery: true }
    : { ...session, is_password_recovery: undefined };
  assertCloudPageOperationCurrent(operationIsCurrent);
  if (!activeSessionMatches(startingOwnership)) {
    clearAuthParamsFromUrl();
    throw new Error(accountChangedMessage);
  }
  saveSupabaseSession(storedSession);
  const storedOwnership = captureSupabaseSessionOwnership();
  identityChanged();
  clearAuthParamsFromUrl();
  if (authType === "recovery") {
    return { user: null, requiresPasswordSignIn: false } satisfies EmailVerificationResult;
  }

  // Email verification and one-time-link sessions prove control of a link, but
  // JR OS business access requires a normal password or other business-capable
  // authentication method. Revoke the temporary session and ask for sign-in.
  if (authType) {
    const cleared = await signOutTemporaryCloudSession(storedOwnership);
    if (!cleared) throw new Error(accountChangedMessage);
    return { user: null, requiresPasswordSignIn: true } satisfies EmailVerificationResult;
  }

  const user = storedSession.user ?? await getCurrentCloudUser();
  if (user && !storedSession.user) {
    assertActiveSession(storedOwnership);
    const activeSession = readSupabaseSession();
    if (!activeSession) throw new Error(accountChangedMessage);
    saveSupabaseSession({ ...activeSession, user });
    identityChanged();
  } else if (!activeSessionMatches(storedOwnership)) {
    throw new Error(accountChangedMessage);
  }
  return { user, requiresPasswordSignIn: false } satisfies EmailVerificationResult;
}

export async function signInWithEmail(email: string, password: string, operationIsCurrent?: CloudOperationOwnershipGuard) {
  const startingOwnership = captureSupabaseSessionOwnership();
  const session = await supabaseFetch("/auth/v1/token?grant_type=password", { method: "POST", body: JSON.stringify({ email: normaliseAuthEmail(email), password }) }, false) as SupabaseSession;
  assertCloudPageOperationCurrent(operationIsCurrent);
  assertActiveSession(startingOwnership);
  saveSupabaseSession(session);
  identityChanged();
  return session.user ?? null;
}

export async function signUpWithEmail(email: string, password: string, operationIsCurrent?: CloudOperationOwnershipGuard) {
  const startingOwnership = captureSupabaseSessionOwnership();
  const normalisedEmail = normaliseAuthEmail(email);
  const emailName = normalisedEmail.split("@")[0]?.trim() || "JR OS Owner";
  const result = await supabaseFetch("/auth/v1/signup", {
    method: "POST",
    body: JSON.stringify({
      email: normalisedEmail,
      password,
      data: { full_name: emailName, business_name: "New JR OS Business" },
    }),
  }, false) as SupabaseSession;
  assertCloudPageOperationCurrent(operationIsCurrent);
  assertActiveSession(startingOwnership);
  if (result.access_token) {
    saveSupabaseSession(result);
    identityChanged();
  }
  return result.user ?? null;
}

export async function signOutCloudUser(
  expectedOwnership = captureSupabaseSessionOwnership(),
  operationIsCurrent?: CloudOperationOwnershipGuard,
  expectedUserId?: string,
) {
  if (activeSessionOwnedByGlobalSignOut(expectedOwnership, expectedUserId)) {
    const exactStartingOwnership = activeSessionMatches(expectedOwnership);
    if (exactStartingOwnership) assertCloudPageOperationCurrent(operationIsCurrent);
    clearActiveCloudReplayOwnership();
  }
  try { await revokeCapturedCloudSession(expectedOwnership, "global"); }
  finally {
    if (activeSessionOwnedByGlobalSignOut(expectedOwnership, expectedUserId)) {
      clearActiveCloudReplayOwnership();
      saveSupabaseSession(null);
      identityChanged();
    }
  }
}

export async function getCloudContext(operationIsCurrent?: CloudOperationOwnershipGuard, expectedContext?: CloudOperationExpectedContext) {
  const startingOwnership = captureSupabaseSessionOwnership();
  assertCloudPageOperationCurrent(operationIsCurrent);
  const user = await getCurrentCloudUser();
  assertCloudPageOperationCurrent(operationIsCurrent);
  if (!user) throw new Error("Sign in before using cloud storage.");
  const profile = await getProfile(user.id);
  assertCloudPageOperationCurrent(operationIsCurrent);
  assertActiveSession(startingOwnership);
  const context = {
    user,
    organisationId: profile.organisation_id,
    role: profile.role,
    customerSourceId: profile.customer_source_id || undefined,
  };
  if (expectedContext && !sameAccountStorageContext(expectedContext, {
    organisationId: context.organisationId,
    userId: context.user.id,
    role: context.role,
    customerSourceId: context.customerSourceId,
  })) {
    throw new Error("The active JR OS account changed before the cloud operation could continue.");
  }
  return context;
}

export function legacyMigrationRecordId(organisationId: string, storageKey: string) {
  return JSON.stringify([organisationId, storageKey]);
}

export async function migrateLocalDataToCloud(operationIsCurrent?: CloudOperationOwnershipGuard, expectedContext?: CloudOperationExpectedContext): Promise<CloudSyncResult> {
  const { user, organisationId, role } = await getCloudContext(operationIsCurrent, expectedContext);
  assertCloudMigrationRole(role);
  assertCloudPageOperationCurrent(operationIsCurrent);
  const backup = exportLegacyJrOsData(organisationId);
  const result: CloudSyncResult = { uploaded: 0, skipped: 0, errors: [] };
  for (const [storageKey, value] of Object.entries(backup.data)) {
    assertCloudPageOperationCurrent(operationIsCurrent);
    if (!storageKey.startsWith(JR_OS_STORAGE_PREFIX)) { result.skipped += 1; continue; }
    const collection = storageKey.slice(JR_OS_STORAGE_PREFIX.length) || "general";
    const record = { id: legacyMigrationRecordId(organisationId, storageKey), organisation_id: organisationId, collection, payload: { storageKey, value }, created_by: user.id, updated_by: user.id, updated_at: new Date().toISOString() };
    try {
      assertCloudPageOperationCurrent(operationIsCurrent);
      await supabaseFetch("/rest/v1/app_records?on_conflict=id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(record) });
      assertCloudPageOperationCurrent(operationIsCurrent);
      result.uploaded += 1;
    } catch (error) {
      if (operationIsCurrent && !operationIsCurrent()) throw error;
      result.errors.push(`${storageKey}: ${error instanceof Error ? error.message : "Upload failed"}`);
    }
  }
  if (result.errors.length === 0) recordSuccessfulCloudUpload(organisationId, operationIsCurrent);
  return result;
}

export async function migrateTypedLocalDataToCloud(onProgress?: TypedMigrationProgressHandler, operationIsCurrent?: CloudOperationOwnershipGuard, expectedContext?: CloudOperationExpectedContext): Promise<CloudSyncResult> {
  const { user, organisationId, role } = await getCloudContext(operationIsCurrent, expectedContext);
  assertCloudMigrationRole(role);
  assertCloudPageOperationCurrent(operationIsCurrent);
  const result: CloudSyncResult = { uploaded: 0, skipped: 0, errors: [] };
  const storageKeys = typedLegacyMigrationStorageKeys(window.localStorage);
  if (storageKeys.length) claimLegacyMigrationStorage(window.localStorage, organisationId);

  const report = (currentCollection: string, completedCollections: number, latestError?: string) => onProgress?.({
    currentCollection,
    completedCollections,
    totalCollections: storageKeys.length,
    imported: result.uploaded,
    skipped: result.skipped,
    failed: result.errors.length,
    latestError,
  });

  for (const [index, storageKey] of storageKeys.entries()) {
    assertCloudPageOperationCurrent(operationIsCurrent);
    report(storageKey, index);
    const target = collectionCloudTarget(storageKey);
    if (!target) {
      result.skipped += 1;
      report(storageKey, index + 1);
      continue;
    }
    try {
      assertCloudPageOperationCurrent(operationIsCurrent);
      const parsed = JSON.parse(window.localStorage.getItem(storageKey) || "[]") as unknown;
      if (!Array.isArray(parsed) || parsed.some((record) => !record || typeof record !== "object" || typeof (record as { id?: unknown }).id !== "string")) {
        result.skipped += 1;
        report(storageKey, index + 1);
        continue;
      }
      const migrated = await importLocalCollection(storageKey, target.table, organisationId, target.collectionKey, user.id, operationIsCurrent);
      assertCloudPageOperationCurrent(operationIsCurrent);
      result.uploaded += migrated.imported;
      result.skipped += migrated.skipped;
      report(storageKey, index + 1);
    } catch (error) {
      if (operationIsCurrent && !operationIsCurrent()) throw error;
      const detail = `${storageKey}: ${error instanceof Error ? error.message : "Migration failed"}`;
      result.errors.push(detail);
      report(storageKey, index + 1, detail);
    }
  }
  if (!result.errors.length) recordSuccessfulCloudUpload(organisationId, operationIsCurrent);
  assertCloudPageOperationCurrent(operationIsCurrent);
  report("Complete", storageKeys.length, result.errors.at(-1));
  return result;
}

export async function restoreCloudDataToLocal(operationIsCurrent?: CloudOperationOwnershipGuard, expectedContext?: CloudOperationExpectedContext) {
  const { user, organisationId, role, customerSourceId } = await getCloudContext(operationIsCurrent, expectedContext);
  const startingContext = { organisationId, userId: user.id, role, customerSourceId };
  assertCloudMigrationRole(role);
  assertCloudPageOperationCurrent(operationIsCurrent);
  const rows = await supabaseFetch(`/rest/v1/app_records?organisation_id=eq.${encodeURIComponent(organisationId)}&select=payload`);
  assertCloudPageOperationCurrent(operationIsCurrent);
  const current = await getCloudContext(operationIsCurrent, expectedContext);
  if (!sameAccountStorageContext(startingContext, {
    organisationId: current.organisationId,
    userId: current.user.id,
    role: current.role,
    customerSourceId: current.customerSourceId,
  })) {
    throw new Error("The active JR OS account changed before cloud data could be restored.");
  }
  let restored = 0;
  for (const record of Array.isArray(rows) ? rows : []) {
    assertCloudPageOperationCurrent(operationIsCurrent);
    const payload = record.payload as { storageKey?: string; value?: unknown };
    if (!payload.storageKey || !isLegacyAggregateStorageKey(payload.storageKey)) continue;
    const scope = backupStorageScope(payload.storageKey);
    if (!scope) continue;
    const scopedKey = scope === "account"
      ? accountStorageKey(payload.storageKey, organisationId, user.id, role, customerSourceId)
      : organisationStorageKey(payload.storageKey, organisationId);
    window.localStorage.setItem(scopedKey, JSON.stringify(payload.value));
    restored += 1;
  }
  return restored;
}
