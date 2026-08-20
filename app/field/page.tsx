"use client";

import Link from "next/link";
import { ChangeEvent, FormEvent, useMemo, useState } from "react";
import { CalendarDays, Camera, ClipboardCheck, Clock3, MapPin, Mic, PenLine, Play, Square, Wrench } from "lucide-react";
import { MobileTestingProgress } from "../../components/MobileTestingProgress";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { InputField, TextareaField } from "../../components/ui/FormField";
import { PageHeader } from "../../components/ui/PageHeader";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { useSiteDiariesCollection } from "../../lib/cloud/coreBusinessCollections";
import { useCloudIdentity } from "../../lib/cloud/useCloudIdentity";
import { isJobInactiveStatus, isJobOnSiteStatus, normaliseJobStatus, siteDiaryTimelineEntry, transitionJobStatus } from "../../lib/jobManagement-core.mjs";
import { fieldOperatorName } from "../../lib/siteDiaryIdentity-core.mjs";
import { makeId, useLocalStorageCollection } from "../../lib/storage";
import type { CanonicalJobStatus, Customer, Job, JobDocument, JobTimelineEntry, SiteDiaryEntry, TeamMember } from "../../lib/models";

const today = () => new Date().toISOString().slice(0, 10);
const nowTime = () => new Date().toTimeString().slice(0, 5);
const blankDiary = { jobId: "", workDate: today(), startedAt: "", finishedAt: "", breakMinutes: "0", workCompleted: "", delays: "", customerRequests: "", materialsUsed: "", voiceNotes: "" };
const checklistItems = ["Work area left safe and tidy", "Installation visually checked", "Required tests completed", "Labels and accessories fitted", "Customer shown completed work", "Photos and notes saved"];

