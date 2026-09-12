import Link from "next/link";
import { UserRound, Zap } from "lucide-react";
import { CloudSyncIndicator } from "./CloudSyncIndicator";

export function AppHeader() {
  return (
    <header className="app-header mobile-safe-inline fixed inset-x-0 top-0 z-40 border-b border-slate-800 bg-slate-950/95 backdrop-blur-xl lg:inset-x-auto lg:right-3 lg:top-3 lg:border-0 lg:bg-transparent">
      <div className="flex min-h-16 items-center justify-between gap-3 lg:min-h-0">
        <Link href="/app" aria-label="Open JR OS workspace" className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl font-bold tracking-tight text-white focus-visible:outline-2 focus-visible:outline-cyan-400 lg:hidden">
          <span className="grid size-9 place-items-center rounded-xl bg-cyan-400 text-slate-950"><Zap aria-hidden="true" className="size-5" /></span>
          JR OS
        </Link>
        <div className="flex min-w-0 items-center gap-2">
          <CloudSyncIndicator />
          <Link href="/cloud" aria-label="Account" className="grid min-h-11 min-w-11 place-items-center rounded-xl border border-slate-800 bg-slate-900 text-slate-200 focus-visible:outline-2 focus-visible:outline-cyan-400 lg:hidden">
            <UserRound aria-hidden="true" className="size-5" />
          </Link>
        </div>
      </div>
    </header>
  );
}
