"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, CloudOff, RefreshCw } from "lucide-react";
import { effectiveCloudMode } from "../lib/cloud/config";
import { syncStatus, type SyncState } from "../lib/cloud/repository";

export function CloudSyncIndicator() {
  const [status, setStatus] = useState<SyncState>(() => typeof window === "undefined" ? "Offline" : syncStatus.get());
  const mode = effectiveCloudMode();

  useEffect(() => {
    const listener = (event: Event) => setStatus((event as CustomEvent<SyncState>).detail);
    window.addEventListener("jr-os-sync-status", listener);
    return () => window.removeEventListener("jr-os-sync-status", listener);
  }, []);

  if (mode === "local") return null;
  const Icon = status === "Synced" ? CheckCircle2 : status === "Offline" ? CloudOff : status === "Conflict" || status === "Failed" ? AlertTriangle : RefreshCw;
  const tone = status === "Synced" ? "text-emerald-300" : status === "Conflict" || status === "Failed" ? "text-rose-300" : "text-amber-300";

  return <Link href="/cloud" className="fixed right-3 top-3 z-50 inline-flex min-h-9 items-center gap-2 rounded-full border border-slate-700 bg-slate-950/95 px-3 text-xs font-semibold shadow-lg backdrop-blur"><Icon className={`size-4 ${tone}`} /><span>{status}</span></Link>;
}
