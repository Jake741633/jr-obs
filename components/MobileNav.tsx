"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { primaryNavigation } from "./navigation";

export function MobileNav() {
  const pathname = usePathname();
  return <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-slate-800 bg-slate-950/95 px-2 pb-[max(.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur lg:hidden">{primaryNavigation.map(({ label, href, icon: Icon }) => { const active = pathname === href; return <Link key={href} href={href} className={`flex min-w-0 flex-col items-center gap-1 rounded-xl py-2 text-[10px] font-medium ${active ? "text-cyan-300" : "text-slate-500"}`}><Icon className="size-5" /><span className="max-w-full truncate">{label === "Command Centre" ? "Home" : label}</span></Link>; })}</nav>;
}
