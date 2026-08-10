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

function normalisedSessionUserId(session) {
  const userId = session?.user?.id;
  return typeof userId === "string" && userId.trim() ? userId.trim() : null;
}

export function capturedSupabaseLogoutRequest(expectedOwnership, scope) {
  if (scope !== "global" && scope !== "local") throw new Error("Unsupported Supabase logout scope.");
  const accessToken = expectedOwnership?.session?.access_token;
  if (typeof accessToken !== "string" || !accessToken.trim()) return null;
  return {
    path: `/auth/v1/logout?scope=${scope}`,
    headers: { Authorization: `Bearer ${accessToken}` },
  };
}

export function globalSupabaseSignOutOwnsSession(
  currentSession,
  currentEpoch,
  expectedSession,
  expectedEpoch,
  expectedUserId,
) {
  if (sameSupabaseSessionOwnership(currentSession, currentEpoch, expectedSession, expectedEpoch)) return true;
  const capturedUserId = typeof expectedUserId === "string" && expectedUserId.trim()
    ? expectedUserId.trim()
    : normalisedSessionUserId(expectedSession);
  return Boolean(capturedUserId && normalisedSessionUserId(currentSession) === capturedUserId);
}
