"use client";

import { cloudConfig, cloudStorageBucket } from "./config";
import {
  captureSupabaseSessionOwnership,
  readSupabaseSession,
  readSupabaseSessionOwnershipEpoch,
  saveSupabaseSession,
  type SupabaseSession,
  type SupabaseSessionOwnership,
} from "../supabase/client";
import { sameSupabaseSessionOwnership } from "../supabase/sessionOwnership-core.mjs";

export interface CloudSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  user: { id: string; email?: string };
  isPasswordRecovery?: boolean;
}

interface PostgrestErrorBody {
  code?: string;
  message?: string;
  details?: string | null;
  hint?: string | null;
}

export class CloudRequestError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly details?: string | null;
  readonly hint?: string | null;

  constructor(status: number, body: PostgrestErrorBody | null, fallbackMessage: string) {
    super(body?.message || fallbackMessage);
    this.name = "CloudRequestError";
    this.status = status;
    this.code = body?.code;
    this.details = body?.details;
    this.hint = body?.hint;
  }
}

export function isCloudConflictError(error: unknown) {
  return error instanceof CloudRequestError
    && (error.status === 409 || error.code === "PT409");
}

function requestHeaders(session?: CloudSession, extra?: HeadersInit) {
  const result = new Headers();
  result.set("apikey", cloudConfig.anonKey);
  if (session) result.set("Authorization", `Bearer ${session.accessToken}`);
  result.set("Content-Type", "application/json");
  if (extra) new Headers(extra).forEach((value, key) => result.set(key, value));
  return result;
}

