"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft, Building2, CalendarDays, CheckCircle2, Clock3, MapPin, Plus, Trash2, User, WalletCards } from "lucide-react";
import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { InputField, TextareaField } from "../../../components/ui/FormField";
import { StatusBadge } from "../../../components/ui/StatusBadge";
import { makeId, useLocalStorageCollection } from "../../../lib/storage";
import type { Builder, Customer, Job, JobMilestoneType, JobTimelineEntry } from "../../../lib/models";

const milestones: JobMilestoneType[] = [
  "Enquiry received",
  "Site survey booked",
  "Quote prepared",
  "Quote sent",
  "Quote accepted",
  "Deposit received",
  "Materials ordered",
  "Materials delivered",
  "First fix complete",
  "Second fix complete",
  "Testing complete",
  "Certificate uploaded",
  "Invoice sent",
  "Payment received",
  "Review requested",
  "Custom update",
];

const blankEntry = {
  milestone: "Enquiry received" as JobMilestoneType,
  note: "",
  completedBy: "Jake",
  completedAt: "",
};

export default function JobDetailPage() {
  const params = useParams<{ id: string }>();
  const jobs = useLocalStorageCollection<Job>("jr-os-jobs");
  const customers = useLocalStorageCollection<Customer>("jr-os-customers");
  const builders = useLocalStorageCollection<Builder>("jr-os-builders");
  const timeline = useLocalStorageCollection<JobTimelineEntry>("jr-os-job-timeline");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(blankEntry);
  const [error, setError] = useState("");

  const job = jobs.items.find((item) => item.id === params.id);
  const customer = customers.items.find((item) => item.id === job?.customerId);
  const builder = builders.items.find((item) => item.id === job?.builderId);
  const entries = useMemo(
    () => timeline.items.filter((item) => item.jobId === params.id).sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()),
    [timeline.items, params.id],
  );

  if (!jobs.isReady || !customers.isReady || !builders.isReady || !timeline.isReady) return <Card>Loading job…</Card>;

  if (!job) {
    return <div className="space-y-6"><Link href="/jobs" className="inline-flex items-center gap-2 text-sm text-cyan-300 hover:text-cyan-200"><ArrowLeft className="size-4" />Back to jobs</Link><Card><h1 className="text-xl font-bold">Job not found</h1><p className="mt-2 text-sm text-slate-400">This job may have been deleted or the link is no longer valid.</p></Card></div>;
  }

  const formattedValue = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(job.value || 0);
  const formattedDate = job.startDate ? new Date(`${job.startDate}T12:00:00`).toLocaleDateString("en-GB") : "Not scheduled";

  function addTimelineEntry(event: FormEvent) {
    event.preventDefault();
    if (!form.completedAt) { setError("Choose the date and time this milestone was completed."); return; }
    const now = new Date().toISOString();
    const entry: JobTimelineEntry = {
      id: makeId("timeline"),
      jobId: job.id,
      milestone: form.milestone,
      note: form.note.trim(),
      completedBy: form.completedBy.trim() || "Jake",
      completedAt: new Date(form.completedAt).toISOString(),
      createdAt: now,
    };
    timeline.setItems((current) => [entry, ...current]);
    setForm(blankEntry);
    setError("");
    setShowForm(false);
  }

  function addMilestoneNow(milestone: JobMilestoneType) {
    const now = new Date().toISOString();
    timeline.setItems((current) => [{ id: makeId("timeline"), jobId: job.id, milestone, note: "", completedBy: "Jake", completedAt: now, createdAt: now }, ...current]);
  }

  function deleteEntry(entry: JobTimelineEntry) {
    if (window.confirm(`Delete ${entry.milestone} from this job timeline?`)) timeline.remove((item) => item.id === entry.id);
  }

  const completedMilestones = new Set(entries.map((entry) => entry.milestone));
  const nextMilestone = milestones.find((milestone) => milestone !== "Custom update" && !completedMilestones.has(milestone));

  return <div className="space-y-6">
    <Link href="/jobs" className="inline-flex items-center gap-2 text-sm text-cyan-300 hover:text-cyan-200"><ArrowLeft className="size-4" />Back to jobs</Link>
    <Card className="border-cyan-400/30">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">Job record</p><h1 className="mt-2 text-3xl font-bold">{job.title}</h1></div><StatusBadge status={job.status} /></div>
      <div className="mt-6 grid gap-4 text-sm text-slate-300 md:grid-cols-2">
        <p className="flex items-start gap-2"><MapPin className="mt-0.5 size-4 shrink-0 text-cyan-400" />{job.siteAddress}</p>
        <p className="flex items-center gap-2"><CalendarDays className="size-4 text-cyan-400" />{formattedDate}</p>
        <p className="flex items-center gap-2"><WalletCards className="size-4 text-cyan-400" />{formattedValue}</p>
        <p className="md:col-span-2 whitespace-pre-wrap"><span className="font-semibold text-slate-200">Notes:</span> {job.notes || "No notes"}</p>
      </div>
    </Card>

    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">Live workflow</p><h2 className="mt-1 text-2xl font-bold">Job timeline</h2><p className="mt-1 text-sm text-slate-400">Record every important stage from enquiry through payment and review request.</p></div><Button onClick={() => setShowForm((current) => !current)}><Plus className="mr-2 size-4" />{showForm ? "Close update" : "Add update"}</Button></div>

      {nextMilestone ? <Card className="border-emerald-500/20 bg-emerald-500/5"><div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between"><div><p className="text-xs font-semibold uppercase tracking-wider text-emerald-300">Suggested next step</p><h3 className="mt-1 text-lg font-bold">{nextMilestone}</h3></div><Button onClick={() => addMilestoneNow(nextMilestone)}>Mark complete now</Button></div></Card> : null}

      {showForm ? <Card><form onSubmit={addTimelineEntry} className="grid gap-4 md:grid-cols-2"><label className="grid gap-2 text-sm font-medium text-slate-300"><span>Milestone</span><select value={form.milestone} onChange={(event) => setForm({ ...form, milestone: event.target.value as JobMilestoneType })} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3">{milestones.map((milestone) => <option key={milestone}>{milestone}</option>)}</select></label><InputField required label="Completed date and time" type="datetime-local" value={form.completedAt} onChange={(event) => setForm({ ...form, completedAt: event.target.value })} /><InputField label="Completed by" value={form.completedBy} onChange={(event) => setForm({ ...form, completedBy: event.target.value })} /><div className="md:col-span-2"><TextareaField label="Notes" value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} /></div>{error ? <p className="md:col-span-2 text-sm text-red-300">{error}</p> : null}<div className="md:col-span-2 flex justify-end"><Button type="submit">Save timeline update</Button></div></form></Card> : null}

      {entries.length === 0 ? <Card><div className="flex items-start gap-3"><Clock3 className="mt-0.5 size-5 text-slate-500" /><div><h3 className="font-semibold">No workflow updates yet</h3><p className="mt-1 text-sm text-slate-400">Add the enquiry, quote, materials, installation, testing and payment milestones as the job progresses.</p></div></div></Card> : <div className="space-y-3">{entries.map((entry) => <Card key={entry.id}><div className="flex items-start gap-4"><div className="mt-0.5 rounded-full bg-emerald-500/10 p-2 text-emerald-300"><CheckCircle2 className="size-5" /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-bold">{entry.milestone}</h3><p className="mt-1 text-sm text-slate-500">{new Date(entry.completedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })} · {entry.completedBy}</p></div><button onClick={() => deleteEntry(entry)} aria-label={`Delete ${entry.milestone}`} className="rounded-lg p-2 text-slate-500 hover:bg-red-500/10 hover:text-red-300"><Trash2 className="size-4" /></button></div>{entry.note ? <p className="mt-3 whitespace-pre-wrap text-sm text-slate-300">{entry.note}</p> : null}</div></div></Card>)}</div>}
    </section>

    <section className="space-y-4">
      <div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">Relationships</p><h2 className="mt-1 text-2xl font-bold">Linked CRM records</h2></div>
      <div className="grid gap-4 md:grid-cols-2">
        {customer ? <Link href={`/customers/${customer.id}`}><Card className="h-full transition hover:border-cyan-400/40"><p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-cyan-400"><User className="size-4" />Customer</p><h3 className="mt-2 text-lg font-bold">{customer.name}</h3><p className="mt-1 text-sm text-slate-400">{customer.phone || customer.email || "No contact details"}</p></Card></Link> : null}
        {builder ? <Link href={`/builders/${builder.id}`}><Card className="h-full transition hover:border-cyan-400/40"><p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-cyan-400"><Building2 className="size-4" />Builder</p><h3 className="mt-2 text-lg font-bold">{builder.companyName}</h3><p className="mt-1 text-sm text-slate-400">{builder.contactName || builder.phone || builder.email || "No contact details"}</p></Card></Link> : null}
        {!customer && !builder ? <Card><p className="text-sm text-slate-400">This is currently recorded as a direct job with no linked customer or builder.</p></Card> : null}
      </div>
    </section>
  </div>;
}