export default function FieldWorkspacePage() {
  const jobs = useLocalStorageCollection<Job>("jr-os-jobs");
  const customers = useLocalStorageCollection<Customer>("jr-os-customers");
  const diary = useSiteDiariesCollection();
  const documents = useLocalStorageCollection<JobDocument>("jr-os-job-documents");
  const timeline = useLocalStorageCollection<JobTimelineEntry>("jr-os-job-timeline");
  const team = useLocalStorageCollection<TeamMember>("jr-os-team");
  const identityState = useCloudIdentity();
  const [form, setForm] = useState(blankDiary);
  const [message, setMessage] = useState("");
  const [checklist, setChecklist] = useState<string[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [signOffNotes, setSignOffNotes] = useState("");
  const [selectedPhoto, setSelectedPhoto] = useState<File | null>(null);

  const customerNames = useMemo(() => new Map(customers.items.map((customer) => [customer.id, customer.name])), [customers.items]);
  const todaysJobs = useMemo(() => jobs.items.filter((job) => job.startDate === today() || isJobOnSiteStatus(job.status)).toSorted((a, b) => a.startDate.localeCompare(b.startDate)), [jobs.items]);
  const operatorName = useMemo(() => fieldOperatorName({ identity: identityState.identity, teamMembers: team.items, mode: identityState.mode }), [identityState.identity, identityState.mode, team.items]);
  const cloudFieldMode = identityState.mode !== "local";
  const activeJob = jobs.items.find((job) => job.id === form.jobId);
  const todaysEntries = diary.items.filter((entry) => entry.workDate === today());

  function updateJobStatus(jobId: string, status: CanonicalJobStatus) {
    const job = jobs.items.find((item) => item.id === jobId);
    if (!job) return;
    const result = transitionJobStatus({ job, nextStatus: status, now: new Date().toISOString(), timelineId: makeId("timeline"), completedBy: operatorName || "JR OS Mobile" });
    jobs.setItems((current) => current.map((item) => item.id === jobId ? result.job : item));
    if (!cloudFieldMode && result.timelineEntry) timeline.setItems((current) => [result.timelineEntry!, ...current]);
  }

  function startJob(job: Job) {
    if (cloudFieldMode && !operatorName) return setMessage("Your active team identity could not be resolved. Refresh your account before starting work.");
    const startedAt = nowTime();
    setForm((current) => ({ ...current, jobId: job.id, workDate: today(), startedAt: current.jobId === job.id && current.startedAt ? current.startedAt : startedAt, finishedAt: "" }));
    if (normaliseJobStatus(job.status) === "Scheduled") updateJobStatus(job.id, "First fix");
    setMessage(`${job.title} started at ${startedAt}.`);
  }

  function stopJob(job: Job) {
    const finishedAt = nowTime();
    setForm((current) => ({ ...current, jobId: job.id, finishedAt }));
    setMessage(`${job.title} stopped at ${finishedAt}. Add the site record below.`);
  }

  function saveDiary(event: FormEvent) {
    event.preventDefault();
    if (!form.jobId) return setMessage("Choose a job before saving the site record.");
    if (!operatorName) return setMessage("Your active team identity could not be resolved. Refresh your account before saving the site record.");
    if (!form.startedAt) return setMessage("Add the time work started.");
    const now = new Date().toISOString();
    const entry: SiteDiaryEntry = { id: makeId("site-diary"), jobId: form.jobId, workDate: form.workDate, startedAt: form.startedAt, finishedAt: form.finishedAt, breakMinutes: Math.max(0, Number(form.breakMinutes || 0)), completedBy: operatorName, staffPresent: [], workCompleted: form.workCompleted.trim(), delays: form.delays.trim(), builderInstructions: "", customerRequests: form.customerRequests.trim(), customerInstructions: form.customerRequests.trim(), materialsUsed: form.materialsUsed.trim(), materialsRequired: "", voiceNotes: form.voiceNotes.trim(), voiceNoteTranscript: form.voiceNotes.trim(), weather: "", issuesAndRisks: form.delays.trim(), followUpActions: "", createdAt: now, updatedAt: now };
    diary.setItems((current) => [entry, ...current]);
    timeline.setItems((current) => [siteDiaryTimelineEntry({ entry, timelineId: makeId("timeline"), completedBy: operatorName, now }), ...current]);
    setMessage(cloudFieldMode
      ? "Site diary entry and a separate job timeline note queued for secure sync."
      : "Site diary entry saved to the job record.");
    setForm({ ...blankDiary, jobId: form.jobId, workDate: today() });
  }

  function choosePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    if (file && file.size > 2_000_000) { setSelectedPhoto(null); setMessage("Choose a site photo smaller than 2 MB while JR OS uses local storage."); return; }
    setSelectedPhoto(file);
  }

  async function saveCompletionPack() {
    if (cloudFieldMode) {
      setMessage("Completion photos and sign-off packs are read-only for field cloud sessions until the dedicated secure completion upload route is available.");
      return;
    }
    if (!form.jobId) return setMessage("Choose or start a job before saving completion details.");
    if (checklist.length !== checklistItems.length) return setMessage("Complete every site checklist item before customer sign-off.");
    if (!customerName.trim()) return setMessage("Enter the customer or site contact name for sign-off.");
    const now = new Date().toISOString();
    if (selectedPhoto) {
      const dataUrl = await new Promise<string>((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result ?? "")); reader.onerror = () => resolve(""); reader.readAsDataURL(selectedPhoto); });
      if (dataUrl) documents.setItems((current) => [{ id: makeId("document"), jobId: form.jobId, name: `Site completion photo - ${today()}`, category: "Photo", fileName: selectedPhoto.name, mimeType: selectedPhoto.type, dataUrl, externalUrl: "", notes: signOffNotes.trim(), uploadedBy: operatorName || "JR OS engineer", uploadedAt: now, createdAt: now }, ...current]);
    }
    timeline.setItems((current) => [{ id: makeId("timeline"), jobId: form.jobId, milestone: "Job completed", note: `Site checklist completed. Customer sign-off recorded by ${customerName.trim()}.${signOffNotes.trim() ? ` ${signOffNotes.trim()}` : ""}`, completedBy: operatorName || "JR OS Mobile", completedAt: now, createdAt: now }, ...current]);
    updateJobStatus(form.jobId, "Complete");
    setChecklist([]); setCustomerName(""); setSignOffNotes(""); setSelectedPhoto(null);
    setMessage("Completion checklist, customer sign-off and site photo saved. Job marked complete.");
  }

  const ready = jobs.isReady && customers.isReady && diary.isReady && documents.isReady && timeline.isReady && team.isReady && identityState.isReady;
  if (!ready) return <Card>Loading field workspace…</Card>;

  return <div className="space-y-6">
    <PageHeader eyebrow="Mobile workspace" title="Today on site" description="Start assigned jobs and capture secure site records from your phone. Completion uploads stay locked in cloud field mode until their dedicated server route is available." />
    {cloudFieldMode && !operatorName ? <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 px-4 py-3 text-sm text-amber-100"><p className="font-semibold">Field identity could not be resolved.</p><p className="mt-1 text-xs text-amber-100/70">Site writes remain locked until this signed-in account resolves to an active team identity.</p></div> : null}
    <section className="grid gap-4 sm:grid-cols-3"><Card><p className="text-sm text-slate-400">Today&apos;s jobs</p><p className="mt-2 text-3xl font-bold">{todaysJobs.length}</p></Card><Card><p className="text-sm text-slate-400">On site</p><p className="mt-2 text-3xl font-bold">{jobs.items.filter((job) => isJobOnSiteStatus(job.status)).length}</p></Card><Card><p className="text-sm text-slate-400">Diary records today</p><p className="mt-2 text-3xl font-bold">{todaysEntries.length}</p></Card></section>
    {message ? <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/5 px-4 py-3 text-sm text-cyan-200">{message}</div> : null}
    <MobileTestingProgress activeJobId={form.jobId || todaysJobs.find((job) => isJobOnSiteStatus(job.status))?.id} />

    <section className="space-y-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">Schedule</p><h2 className="mt-1 text-2xl font-bold">Today&apos;s jobs</h2></div>{todaysJobs.length === 0 ? <Card><div className="flex items-start gap-3"><CalendarDays className="mt-0.5 size-5 text-slate-500" /><div><h3 className="font-semibold">No jobs scheduled for today</h3><p className="mt-1 text-sm text-slate-400">Jobs in an active site stage will also appear here.</p></div></div></Card> : <div className="grid gap-4 xl:grid-cols-2">{todaysJobs.map((job) => <Card key={job.id} className={form.jobId === job.id ? "border-cyan-400/40" : undefined}><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">{customerNames.get(job.customerId ?? "") || "Direct job"}</p><h3 className="mt-1 text-xl font-bold">{job.title}</h3><div className="mt-2"><StatusBadge status={job.status} /></div></div><Link href={`/jobs/${job.id}`} className="rounded-lg border border-slate-700 px-3 py-2 text-sm font-semibold text-slate-200 hover:border-cyan-400/50">Open job</Link></div><p className="mt-4 flex items-start gap-2 text-sm text-slate-400"><MapPin className="mt-0.5 size-4 shrink-0 text-cyan-400" />{job.siteAddress}</p><div className="mt-5 flex flex-wrap gap-2"><Button type="button" disabled={cloudFieldMode && !operatorName} onClick={() => startJob(job)}><Play className="mr-2 size-4" />Start job</Button><Button type="button" variant="secondary" onClick={() => stopJob(job)}><Square className="mr-2 size-4" />Stop timer</Button><Link href="/field/testing" className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold hover:border-cyan-400/50">Testing</Link></div></Card>)}</div>}</section>

    <section className="space-y-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">Site record</p><h2 className="mt-1 text-2xl font-bold">Daily job diary</h2><p className="mt-1 text-sm text-slate-400">Record working time, progress, materials and customer requests before leaving site.</p></div><Card><form onSubmit={saveDiary} className="grid gap-4 md:grid-cols-2"><label className="grid gap-2 text-sm font-medium text-slate-300"><span>Job</span><select required value={form.jobId} onChange={(event) => setForm({ ...form, jobId: event.target.value })} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3"><option value="">Choose job</option>{jobs.items.filter((job) => !isJobInactiveStatus(job.status)).map((job) => <option key={job.id} value={job.id}>{job.title}</option>)}</select></label><InputField label="Work date" type="date" value={form.workDate} onChange={(event) => setForm({ ...form, workDate: event.target.value })} /><InputField label="Started" type="time" value={form.startedAt} onChange={(event) => setForm({ ...form, startedAt: event.target.value })} /><InputField label="Finished" type="time" value={form.finishedAt} onChange={(event) => setForm({ ...form, finishedAt: event.target.value })} /><InputField label="Break (minutes)" type="number" min="0" value={form.breakMinutes} onChange={(event) => setForm({ ...form, breakMinutes: event.target.value })} /><InputField label="Completed by" value={operatorName} readOnly aria-readonly="true" /><div className="md:col-span-2"><TextareaField label="Work completed" value={form.workCompleted} onChange={(event) => setForm({ ...form, workCompleted: event.target.value })} /></div><div className="md:col-span-2"><TextareaField label="Materials used" value={form.materialsUsed} onChange={(event) => setForm({ ...form, materialsUsed: event.target.value })} /></div><TextareaField label="Delays or issues" value={form.delays} onChange={(event) => setForm({ ...form, delays: event.target.value })} /><TextareaField label="Customer requests" value={form.customerRequests} onChange={(event) => setForm({ ...form, customerRequests: event.target.value })} /><div className="md:col-span-2"><label className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-300"><Mic className="size-4 text-cyan-400" />Voice-note transcript</label><TextareaField label="" value={form.voiceNotes} onChange={(event) => setForm({ ...form, voiceNotes: event.target.value })} /></div><div className="md:col-span-2 flex justify-end"><Button type="submit" disabled={cloudFieldMode && !operatorName}><Wrench className="mr-2 size-4" />Save site record</Button></div></form></Card>{activeJob ? <p className="flex items-center gap-2 text-sm text-slate-400"><Clock3 className="size-4 text-cyan-400" />Recording for {activeJob.title}</p> : null}</section>

    <section className="space-y-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-emerald-400">Completion</p><h2 className="mt-1 text-2xl font-bold">Site handover and sign-off</h2><p className="mt-1 text-sm text-slate-400">{cloudFieldMode ? "Completion packs and photo uploads are read-only in field cloud mode until their dedicated secure server route is available." : "Finish the checklist, save a completion photo and record the customer handover."}</p></div>{cloudFieldMode ? <Card><p className="text-sm text-amber-100">Use the job record for review and continue testing or snagging as needed. JR OS will not claim a customer sign-off or completion photo was saved when the field document boundary would reject it.</p><div className="mt-4 grid gap-2 sm:grid-cols-2">{form.jobId ? <Link href={`/jobs/${form.jobId}`} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-700 px-4 text-sm font-semibold">Open full job</Link> : <Link href="/field/jobs" className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-700 px-4 text-sm font-semibold">Open job control</Link>}<Link href="/field/testing" className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-700 px-4 text-sm font-semibold">Open testing</Link></div></Card> : <Card className="space-y-5"><div className="space-y-3">{checklistItems.map((item) => <label key={item} className="flex min-h-11 items-center gap-3 rounded-xl border border-slate-800 bg-slate-950/50 px-4 py-3 text-sm"><input type="checkbox" checked={checklist.includes(item)} onChange={(event) => setChecklist((current) => event.target.checked ? [...current, item] : current.filter((value) => value !== item))} className="size-5 accent-cyan-400" /><span>{item}</span></label>)}</div><div className="grid gap-4 md:grid-cols-2"><label className="grid gap-2 text-sm font-medium text-slate-300"><span className="flex items-center gap-2"><Camera className="size-4 text-cyan-400" />Completion photo</span><input type="file" accept="image/*" capture="environment" onChange={choosePhoto} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-slate-800 file:px-3 file:py-1 file:text-slate-200" />{selectedPhoto ? <span className="text-xs font-normal text-emerald-300">{selectedPhoto.name} ready to save</span> : null}</label><InputField label="Customer / site contact name" value={customerName} onChange={(event) => setCustomerName(event.target.value)} /><div className="md:col-span-2"><TextareaField label="Handover or sign-off notes" value={signOffNotes} onChange={(event) => setSignOffNotes(event.target.value)} /></div></div><div className="flex flex-col gap-3 border-t border-slate-800 pt-5 sm:flex-row sm:items-center sm:justify-between"><p className="flex items-center gap-2 text-sm text-slate-400"><ClipboardCheck className="size-4 text-emerald-400" />{checklist.length} of {checklistItems.length} checks complete</p><Button type="button" onClick={saveCompletionPack}><PenLine className="mr-2 size-4" />Save sign-off and complete job</Button></div></Card>}</section>
  </div>;
}
