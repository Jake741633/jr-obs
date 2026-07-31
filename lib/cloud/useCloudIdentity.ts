"use client";

import { useEffect, useSyncExternalStore } from "react";
import { getCurrentCloudUser } from "../cloudSync";
import { supabaseFetch } from "../supabase/client";
import { effectiveCloudMode } from "./config";
import type { JrRole } from "./permissions";

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
const listeners = new Set<() => void>();

function emit(next: IdentitySnapshot) {
  snapshot = next;
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

async function loadIdentity(force = false) {
  if (effectiveCloudMode() === "local") {
    emit({ identity: null, isReady: true });
    return null;
  }
  if (!force && snapshot.isReady) return snapshot.identity;
  if (!force && identityRequest) return identityRequest;

  identityRequest = (async () => {
    const user = await getCurrentCloudUser();
    if (!user) return null;
    const rows = await supabaseFetch(`/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=organisation_id,role,customer_source_id`);
    const profile = Array.isArray(rows) ? rows[0] : null;
    if (!profile?.organisation_id || !profile?.role) return null;
    return {
      userId: user.id,
      email: user.email,
      organisationId: profile.organisation_id,
      role: profile.role as JrRole,
      customerSourceId: profile.customer_source_id || undefined,
    } satisfies CloudIdentity;
  })();

  try {
    const identity = await identityRequest;
    emit({ identity, isReady: true });
    return identity;
  } finally {
    identityRequest = null;
  }
}

function refreshIdentity() {
  emit({ identity: null, isReady: false });
  void loadIdentity(true);
}

export function useCloudIdentity() {
  const mode = effectiveCloudMode();
  const current = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    if (mode !== "local" && !current.isReady) void loadIdentity();
    window.addEventListener("jr-os-cloud-identity-changed", refreshIdentity);
    return () => window.removeEventListener("jr-os-cloud-identity-changed", refreshIdentity);
  }, [current.isReady, mode]);

  return { identity: current.identity, isReady: current.isReady, mode };
}
