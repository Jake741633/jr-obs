"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Zap } from "lucide-react";
import { canAccessPath, isOperatorOnlyPath } from "../lib/cloud/permissions";
import { useCloudIdentity } from "../lib/cloud/useCloudIdentity";
import { primaryNavigation, secondaryNavigation } from "./navigation";

function navigationItemIsActive(pathname: string, href: string) {
  return href === "/"
    ? pathname === "/"
    : pathname === href || pathname.startsWith(`${href}/`);
}

export default function Sidebar() {
  const pathname = usePathname();
  const { identity, mode } = useCloudIdentity();
  const unrestricted = mode === "local" || (mode === "migration" && !identity);
  const permitted = (href: string) => {
    if (href === "/cloud") return true;
    if (isOperatorOnlyPath(href)) return canAccessPath(identity?.role, href, identity?.email);
    return unrestricted || canAccessPath(identity?.role, href, identity?.email);
  };
  const primary = primaryNavigation.slice(0, 4).filter((item) => permitted(item.href));
  const secondary = secondaryNavigation.filter(([, href]) => permitted(href));

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 flex-col border-r border-slate-800 bg-slate-950/95 px-5 py-6 backdrop-blur lg:flex">
      <div className="flex items-center gap-3 px-2"><span className="grid size-11 place-items-center rounded-2xl bg-cyan-400 text-slate-950"><Zap className="size-6" /></span><div><div className="flex items-center gap-2"><p className="text-xl font-black tracking-tight text-white">JR OS</p><span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-cyan-300">Beta</span></div><p className="text-xs text-slate-500">v0.1 · Internal business suite</p></div></div>

      <nav className="mt-8 space-y-1">{primary.map(({ label, href, icon: Icon }) => { const active = navigationItemIsActive(pathname, href); return <Link key={href} href={href} className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition ${active ? "bg-cyan-400 text-slate-950" : "text-slate-400 hover:bg-slate-900 hover:text-white"}`}><Icon className="size-5" />{label}</Link>; })}</nav>

      <div className="my-5 border-t border-slate-800" /><p className="px-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">Workspace</p>
      <nav className="mt-2 grid min-h-0 flex-1 gap-1 overflow-y-auto pr-1">{secondary.map(([label, href]) => { const active = navigationItemIsActive(pathname, href); return <Link key={href} href={href} className={`rounded-xl px-3 py-2 text-sm transition ${active ? "bg-slate-800 text-cyan-300" : "text-slate-400 hover:bg-slate-900 hover:text-white"}`}>{label}</Link>; })}</nav>

      <div className="pt-4"><Link href="/cloud" className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900 px-3 py-3 text-sm text-slate-300"><span className="grid size-9 place-items-center rounded-full bg-slate-800 font-bold text-cyan-400">JR</span><span className="flex-1"><strong className="block text-white">{identity?.email || "JR OS local user"}</strong><span className="text-xs capitalize text-slate-500">{identity?.role || `${mode} mode`}</span></span></Link></div>
    </aside>
  );
}
