"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, CloudOff, LogIn, RefreshCw } from "lucide-react";
import { useCloudIdentity } from "../lib/cloud/useCloudIdentity";
import { syncStatus, type SyncState } from "../lib/cloud/repository";

export function CloudSyncIndicator() {
  const [status, setStatus] = useState<SyncState>(() => typeof window === "undefined" ? "Offline" : syncStatus.get());
  const { identity, isReady, mode } = useCloudIdentity();

  useEffect(() => {
    const listener = (event: Event) => setStatus((event as CustomEvent<SyncState>).detail);
    window.addEventListener("jr-os-sync-status", listener);
    return () => window.removeEventListener("jr-os-sync-status", listener);
  }, []);

  if (mode === "local") return null;
  const label = !isReady ? "Checking…" : !identity ? "Sign in" : status;
  const Icon = !isReady ? RefreshCw : !identity ? LogIn : status === "Synced" ? CheckCircle2 : status === "Offline" ? CloudOff : status === "Conflict" || status === "Failed" ? AlertTriangle : RefreshCw;
  const tone = !identity || !isReady ? "text-cyan-300" : status === "Synced" ? "text-emerald-300" : status === "Conflict" || status === "Failed" ? "text-rose-300" : "text-amber-300";

  return <Link href="/cloud" aria-label={identity && isReady ? `Cloud sync: ${status}` : label} className="inline-flex min-h-11 min-w-0 items-center gap-2 rounded-full border border-slate-700 bg-slate-950/95 px-3 text-xs font-semibold shadow-lg backdrop-blur focus-visible:outline-2 focus-visible:outline-cyan-400"><Icon aria-hidden="true" className={`size-4 shrink-0 ${tone}`} /><span className="truncate">{label}</span></Link>;
}
