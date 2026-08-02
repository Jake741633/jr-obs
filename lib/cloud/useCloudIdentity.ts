"use client";

import { useEffect, useSyncExternalStore } from "react";
import { getCurrentCloudUser } from "../cloudSync";
import { readSupabaseSession, supabaseFetch } from "../supabase/client";
import { effectiveCloudMode } from "./config";
import type { JrRole } from "./permissions";
import { setActiveSyncOrganisation } from "./repository";

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

function emit(next: IdentitySnapshot) {
  snapshot = next;
  setActiveSyncOrganisation(next.identity?.organisationId ?? null);
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
  return Boolean(readSupabaseSession()?.access_token);
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
    const user = await getCurrentCloudUser();
    if (!user) return null;
    const rows = await supabaseFetch(`/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&active=eq.true&select=organisation_id,role,customer_source_id,active`);
    const profile = Array.isArray(rows) ? rows[0] : null;
    if (!profile?.active || !profile?.organisation_id || !profile?.role) return null;
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
  } finally {
    if (identityRequest === request) identityRequest = null;
  }
}

export function refreshCloudIdentity() {
  emit({ identity: null, isReady: false });
  return loadIdentity(true);
}

function handleIdentityChange() {
  void refreshCloudIdentity();
}

function handleStorageChange(event: StorageEvent) {
  if (event.key === "jr-os-supabase-session") void refreshCloudIdentity();
}

function handleVisibilityChange() {
  if (document.visibilityState === "visible" && hasPersistedSession() && !snapshot.identity) {
    void refreshCloudIdentity();
  }
}

export function useCloudIdentity() {
  const mode = effectiveCloudMode();
  const current = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    if (mode !== "local" && (!current.isReady || (!current.identity && hasPersistedSession()))) void loadIdentity();
    window.addEventListener("jr-os-cloud-identity-changed", handleIdentityChange);
    window.addEventListener("storage", handleStorageChange);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("jr-os-cloud-identity-changed", handleIdentityChange);
      window.removeEventListener("storage", handleStorageChange);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [current.identity, current.isReady, mode]);

  return { identity: current.identity, isReady: current.isReady, mode, refresh: refreshCloudIdentity };
}
