"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import {
  ArrowLeft,
  BookOpenText,
  Building2,
  CalendarDays,
  CheckSquare2,
  ClipboardList,
  FileText,
  Gauge,
  MapPin,
  Phone,
  ReceiptText,
  UserRound,
  Wrench,
} from "lucide-react";
import { Button } from "../../../../components/ui/Button";
import { Card } from "../../../../components/ui/Card";
import { StatusBadge } from "../../../../components/ui/StatusBadge";
import {
  useBuildersCollection,
  useCustomersCollection,
  useJobDocumentsCollection,
  useJobProgressCollection,
  useJobsCollection,
  useJobTasksCollection,
  useJobTimelineCollection,
  useJobVariationsCollection,
  useSiteDiariesCollection,
  useTeamCollection,
} from "../../../../lib/cloud/coreBusinessCollections";
import { canonicalJobStatuses, transitionJobStatus } from "../../../../lib/jobManagement-core.mjs";
import { normaliseJobProgress } from "../../../../lib/jobProgress-core.mjs";
import { jobTaskCounts } from "../../../../lib/jobTasks-core.mjs";
import { makeId } from "../../../../lib/storage";
import type { CanonicalJobStatus, JobProgressMetrics, JobTimelineEntry } from "../../../../lib/models";

const money = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });

function quickLink(href: string, label: string, detail: string, icon: typeof FileText) {
  const Icon = icon;
  return <Link href={href} className="flex min-h-20 items-center gap-3 rounded-2xl border border-slate-800 bg-slate-950/50 p-4 transition hover:border-cyan-500/30 hover:bg-slate-900">
    <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-cyan-500/10 text-cyan-300"><Icon className="size-5" /></span>
    <span className="min-w-0"><span className="block font-semibold text-slate-100">{label}</span><span className="mt-1 block text-xs text-slate-500">{detail}</span></span>
  </Link>;
}

function progressBar(label: string, value: number) {
  return <div><div className="flex items-center justify-between gap-3 text-sm"><span className="font-medium text-slate-300">{label}</span><span className="font-semibold text-cyan-200">{value}%</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-cyan-400" style={{ width: `${value}%` }} /></div></div>;
}

