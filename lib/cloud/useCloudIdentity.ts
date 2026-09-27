"use client";

import { useEffect, useSyncExternalStore } from "react";
import { getCurrentCloudUser } from "../cloudSync";
import { captureSupabaseSessionOwnership, readSupabaseSession, readSupabaseSessionOwnershipEpoch, supabaseFetch } from "../supabase/client";
import { sameSupabaseSessionOwnership } from "../supabase/sessionOwnership-core.mjs";
import { effectiveCloudMode } from "./config";
import type { JrRole } from "./permissions";
import { setActiveSyncIdentity } from "./repository";
import { purgeCustomerNetworkOnlyCollectionCaches, purgeElectricianFleetCollectionCaches, purgeElectricianNetworkOnlyCollectionCaches } from "./roleProjectionCache-core.mjs";

export interface CloudIdentity {
  userId: string;
  email?: string;
  organisationId: string;
  role: JrRole;
  customerSourceId?: string;
}

interface IdentitySnapshot {
  identity: CloudIdentity | null;
  isReady: boolean;
}

let snapshot: IdentitySnapshot = { identity: null, isReady: effectiveCloudMode() === "local" };
let identityRequest: Promise<CloudIdentity | null> | null = null;
let identityRequestVersion = 0;
const listeners = new Set<() => void>();
const IDENTITY_REVALIDATION_INTERVAL_MS = 30_000;

function emit(next: IdentitySnapshot) {
  if (typeof window !== "undefined" && effectiveCloudMode() !== "local") {
    try {
      purgeCustomerNetworkOnlyCollectionCaches(window.localStorage, "jr-os-certificates");
      purgeCustomerNetworkOnlyCollectionCaches(window.localStorage, "jr-os-job-documents");
      purgeCustomerNetworkOnlyCollectionCaches(window.localStorage, "jr-os-portal-payment-links");
      purgeElectricianNetworkOnlyCollectionCaches(window.localStorage, "jr-os-job-documents");
      purgeElectricianFleetCollectionCaches(window.localStorage);
    }
    catch { /* Best-effort privacy cleanup must not invalidate a live identity. */ }
  }
  snapshot = next;
  setActiveSyncIdentity(
    next.identity?.organisationId ?? null,
    next.identity?.userId ?? null,
    next.identity?.role ?? null,
    next.identity?.customerSourceId ?? null,
  );
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return snapshot;
}

function getServerSnapshot(): IdentitySnapshot {
  return { identity: null, isReady: effectiveCloudMode() === "local" };
}

function hasPersistedSession() {
  const session = readSupabaseSession();
  return Boolean(session?.access_token && !session.is_password_recovery);
}

async function loadIdentity(force = false) {
  if (effectiveCloudMode() === "local") {
    identityRequestVersion += 1;
    emit({ identity: null, isReady: true });
    return null;
  }
  if (!force && snapshot.isReady && (snapshot.identity || !hasPersistedSession())) return snapshot.identity;
  if (!force && identityRequest) return identityRequest;

  const requestVersion = ++identityRequestVersion;
  const request = (async () => {
    const startingOwnership = captureSupabaseSessionOwnership();
    const ownershipIsCurrent = () => sameSupabaseSessionOwnership(
      readSupabaseSession(),
      readSupabaseSessionOwnershipEpoch(),
      startingOwnership.session,
      startingOwnership.epoch,
    );
    const user = await getCurrentCloudUser();
    if (!user || !ownershipIsCurrent()) return null;
    const rows = await supabaseFetch(`/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&active=eq.true&select=organisation_id,role,customer_source_id,active`);
    if (!ownershipIsCurrent()) return null;
    const profile = Array.isArray(rows) ? rows[0] : null;
    if (!profile?.active || !profile?.organisation_id || !profile?.role) return null;
    if (profile.role === "customer" && !profile.customer_source_id) return null;
    return {
      userId: user.id,
      email: user.email,
      organisationId: profile.organisation_id,
      role: profile.role as JrRole,
      customerSourceId: profile.customer_source_id || undefined,
    } satisfies CloudIdentity;
  })();
  identityRequest = request;

  try {
    const identity = await request;
    if (requestVersion === identityRequestVersion) emit({ identity, isReady: true });
    return identity;
  } catch {
    if (requestVersion === identityRequestVersion) emit({ identity: null, isReady: true });
    return null;
  } finally {
    if (identityRequest === request) identityRequest = null;
  }
}

export function refreshCloudIdentity() {
  emit({ identity: null, isReady: false });
  return loadIdentity(true);
}

function revalidateCloudIdentity() {
  return identityRequest ?? loadIdentity(true);
}

function handleIdentityChange() {
  void refreshCloudIdentity();
}

function handleStorageChange(event: StorageEvent) {
  if (event.key === "jr-os-supabase-session") void refreshCloudIdentity();
}

function handleVisibilityChange() {
  if (document.visibilityState === "visible") void refreshCloudIdentity();
}

function handleWindowFocus() {
  if (document.visibilityState === "visible") void refreshCloudIdentity();
}

export function useCloudIdentity() {
  const mode = effectiveCloudMode();
  const current = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    if (mode !== "local" && (!current.isReady || (!current.identity && hasPersistedSession()))) void loadIdentity();
    window.addEventListener("jr-os-cloud-identity-changed", handleIdentityChange);
    window.addEventListener("storage", handleStorageChange);
    window.addEventListener("focus", handleWindowFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    const intervalId = mode === "local" ? undefined : window.setInterval(() => {
      if (document.visibilityState === "visible") void revalidateCloudIdentity();
    }, IDENTITY_REVALIDATION_INTERVAL_MS);
    return () => {
      window.removeEventListener("jr-os-cloud-identity-changed", handleIdentityChange);
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener("focus", handleWindowFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (intervalId !== undefined) window.clearInterval(intervalId);
    };
  }, [current.identity, current.isReady, mode]);

  return { identity: current.identity, isReady: current.isReady, mode, refresh: refreshCloudIdentity };
}
