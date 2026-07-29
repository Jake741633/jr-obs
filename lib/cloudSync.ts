"use client";

import { exportJrOsData, JR_OS_STORAGE_PREFIX } from "./appData";
import { getSupabaseBrowserClient } from "./supabase/client";

export interface CloudSyncResult {
  uploaded: number;
  skipped: number;
  errors: string[];
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
  const supabase = getSupabaseBrowserClient();
  if (!supabase) throw new Error("Supabase is not configured yet.");

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) throw new Error("Sign in before starting migration.");

  const backup = exportJrOsData();
  const result: CloudSyncResult = { uploaded: 0, skipped: 0, errors: [] };

  for (const [storageKey, payload] of Object.entries(backup.data)) {
    if (!storageKey.startsWith(JR_OS_STORAGE_PREFIX)) {
      result.skipped += 1;
      continue;
    }

    const { error } = await supabase.from("app_records").upsert(
      {
        owner_id: authData.user.id,
        storage_key: storageKey,
        payload,
        source_updated_at: new Date().toISOString(),
      },
      { onConflict: "owner_id,storage_key" },
    );

    if (error) result.errors.push(`${storageKey}: ${error.message}`);
    else result.uploaded += 1;
  }

  if (result.errors.length === 0) {
    window.localStorage.setItem("jr-os-last-cloud-sync", new Date().toISOString());
  }

  return result;
}

export async function restoreCloudDataToLocal() {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) throw new Error("Supabase is not configured yet.");

  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) throw new Error("Sign in before restoring cloud data.");

  const { data, error } = await supabase
    .from("app_records")
    .select("storage_key,payload")
    .eq("owner_id", authData.user.id);

  if (error) throw error;
  for (const record of data ?? []) {
    window.localStorage.setItem(record.storage_key, JSON.stringify(record.payload));
  }
  return data?.length ?? 0;
}
