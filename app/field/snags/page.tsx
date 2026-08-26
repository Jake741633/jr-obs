"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ClipboardCheck, Plus, Wrench } from "lucide-react";
import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { InputField, TextareaField } from "../../../components/ui/FormField";
import { PageHeader } from "../../../components/ui/PageHeader";
import { useJobsCollection, useJobTasksCollection, useJobTimelineCollection, useTeamCollection } from "../../../lib/cloud/coreBusinessCollections";
import { useCloudIdentity } from "../../../lib/cloud/useCloudIdentity";
import { fieldJobTaskStatusTransitionAllowed, jobTaskTimelineEntry, transitionJobTask } from "../../../lib/jobTasks-core.mjs";
import { prioritiseSnags, snagCategories, snagSummary } from "../../../lib/mobileSnagControl-core.mjs";
import { makeId } from "../../../lib/storage";
import type { JobPriority, JobTask, JobTaskCategory } from "../../../lib/models";

const today = () => new Date().toISOString().slice(0, 10);
const blankForm = { jobId: "", title: "", description: "", category: "General" as JobTaskCategory, priority: "Normal" as JobPriority, assignedTo: "", dueDate: today(), notes: "" };

export default function MobileSnagsPage() {
  const jobs = useJobsCollection();
  const tasks = useJobTasksCollection();
  const timeline = useJobTimelineCollection();
  const team = useTeamCollection();
  const identityState = useCloudIdentity();
  const [selectedJobId, setSelectedJobId] = useState("");
  const [form, setForm] = useState(blankForm);
  const [message, setMessage] = useState("");

  const activeJobs = useMemo(() => jobs.items.filter((job) => !["Complete", "Invoiced", "Paid", "Cancelled"].includes(job.status)), [jobs.items]);
  const visibleJobId = selectedJobId || form.jobId || activeJobs[0]?.id || "";
  const visibleSnags = useMemo(() => prioritiseSnags(tasks.items.filter((task) => task.jobId === visibleJobId)), [tasks.items, visibleJobId]);
  const summary = useMemo(() => snagSummary(tasks.items, visibleJobId), [tasks.items, visibleJobId]);
  const cloudFieldMode = identityState.mode !== "local" && identityState.identity?.role === "electrician";
  const operatorMember = useMemo(() => {
    const identityEmail = identityState.identity?.email?.trim().toLowerCase();
    if (!identityEmail) return undefined;
    return team.items.find((member) => member.status === "Active" && member.email?.trim().toLowerCase() === identityEmail);
  }, [identityState.identity?.email, team.items]);

  const ready = [jobs, tasks, timeline, team].every((collection) => collection.isReady) && identityState.isReady;
  if (!ready) return <Card>Loading mobile snag control…</Card>;

  function createSnag(event: FormEvent) {
    event.preventDefault();
    const jobId = form.jobId || visibleJobId;
    if (!jobId) return setMessage("Choose a job before creating a snag.");
    if (!form.title.trim()) return setMessage("Enter a short snag title.");
    if (cloudFieldMode && !operatorMember) return setMessage("Your active team identity could not be resolved. Refresh your account before creating a snag.");
    const now = new Date().toISOString();
    const snag: JobTask = {
      id: makeId("snag"),
      jobId,
      type: "Snag",
      title: form.title.trim(),
      description: form.description.trim(),
      category: form.category,
      priority: form.priority,
      assignedTo: cloudFieldMode ? operatorMember?.id : form.assignedTo || undefined,
      dueDate: form.dueDate,
      status: "Open",
      photos: [],
      notes: form.notes.trim(),
      createdAt: now,
      updatedAt: now,
    };
    const completedBy = cloudFieldMode ? operatorMember?.name || "" : "Mobile Snag Control";
    tasks.setItems((current) => [snag, ...current]);
    timeline.setItems((current) => [{ id: makeId("timeline"), jobId, milestone: "Custom update", eventType: "Snag", sourceId: snag.id, sourceType: "JobTask", note: `Snag created · ${snag.title}.`, completedBy, completedAt: now, createdAt: now }, ...current]);
    setSelectedJobId(jobId);
    setForm({ ...blankForm, jobId });
    setMessage(`${snag.title} added to the job snag list.`);
  }

  function changeStatus(task: JobTask, nextStatus: "In progress" | "Completed" | "Open") {
    if (cloudFieldMode && (!operatorMember || task.assignedTo !== operatorMember.id)) {
      setMessage("Only snags assigned to your active field account can be updated here.");
      return;
    }
    if (cloudFieldMode && !fieldJobTaskStatusTransitionAllowed(task.status, nextStatus)) {
      setMessage("That snag status change is unavailable in the field workflow. Ask the office to reopen a completed snag.");
      return;
    }
    const now = new Date().toISOString();
    const updated = transitionJobTask({ task, nextStatus, now });
    const completedBy = cloudFieldMode ? operatorMember?.name || "" : "Mobile Snag Control";
    tasks.setItems((current) => current.map((item) => item.id === task.id ? updated : item));
    timeline.setItems((current) => [jobTaskTimelineEntry({ task, fromStatus: task.status, toStatus: nextStatus, timelineId: makeId("timeline"), completedBy, now }), ...current]);
    setMessage(`${task.title} marked ${nextStatus.toLowerCase()}.`);
  }

  return <div className="space-y-5 pb-24 sm:space-y-6 sm:pb-0">
    <PageHeader eyebrow="Job Management Pro" title="Mobile snag control" description="Capture site defects, track responsibility and close snags assigned to your field account using the existing job task workflow." />

    <Card>
      <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Job snag list</span><select value={visibleJobId} onChange={(event) => { setSelectedJobId(event.target.value); setForm((current) => ({ ...current, jobId: event.target.value })); }} className="min-h-12 rounded-xl border border-slate-700 bg-slate-950 px-3 text-base"><option value="">Choose job</option>{activeJobs.map((job) => <option key={job.id} value={job.id}>{job.title}</option>)}</select></label>
    </Card>

    <section className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      <Card><p className="text-xs text-slate-400">Total</p><p className="mt-2 text-3xl font-bold">{summary.total}</p></Card>
      <Card><p className="text-xs text-slate-400">Open</p><p className="mt-2 text-3xl font-bold text-amber-200">{summary.outstanding}</p></Card>
      <Card><p className="text-xs text-slate-400">Overdue</p><p className="mt-2 text-3xl font-bold text-rose-300">{summary.overdue}</p></Card>
      <Card><p className="text-xs text-slate-400">Urgent</p><p className="mt-2 text-3xl font-bold text-orange-300">{summary.urgent}</p></Card>
      <Card className="col-span-2 sm:col-span-1"><p className="text-xs text-slate-400">Complete</p><p className="mt-2 text-3xl font-bold text-emerald-300">{summary.completed}</p></Card>
    </section>

    {message ? <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/5 px-4 py-3 text-sm text-cyan-200">{message}</div> : null}

    <Card>
      <form onSubmit={createSnag} className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Linked job</span><select required value={form.jobId} onChange={(event) => setForm({ ...form, jobId: event.target.value })} className="min-h-12 rounded-xl border border-slate-700 bg-slate-950 px-3 text-base"><option value="">Choose job</option>{activeJobs.map((job) => <option key={job.id} value={job.id}>{job.title}</option>)}</select></label>
        <InputField label="Snag title" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Loose socket, missing label…" />
        <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Category</span><select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value as JobTaskCategory })} className="min-h-12 rounded-xl border border-slate-700 bg-slate-950 px-3 text-base">{snagCategories.map((category) => <option key={category} value={category}>{category}</option>)}</select></label>
        <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Priority</span><select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value as JobPriority })} className="min-h-12 rounded-xl border border-slate-700 bg-slate-950 px-3 text-base">{["Low", "Normal", "High", "Urgent"].map((priority) => <option key={priority}>{priority}</option>)}</select></label>
        {cloudFieldMode ? <InputField label="Assigned to" value={operatorMember?.name || "Resolving active engineer…"} readOnly aria-readonly="true" /> : <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Assigned to</span><select value={form.assignedTo} onChange={(event) => setForm({ ...form, assignedTo: event.target.value })} className="min-h-12 rounded-xl border border-slate-700 bg-slate-950 px-3 text-base"><option value="">Unassigned</option>{team.items.filter((member) => member.status === "Active").map((member) => <option key={member.id} value={member.id}>{member.name} · {member.role}</option>)}</select></label>}
        <InputField label="Due date" type="date" value={form.dueDate} onChange={(event) => setForm({ ...form, dueDate: event.target.value })} />
        <div className="md:col-span-2"><TextareaField label="Description" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></div>
        <div className="md:col-span-2"><TextareaField label="Notes" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Location, trade responsible or access details…" /></div>
        <div className="md:col-span-2"><Button type="submit" className="w-full"><Plus className="mr-2 size-4" />Add snag</Button></div>
      </form>
    </Card>

    <section className="space-y-3">
      {!visibleSnags.length ? <Card><ClipboardCheck className="size-5 text-slate-500" /><h2 className="mt-3 font-semibold">No snags recorded</h2><p className="mt-2 text-sm text-slate-400">Choose a job and add the first site snag above.</p></Card> : visibleSnags.map((snag) => {
        const assignee = team.items.find((member) => member.id === snag.assignedTo);
        const overdue = snag.status !== "Completed" && snag.status !== "Customer confirmed" && snag.dueDate && snag.dueDate < today();
        return <Card key={snag.id}>
          <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">{snag.category}</p><h2 className="mt-1 break-words text-lg font-bold">{snag.title}</h2></div><span className="rounded-full border border-slate-700 px-3 py-1 text-xs font-semibold">{snag.priority}</span></div>
          {snag.description ? <p className="mt-3 text-sm text-slate-300">{snag.description}</p> : null}
          <div className="mt-3 space-y-1 text-xs text-slate-400"><p>Status: {snag.status}</p><p>Due: {snag.dueDate || "No due date"}</p><p>Assigned: {assignee?.name || "Unassigned"}</p></div>
          {overdue ? <p className="mt-3 flex items-center gap-2 text-sm text-rose-300"><AlertTriangle className="size-4" />Overdue snag</p> : null}
          <div className="mt-4 grid grid-cols-2 gap-2">{snag.status === "Open" ? <Button type="button" variant="secondary" onClick={() => changeStatus(snag, "In progress")}><Wrench className="mr-2 size-4" />Start</Button> : <Button type="button" variant="secondary" disabled={cloudFieldMode && !fieldJobTaskStatusTransitionAllowed(snag.status, "Open")} onClick={() => changeStatus(snag, "Open")}>Reopen</Button>}<Button type="button" disabled={snag.status === "Completed" || snag.status === "Customer confirmed"} onClick={() => changeStatus(snag, "Completed")}><CheckCircle2 className="mr-2 size-4" />Complete</Button></div>
          <Link href={`/jobs/${snag.jobId}`} className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-slate-700 px-4 text-sm font-semibold">Open full job</Link>
        </Card>;
      })}
    </section>
  </div>;
}