async function request<T>(path: string, init: RequestInit = {}, session?: CloudSession, authenticated = true, allowPasswordRecovery = false): Promise<T> {
  if (!cloudConfig.isConfigured) throw new Error("Supabase is not configured.");
  if (authenticated && !session) throw new Error("Your cloud session has expired. Sign in again to continue.");
  if (authenticated && session?.isPasswordRecovery && !allowPasswordRecovery) {
    throw new Error("Complete password recovery before accessing JR OS data.");
  }
  const response = await fetch(`${cloudConfig.url}${path}`, { ...init, headers: requestHeaders(session, init.headers) });
  if (!response.ok) {
    const responseText = await response.text();
    let body: PostgrestErrorBody | null = null;
    try { body = JSON.parse(responseText) as PostgrestErrorBody; } catch { /* PostgREST may return plain text upstream errors. */ }
    throw new CloudRequestError(response.status, body, responseText || `Supabase request failed (${response.status}).`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

function normalizeSession(value: SupabaseSession | null): CloudSession | null {
  if (!value?.access_token || !value.user) return null;
  return {
    accessToken: value.access_token,
    refreshToken: value.refresh_token || "",
    expiresAt: value.expires_at ? value.expires_at * 1000 : Date.now() + (value.expires_in || 3600) * 1000,
    user: value.user,
    isPasswordRecovery: value.is_password_recovery === true,
  };
}

function storedSession(value: CloudSession): SupabaseSession {
  return {
    access_token: value.accessToken,
    refresh_token: value.refreshToken,
    expires_at: Math.floor(value.expiresAt / 1000),
    user: value.user,
    is_password_recovery: value.isPasswordRecovery || undefined,
  };
}

function activeSessionOwnershipMatches(expected: SupabaseSessionOwnership) {
  return sameSupabaseSessionOwnership(
    readSupabaseSession(),
    readSupabaseSessionOwnershipEpoch(),
    expected.session,
    expected.epoch,
  );
}

function assertActiveSessionOwnership(expected: SupabaseSessionOwnership) {
  if (!activeSessionOwnershipMatches(expected)) {
    throw new Error("The active JR OS account changed before the authentication request completed.");
  }
}

function identityChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event("jr-os-cloud-identity-changed"));
}

function encodedObjectPath(path: string) {
  return path.split("/").map((segment) => encodeURIComponent(segment)).join("/");
}

export const cloudSession = {
  load(): CloudSession | null {
    return normalizeSession(readSupabaseSession());
  },
  save(session: CloudSession | null) {
    saveSupabaseSession(session ? storedSession(session) : null);
    identityChanged();
  },
};

export async function signInWithPassword(email: string, password: string) {
  const startingOwnership = captureSupabaseSessionOwnership();
  const payload = await request<{ access_token: string; refresh_token: string; expires_in: number; user: { id: string; email?: string } }>("/auth/v1/token?grant_type=password", { method: "POST", body: JSON.stringify({ email, password }) }, undefined, false);
  assertActiveSessionOwnership(startingOwnership);
  const session: CloudSession = { accessToken: payload.access_token, refreshToken: payload.refresh_token, expiresAt: Date.now() + payload.expires_in * 1000, user: payload.user };
  cloudSession.save(session); return session;
}

export async function signOut() {
  const startingOwnership = captureSupabaseSessionOwnership();
  const session = normalizeSession(startingOwnership.session);
  try {
    if (session) await request<void>("/auth/v1/logout?scope=global", { method: "POST" }, session, true, true);
  } finally {
    if (activeSessionOwnershipMatches(startingOwnership)) cloudSession.save(null);
  }
}
export async function refreshSession(session = cloudSession.load()) {
  const startingOwnership = captureSupabaseSessionOwnership();
  const activeSession = normalizeSession(startingOwnership.session);
  if (!session?.refreshToken || session.isPasswordRecovery || session.accessToken !== activeSession?.accessToken) return null;
  const payload = await request<{ access_token: string; refresh_token: string; expires_in: number; user: { id: string; email?: string } }>("/auth/v1/token?grant_type=refresh_token", { method: "POST", body: JSON.stringify({ refresh_token: session.refreshToken }) }, undefined, false);
  assertActiveSessionOwnership(startingOwnership);
  const refreshed: CloudSession = { accessToken: payload.access_token, refreshToken: payload.refresh_token, expiresAt: Date.now() + payload.expires_in * 1000, user: payload.user };
  cloudSession.save(refreshed); return refreshed;
}

export async function cloudSelect<T>(table: string, query = "select=*") { return request<T[]>(`/rest/v1/${encodeURIComponent(table)}?${query}`, { method: "GET" }, cloudSession.load() || undefined); }
export async function cloudInsert<T extends object>(table: string, records: T[]) { return request<T[]>(`/rest/v1/${encodeURIComponent(table)}`, { method: "POST", body: JSON.stringify(records), headers: { Prefer: "return=representation" } }, cloudSession.load() || undefined); }
export async function cloudUpsert<T extends object>(table: string, records: T[], conflictColumns = "organisation_id,source_id") { return request<T[]>(`/rest/v1/${encodeURIComponent(table)}?on_conflict=${encodeURIComponent(conflictColumns)}`, { method: "POST", body: JSON.stringify(records), headers: { Prefer: "resolution=merge-duplicates,return=representation" } }, cloudSession.load() || undefined); }
export async function cloudPatch<TResult extends object = Record<string, unknown>, TPatch extends object = Record<string, unknown>>(table: string, query: string, patch: TPatch) { return request<TResult[]>(`/rest/v1/${encodeURIComponent(table)}?${query}`, { method: "PATCH", body: JSON.stringify(patch), headers: { Prefer: "return=representation" } }, cloudSession.load() || undefined); }
export async function cloudDelete(table: string, sourceId: string, extraFilters = "") { return request<void>(`/rest/v1/${encodeURIComponent(table)}?source_id=eq.${encodeURIComponent(sourceId)}${extraFilters}`, { method: "DELETE", headers: { Prefer: "return=minimal" } }, cloudSession.load() || undefined); }
export async function cloudRpc<TResult>(functionName: string, args: Record<string, unknown>) {
  return request<TResult>(`/rest/v1/rpc/${encodeURIComponent(functionName)}`, {
    method: "POST",
    body: JSON.stringify(args),
  }, cloudSession.load() || undefined);
}
export async function uploadPrivateObject(path: string, body: Blob, mimeType: string) {
  return request<unknown>(`/storage/v1/object/${cloudStorageBucket}/${encodedObjectPath(path)}`, {
    method: "POST",
    body,
    headers: { "Content-Type": mimeType, "x-upsert": "false" },
  }, cloudSession.load() || undefined);
}

export async function downloadPrivateObject(path: string) {
  const session = cloudSession.load();
  if (!session) throw new Error("Your cloud session has expired. Sign in again to continue.");
  if (session.isPasswordRecovery) throw new Error("Complete password recovery before accessing JR OS data.");
  const response = await fetch(
    `${cloudConfig.url}/storage/v1/object/authenticated/${cloudStorageBucket}/${encodedObjectPath(path)}`,
    { method: "GET", headers: requestHeaders(session, { Accept: "application/octet-stream" }) },
  );
  if (!response.ok) throw new Error((await response.text()) || `Private file download failed (${response.status}).`);
  return response.blob();
}
