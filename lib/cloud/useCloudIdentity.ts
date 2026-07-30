"use client";

import { useEffect, useState } from "react";
import { getCurrentCloudUser } from "../cloudSync";
import { effectiveCloudMode } from "./config";
import type { JrRole } from "./permissions";
import { supabaseFetch } from "../supabase/client";

export interface CloudIdentity {
  userId: string;
  email?: string;
  organisationId: string;
  role: JrRole;
  customerSourceId?: string;
}

let cachedIdentity: CloudIdentity | null = null;
let identityRequest: Promise<CloudIdentity | null> | null = null;

async function loadIdentity(force = false) {
  if (effectiveCloudMode() === "local") return null;
  if (!force && cachedIdentity) return cachedIdentity;
  if (!force && identityRequest) return identityRequest;
  identityRequest = (async () => {
    const user = await getCurrentCloudUser();
    if (!user) return null;
    const rows = await supabaseFetch(`/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=organisation_id,role,customer_source_id`);
    const profile = Array.isArray(rows) ? rows[0] : null;
    if (!profile?.organisation_id || !profile?.role) return null;
    cachedIdentity = { userId: user.id, email: user.email, organisationId: profile.organisation_id, role: profile.role as JrRole, customerSourceId: profile.customer_source_id || undefined };
    return cachedIdentity;
  })().finally(() => { identityRequest = null; });
  return identityRequest;
}

export function useCloudIdentity() {
  const mode = effectiveCloudMode();
  const [identity, setIdentity] = useState<CloudIdentity | null>(cachedIdentity);
  const [isReady, setIsReady] = useState(mode === "local" || Boolean(cachedIdentity));

  useEffect(() => {
    if (mode === "local") return;
    let active = true;
    const refresh = () => {
      cachedIdentity = null;
      setIsReady(false);
      void loadIdentity(true).then((value) => { if (active) { setIdentity(value); setIsReady(true); } });
    };
    void loadIdentity().then((value) => { if (active) { setIdentity(value); setIsReady(true); } });
    window.addEventListener("jr-os-cloud-identity-changed", refresh);
    return () => { active = false; window.removeEventListener("jr-os-cloud-identity-changed", refresh); };
  }, [mode]);

  return { identity, isReady, mode };
}
