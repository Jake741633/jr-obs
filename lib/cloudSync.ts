"use client";

import { exportJrOsData, JR_OS_STORAGE_PREFIX } from "./appData";
import { getSupabaseBrowserClient } from "./supabase/client";

export interface CloudSyncResult {
  uploaded: number;
  skipped: number;
  errors: string[];
}

async function getCloudContext() {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) throw new Error("Supabase is not configured yet.");
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) throw new Error("Sign in before using cloud storage.");
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("organisation_id")
    .eq("id", authData.user.id)
    .single();
  if (profileError || !profile?.organisation_id) throw new Error("Your JR OS organisation profile is not ready yet.");
  return { supabase, user: authData.user, organisationId: profile.organisation_id as string };
}

export async function getCurrentCloudUser() {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}

export async function signInWithEmail(email: string, password: string) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) throw new Error("Supabase is not configured yet.");
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.user;
}

export async function signUpWithEmail(email: string, password: string) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) throw new Error("Supabase is not configured yet.");
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return data.user;
}

export async function signOutCloudUser() {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function migrateLocalDataToCloud(): Promise<CloudSyncResult> {
  const { supabase, user, organisationId } = await getCloudContext();
  const backup = exportJrOsData();
  const result: CloudSyncResult = { uploaded: 0, skipped: 0, errors: [] };

  for (const [storageKey, payload] of Object.entries(backup.data)) {
    if (!storageKey.startsWith(JR_OS_STORAGE_PREFIX)) {
      result.skipped += 1;
      continue;
    }
    const collection = storageKey.slice(JR_OS_STORAGE_PREFIX.length) || "general";
    const id = `${organisationId}:${storageKey}`;
    const { error } = await supabase.from("app_records").upsert({
      id,
      organisation_id: organisationId,
      collection,
      payload: { storageKey, value: payload },
      created_by: user.id,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    });
    if (error) result.errors.push(`${storageKey}: ${error.message}`);
    else result.uploaded += 1;
  }

  if (result.errors.length === 0) window.localStorage.setItem("jr-os-last-cloud-sync", new Date().toISOString());
  return result;
}

export async function restoreCloudDataToLocal() {
  const { supabase, organisationId } = await getCloudContext();
  const { data, error } = await supabase
    .from("app_records")
    .select("payload")
    .eq("organisation_id", organisationId);
  if (error) throw error;

  let restored = 0;
  for (const record of data ?? []) {
    const payload = record.payload as { storageKey?: string; value?: unknown };
    if (!payload.storageKey?.startsWith(JR_OS_STORAGE_PREFIX)) continue;
    window.localStorage.setItem(payload.storageKey, JSON.stringify(payload.value));
    restored += 1;
  }
  return restored;
}
