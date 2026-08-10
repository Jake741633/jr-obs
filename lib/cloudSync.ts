"use client";

import { exportLegacyJrOsData, JR_OS_STORAGE_PREFIX } from "./appData";
import { accountStorageKey, organisationStorageKey } from "./cloud/adapter";
import { collectionCloudTarget } from "./cloud/collections";
import {
  backupStorageScope,
  claimLegacyMigrationStorage,
  isLegacyAggregateStorageKey,
  sameAccountStorageContext,
  typedLegacyMigrationStorageKeys,
} from "./cloud/migrationStoragePolicy-core.mjs";
import { importLocalCollection } from "./cloud/repository";
import { readSupabaseSession, saveSupabaseSession, supabaseFetch, type SupabaseSession } from "./supabase/client";

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

const cloudMigrationRoles = ["owner", "admin", "office"] as const;

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

async function signOutTemporaryCloudSession() {
  try { await supabaseFetch("/auth/v1/logout?scope=local", { method: "POST" }); }
  finally {
    saveSupabaseSession(null);
    identityChanged();
  }
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

function typedMigrationPriority(storageKey: string) {
  if (storageKey === "jr-os-customers") return 0;
  if (storageKey === "jr-os-jobs") return 1;
  return 2;
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

function recordSuccessfulCloudUpload() {
  const completedAt = new Date().toISOString();
  window.localStorage.setItem("jr-os-last-cloud-sync", completedAt);
  window.localStorage.setItem("jr-os-last-typed-cloud-sync", completedAt);
}

async function getProfile(userId: string) {
  const rows = await supabaseFetch(`/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&active=eq.true&select=organisation_id,role,customer_source_id,active`);
  const profile = Array.isArray(rows) ? rows[0] : null;
  if (!profile?.active || !profile?.organisation_id) throw new Error("Your JR OS organisation profile is not active or ready yet.");
  return profile as { organisation_id: string; role: string; customer_source_id: string | null; active: true };
}

export async function getCurrentCloudUser() {
  const session = readSupabaseSession();
  if (!session?.access_token || session.is_password_recovery) return null;
  try { return await supabaseFetch("/auth/v1/user", { method: "GET" }) as { id: string; email?: string }; }
  catch { saveSupabaseSession(null); identityChanged(); return null; }
}

export async function completeEmailVerificationFromUrl() {
  if (typeof window === "undefined") return null;
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
  saveSupabaseSession(storedSession);
  identityChanged();
  clearAuthParamsFromUrl();
  if (authType === "recovery") {
    return { user: null, requiresPasswordSignIn: false } satisfies EmailVerificationResult;
  }

  // Email verification and one-time-link sessions prove control of a link, but
  // JR OS business access requires a normal password or other business-capable
  // authentication method. Revoke the temporary session and ask for sign-in.
  if (authType) {
    try { await signOutTemporaryCloudSession(); } catch { /* local session is cleared in finally */ }
    return { user: null, requiresPasswordSignIn: true } satisfies EmailVerificationResult;
  }

  const user = storedSession.user ?? await getCurrentCloudUser();
  if (user && !storedSession.user) {
    saveSupabaseSession({ ...storedSession, user });
    identityChanged();
  }
  return { user, requiresPasswordSignIn: false } satisfies EmailVerificationResult;
}

export async function signInWithEmail(email: string, password: string) {
  const session = await supabaseFetch("/auth/v1/token?grant_type=password", { method: "POST", body: JSON.stringify({ email: normaliseAuthEmail(email), password }) }, false) as SupabaseSession;
  saveSupabaseSession(session);
  identityChanged();
  return session.user ?? null;
}

export async function signUpWithEmail(email: string, password: string) {
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
  if (result.access_token) {
    saveSupabaseSession(result);
    identityChanged();
  }
  return result.user ?? null;
}

export async function signOutCloudUser() {
  if (typeof window !== "undefined") {
    ["jr-os-active-organisation", "jr-os-active-user", "jr-os-active-role", "jr-os-active-customer-source"]
      .forEach((key) => window.localStorage.removeItem(key));
  }
  try { await supabaseFetch("/auth/v1/logout?scope=global", { method: "POST" }); }
  finally {
    saveSupabaseSession(null);
    identityChanged();
  }
}

export async function getCloudContext() {
  const user = await getCurrentCloudUser();
  if (!user) throw new Error("Sign in before using cloud storage.");
  const profile = await getProfile(user.id);
  return {
    user,
    organisationId: profile.organisation_id,
    role: profile.role,
    customerSourceId: profile.customer_source_id || undefined,
  };
}

export function legacyMigrationRecordId(organisationId: string, storageKey: string) {
  return JSON.stringify([organisationId, storageKey]);
}

export async function migrateLocalDataToCloud(): Promise<CloudSyncResult> {
  const { user, organisationId, role } = await getCloudContext();
  assertCloudMigrationRole(role);
  const backup = exportLegacyJrOsData(organisationId);
  const result: CloudSyncResult = { uploaded: 0, skipped: 0, errors: [] };
  for (const [storageKey, value] of Object.entries(backup.data)) {
    if (!storageKey.startsWith(JR_OS_STORAGE_PREFIX)) { result.skipped += 1; continue; }
    const collection = storageKey.slice(JR_OS_STORAGE_PREFIX.length) || "general";
    const record = { id: legacyMigrationRecordId(organisationId, storageKey), organisation_id: organisationId, collection, payload: { storageKey, value }, created_by: user.id, updated_by: user.id, updated_at: new Date().toISOString() };
    try {
      await supabaseFetch("/rest/v1/app_records?on_conflict=id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(record) });
      result.uploaded += 1;
    } catch (error) { result.errors.push(`${storageKey}: ${error instanceof Error ? error.message : "Upload failed"}`); }
  }
  if (result.errors.length === 0) recordSuccessfulCloudUpload();
  return result;
}

export async function migrateTypedLocalDataToCloud(onProgress?: TypedMigrationProgressHandler): Promise<CloudSyncResult> {
  const { user, organisationId, role } = await getCloudContext();
  assertCloudMigrationRole(role);
  const result: CloudSyncResult = { uploaded: 0, skipped: 0, errors: [] };
  const storageKeys = typedLegacyMigrationStorageKeys(window.localStorage)
    .sort((left, right) => typedMigrationPriority(left) - typedMigrationPriority(right));
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
    report(storageKey, index);
    const target = collectionCloudTarget(storageKey);
    if (!target) {
      result.skipped += 1;
      report(storageKey, index + 1);
      continue;
    }
    try {
      const parsed = JSON.parse(window.localStorage.getItem(storageKey) || "[]") as unknown;
      if (!Array.isArray(parsed) || parsed.some((record) => !record || typeof record !== "object" || typeof (record as { id?: unknown }).id !== "string")) {
        result.skipped += 1;
        report(storageKey, index + 1);
        continue;
      }
      const migrated = await importLocalCollection(storageKey, target.table, organisationId, target.collectionKey, user.id);
      result.uploaded += migrated.imported;
      result.skipped += migrated.skipped;
      report(storageKey, index + 1);
    } catch (error) {
      const detail = `${storageKey}: ${error instanceof Error ? error.message : "Migration failed"}`;
      result.errors.push(detail);
      report(storageKey, index + 1, detail);
    }
  }
  if (!result.errors.length) recordSuccessfulCloudUpload();
  report("Complete", storageKeys.length, result.errors.at(-1));
  return result;
}

export async function restoreCloudDataToLocal() {
  const { user, organisationId, role, customerSourceId } = await getCloudContext();
  const startingContext = { organisationId, userId: user.id, role, customerSourceId };
  assertCloudMigrationRole(role);
  const rows = await supabaseFetch(`/rest/v1/app_records?organisation_id=eq.${encodeURIComponent(organisationId)}&select=payload`);
  const current = await getCloudContext();
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
