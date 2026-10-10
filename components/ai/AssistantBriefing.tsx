"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Search, Sparkles } from "lucide-react";
import { buildAssistantBriefing, filterAssistantActions, type AssistantFocus } from "../../lib/assistantBriefing";
import { canAccessPath } from "../../lib/cloud/permissions";
import { useCloudIdentity } from "../../lib/cloud/useCloudIdentity";
import { useAiRemindersCollection, useCertificatesCollection, useInvoicesCollection, useJobsCollection, usePlannerCollection, usePricingDocumentsCollection, usePurchaseListsCollection } from "../../lib/cloud/coreBusinessCollections";
import { Card } from "../ui/Card";

const focuses: AssistantFocus[] = ["All", "Money", "Quotes", "Site", "Diary", "Reminders"];
const tones = { Now: "bg-rose-400/10 text-rose-200", Today: "bg-amber-400/10 text-amber-200", Next: "bg-cyan-400/10 text-cyan-200" };

export function AssistantBriefing() {
  const { identity, isReady, mode } = useCloudIdentity();
  if (!isReady) return <Card role="status">Checking your workspace…</Card>;
  const local = mode === "local" || (mode === "migration" && !identity);
  if (!local && !canAccessPath(identity?.role, "/ai/assistant", identity?.email)) {
    return <Card>JR AI is available to office accounts. <Link href="/app" className="text-cyan-300 underline">Open your workspace</Link></Card>;
  }
  // Remount collections, search and the clock before a different account can render.
  const scope = JSON.stringify([mode, identity?.organisationId, identity?.userId, identity?.role, identity?.customerSourceId]);
  return <AccountBriefing key={scope} />;
}

