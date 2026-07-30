"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { LockKeyhole } from "lucide-react";
import { canAccessPath } from "../lib/cloud/permissions";
import { useCloudIdentity } from "../lib/cloud/useCloudIdentity";

export function CloudAccessGuard({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { identity, isReady, mode } = useCloudIdentity();

  if (mode === "local" || pathname === "/cloud") return children;
  if (!isReady) return <div className="grid min-h-[50vh] place-items-center text-sm text-slate-400">Checking cloud access…</div>;
  if (mode === "migration" && !identity) return children;

  if (!identity) {
    return <div className="grid min-h-[60vh] place-items-center"><div className="max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 text-center"><LockKeyhole className="mx-auto size-8 text-cyan-300" /><h1 className="mt-4 text-2xl font-bold">Cloud sign-in required</h1><p className="mt-2 text-sm text-slate-400">JR OS is in cloud mode. Sign in before opening business records.</p><Link href="/cloud" className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-cyan-400 px-4 text-sm font-semibold text-slate-950">Open Cloud & Account</Link></div></div>;
  }

  if (!canAccessPath(identity.role, pathname)) {
    return <div className="grid min-h-[60vh] place-items-center"><div className="max-w-md rounded-2xl border border-amber-500/30 bg-slate-900 p-6 text-center"><LockKeyhole className="mx-auto size-8 text-amber-300" /><h1 className="mt-4 text-2xl font-bold">Page not permitted</h1><p className="mt-2 text-sm text-slate-400">Your {identity.role} role does not have permission to open this JR OS page.</p><Link href={identity.role === "customer" ? "/customer-portal" : "/"} className="mt-5 inline-flex min-h-11 items-center rounded-xl border border-slate-700 px-4 text-sm font-semibold">Return to permitted workspace</Link></div></div>;
  }

  return children;
}
