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

export function useCloudIdentity() {
  const [identity, setIdentity] = useState<CloudIdentity | null>(null);
  const [isReady, setIsReady] = useState(effectiveCloudMode() === "local");

  useEffect(() => {
    if (effectiveCloudMode() === "local") return;
    let active = true;
    void (async () => {
      try {
        const user = await getCurrentCloudUser();
        if (!user) return;
        const rows = await supabaseFetch(`/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=organisation_id,role,customer_source_id`);
        const profile = Array.isArray(rows) ? rows[0] : null;
        if (active && profile?.organisation_id && profile?.role) {
          setIdentity({ userId: user.id, email: user.email, organisationId: profile.organisation_id, role: profile.role as JrRole, customerSourceId: profile.customer_source_id || undefined });
        }
      } finally { if (active) setIsReady(true); }
    })();
    return () => { active = false; };
  }, []);

  return { identity, isReady, mode: effectiveCloudMode() };
}
