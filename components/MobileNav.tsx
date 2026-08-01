"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BriefcaseBusiness, Building2, Cloud, LayoutDashboard, Menu, Users } from "lucide-react";
import { canAccessPath } from "../lib/cloud/permissions";
import { useCloudIdentity } from "../lib/cloud/useCloudIdentity";

const mobileNavigation = [
  { label: "Home", href: "/", icon: LayoutDashboard },
  { label: "Customers", href: "/customers", icon: Users },
  { label: "Builders", href: "/builders", icon: Building2 },
  { label: "Jobs", href: "/jobs", icon: BriefcaseBusiness },
  { label: "More", href: "/menu", icon: Menu },
] as const;

export function MobileNav() {
  const pathname = usePathname();
  const { identity, mode } = useCloudIdentity();
  const unrestricted = mode === "local" || (mode === "migration" && !identity);
  const visible = mobileNavigation.filter((item) => item.href === "/menu" || unrestricted || canAccessPath(identity?.role, item.href));
  const navigation = identity?.role === "customer"
    ? [{ label: "Portal", href: "/customer-portal", icon: Users }, { label: "Account", href: "/cloud", icon: Cloud }]
    : visible;

  return (
    <nav
      aria-label="Primary mobile navigation"
      className={`fixed inset-x-0 bottom-0 z-40 grid border-t border-slate-800/90 bg-slate-950/95 px-1.5 pb-[max(.5rem,env(safe-area-inset-bottom))] pt-1.5 shadow-[0_-12px_32px_rgba(2,6,23,.55)] backdrop-blur-xl lg:hidden ${navigation.length === 2 ? "grid-cols-2" : "grid-cols-5"}`}
    >
      {navigation.map(({ label, href, icon: Icon }) => {
        const active = pathname === href || (href === "/menu" && !["/", "/customers", "/builders", "/jobs"].some((item) => pathname === item || (item !== "/" && pathname.startsWith(`${item}/`))));
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 py-1.5 text-[10px] font-semibold transition active:scale-[.98] ${active ? "bg-cyan-400/10 text-cyan-300" : "text-slate-500 hover:bg-slate-900 hover:text-slate-300"}`}
          >
            <Icon className="size-5 shrink-0" />
            <span className="max-w-full truncate">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
