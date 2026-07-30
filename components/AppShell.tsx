import type { ReactNode } from "react";
import { CloudAccessGuard } from "./CloudAccessGuard";
import { CloudSyncIndicator } from "./CloudSyncIndicator";
import Sidebar from "./Sidebar";
import { MobileNav } from "./MobileNav";

export function AppShell({ children }: { children: ReactNode }) {
  return <div className="min-h-screen bg-slate-950 text-white"><Sidebar /><CloudSyncIndicator /><main className="min-h-screen pb-24 lg:ml-72 lg:pb-0"><div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8"><CloudAccessGuard>{children}</CloudAccessGuard></div></main><MobileNav /></div>;
}
