"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BriefcaseBusiness, Building2, LayoutDashboard, Menu, Users } from "lucide-react";

const mobileNavigation = [
  { label: "Home", href: "/", icon: LayoutDashboard },
  { label: "Customers", href: "/customers", icon: Users },
  { label: "Builders", href: "/builders", icon: Building2 },
  { label: "Jobs", href: "/jobs", icon: BriefcaseBusiness },
  { label: "More", href: "/menu", icon: Menu },
] as const;

export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-slate-800 bg-slate-950/95 px-2 pb-[max(.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur lg:hidden">
      {mobileNavigation.map(({ label, href, icon: Icon }) => {
        const active = pathname === href || (href === "/menu" && !["/", "/customers", "/builders", "/jobs"].some((item) => pathname === item || (item !== "/" && pathname.startsWith(`${item}/`))));
        return (
          <Link key={href} href={href} className={`flex min-w-0 flex-col items-center gap-1 rounded-xl py-2 text-[10px] font-medium ${active ? "text-cyan-300" : "text-slate-500"}`}>
            <Icon className="size-5" />
            <span className="max-w-full truncate">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