export default function JobWorkspacePage() {
  const params = useParams<{ id: string }>();
  const jobId = params.id;
  const jobs = useJobsCollection();
  const customers = useCustomersCollection();
  const builders = useBuildersCollection();
  const team = useTeamCollection();
  const tasks = useJobTasksCollection();
  const diaries = useSiteDiariesCollection();
  const variations = useJobVariationsCollection();
  const documents = useJobDocumentsCollection();
  const progress = useJobProgressCollection();
  const timeline = useJobTimelineCollection();
  const [selectedStatus, setSelectedStatus] = useState<CanonicalJobStatus>("Enquiry");
  const [statusMessage, setStatusMessage] = useState("");

  const ready = [jobs, customers, builders, team, tasks, diaries, variations, documents, progress, timeline].every((store) => store.isReady);
  if (!ready) return <Card>Loading job workspace…</Card>;

  const job = jobs.items.find((item) => item.id === jobId);
  if (!job) return <main className="space-y-6"><Link href="/jobs" className="inline-flex items-center gap-2 text-sm text-cyan-300"><ArrowLeft className="size-4" />Back to jobs</Link><Card><h1 className="text-xl font-bold">Job not found</h1><p className="mt-2 text-sm text-slate-400">This job may have been removed or the link is no longer available.</p></Card></main>;

  const customer = customers.items.find((item) => item.id === job.customerId);
  const builder = builders.items.find((item) => item.id === job.builderId);
  const assigned = team.items.filter((member) => job.assignedTo?.includes(member.id));
  const counts = jobTaskCounts(tasks.items, jobId);
  const jobDiaries = diaries.items.filter((item) => item.jobId === jobId);
  const jobVariations = variations.items.filter((item) => item.jobId === jobId);
  const acceptedVariationValue = jobVariations.filter((item) => ["Accepted", "Approved", "Invoiced"].includes(item.status)).reduce((sum, item) => sum + (item.fixedPrice ?? item.labourHours * item.labourRate + item.materialCharge + item.otherCharge), 0);
  const jobDocuments = documents.items.filter((item) => item.jobId === jobId);
  const progressRecord = progress.items.find((item) => item.jobId === jobId);
  const progressValue = normaliseJobProgress(progressRecord?.manual ?? {}) as JobProgressMetrics;
  const recentActivity = timeline.items.filter((item) => item.jobId === jobId).toSorted((a, b) => b.completedAt.localeCompare(a.completedAt)).slice(0, 5);
  const currentStatus = canonicalJobStatuses.includes(job.status) ? job.status as CanonicalJobStatus : "Enquiry";

  function updateStatus() {
    if (!job) return;
    const nextStatus = selectedStatus === "Enquiry" && currentStatus !== "Enquiry" ? currentStatus : selectedStatus;
    if (nextStatus === currentStatus) { setStatusMessage("Choose a different status before saving."); return; }
    const now = new Date().toISOString();
    const result = transitionJobStatus({ job, nextStatus, now, timelineId: makeId("timeline"), completedBy: "JR OS mobile workspace" });
    jobs.setItems((current) => current.map((item) => item.id === job.id ? result.job : item));
    if (result.timelineEntry) {
      const entry = result.timelineEntry as JobTimelineEntry;
      timeline.setItems((current) => [entry, ...current]);
    }
    setSelectedStatus(nextStatus);
    setStatusMessage(`Job status updated to ${nextStatus}.`);
  }

  return <main className="space-y-6 pb-28">
    <Link href={`/jobs/${jobId}`} className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-cyan-300"><ArrowLeft className="size-4" />Back to job record</Link>

    <Card className="border-cyan-500/25">
      <div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">Job Management Pro</p><h1 className="mt-2 break-words text-3xl font-black">{job.title}</h1><p className="mt-2 flex items-start gap-2 text-sm text-slate-400"><MapPin className="mt-0.5 size-4 shrink-0 text-cyan-400" />{job.siteAddress || "No site address"}</p></div><StatusBadge status={job.status} /></div>
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl bg-slate-950/70 p-3"><p className="text-xs text-slate-500">Contract value</p><p className="mt-1 font-bold">{money.format(job.value || 0)}</p></div>
        <div className="rounded-xl bg-slate-950/70 p-3"><p className="text-xs text-slate-500">Variations</p><p className="mt-1 font-bold text-emerald-300">{money.format(acceptedVariationValue)}</p></div>
        <div className="rounded-xl bg-slate-950/70 p-3"><p className="text-xs text-slate-500">Outstanding</p><p className="mt-1 font-bold text-amber-300">{counts.outstanding}</p></div>
        <div className="rounded-xl bg-slate-950/70 p-3"><p className="text-xs text-slate-500">Progress</p><p className="mt-1 font-bold text-cyan-200">{progressValue.overall}%</p></div>
      </div>
    </Card>

    <Card>
      <div className="flex items-start gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-cyan-500/10 text-cyan-300"><Gauge className="size-5" /></span><div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">Live progress</p><h2 className="mt-1 text-xl font-bold">Operational completion</h2><p className="mt-2 text-sm text-slate-400">Read-only snapshot from the existing job progress record.</p></div></div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {progressBar("Overall", progressValue.overall)}
        {progressBar("First fix", progressValue.firstFix)}
        {progressBar("Second fix", progressValue.secondFix)}
        {progressBar("Testing", progressValue.testing)}
        {progressBar("Certificates", progressValue.certificates)}
        {progressBar("Materials", progressValue.materials)}
        {progressBar("Payments", progressValue.payments)}
      </div>
      {!progressRecord ? <p className="mt-4 text-sm text-amber-300">No saved progress record yet. Add one from the full job management controls.</p> : <p className="mt-4 text-xs text-slate-500">Last updated {new Date(progressRecord.updatedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })} by {progressRecord.updatedBy || "JR OS"}.</p>}
    </Card>

    <Card>
      <p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">Mobile status control</p>
      <h2 className="mt-1 text-xl font-bold">Update job stage</h2>
      <p className="mt-2 text-sm text-slate-400">Every change is written to the job timeline automatically.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
        <select value={selectedStatus === "Enquiry" && currentStatus !== "Enquiry" ? currentStatus : selectedStatus} onChange={(event) => setSelectedStatus(event.target.value as CanonicalJobStatus)} className="min-h-12 rounded-xl border border-slate-700 bg-slate-950 px-3 text-base">
          {canonicalJobStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
        </select>
        <Button type="button" onClick={updateStatus} className="w-full sm:w-auto">Save status</Button>
      </div>
      {statusMessage ? <p role="status" className="mt-3 text-sm text-cyan-200">{statusMessage}</p> : null}
    </Card>

    <section className="grid gap-4 md:grid-cols-2">
      <Card><div className="flex items-start gap-3"><UserRound className="mt-0.5 size-5 text-cyan-300" /><div><p className="text-xs uppercase tracking-wider text-slate-500">Customer</p><h2 className="mt-1 font-bold">{customer?.name || "Not linked"}</h2>{customer?.phone ? <a href={`tel:${customer.phone}`} className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-cyan-300"><Phone className="size-4" />{customer.phone}</a> : null}</div></div></Card>
      <Card><div className="flex items-start gap-3"><Building2 className="mt-0.5 size-5 text-violet-300" /><div><p className="text-xs uppercase tracking-wider text-slate-500">Builder</p><h2 className="mt-1 font-bold">{builder?.companyName || "Not linked"}</h2>{builder?.phone ? <a href={`tel:${builder.phone}`} className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-cyan-300"><Phone className="size-4" />{builder.phone}</a> : null}</div></div></Card>
      <Card><div className="flex items-start gap-3"><CalendarDays className="mt-0.5 size-5 text-amber-300" /><div><p className="text-xs uppercase tracking-wider text-slate-500">Schedule</p><h2 className="mt-1 font-bold">{job.startDate ? new Date(`${job.startDate}T12:00:00`).toLocaleDateString("en-GB") : "Not scheduled"}</h2><p className="mt-2 text-sm text-slate-400">Target: {job.targetCompletionDate ? new Date(`${job.targetCompletionDate}T12:00:00`).toLocaleDateString("en-GB") : "Not set"}</p></div></div></Card>
      <Card><div className="flex items-start gap-3"><ClipboardList className="mt-0.5 size-5 text-emerald-300" /><div><p className="text-xs uppercase tracking-wider text-slate-500">Assigned staff</p><h2 className="mt-1 font-bold">{assigned.length ? assigned.map((member) => member.name).join(", ") : "Unassigned"}</h2><p className="mt-2 text-sm text-slate-400">{assigned.length} active team member{assigned.length === 1 ? "" : "s"}</p></div></div></Card>
    </section>

    <Card>
      <p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">On-site workspace</p><h2 className="mt-1 text-xl font-bold">Quick actions</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {quickLink(`/job-tasks?job=${jobId}`, "Tasks & snagging", `${counts.outstandingTasks} tasks · ${counts.outstandingSnags} snags outstanding`, CheckSquare2)}
        {quickLink(`/site-management?job=${jobId}`, "Site diary", `${jobDiaries.length} diary entr${jobDiaries.length === 1 ? "y" : "ies"}`, BookOpenText)}
        {quickLink(`/site-management?job=${jobId}`, "Variations", `${jobVariations.length} recorded change${jobVariations.length === 1 ? "" : "s"}`, Wrench)}
        {quickLink(`/jobs/${jobId}`, "Documents & photos", `${jobDocuments.length} linked files`, FileText)}
        {quickLink(`/job-finance?job=${jobId}`, "Job financials", "Contract, costs, profit and payments", ReceiptText)}
        {quickLink(`/field/testing?job=${jobId}`, "Testing", "Open electrical testing records", ClipboardList)}
      </div>
    </Card>

    <Card>
      <div className="flex items-end justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">Latest activity</p><h2 className="mt-1 text-xl font-bold">Job timeline</h2></div><Link href={`/jobs/${jobId}`} className="text-sm font-semibold text-cyan-300">View full timeline</Link></div>
      <div className="mt-4 space-y-3">{recentActivity.length ? recentActivity.map((entry) => <div key={entry.id} className="rounded-xl border border-slate-800 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold">{entry.eventType || entry.milestone}</p><p className="text-xs text-slate-500">{new Date(entry.completedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</p></div>{entry.note ? <p className="mt-2 text-sm text-slate-400">{entry.note}</p> : null}</div>) : <p className="text-sm text-slate-400">No activity recorded yet.</p>}</div>
    </Card>
  </main>;
}