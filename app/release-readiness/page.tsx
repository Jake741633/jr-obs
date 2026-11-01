"use client";

import Link from "next/link";
import { CheckCircle2, Circle, CloudCog, ExternalLink, RotateCcw, ShieldCheck, Smartphone, TestTube2 } from "lucide-react";
import { Card } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";
import { useCloudIdentity } from "../../lib/cloud/useCloudIdentity";
import { useLocalStorageCollection } from "../../lib/storage";
import { reconcileReleaseEvidence, releaseEvidence, releaseModeGuidance, RELEASE_REQUIREMENTS_VERSION, RELEASE_REVIEW_STORAGE_KEY, type ReleaseEvidence } from "../../lib/releaseReadiness";

export default function ReleaseReadinessPage() {
  const { mode, isReady: identityReady } = useCloudIdentity();
  const evidence = useLocalStorageCollection<ReleaseEvidence>(RELEASE_REVIEW_STORAGE_KEY, []);
  const checks = reconcileReleaseEvidence(mode, evidence.items);
  const complete = checks.filter((item) => item.complete).length;
  const percentage = Math.round((complete / checks.length) * 100);
  const reviewComplete = complete === checks.length;
  const guidance = releaseModeGuidance[mode];

  function toggle(id: string) {
    evidence.setItems((current) => {
      const check = reconcileReleaseEvidence(mode, current).find((item) => item.id === id);
      if (!check) return current;
      return [...current.filter((item) => item?.id !== id), releaseEvidence(mode, check, !check.complete)];
    });
  }

  if (!identityReady || !evidence.isReady) return <Card>Preparing release checklist…</Card>;

  return <main className="space-y-6">
    <PageHeader
      eyebrow="Operator release review"
      title="Release readiness review"
      description="Record the checks reviewed for the intended release. Manual confirmations do not run tests, verify a deployment or authorise production changes."
      action={<button type="button" onClick={() => evidence.setItems([])} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 text-sm font-semibold hover:bg-slate-800"><RotateCcw className="size-4" />Reset confirmations</button>}
    />

    <section className="grid gap-4 md:grid-cols-3">
      <Card className={reviewComplete ? "border-cyan-400/30" : "border-amber-400/30"}>
        <ShieldCheck className={`size-6 ${reviewComplete ? "text-cyan-300" : "text-amber-300"}`} />
        <p className="mt-3 text-sm text-slate-400">Manual review status</p>
        <p className="mt-2 text-2xl font-bold">{reviewComplete ? "Review recorded" : "Review outstanding"}</p>
        <p className="mt-2 text-sm text-slate-400">Deployment acceptance still needs the underlying evidence.</p>
      </Card>
      <Card><TestTube2 className="size-6 text-cyan-300" /><p className="mt-3 text-sm text-slate-400">Confirmations recorded</p><p className="mt-2 text-3xl font-bold">{complete}/{checks.length}</p></Card>
      <Card><Smartphone className="size-6 text-cyan-300" /><p className="mt-3 text-sm text-slate-400">Review progress</p><p className="mt-2 text-3xl font-bold">{percentage}%</p></Card>
    </section>

    <Card className="border-cyan-400/20">
      <div className="flex items-start gap-3"><CloudCog className="mt-0.5 size-6 shrink-0 text-cyan-300" /><div><h2 className="font-bold">{guidance.title}</h2><p className="mt-1 text-sm leading-6 text-slate-400">{guidance.detail}</p><p className="mt-2 text-sm text-slate-400">The configured mode is not an acceptance result. Physical phone checks and production backup/restore evidence must be reviewed separately.</p></div></div>
    </Card>

    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-bold">Release checks</h2><p className="mt-1 max-w-3xl text-sm text-slate-400">Confirm only checks you have reviewed for this release. Earlier v0.1 ticks are not carried forward. A changed requirement or mode requires a new confirmation. Reset confirmations when reviewing a different release candidate.</p></div><span className="rounded-full bg-slate-800 px-3 py-1 text-sm font-semibold text-cyan-300">Requirements v{RELEASE_REQUIREMENTS_VERSION}</span></div>
      <div className="mt-5 space-y-3">
        {checks.map((item) => <button key={item.id} type="button" aria-pressed={item.complete} onClick={() => toggle(item.id)} className="flex min-h-11 w-full items-start gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-left hover:border-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400">
          {item.complete ? <CheckCircle2 aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-emerald-300" /> : <Circle aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-slate-600" />}
          <span><strong className={item.complete ? "text-slate-300" : "text-white"}>{item.title}</strong><span className="mt-1 block text-sm leading-6 text-slate-400">{item.detail}</span>{item.reviewedAt ? <span className="mt-2 block text-xs text-cyan-300">Review recorded <time dateTime={item.reviewedAt}>{new Date(item.reviewedAt).toLocaleString("en-GB")}</time></span> : null}</span>
        </button>)}
      </div>
    </Card>

    <Card>
      <h2 className="text-lg font-bold">Evidence and next steps</h2>
      <p className="mt-2 text-sm leading-6 text-slate-400">Review the exact commit and preview checks, the relevant recovery evidence and physical-device results before release. Verify the published version after deployment. A production schema upgrade requires its separately reviewed backup, restore and explicit authorisation.</p>
      <div className="mt-4 flex flex-wrap gap-x-6 gap-y-3 text-sm font-semibold text-cyan-300">
        <Link href="/cloud" className="inline-flex min-h-11 items-center gap-2">Account and browser backups <ExternalLink className="size-4" /></Link>
        <Link href="/cloud#install-app" className="inline-flex min-h-11 items-center gap-2">Phone installation instructions <Smartphone className="size-4" /></Link>
        {mode !== "local" ? <Link href="/cloud/cutover" className="inline-flex min-h-11 items-center gap-2">Cloud cutover report <ExternalLink className="size-4" /></Link> : null}
        <a href="https://github.com/Jake741633/jr-obs/blob/jr-os-v2/docs/security/supabase-upgrade-rehearsal-2026-09-19.md" className="inline-flex min-h-11 items-center gap-2">Production recovery requirements <ExternalLink className="size-4" /></a>
        <a href="https://github.com/Jake741633/jr-obs/blob/jr-os-v2/docs/security/supabase-full-stack-rehearsal-2026-09-19.md" className="inline-flex min-h-11 items-center gap-2">Full Supabase rehearsal evidence <ExternalLink className="size-4" /></a>
      </div>
    </Card>
  </main>;
}
