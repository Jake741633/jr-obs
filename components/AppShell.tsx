import type { ReactNode } from "react";
import Sidebar from "./Sidebar";
import { MobileNav } from "./MobileNav";

export function AppShell({ children }: { children: ReactNode }) {
  return <div className="min-h-screen bg-slate-950 text-white"><Sidebar /><main className="min-h-screen pb-24 lg:ml-72 lg:pb-0"><div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</div></main><MobileNav /></div>;
}
