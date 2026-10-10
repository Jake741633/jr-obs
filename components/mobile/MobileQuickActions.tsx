"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { ArrowRight, Plus, X } from "lucide-react";
import { canAccessPath } from "../../lib/cloud/permissions";
import { useCloudIdentity } from "../../lib/cloud/useCloudIdentity";

const officeActions = [
  ["Quick quote", "Build a fixed-price draft", "/quotes/mobile"],
  ["JR AI", "See your next action", "/ai/assistant"],
  ["Customers", "Find details and recent work", "/customers"],
  ["Surveys", "Capture or review a survey", "/surveys"],
  ["Planner", "Check upcoming visits", "/planner"],
  ["Job control", "Open jobs ready for site", "/field/jobs"],
] as const;
const fieldActions = [
  ["My day", "Visits and travel details", "/field/day-planner"],
  ["My jobs", "Open assigned job workspaces", "/field/jobs"],
  ["Site diary", "Capture today's progress", "/field/site-diary"],
  ["Materials", "Check what is needed", "/field/materials"],
  ["Testing", "Capture circuit results", "/field/testing"],
  ["Snags", "Record and review site snags", "/field/snags"],
] as const;

export function MobileQuickActions() {
  const { identity, isReady, mode } = useCloudIdentity();
  if (!isReady || identity?.role === "customer") return null;
  const unrestricted = mode === "local" || (mode === "migration" && !identity);
  const actions = (identity?.role === "electrician" ? fieldActions : officeActions).filter(([, , href]) => unrestricted || canAccessPath(identity?.role, href, identity?.email));
  if (!actions.length) return null;
  return <ActionSheet key={JSON.stringify([mode, identity?.organisationId, identity?.userId, identity?.role, identity?.customerSourceId])} actions={actions} />;
}

function ActionSheet({ actions }: { actions: ReadonlyArray<readonly [string, string, string]> }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const pathname = usePathname();
  useEffect(() => { dialog.current?.close(); }, [pathname]);
  return <>
    <button type="button" aria-label="Quick actions" aria-haspopup="dialog" onClick={() => dialog.current?.showModal()} className="grid min-h-11 min-w-11 place-items-center rounded-xl bg-cyan-400 text-slate-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300 lg:hidden"><Plus aria-hidden="true" className="size-5" /></button>
    <dialog ref={dialog} aria-labelledby="quick-actions-title" onClick={(event) => { if (event.target === event.currentTarget) dialog.current?.close(); }} className="mobile-safe-inline fixed inset-x-0 bottom-0 top-auto m-auto mb-0 max-h-[85dvh] w-full max-w-lg overflow-y-auto overscroll-contain rounded-t-3xl border border-slate-700 bg-slate-950 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-white shadow-2xl backdrop:bg-slate-950/75">
      <div>
        <div className="flex items-center justify-between gap-3"><h2 id="quick-actions-title" className="text-xl font-bold">Quick actions</h2><button type="button" aria-label="Close quick actions" onClick={() => dialog.current?.close()} className="grid min-h-11 min-w-11 place-items-center rounded-xl border border-slate-700 focus-visible:outline-2 focus-visible:outline-cyan-400"><X aria-hidden="true" className="size-5" /></button></div>
        <p className="mt-1 text-sm text-slate-400">Go straight to the task you need.</p>
        <div className="mt-4 grid grid-cols-2 gap-2">{actions.map(([label, detail, href]) => <Link key={href} href={href} onClick={() => dialog.current?.close()} className="min-w-0 rounded-2xl border border-slate-800 bg-slate-900 p-3 focus-visible:outline-2 focus-visible:outline-cyan-400"><span className="flex min-h-8 items-center justify-between gap-2 text-sm font-bold text-cyan-100">{label}<ArrowRight aria-hidden="true" className="size-4 shrink-0" /></span><span className="mt-1 block text-xs leading-5 text-slate-400">{detail}</span></Link>)}</div>
        <Link href="/menu" onClick={() => dialog.current?.close()} className="mt-3 flex min-h-12 items-center justify-center rounded-xl border border-slate-700 text-sm font-semibold">All workspaces</Link>
      </div>
    </dialog>
  </>;
}
