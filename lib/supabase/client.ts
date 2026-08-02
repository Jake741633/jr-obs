export interface SupabaseSession {
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
  user?: { id: string; email?: string };
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
    return JSON.parse(raw) as SupabaseSession;
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

function consumeEmailVerificationRedirect() {
  if (typeof window === "undefined" || !window.location.hash) return;
  const params = new URLSearchParams(window.location.hash.slice(1));
  const accessToken = params.get("access_token");
  if (!accessToken) return;

  const expiresAt = Number(params.get("expires_at"));
  const expiresIn = Number(params.get("expires_in"));
  saveSupabaseSession({
    access_token: accessToken,
    refresh_token: params.get("refresh_token") || undefined,
    expires_at: Number.isFinite(expiresAt) && expiresAt > 0
      ? expiresAt
      : Number.isFinite(expiresIn) && expiresIn > 0
        ? Math.floor(Date.now() / 1000) + expiresIn
        : undefined,
  });

  window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.search}`);
  window.dispatchEvent(new Event("jr-os-cloud-identity-changed"));
}

if (typeof window !== "undefined") consumeEmailVerificationRedirect();

export async function supabaseFetch(path: string, init: RequestInit = {}, authenticated = true) {
  const config = getSupabaseConfig();
  if (!config) throw new Error("Supabase is not configured yet.");
  const session = readSupabaseSession();
  const headers = new Headers(init.headers);
  headers.set("apikey", config.anonKey);
  headers.set("Content-Type", "application/json");
  if (authenticated && session?.access_token) headers.set("Authorization", `Bearer ${session.access_token}`);

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
