import type { ReactNode } from "react";
import { CloudAccessGuard } from "./CloudAccessGuard";
import { CloudSyncIndicator } from "./CloudSyncIndicator";
import Sidebar from "./Sidebar";
import { MobileNav } from "./MobileNav";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen overflow-x-hidden bg-slate-950 text-white">
      <Sidebar />
      <CloudSyncIndicator />
      <main className="min-h-screen pb-[calc(5.75rem+env(safe-area-inset-bottom))] lg:ml-72 lg:pb-0">
        <div className="mx-auto w-full max-w-7xl px-3 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
          <CloudAccessGuard>{children}</CloudAccessGuard>
        </div>
      </main>
      <MobileNav />
    </div>
  );
}
