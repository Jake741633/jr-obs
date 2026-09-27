import type { ReactNode } from "react";
import { CloudAccessGuard } from "./CloudAccessGuard";
import { AppHeader } from "./AppHeader";
import Sidebar from "./Sidebar";
import { MobileNav } from "./MobileNav";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh overflow-x-hidden bg-slate-950 text-white">
      <Sidebar />
      <AppHeader />
      <main className="min-h-dvh pb-[calc(5.75rem+env(safe-area-inset-bottom))] pt-[calc(4rem+env(safe-area-inset-top))] lg:ml-72 lg:pb-0 lg:pt-0">
        <div className="app-content mx-auto w-full max-w-7xl px-3 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
          <CloudAccessGuard>{children}</CloudAccessGuard>
        </div>
      </main>
      <MobileNav />
    </div>
  );
}
