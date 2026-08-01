"use client";

import { FormEvent, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ClipboardCheck, Plus, Wrench } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { InputField, TextareaField } from "../../components/ui/FormField";
import { PageHeader } from "../../components/ui/PageHeader";
import { useJobsCollection, useJobTasksCollection, useJobTimelineCollection, useTeamCollection } from "../../lib/cloud/coreBusinessCollections";
import { jobTaskCounts, jobTaskStatuses, jobTaskTimelineEntry, sortJobTasks, transitionJobTask } from "../../lib/jobTasks-core.mjs";
import { makeId } from "../../lib/storage";
import type { JobPriority, JobTask, JobTaskCategory, JobTaskStatus, JobTaskType } from "../../lib/models";

const categories: JobTaskCategory[] = ["General", "Survey", "First fix", "Second fix", "Testing", "Certificate", "Materials", "Handover", "Safety", "Other"];
const priorities: JobPriority[] = ["Low", "Normal", "High", "Urgent"];
const blankForm = {
  jobId: "",
  type: "Task" as JobTaskType,
  title: "",
  description: "",
  category: "General" as JobTaskCategory,
  priority: "Normal" as JobPriority,
  assignedTo: "",
  dueDate: "",
  notes: "",
};

export default function JobTasksPage() {
  const jobs = useJobsCollection();
  const tasks = useJobTasksCollection();
  const timeline = useJobTimelineCollection();
  const team = useTeamCollection();
  const [selectedJobId, setSelectedJobId] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(blankForm);
  const [message, setMessage] = useState("");

  const visibleTasks = useMemo(() => sortJobTasks(tasks.items.filter((task) => !selectedJobId || task.jobId === selectedJobId)), [selectedJobId, tasks.items]);
  const selectedCounts = useMemo(() => selectedJobId ? jobTaskCounts(tasks.items, selectedJobId) : null, [selectedJobId, tasks.items]);
  const ready = jobs.isReady && tasks.isReady && timeline.isReady && team.isReady;

  function openForm(type: JobTaskType) {
    setForm({ ...blankForm, jobId: selectedJobId, type });
    setShowForm(true);
    setMessage("");
  }

  function createTask(event: FormEvent) {
    event.preventDefault();
    if (!form.jobId) { setMessage("Choose the job this task belongs to."); return; }
    if (!form.title.trim()) { setMessage("Enter a task or snag title."); return; }
    const now = new Date().toISOString();
    const task: JobTask = {
      id: makeId(form.type === "Snag" ? "snag" : "task"),
      jobId: form.jobId,
      type: form.type,
      title: form.title.trim(),
      description: form.description.trim(),
      category: form.category,
      priority: form.priority,
      assignedTo: form.assignedTo || undefined,
      dueDate: form.dueDate,
      status: "Open",
      photos: [],
      notes: form.notes.trim(),
      createdAt: now,
      updatedAt: now,
    };
    tasks.setItems((current) => [task, ...current]);
    timeline.setItems((current) => [{
      id: makeId("timeline"),
      jobId: task.jobId,
      milestone: "Custom update",
      eventType: task.type,
      sourceId: task.id,
      sourceType: "JobTask",
      note: `${task.type} · ${task.title} created with ${task.priority.toLowerCase()} priority.`,
      completedBy: "JR OS",
      completedAt: now,
      createdAt: now,
    }, ...current]);
    setSelectedJobId(task.jobId);
    setForm(blankForm);
    setShowForm(false);
    setMessage(`${task.type} saved and added to the job timeline.`);
  }

  function changeStatus(task: JobTask, nextStatus: JobTaskStatus) {
    const now = new Date().toISOString();
    try {
      const updated = transitionJobTask({ task, nextStatus, now });
      tasks.setItems((current) => current.map((item) => item.id === task.id ? updated : item));
      if (task.status !== nextStatus) {
        timeline.setItems((current) => [jobTaskTimelineEntry({ task: updated, fromStatus: task.status, toStatus: nextStatus, timelineId: makeId("timeline"), completedBy: "JR OS", now }), ...current]);
      }
      setMessage(`${task.type} updated to ${nextStatus}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The status could not be changed.");
    }
  }

  function removeTask(task: JobTask) {
    if (!window.confirm(`Delete ${task.type.toLowerCase()} “${task.title}”?`)) return;
    tasks.remove((item) => item.id === task.id);
    setMessage(`${task.type} deleted.`);
  }

  if (!ready) return <Card>Loading job tasks…</Card>;

  return <main className="space-y-6 pb-24">
    <PageHeader eyebrow="Job Management Pro" title="Tasks & Snagging" description="Track site actions, defects and customer-confirmed completion from one mobile workspace." action={<Button onClick={() => openForm("Task")}><Plus className="mr-2 size-4" />Add task</Button>} />

    {message ? <div role="status" className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 px-4 py-3 text-sm text-cyan-200">{message}</div> : null}

    <Card>
      <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Job</span><select value={selectedJobId} onChange={(event) => setSelectedJobId(event.target.value)} className="min-h-12 rounded-xl border border-slate-700 bg-slate-950 px-3"><option value="">All jobs</option>{jobs.items.toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map((job) => <option key={job.id} value={job.id}>{job.title} · {job.siteAddress || "No address"}</option>)}</select></label>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <button type="button" onClick={() => openForm("Task")} className="min-h-12 rounded-xl border border-cyan-500/20 bg-cyan-500/5 px-3 text-sm font-semibold text-cyan-200"><Plus className="mx-auto mb-1 size-4" />Task</button>
        <button type="button" onClick={() => openForm("Snag")} className="min-h-12 rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 text-sm font-semibold text-amber-200"><Wrench className="mx-auto mb-1 size-4" />Snag</button>
        <div className="rounded-xl bg-slate-950 p-3"><p className="text-xs text-slate-500">Outstanding</p><p className="mt-1 text-xl font-black">{selectedCounts?.outstanding ?? visibleTasks.filter((task) => !["Completed", "Customer confirmed"].includes(task.status)).length}</p></div>
        <div className="rounded-xl bg-slate-950 p-3"><p className="text-xs text-slate-500">Completed</p><p className="mt-1 text-xl font-black text-emerald-300">{selectedCounts?.completed ?? visibleTasks.filter((task) => ["Completed", "Customer confirmed"].includes(task.status)).length}</p></div>
      </div>
    </Card>

    {showForm ? <Card><form onSubmit={createTask} className="space-y-4">
      <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">New {form.type}</p><h2 className="mt-1 text-lg font-bold">Record site action</h2></div><Button type="button" variant="secondary" onClick={() => setShowForm(false)}>Close</Button></div>
      <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Job</span><select required value={form.jobId} onChange={(event) => setForm({ ...form, jobId: event.target.value })} className="min-h-12 rounded-xl border border-slate-700 bg-slate-950 px-3"><option value="">Choose job</option>{jobs.items.map((job) => <option key={job.id} value={job.id}>{job.title}</option>)}</select></label>
      <div className="grid gap-4 sm:grid-cols-2"><InputField required label="Title" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /><label className="grid gap-2 text-sm font-medium text-slate-300"><span>Type</span><select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value as JobTaskType })} className="min-h-12 rounded-xl border border-slate-700 bg-slate-950 px-3"><option>Task</option><option>Snag</option></select></label></div>
      <TextareaField label="Description" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
      <div className="grid gap-4 sm:grid-cols-2"><label className="grid gap-2 text-sm font-medium text-slate-300"><span>Category</span><select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value as JobTaskCategory })} className="min-h-12 rounded-xl border border-slate-700 bg-slate-950 px-3">{categories.map((category) => <option key={category}>{category}</option>)}</select></label><label className="grid gap-2 text-sm font-medium text-slate-300"><span>Priority</span><select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value as JobPriority })} className="min-h-12 rounded-xl border border-slate-700 bg-slate-950 px-3">{priorities.map((priority) => <option key={priority}>{priority}</option>)}</select></label></div>
      <div className="grid gap-4 sm:grid-cols-2"><label className="grid gap-2 text-sm font-medium text-slate-300"><span>Assigned person</span><select value={form.assignedTo} onChange={(event) => setForm({ ...form, assignedTo: event.target.value })} className="min-h-12 rounded-xl border border-slate-700 bg-slate-950 px-3"><option value="">Unassigned</option>{team.items.filter((member) => member.status === "Active").map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label><InputField label="Due date" type="date" value={form.dueDate} onChange={(event) => setForm({ ...form, dueDate: event.target.value })} /></div>
      <TextareaField label="Notes" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
      <Button type="submit" className="w-full sm:w-auto"><ClipboardCheck className="mr-2 size-4" />Save {form.type.toLowerCase()}</Button>
    </form></Card> : null}

    <section className="space-y-3">
      {visibleTasks.length ? visibleTasks.map((task) => {
        const job = jobs.items.find((item) => item.id === task.jobId);
        const assignee = team.items.find((member) => member.id === task.assignedTo);
        const complete = ["Completed", "Customer confirmed"].includes(task.status);
        return <Card key={task.id} className={complete ? "border-emerald-500/20" : task.type === "Snag" ? "border-amber-500/20" : ""}>
          <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${task.type === "Snag" ? "bg-amber-500/10 text-amber-300" : "bg-cyan-500/10 text-cyan-300"}`}>{task.type}</span><span className="rounded-full bg-slate-800 px-2 py-1 text-xs text-slate-300">{task.priority}</span><span className="rounded-full bg-slate-800 px-2 py-1 text-xs text-slate-300">{task.status}</span></div><h2 className="mt-3 text-lg font-bold">{task.title}</h2><p className="mt-1 text-sm text-slate-400">{job?.title ?? "Unknown job"} · {task.category}</p></div>{complete ? <CheckCircle2 className="size-6 shrink-0 text-emerald-300" /> : task.priority === "Urgent" ? <AlertTriangle className="size-6 shrink-0 text-red-300" /> : null}</div>
          {task.description ? <p className="mt-4 whitespace-pre-wrap text-sm text-slate-300">{task.description}</p> : null}
          <div className="mt-4 grid gap-2 text-xs text-slate-500 sm:grid-cols-3"><span>Assigned: {assignee?.name ?? "Unassigned"}</span><span>Due: {task.dueDate ? new Date(`${task.dueDate}T12:00:00`).toLocaleDateString("en-GB") : "No date"}</span><span>Photos: {task.photos.length}</span></div>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">{jobTaskStatuses.map((status) => <button key={status} type="button" disabled={task.status === status} onClick={() => changeStatus(task, status as JobTaskStatus)} className="min-h-11 rounded-xl border border-slate-700 px-2 text-xs font-semibold text-slate-300 disabled:border-cyan-500/30 disabled:bg-cyan-500/10 disabled:text-cyan-200">{status}</button>)}</div>
          <button type="button" onClick={() => removeTask(task)} className="mt-4 min-h-11 text-sm font-semibold text-red-300">Delete {task.type.toLowerCase()}</button>
        </Card>;
      }) : <Card><h2 className="font-bold">No tasks or snags</h2><p className="mt-2 text-sm text-slate-400">Choose a job and add the first action needed on site.</p></Card>}
    </section>
  </main>;
}
