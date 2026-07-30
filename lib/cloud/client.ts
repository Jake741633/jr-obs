"use client";

import { cloudConfig, cloudStorageBucket } from "./config";

export interface CloudSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  user: { id: string; email?: string };
}

const SESSION_KEY = "jr-os-cloud-session";

function headers(session?: CloudSession) {
  return { apikey: cloudConfig.anonKey, Authorization: `Bearer ${session?.accessToken || cloudConfig.anonKey}`, "Content-Type": "application/json" };
}

async function request<T>(path: string, init: RequestInit = {}, session?: CloudSession): Promise<T> {
  if (!cloudConfig.isConfigured) throw new Error("Supabase is not configured.");
  const response = await fetch(`${cloudConfig.url}${path}`, { ...init, headers: { ...headers(session), ...(init.headers || {}) } });
  if (!response.ok) throw new Error((await response.text()) || `Supabase request failed (${response.status}).`);
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const cloudSession = {
  load(): CloudSession | null { if (typeof window === "undefined") return null; try { return JSON.parse(window.localStorage.getItem(SESSION_KEY) || "null") as CloudSession | null; } catch { return null; } },
  save(session: CloudSession | null) { if (typeof window === "undefined") return; if (session) window.localStorage.setItem(SESSION_KEY, JSON.stringify(session)); else window.localStorage.removeItem(SESSION_KEY); },
};

export async function signInWithPassword(email: string, password: string) {
  const payload = await request<{ access_token: string; refresh_token: string; expires_in: number; user: { id: string; email?: string } }>("/auth/v1/token?grant_type=password", { method: "POST", body: JSON.stringify({ email, password }) });
  const session: CloudSession = { accessToken: payload.access_token, refreshToken: payload.refresh_token, expiresAt: Date.now() + payload.expires_in * 1000, user: payload.user };
  cloudSession.save(session); return session;
}

export async function signOut() { const session = cloudSession.load(); if (session) await request<void>("/auth/v1/logout", { method: "POST" }, session).catch(() => undefined); cloudSession.save(null); }

export async function refreshSession(session = cloudSession.load()) {
  if (!session) return null;
  const payload = await request<{ access_token: string; refresh_token: string; expires_in: number; user: { id: string; email?: string } }>("/auth/v1/token?grant_type=refresh_token", { method: "POST", body: JSON.stringify({ refresh_token: session.refreshToken }) });
  const refreshed: CloudSession = { accessToken: payload.access_token, refreshToken: payload.refresh_token, expiresAt: Date.now() + payload.expires_in * 1000, user: payload.user };
  cloudSession.save(refreshed); return refreshed;
}

export async function cloudSelect<T>(table: string, query = "select=*") { return request<T[]>(`/rest/v1/${encodeURIComponent(table)}?${query}`, { method: "GET" }, cloudSession.load() || undefined); }
export async function cloudInsert<T extends object>(table: string, records: T[]) { return request<T[]>(`/rest/v1/${encodeURIComponent(table)}`, { method: "POST", body: JSON.stringify(records), headers: { Prefer: "return=representation" } }, cloudSession.load() || undefined); }
export async function cloudUpsert<T extends object>(table: string, records: T[]) { return request<T[]>(`/rest/v1/${encodeURIComponent(table)}?on_conflict=organisation_id,source_id`, { method: "POST", body: JSON.stringify(records), headers: { Prefer: "resolution=merge-duplicates,return=representation" } }, cloudSession.load() || undefined); }
export async function cloudDelete(table: string, sourceId: string) { return request<void>(`/rest/v1/${encodeURIComponent(table)}?source_id=eq.${encodeURIComponent(sourceId)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } }, cloudSession.load() || undefined); }
export async function createSignedUpload(path: string, expiresIn = 600) { return request<{ signedURL: string; token: string }>(`/storage/v1/object/upload/sign/${cloudStorageBucket}/${encodeURIComponent(path)}`, { method: "POST", body: JSON.stringify({ expiresIn }) }, cloudSession.load() || undefined); }
export async function createSignedDownload(path: string, expiresIn = 300) { return request<{ signedURL: string }>(`/storage/v1/object/sign/${cloudStorageBucket}/${encodeURIComponent(path)}`, { method: "POST", body: JSON.stringify({ expiresIn }) }, cloudSession.load() || undefined); }
