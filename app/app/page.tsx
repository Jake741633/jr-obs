"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { roleLandingPath } from "../../lib/cloud/permissions";
import { useCloudIdentity } from "../../lib/cloud/useCloudIdentity";

export default function AppLaunchPage() {
  const router = useRouter();
  const { identity, isReady, mode } = useCloudIdentity();

  useEffect(() => {
    if (!isReady) return;
    const destination = identity ? roleLandingPath(identity.role) : mode === "cloud" ? "/cloud" : "/";
    router.replace(destination);
  }, [identity, isReady, mode, router]);

  return <p role="status" className="grid min-h-[60dvh] place-items-center text-sm text-slate-400">Opening JR OS…</p>;
}
