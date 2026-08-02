"use client";

import { cloudConfig, cloudStorageBucket } from "./config";

export interface CloudSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  user: { id: string; email?: string };
}

type StoredSupabaseSession = { access_token?: string; refresh_token?: string; expires_in?: number; expires_at?: number; user?: { id: string; email?: string } };
type SignedStorageResponse = { signedURL?: string; signedUrl?: string; url?: string; token?: string };
const SESSION_KEY = "jr-os-supabase-session";

function requestHeaders(session?: CloudSession, extra?: HeadersInit) {
  const result = new Headers();
  result.set("apikey", cloudConfig.anonKey);
  result.set("Authorization", `Bearer ${session?.accessToken || cloudConfig.anonKey}`);
  result.set("Content-Type", "application/json");
  if (extra) new Headers(extra).forEach((value, key) => result.set(key, value));
  return result;
}

async function request<T>(path: string, init: RequestInit = {}, session?: CloudSession): Promise<T> {
  if (!cloudConfig.isConfigured) throw new Error("Supabase is not configured.");
  const response = await fetch(`${cloudConfig.url}${path}`, { ...init, headers: requestHeaders(session, init.headers) });
  if (!response.ok) throw new Error((await response.text()) || `Supabase request failed (${response.status}).`);
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

function normalizeSession(value: StoredSupabaseSession | null): CloudSession | null {
  if (!value?.access_token || !value.user) return null;
  return {
    accessToken: value.access_token,
    refreshToken: value.refresh_token || "",
    expiresAt: value.expires_at ? value.expires_at * 1000 : Date.now() + (value.expires_in || 3600) * 1000,
    user: value.user,
  };
}

function encodedObjectPath(path: string) {
  return path.split("/").map((segment) => encodeURIComponent(segment)).join("/");
}

function normalizeSignedStorageResponse(value: SignedStorageResponse) {
  const signedURL = value.signedURL || value.signedUrl || value.url;
  if (!signedURL) throw new Error("Supabase did not return a signed Storage URL.");
  return { signedURL, token: value.token || "" };
}

export const cloudSession = {
  load(): CloudSession | null {
    if (typeof window === "undefined") return null;
    try {
      const session = normalizeSession(JSON.parse(window.localStorage.getItem(SESSION_KEY) || "null") as StoredSupabaseSession | null);
      if (!session) return null;
      if (session.expiresAt <= Date.now()) {
        window.localStorage.removeItem(SESSION_KEY);
        return null;
      }
      return session;
    } catch {
      window.localStorage.removeItem(SESSION_KEY);
      return null;
    }
  },
  save(session: CloudSession | null) {
    if (typeof window === "undefined") return;
    if (!session) window.localStorage.removeItem(SESSION_KEY);
    else window.localStorage.setItem(SESSION_KEY, JSON.stringify({ access_token: session.accessToken, refresh_token: session.refreshToken, expires_at: Math.floor(session.expiresAt / 1000), user: session.user }));
  },
};

export async function signInWithPassword(email: string, password: string) {
  const payload = await request<{ access_token: string; refresh_token: string; expires_in: number; user: { id: string; email?: string } }>("/auth/v1/token?grant_type=password", { method: "POST", body: JSON.stringify({ email, password }) });
  const session: CloudSession = { accessToken: payload.access_token, refreshToken: payload.refresh_token, expiresAt: Date.now() + payload.expires_in * 1000, user: payload.user };
  cloudSession.save(session); return session;
}

export async function signOut() { const session = cloudSession.load(); if (session) await request<void>("/auth/v1/logout", { method: "POST" }, session).catch(() => undefined); cloudSession.save(null); }
export async function refreshSession(session = cloudSession.load()) {
  if (!session?.refreshToken) return null;
  const payload = await request<{ access_token: string; refresh_token: string; expires_in: number; user: { id: string; email?: string } }>("/auth/v1/token?grant_type=refresh_token", { method: "POST", body: JSON.stringify({ refresh_token: session.refreshToken }) });
  const refreshed: CloudSession = { accessToken: payload.access_token, refreshToken: payload.refresh_token, expiresAt: Date.now() + payload.expires_in * 1000, user: payload.user };
  cloudSession.save(refreshed); return refreshed;
}

export async function cloudSelect<T>(table: string, query = "select=*") { return request<T[]>(`/rest/v1/${encodeURIComponent(table)}?${query}`, { method: "GET" }, cloudSession.load() || undefined); }
export async function cloudInsert<T extends object>(table: string, records: T[]) { return request<T[]>(`/rest/v1/${encodeURIComponent(table)}`, { method: "POST", body: JSON.stringify(records), headers: { Prefer: "return=representation" } }, cloudSession.load() || undefined); }
export async function cloudUpsert<T extends object>(table: string, records: T[], conflictColumns = "organisation_id,source_id") { return request<T[]>(`/rest/v1/${encodeURIComponent(table)}?on_conflict=${encodeURIComponent(conflictColumns)}`, { method: "POST", body: JSON.stringify(records), headers: { Prefer: "resolution=merge-duplicates,return=representation" } }, cloudSession.load() || undefined); }
export async function cloudPatch<T extends object>(table: string, query: string, patch: T) { return request<void>(`/rest/v1/${encodeURIComponent(table)}?${query}`, { method: "PATCH", body: JSON.stringify(patch), headers: { Prefer: "return=minimal" } }, cloudSession.load() || undefined); }
export async function cloudDelete(table: string, sourceId: string, extraFilters = "") { return request<void>(`/rest/v1/${encodeURIComponent(table)}?source_id=eq.${encodeURIComponent(sourceId)}${extraFilters}`, { method: "DELETE", headers: { Prefer: "return=minimal" } }, cloudSession.load() || undefined); }
export async function createSignedUpload(path: string, expiresIn = 600) {
  const result = await request<SignedStorageResponse>(`/storage/v1/object/upload/sign/${cloudStorageBucket}/${encodedObjectPath(path)}`, { method: "POST", body: JSON.stringify({ expiresIn }) }, cloudSession.load() || undefined);
  return normalizeSignedStorageResponse(result);
}
export async function createSignedDownload(path: string, expiresIn = 300) {
  const result = await request<SignedStorageResponse>(`/storage/v1/object/sign/${cloudStorageBucket}/${encodedObjectPath(path)}`, { method: "POST", body: JSON.stringify({ expiresIn }) }, cloudSession.load() || undefined);
  return normalizeSignedStorageResponse(result);
}
