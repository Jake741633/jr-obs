import type { SupabaseSession } from "./client";

export function supabaseSessionFingerprint(session: SupabaseSession | null): string | null;
export function sameSupabaseSession(left: SupabaseSession | null, right: SupabaseSession | null): boolean;
export function sameSupabaseSessionOwnership(
  currentSession: SupabaseSession | null,
  currentEpoch: string | null,
  expectedSession: SupabaseSession | null,
  expectedEpoch: string | null,
): boolean;
