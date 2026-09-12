"use client";

import Link from "next/link";
import { CheckCircle2, Circle, CloudOff, ExternalLink, RotateCcw, ShieldCheck, Smartphone, TestTube2 } from "lucide-react";
import { Card } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";
import { useLocalStorageCollection } from "../../lib/storage";

type ReleaseCheck = {
  id: string;
  title: string;
  detail: string;
  complete: boolean;
};

const initialChecks: ReleaseCheck[] = [
  { id: "ci", title: "Latest GitHub Action is green", detail: "Confirm lint and production build both complete successfully on jr-os-v2.", complete: false },
  { id: "desktop", title: "Desktop navigation checked", detail: "Open every sidebar link on a laptop and confirm there are no blank pages or errors.", complete: false },
  { id: "mobile", title: "Mobile navigation checked", detail: "Check the main workflow on a phone, including forms, tables and the bottom navigation.", complete: false },
  { id: "customer", title: "Customer workflow tested", detail: "Create, edit, reopen and delete a dummy customer.", complete: false },
  { id: "job", title: "Job workflow tested", detail: "Create a dummy job, link a customer and confirm it remains after refresh.", complete: false },
  { id: "quote", title: "Quote workflow tested", detail: "Create a quote with labour and materials, reopen it and run AI Quote Review.", complete: false },
  { id: "invoice", title: "Invoice workflow tested", detail: "Create an invoice, record a part payment and confirm the outstanding balance.", complete: false },
  { id: "technical", title: "Technical records tested", detail: "Create a survey, RAMS record and certificate linked to a dummy job.", complete: false },
  { id: "backup", title: "Backup exported and checked", detail: "Download a JR OS JSON backup before merging or entering live records.", complete: false },
  { id: "privacy", title: "Internal beta limitations accepted", detail: "Confirm data is currently browser-local and is not synced between phone and laptop.", complete: false },
];

export default function ReleaseReadinessPage() {
  const checks = useLocalStorageCollection<ReleaseCheck>("jr-os-release-readiness-v0-1", initialChecks);
  const complete = checks.items.filter((item) => item.complete).length;
  const percentage = checks.items.length ? Math.round((complete / checks.items.length) * 100) : 0;
  const readyToMerge = complete === checks.items.length && checks.items.length > 0;

  function toggle(id: string) {
    checks.setItems((current) => current.map((item) => item.id === id ? { ...item, complete: !item.complete } : item));
  }

  function reset() {
    checks.setItems(initialChecks);
  }

  if (!checks.isReady) return <Card>Preparing release checklist…</Card>;

  return <main className="space-y-6">
    <PageHeader
      eyebrow="JR OS v0.1"
      title="Internal beta release readiness"
      description="Complete this controlled check before merging jr-os-v2 into main and publishing the first internal beta."
      action={<button type="button" onClick={reset} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 text-sm font-semibold hover:bg-slate-800"><RotateCcw className="size-4" />Reset checks</button>}
    />

    <section className="grid gap-4 md:grid-cols-3">
      <Card className={readyToMerge ? "border-emerald-400/30" : "border-amber-400/30"}>
        <ShieldCheck className={`size-6 ${readyToMerge ? "text-emerald-300" : "text-amber-300"}`} />
        <p className="mt-3 text-sm text-slate-400">Release status</p>
        <p className="mt-2 text-2xl font-bold">{readyToMerge ? "Ready to merge" : "Testing required"}</p>
      </Card>
      <Card><TestTube2 className="size-6 text-cyan-300" /><p className="mt-3 text-sm text-slate-400">Checklist complete</p><p className="mt-2 text-3xl font-bold">{complete}/{checks.items.length}</p></Card>
      <Card><Smartphone className="size-6 text-cyan-300" /><p className="mt-3 text-sm text-slate-400">Progress</p><p className="mt-2 text-3xl font-bold">{percentage}%</p></Card>
    </section>

    <Card className="border-red-400/20">
      <div className="flex items-start gap-3"><CloudOff className="mt-0.5 size-6 shrink-0 text-red-300" /><div><h2 className="font-bold">Browser-local beta</h2><p className="mt-1 text-sm leading-6 text-slate-400">Publishing this version does not yet create cloud sync. Records entered on one device will not automatically appear on another. Export backups regularly and keep official certificates and financial records in their existing systems until cloud storage is connected.</p></div></div>
    </Card>

    <Card>
      <div className="flex items-center justify-between gap-3"><div><h2 className="text-xl font-bold">Release checks</h2><p className="text-sm text-slate-500">Tap an item only after you have genuinely tested it.</p></div><span className="rounded-full bg-slate-800 px-3 py-1 text-sm font-semibold text-cyan-300">v0.1 internal beta</span></div>
      <div className="mt-5 space-y-3">
        {checks.items.map((item) => <button key={item.id} type="button" onClick={() => toggle(item.id)} className="flex w-full items-start gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-left hover:border-slate-700">
          {item.complete ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-300" /> : <Circle className="mt-0.5 size-5 shrink-0 text-slate-600" />}
          <span><strong className={item.complete ? "text-slate-300" : "text-white"}>{item.title}</strong><span className="mt-1 block text-sm leading-6 text-slate-500">{item.detail}</span></span>
        </button>)}
      </div>
    </Card>

    <Card>
      <h2 className="text-lg font-bold">Merge and publish sequence</h2>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-xl bg-slate-950 p-4"><p className="text-xs font-bold uppercase tracking-wider text-cyan-300">1 · Protect</p><p className="mt-2 text-sm text-slate-400">Export a backup and confirm the final jr-os-v2 workflow is green.</p></div>
        <div className="rounded-xl bg-slate-950 p-4"><p className="text-xs font-bold uppercase tracking-wider text-cyan-300">2 · Merge</p><p className="mt-2 text-sm text-slate-400">Open a pull request from jr-os-v2 into main, review the summary and merge only after checks pass.</p></div>
        <div className="rounded-xl bg-slate-950 p-4"><p className="text-xs font-bold uppercase tracking-wider text-cyan-300">3 · Verify</p><p className="mt-2 text-sm text-slate-400">Let Netlify deploy main, then repeat a phone and laptop smoke test on the published URL.</p></div>
      </div>
      <Link href="/cloud" className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-cyan-300">Open backup and account tools <ExternalLink className="size-4" /></Link>
    </Card>
  </main>;
}