function AccountBriefing() {
  const jobs = useJobsCollection();
  const documents = usePricingDocumentsCollection();
  const invoices = useInvoicesCollection();
  const planner = usePlannerCollection();
  const purchases = usePurchaseListsCollection();
  const reminders = useAiRemindersCollection();
  const certificates = useCertificatesCollection();
  const [now, setNow] = useState(() => new Date());
  const [focus, setFocus] = useState<AssistantFocus>("All");
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(8);
  useEffect(() => {
    const update = () => setNow(new Date());
    const timer = window.setInterval(update, 60_000);
    window.addEventListener("focus", update);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", update); };
  }, []);
  const ready = [jobs, documents, invoices, planner, purchases, reminders, certificates].every((store) => store.isReady);
  const briefing = useMemo(() => buildAssistantBriefing({ jobs: jobs.items, documents: documents.items, invoices: invoices.items, planner: planner.items, purchases: purchases.items, reminders: reminders.items, certificates: certificates.items }, now), [jobs.items, documents.items, invoices.items, planner.items, purchases.items, reminders.items, certificates.items, now]);
  if (!ready) return <Card role="status">Gathering your jobs, quotes and diary…</Card>;
  const visible = filterAssistantActions(briefing.actions, focus, query);
  const urgent = briefing.actions.filter((action) => action.priority === "Now").length;
  function choose(next: AssistantFocus) { setFocus(next); setLimit(8); }

  return <section aria-label="Your next actions" className="space-y-4">
    <Card className="border-cyan-400/30 bg-gradient-to-br from-cyan-500/10 to-slate-900">
      <div className="flex items-start gap-3"><Sparkles aria-hidden="true" className="mt-1 size-6 shrink-0 text-cyan-300" /><div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wider text-cyan-300">Your next move</p>
        <h2 className="mt-1 text-2xl font-bold">{urgent ? `${urgent} ${urgent === 1 ? "action needs" : "actions need"} attention now` : briefing.actions.length ? `${briefing.actions.length} actions to review` : "No priority actions found"}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-300">Based on the records loaded for this account. Check sync status and recent changes before acting.</p>
      </div></div>
      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
        {([["What should I do next?", "All"], ["What needs chasing?", "Money"], ["Am I ready for site?", "Site"]] as const).map(([label, target]) => <button key={target} type="button" onClick={() => { choose(target); setQuery(""); }} className="min-h-12 rounded-xl border border-cyan-400/20 bg-slate-950/50 px-3 text-left text-sm font-semibold text-cyan-100 hover:bg-cyan-400/10 focus-visible:outline-2 focus-visible:outline-cyan-400">{label}</button>)}
      </div>
    </Card>

    <div role="group" aria-label="Focus the briefing" className="grid grid-cols-3 gap-2 sm:grid-cols-6">
      {focuses.map((item) => <button key={item} type="button" aria-pressed={focus === item} onClick={() => choose(item)} className={`min-h-12 rounded-xl border px-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-cyan-400 ${focus === item ? "border-cyan-400/50 bg-cyan-400/10 text-cyan-200" : "border-slate-800 bg-slate-900 text-slate-300"}`}>{item}<span className="ml-1 text-xs opacity-70">{item === "All" ? briefing.actions.length : briefing.actions.filter((action) => action.category === item).length}</span></button>)}
    </div>
    <label className="block">
      <span className="text-sm font-semibold">Find a job, quote or invoice</span>
      <span className="relative mt-2 block"><Search aria-hidden="true" className="pointer-events-none absolute left-3 top-3.5 size-5 text-slate-400" /><input type="search" maxLength={160} autoComplete="off" value={query} onChange={(event) => { setQuery(event.target.value); setLimit(8); }} placeholder="Search your next actions…" className="min-h-12 w-full rounded-xl border border-slate-700 bg-slate-950 pl-11 pr-3 text-base focus:border-cyan-400 focus:outline-none" /></span>
    </label>
    <p role="status" className="text-sm text-slate-400">{visible.length} {visible.length === 1 ? "action" : "actions"}{focus === "All" ? "" : ` in ${focus.toLowerCase()}`} · {briefing.today}</p>
    <div className="space-y-3">
      {visible.slice(0, limit).map((action, index) => <Card key={action.id} className={`min-w-0 ${index === 0 ? "border-cyan-400/30" : ""}`}>
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold"><span className={`rounded-full px-2.5 py-1 ${tones[action.priority]}`}>{action.priority}</span><span className="text-slate-400">{action.category}</span></div>
        <h3 className="mt-3 break-words text-lg font-bold">{action.title}</h3>
        <p className="mt-2 break-words text-sm leading-6 text-slate-300">{action.reason}</p>
        <p className="mt-3 text-sm leading-6 text-cyan-100">{action.nextStep}</p>
        <details className="mt-3 rounded-xl border border-slate-800 px-3">
          <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-slate-300">Why this appears</summary>
          <ul className="mb-3 list-disc space-y-2 break-words pl-4 text-sm text-slate-400">{action.evidence.map((fact, i) => <li key={i}>{fact}</li>)}</ul>
        </details>
        <Link href={action.href} className="mt-4 flex min-h-12 items-center justify-between gap-3 rounded-xl bg-cyan-400 px-4 py-3 text-sm font-bold text-slate-950 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-300">{action.actionLabel}<ArrowRight aria-hidden="true" className="size-4 shrink-0" /></Link>
      </Card>)}
      {!visible.length ? <Card><p className="font-semibold">{briefing.actions.length ? "No matching actions" : "Nothing flagged in the loaded records"}</p><p className="mt-2 text-sm text-slate-400">{briefing.actions.length ? "Try another focus or search term." : "Missing or unsynced records can change this view. You can still review the diary and create quotes below."}</p></Card> : null}
    </div>
    {visible.length > limit ? <button type="button" onClick={() => setLimit((value) => value + 8)} className="min-h-12 w-full rounded-xl border border-slate-700 text-sm font-semibold">Show more actions ({visible.length - limit} remaining)</button> : null}
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">{[["Build quote from notes", "/ai/quote-builder"], ["Open planner", "/planner"], ["Full AI Command Centre", "/ai"]].map(([label, href]) => <Link key={href} href={href} className="flex min-h-12 items-center rounded-xl border border-slate-700 px-4 text-sm font-semibold text-cyan-200">{label}</Link>)}</div>
    <p className="text-xs leading-5 text-slate-500">JR AI uses local rules to connect your saved records. Suggestions are read-only; it does not send messages or change records for you.</p>
  </section>;
}
