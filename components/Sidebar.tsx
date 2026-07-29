"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Zap } from "lucide-react";
import { primaryNavigation, secondaryNavigation } from "./navigation";

export default function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 flex-col border-r border-slate-800 bg-slate-950/95 px-5 py-6 backdrop-blur lg:flex">
      <div className="flex items-center gap-3 px-2">
        <span className="grid size-11 place-items-center rounded-2xl bg-cyan-400 text-slate-950"><Zap className="size-6" /></span>
        <div><p className="text-xl font-black tracking-tight text-white">JR OS</p><p className="text-xs text-slate-500">Electrical business suite</p></div>
      </div>
      <nav className="mt-8 space-y-1">
        {primaryNavigation.slice(0, 4).map(({ label, href, icon: Icon }) => {
          const active = pathname === href;
          return <Link key={href} href={href} className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition ${active ? "bg-cyan-400 text-slate-950" : "text-slate-400 hover:bg-slate-900 hover:text-white"}`}><Icon className="size-5" />{label}</Link>;
        })}
      </nav>
      <div className="my-5 border-t border-slate-800" />
      <p className="px-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">Workspace</p>
      <nav className="mt-2 grid gap-1">
        {secondaryNavigation.map(([label, href]) => <Link key={href} href={href} className="rounded-xl px-3 py-2 text-sm text-slate-400 transition hover:bg-slate-900 hover:text-white">{label}</Link>)}
      </nav>
      <div className="mt-auto">
        <Link href="/settings" className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900 px-3 py-3 text-sm text-slate-300"><span className="grid size-9 place-items-center rounded-full bg-slate-800 font-bold text-cyan-400">JR</span><span className="flex-1"><strong className="block text-white">Jake Rinaldi</strong><span className="text-xs text-slate-500">Owner</span></span></Link>
      </div>
    </aside>
  );
}
