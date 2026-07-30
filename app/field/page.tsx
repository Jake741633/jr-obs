"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { BriefcaseBusiness, CalendarDays, CheckCircle2, Clock3, MapPin, Mic, Play, Square, Wrench } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { InputField, TextareaField } from "../../components/ui/FormField";
import { PageHeader } from "../../components/ui/PageHeader";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { makeId, useLocalStorageCollection } from "../../lib/storage";
import type { Customer, Job, JobStatus, SiteDiaryEntry } from "../../lib/models";

const today = () => new Date().toISOString().slice(0, 10);
const nowTime = () => new Date().toTimeString().slice(0, 5);

const blankDiary = {
  jobId: "",
  workDate: today(),
  startedAt: "",
  finishedAt: "",
  breakMinutes: "0",
  completedBy: "Jake",
  workCompleted: "",
  delays: "",
  customerRequests: "",
  materialsUsed: "",
  voiceNotes: "",
};

export default function FieldWorkspacePage() {
  const jobs = useLocalStorageCollection<Job>("jr-os-jobs");
  const customers = useLocalStorageCollection<Customer>("jr-os-customers");
  const diary = useLocalStorageCollection<SiteDiaryEntry>("jr-os-site-diary");
  const [form, setForm] = useState(blankDiary);
  const [message, setMessage] = useState("");

  const customerNames = useMemo(
    () => new Map(customers.items.map((customer) => [customer.id, customer.name])),
    [customers.items],
  );

  const todaysJobs = useMemo(
    () => jobs.items
      .filter((job) => job.startDate === today() || job.status === "In progress")
      .toSorted((a, b) => a.startDate.localeCompare(b.startDate)),
    [jobs.items],
  );

  const activeJob = jobs.items.find((job) => job.id === form.jobId);
  const todaysEntries = diary.items.filter((entry) => entry.workDate === today());

  function updateJobStatus(jobId: string, status: JobStatus) {
    jobs.setItems((current) => current.map((job) => job.id === jobId
      ? { ...job, status, updatedAt: new Date().toISOString() }
      : job));
  }

  function startJob(job: Job) {
    setForm((current) => ({
      ...current,
      jobId: job.id,
      workDate: today(),
      startedAt: current.jobId === job.id && current.startedAt ? current.startedAt : nowTime(),
      finishedAt: "",
    }));
    updateJobStatus(job.id, "In progress");
    setMessage(`${job.title} started at ${nowTime()}.`);
  }

  function stopJob(job: Job) {
    setForm((current) => ({ ...current, jobId: job.id, finishedAt: nowTime() }));
    setMessage(`${job.title} stopped at ${nowTime()}. Add the site record below.`);
  }

  function saveDiary(event: FormEvent) {
    event.preventDefault();
    if (!form.jobId) { setMessage("Choose a job before saving the site record."); return; }
    if (!form.startedAt) { setMessage("Add the time work started."); return; }

    const now = new Date().toISOString();
    const entry: SiteDiaryEntry = {
      id: makeId("site-diary"),
      jobId: form.jobId,
      workDate: form.workDate,
      startedAt: form.startedAt,
      finishedAt: form.finishedAt,
      breakMinutes: Math.max(0, Number(form.breakMinutes || 0)),
      completedBy: form.completedBy.trim() || "Jake",
      workCompleted: form.workCompleted.trim(),
      delays: form.delays.trim(),
      customerRequests: form.customerRequests.trim(),
      materialsUsed: form.materialsUsed.trim(),
      voiceNotes: form.voiceNotes.trim(),
      createdAt: now,
      updatedAt: now,
    };

    diary.setItems((current) => [entry, ...current]);
    setMessage("Site diary entry saved to the job record.");
    setForm(blankDiary);
  }

  if (!jobs.isReady || !customers.isReady || !diary.isReady) return <Card>Loading field workspace…</Card>;

  return <div className="space-y-6">
    <PageHeader eyebrow="Mobile workspace" title="Today on site" description="Start jobs, capture site notes and keep the day moving from your phone." />

    <section className="grid gap-4 sm:grid-cols-3">
      <Card><p className="text-sm text-slate-400">Today&apos;s jobs</p><p className="mt-2 text-3xl font-bold">{todaysJobs.length}</p></Card>
      <Card><p className="text-sm text-slate-400">In progress</p><p className="mt-2 text-3xl font-bold">{jobs.items.filter((job) => job.status === "In progress").length}</p></Card>
      <Card><p className="text-sm text-slate-400">Diary records today</p><p className="mt-2 text-3xl font-bold">{todaysEntries.length}</p></Card>
    </section>

    {message ? <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/5 px-4 py-3 text-sm text-cyan-200">{message}</div> : null}

    <section className="space-y-4">
      <div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">Schedule</p><h2 className="mt-1 text-2xl font-bold">Today&apos;s jobs</h2></div>
      {todaysJobs.length === 0 ? <Card><div className="flex items-start gap-3"><CalendarDays className="mt-0.5 size-5 text-slate-500" /><div><h3 className="font-semibold">No jobs scheduled for today</h3><p className="mt-1 text-sm text-slate-400">Jobs marked In progress will also appear here.</p></div></div></Card> : <div className="grid gap-4 xl:grid-cols-2">{todaysJobs.map((job) => <Card key={job.id} className={form.jobId === job.id ? "border-cyan-400/40" : undefined}><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">{customerNames.get(job.customerId ?? "") || "Direct job"}</p><h3 className="mt-1 text-xl font-bold">{job.title}</h3><div className="mt-2"><StatusBadge status={job.status} /></div></div><Link href={`/jobs/${job.id}`} className="rounded-lg border border-slate-700 px-3 py-2 text-sm font-semibold text-slate-200 hover:border-cyan-400/50">Open job</Link></div><p className="mt-4 flex items-start gap-2 text-sm text-slate-400"><MapPin className="mt-0.5 size-4 shrink-0 text-cyan-400" />{job.siteAddress}</p><div className="mt-5 flex flex-wrap gap-2"><Button type="button" onClick={() => startJob(job)}><Play className="mr-2 size-4" />Start job</Button><Button type="button" variant="secondary" onClick={() => stopJob(job)}><Square className="mr-2 size-4" />Stop timer</Button><Button type="button" variant="secondary" onClick={() => updateJobStatus(job.id, "Complete")}><CheckCircle2 className="mr-2 size-4" />Mark complete</Button></div></Card>)}</div>}
    </section>

    <section className="space-y-4">
      <div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">Site record</p><h2 className="mt-1 text-2xl font-bold">Daily job diary</h2><p className="mt-1 text-sm text-slate-400">Record working time, progress, materials and customer requests before leaving site.</p></div>
      <Card><form onSubmit={saveDiary} className="grid gap-4 md:grid-cols-2"><label className="grid gap-2 text-sm font-medium text-slate-300"><span>Job</span><select required value={form.jobId} onChange={(event) => setForm({ ...form, jobId: event.target.value })} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3"><option value="">Choose job</option>{jobs.items.filter((job) => job.status !== "Complete").map((job) => <option key={job.id} value={job.id}>{job.title}</option>)}</select></label><InputField label="Work date" type="date" value={form.workDate} onChange={(event) => setForm({ ...form, workDate: event.target.value })} /><InputField label="Started" type="time" value={form.startedAt} onChange={(event) => setForm({ ...form, startedAt: event.target.value })} /><InputField label="Finished" type="time" value={form.finishedAt} onChange={(event) => setForm({ ...form, finishedAt: event.target.value })} /><InputField label="Break (minutes)" type="number" min="0" value={form.breakMinutes} onChange={(event) => setForm({ ...form, breakMinutes: event.target.value })} /><InputField label="Completed by" value={form.completedBy} onChange={(event) => setForm({ ...form, completedBy: event.target.value })} /><div className="md:col-span-2"><TextareaField label="Work completed" value={form.workCompleted} onChange={(event) => setForm({ ...form, workCompleted: event.target.value })} /></div><div className="md:col-span-2"><TextareaField label="Materials used" value={form.materialsUsed} onChange={(event) => setForm({ ...form, materialsUsed: event.target.value })} /></div><TextareaField label="Delays or issues" value={form.delays} onChange={(event) => setForm({ ...form, delays: event.target.value })} /><TextareaField label="Customer requests" value={form.customerRequests} onChange={(event) => setForm({ ...form, customerRequests: event.target.value })} /><div className="md:col-span-2"><label className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-300"><Mic className="size-4 text-cyan-400" />Voice-note transcript</label><TextareaField label="" value={form.voiceNotes} onChange={(event) => setForm({ ...form, voiceNotes: event.target.value })} /></div><div className="md:col-span-2 flex justify-end"><Button type="submit"><Wrench className="mr-2 size-4" />Save site record</Button></div></form></Card>
      {activeJob ? <p className="flex items-center gap-2 text-sm text-slate-400"><Clock3 className="size-4 text-cyan-400" />Recording for {activeJob.title}</p> : null}
    </section>
  </div>;
}
