export function supabaseSessionFingerprint(session) {
  if (!session?.access_token) return null;
  return JSON.stringify([
    session.access_token,
    session.is_password_recovery === true,
  ]);
}

export function sameSupabaseSession(left, right) {
  return supabaseSessionFingerprint(left) === supabaseSessionFingerprint(right);
}

export function sameSupabaseSessionOwnership(currentSession, currentEpoch, expectedSession, expectedEpoch) {
  return currentEpoch === expectedEpoch && sameSupabaseSession(currentSession, expectedSession);
}
