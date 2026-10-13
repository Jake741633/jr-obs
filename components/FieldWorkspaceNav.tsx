"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const fieldLinks = [
  ["Today", "/field"],
  ["Day planner", "/field/day-planner"],
  ["Jobs", "/field/jobs"],
  ["Site diary", "/field/site-diary"],
  ["Materials", "/field/materials"],
  ["Supplier lookup", "/field/material-lookup"],
  ["Snags", "/field/snags"],
  ["QA", "/field/qa"],
  ["Testing", "/field/testing"],
] as const;

export function FieldWorkspaceNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Field workspace" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      {fieldLinks.map(([label, href]) => {
        const active = href === "/field" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`shrink-0 rounded-xl border px-3 py-2 text-xs font-semibold transition ${active ? "border-cyan-400/50 bg-cyan-400/10 text-cyan-200" : "border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700 hover:text-slate-200"}`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
