"use client";

import Link from "next/link";
import { AlertTriangle, ClipboardCheck } from "lucide-react";
import { Card } from "./ui/Card";
import { useFieldElectricalTestingCollection } from "../lib/cloud/coreBusinessCollections";
import { useLocalStorageCollection } from "../lib/storage";
import type { Job } from "../lib/models";
import { testingProgress, validateTestingRecord } from "../lib/electricalTesting";

export function MobileTestingProgress({ activeJobId }: { activeJobId?: string }) {
  const records = useFieldElectricalTestingCollection();
  const jobs = useLocalStorageCollection<Job>("jr-os-jobs");
  if (!records.isReady || !jobs.isReady) return <Card>Loading testing progress…</Card>;

  const relevant = activeJobId
    ? records.items.filter((record) => record.jobId === activeJobId)
    : records.items.filter((record) => record.status !== "Complete");
  const latest = relevant.toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  const job = latest ? jobs.items.find((item) => item.id === latest.jobId) : undefined;
  const warnings = latest ? validateTestingRecord(latest) : [];

  return <Card className="border-cyan-400/20">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex items-start gap-3">
        <ClipboardCheck className="mt-0.5 size-5 text-cyan-300" />
        <div><h2 className="font-bold">Electrical testing</h2><p className="mt-1 text-sm text-slate-400">{latest ? `${job?.title ?? "Active job"} · ${testingProgress(latest)}% complete` : "No testing draft started for the active work."}</p></div>
      </div>
      <Link href="/field/testing" className="rounded-xl border border-slate-700 px-3 py-2 text-sm font-semibold text-slate-200 hover:border-cyan-400/50">{latest ? "Resume testing" : "Start testing"}</Link>
    </div>
    {latest ? <div className="mt-4 grid gap-3 sm:grid-cols-3"><div className="rounded-xl bg-slate-950/60 p-3"><p className="text-xs text-slate-500">Circuits</p><p className="mt-1 text-xl font-bold">{latest.circuits.length}</p></div><div className="rounded-xl bg-slate-950/60 p-3"><p className="text-xs text-slate-500">Outstanding actions</p><p className="mt-1 text-xl font-bold">{latest.outstandingActions.length}</p></div><div className="rounded-xl bg-slate-950/60 p-3"><p className="text-xs text-slate-500">Review prompts</p><p className="mt-1 text-xl font-bold text-amber-300">{warnings.length}</p></div></div> : null}
    {latest?.outstandingActions.length ? <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3"><p className="flex items-center gap-2 text-sm font-semibold text-amber-200"><AlertTriangle className="size-4" />Outstanding testing actions</p><ul className="mt-2 space-y-1 text-sm text-amber-100">{latest.outstandingActions.slice(0, 3).map((action) => <li key={action}>• {action}</li>)}</ul></div> : null}
  </Card>;
}
