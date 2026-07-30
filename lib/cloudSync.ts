"use client";

import { exportJrOsData, JR_OS_STORAGE_PREFIX } from "./appData";
import { collectionCloudTarget } from "./cloud/collections";
import { importLocalCollection } from "./cloud/repository";
import { readSupabaseSession, saveSupabaseSession, supabaseFetch, type SupabaseSession } from "./supabase/client";

export interface CloudSyncResult { uploaded: number; skipped: number; errors: string[]; }

const cloudInternalKeys = [
  "jr-os-cloud-session",
  "jr-os-supabase-session",
  "jr-os-cloud-sync-queue",
  "jr-os-cloud-sync-status",
  "jr-os-last-cloud-sync",
  "jr-os-last-typed-cloud-sync",
];

function identityChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event("jr-os-cloud-identity-changed"));
}

async function getProfile(userId: string) {
  const rows = await supabaseFetch(`/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=organisation_id,role,customer_source_id`);
  const profile = Array.isArray(rows) ? rows[0] : null;
  if (!profile?.organisation_id) throw new Error("Your JR OS organisation profile is not ready yet.");
  return profile as { organisation_id: string; role: string; customer_source_id?: string };
}

export async function getCurrentCloudUser() {
  const session = readSupabaseSession();
  if (!session?.access_token) return null;
  try { return await supabaseFetch("/auth/v1/user", { method: "GET" }) as { id: string; email?: string }; }
  catch { saveSupabaseSession(null); identityChanged(); return null; }
}

export async function signInWithEmail(email: string, password: string) {
  const session = await supabaseFetch("/auth/v1/token?grant_type=password", { method: "POST", body: JSON.stringify({ email, password }) }, false) as SupabaseSession;
  saveSupabaseSession(session); identityChanged(); return session.user ?? null;
}

export async function signUpWithEmail(email: string, password: string) {
  const result = await supabaseFetch("/auth/v1/signup", { method: "POST", body: JSON.stringify({ email, password, data: { full_name: "Jake Rinaldi", business_name: "JR Electrical Services" } }) }, false) as SupabaseSession;
  if (result.access_token) { saveSupabaseSession(result); identityChanged(); }
  return result.user ?? null;
}

export async function signOutCloudUser() {
  try { await supabaseFetch("/auth/v1/logout", { method: "POST" }); }
  finally { saveSupabaseSession(null); identityChanged(); }
}

export async function getCloudContext() {
  const user = await getCurrentCloudUser();
  if (!user) throw new Error("Sign in before using cloud storage.");
  const profile = await getProfile(user.id);
  return { user, organisationId: profile.organisation_id, role: profile.role, customerSourceId: profile.customer_source_id };
}

export async function migrateLocalDataToCloud(): Promise<CloudSyncResult> {
  const { user, organisationId } = await getCloudContext();
  const backup = exportJrOsData();
  const result: CloudSyncResult = { uploaded: 0, skipped: 0, errors: [] };
  for (const [storageKey, value] of Object.entries(backup.data)) {
    if (!storageKey.startsWith(JR_OS_STORAGE_PREFIX)) { result.skipped += 1; continue; }
    const collection = storageKey.slice(JR_OS_STORAGE_PREFIX.length) || "general";
    const record = { id: `${organisationId}:${storageKey}`, organisation_id: organisationId, collection, payload: { storageKey, value }, created_by: user.id, updated_by: user.id, updated_at: new Date().toISOString() };
    try {
      await supabaseFetch("/rest/v1/app_records?on_conflict=id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(record) });
      result.uploaded += 1;
    } catch (error) { result.errors.push(`${storageKey}: ${error instanceof Error ? error.message : "Upload failed"}`); }
  }
  if (result.errors.length === 0) window.localStorage.setItem("jr-os-last-cloud-sync", new Date().toISOString());
  return result;
}

export async function migrateTypedLocalDataToCloud(): Promise<CloudSyncResult> {
  const { user, organisationId, role } = await getCloudContext();
  if (!["owner", "admin", "office"].includes(role)) throw new Error("Only owner, admin or office users can run the collection migration.");
  const result: CloudSyncResult = { uploaded: 0, skipped: 0, errors: [] };
  const storageKeys = Array.from({ length: window.localStorage.length }, (_, index) => window.localStorage.key(index))
    .filter((key): key is string => Boolean(key?.startsWith(JR_OS_STORAGE_PREFIX)))
    .filter((key) => !cloudInternalKeys.includes(key) && !key.startsWith("jr-os-cloud-versions:"));

  for (const storageKey of storageKeys) {
    const target = collectionCloudTarget(storageKey);
    if (!target) { result.skipped += 1; continue; }
    try {
      const parsed = JSON.parse(window.localStorage.getItem(storageKey) || "[]") as unknown;
      if (!Array.isArray(parsed) || parsed.some((record) => !record || typeof record !== "object" || typeof (record as { id?: unknown }).id !== "string")) {
        result.skipped += 1;
        continue;
      }
      const migrated = await importLocalCollection(storageKey, target.table, organisationId, target.collectionKey, user.id);
      result.uploaded += migrated.imported;
      result.skipped += migrated.skipped;
    } catch (error) { result.errors.push(`${storageKey}: ${error instanceof Error ? error.message : "Migration failed"}`); }
  }
  if (!result.errors.length) window.localStorage.setItem("jr-os-last-typed-cloud-sync", new Date().toISOString());
  return result;
}

export async function restoreCloudDataToLocal() {
  const { organisationId } = await getCloudContext();
  const rows = await supabaseFetch(`/rest/v1/app_records?organisation_id=eq.${organisationId}&select=payload`);
  let restored = 0;
  for (const record of Array.isArray(rows) ? rows : []) {
    const payload = record.payload as { storageKey?: string; value?: unknown };
    if (!payload.storageKey?.startsWith(JR_OS_STORAGE_PREFIX)) continue;
    window.localStorage.setItem(payload.storageKey, JSON.stringify(payload.value)); restored += 1;
  }
  return restored;
}
