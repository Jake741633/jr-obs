import type { SupabaseSession, SupabaseSessionOwnership } from "./client";

export function supabaseSessionFingerprint(session: SupabaseSession | null): string | null;
export function sameSupabaseSession(left: SupabaseSession | null, right: SupabaseSession | null): boolean;
export function sameSupabaseSessionOwnership(
  currentSession: SupabaseSession | null,
  currentEpoch: string | null,
  expectedSession: SupabaseSession | null,
  expectedEpoch: string | null,
): boolean;
export function supabaseSessionUserId(session: SupabaseSession | null): string | null;
export function capturedSupabaseLogoutRequest(
  expectedOwnership: SupabaseSessionOwnership,
  scope: "global" | "local",
): { path: string; headers: { Authorization: string } } | null;
export function globalSupabaseSignOutOwnsSession(
  currentSession: SupabaseSession | null,
  currentEpoch: string | null,
  expectedSession: SupabaseSession | null,
  expectedEpoch: string | null,
  expectedUserId?: string,
): boolean;
