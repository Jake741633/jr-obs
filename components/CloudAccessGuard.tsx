"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment, type ReactNode } from "react";
import { LockKeyhole } from "lucide-react";
import { canAccessPath, isOperatorOnlyPath, roleDeniedRouteHandoff, roleLandingPath } from "../lib/cloud/permissions";
import { useCloudIdentity } from "../lib/cloud/useCloudIdentity";

export function CloudAccessGuard({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { identity, isReady } = useCloudIdentity();

  // The account route must remain reachable before a full organisation profile
  // has resolved. Recovery callbacks are handled by PasswordRecoveryGate before
  // this workspace guard renders.
  if (pathname === "/cloud") return children;
  if (!isReady) return <div className="grid min-h-[50vh] place-items-center text-sm text-slate-400">Checking secure account access…</div>;

  if (!identity) {
    return <div className="grid min-h-[60vh] place-items-center"><div className="max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 text-center"><LockKeyhole className="mx-auto size-8 text-cyan-300" /><h1 className="mt-4 text-2xl font-bold">Sign in required</h1><p className="mt-2 text-sm text-slate-400">Create an account or sign in before opening JR OS business records on this browser or device.</p><Link href="/cloud" className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-cyan-400 px-4 text-sm font-semibold text-slate-950">Sign in or create account</Link></div></div>;
  }

  if (!canAccessPath(identity.role, pathname, identity.email)) {
    const operatorOnly = isOperatorOnlyPath(pathname);
    const handoff = roleDeniedRouteHandoff(identity.role, pathname);
    const title = handoff?.title ?? "Page not permitted";
    const description = handoff?.description ?? (operatorOnly
      ? "This operational JR OS page is restricted to the authorised platform operator."
      : `Your ${identity.role} role does not have permission to open this JR OS page.`);
    return <div className="grid min-h-[60vh] place-items-center"><div className="max-w-md rounded-2xl border border-amber-500/30 bg-slate-900 p-6 text-center"><LockKeyhole className="mx-auto size-8 text-amber-300" /><h1 className="mt-4 text-2xl font-bold">{title}</h1><p className="mt-2 text-sm text-slate-400">{description}</p><Link href={handoff?.href ?? roleLandingPath(identity.role)} className="mt-5 inline-flex min-h-11 items-center rounded-xl border border-slate-700 px-4 text-sm font-semibold">{handoff?.actionLabel ?? "Return to permitted workspace"}</Link></div></div>;
  }

  const workspaceIdentityKey = JSON.stringify([
    identity.organisationId,
    identity.userId,
    identity.role,
    identity.customerSourceId ?? "",
    identity.email?.trim().toLowerCase() ?? "",
  ]);
  return <Fragment key={workspaceIdentityKey}>{children}</Fragment>;
}
