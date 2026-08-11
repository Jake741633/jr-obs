import { supabaseSessionFingerprint } from "./sessionOwnership-core.mjs";

export interface SupabaseSession {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  expires_at?: number;
  token_type?: string;
  user?: { id: string; email?: string };
  is_password_recovery?: boolean;
}

const sessionKey = "jr-os-supabase-session";
const sessionOwnershipEpochKey = "jr-os-supabase-session-epoch";
const materialLookupSessionCookie = "jr-os-materials-api-session";

export interface SupabaseSessionOwnership {
  session: SupabaseSession | null;
  epoch: string | null;
}

function nextSessionOwnershipEpoch() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now()}-${Math.random()}`;
}

function rotateSessionOwnershipEpoch() {
  window.localStorage.setItem(sessionOwnershipEpochKey, nextSessionOwnershipEpoch());
}

function syncMaterialLookupSessionCookie(session: SupabaseSession | null) {
  if (typeof document === "undefined") return;
  if (!session?.access_token || session.is_password_recovery) {
    document.cookie = `${materialLookupSessionCookie}=; Path=/api/materials/lookup; Max-Age=0; SameSite=Strict`;
    return;
  }

  const now = Math.floor(Date.now() / 1000);
  const maxAge = typeof session.expires_at === "number" && Number.isFinite(session.expires_at)
    ? Math.max(0, Math.floor(session.expires_at - now))
    : typeof session.expires_in === "number" && Number.isFinite(session.expires_in)
      ? Math.max(0, Math.floor(session.expires_in))
      : 3600;
  const secure = typeof window !== "undefined" && window.location?.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${materialLookupSessionCookie}=${encodeURIComponent(session.access_token)}; Path=/api/materials/lookup; Max-Age=${maxAge}; SameSite=Strict${secure}`;
}

function clearStoredSupabaseSession() {
  window.localStorage.removeItem(sessionKey);
  syncMaterialLookupSessionCookie(null);
  rotateSessionOwnershipEpoch();
}

function storedSessionFingerprint(raw: string | null) {
  if (!raw) return null;
  try { return supabaseSessionFingerprint(JSON.parse(raw) as SupabaseSession); }
  catch { return null; }
}

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
      clearStoredSupabaseSession();
      return null;
    }

    return session as SupabaseSession;
  } catch {
    clearStoredSupabaseSession();
    return null;
  }
}

export function readSupabaseSessionOwnershipEpoch() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(sessionOwnershipEpochKey);
}

export function captureSupabaseSessionOwnership(): SupabaseSessionOwnership {
  const session = readSupabaseSession();
  return { session, epoch: readSupabaseSessionOwnershipEpoch() };
}

export function saveSupabaseSession(session: SupabaseSession | null) {
  if (typeof window === "undefined") return;
  const previousFingerprint = storedSessionFingerprint(window.localStorage.getItem(sessionKey));
  if (!session) window.localStorage.removeItem(sessionKey);
  else window.localStorage.setItem(sessionKey, JSON.stringify(session));
  syncMaterialLookupSessionCookie(session);
  if (previousFingerprint !== supabaseSessionFingerprint(session)) rotateSessionOwnershipEpoch();
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
