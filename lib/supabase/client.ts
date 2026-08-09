export interface SupabaseSession {
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
  user?: { id: string; email?: string };
  is_password_recovery?: boolean;
}

const sessionKey = "jr-os-supabase-session";

export function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && anonKey ? { url: url.replace(/\/$/, ""), anonKey } : null;
}

export function isSupabaseConfigured() {
  return Boolean(getSupabaseConfig());
}

export function readSupabaseSession(): SupabaseSession | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(sessionKey);
  if (!raw) return null;
  try {
    const session = JSON.parse(raw) as Partial<SupabaseSession>;
    const hasAccessToken = typeof session.access_token === "string" && session.access_token.trim().length > 0;
    const expiresAt = typeof session.expires_at === "number" && Number.isFinite(session.expires_at)
      ? session.expires_at
      : undefined;
    const hasExpired = expiresAt !== undefined && expiresAt <= Math.floor(Date.now() / 1000);

    if (!hasAccessToken || hasExpired) {
      window.localStorage.removeItem(sessionKey);
      return null;
    }

    return session as SupabaseSession;
  } catch {
    window.localStorage.removeItem(sessionKey);
    return null;
  }
}

export function saveSupabaseSession(session: SupabaseSession | null) {
  if (typeof window === "undefined") return;
  if (!session) window.localStorage.removeItem(sessionKey);
  else window.localStorage.setItem(sessionKey, JSON.stringify(session));
}

export async function supabaseFetch(path: string, init: RequestInit = {}, authenticated = true) {
  const config = getSupabaseConfig();
  if (!config) throw new Error("Supabase is not configured yet.");
  const session = readSupabaseSession();

  const headers = new Headers(init.headers);
  headers.set("apikey", config.anonKey);
  headers.set("Content-Type", "application/json");
  if (authenticated) {
    if (!session) throw new Error("Your cloud session has expired. Sign in again to continue.");
    const method = (init.method || "GET").toUpperCase();
    const recoveryAction = path === "/auth/v1/user" && method === "PUT";
    const recoverySignOut = path.startsWith("/auth/v1/logout") && method === "POST";
    if (session.is_password_recovery && !recoveryAction && !recoverySignOut) {
      throw new Error("Complete password recovery before accessing JR OS data.");
    }
    headers.set("Authorization", `Bearer ${session.access_token}`);
  }

  let requestPath = path;
  if (typeof window !== "undefined" && path === "/auth/v1/signup") {
    const redirectTo = `${window.location.origin}/cloud`;
    requestPath = `${path}?redirect_to=${encodeURIComponent(redirectTo)}`;
  }

  const response = await fetch(`${config.url}${requestPath}`, { ...init, headers });
  const body = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    const message = body?.msg || body?.message || body?.error_description || body?.error || "Cloud request failed.";
    throw new Error(message);
  }
  return body;
}
