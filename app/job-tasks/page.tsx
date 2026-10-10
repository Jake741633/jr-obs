"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, ClipboardCheck, Plus, Wrench } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { InputField, TextareaField } from "../../components/ui/FormField";
import { PageHeader } from "../../components/ui/PageHeader";
import { useJobsCollection, useJobTasksCollection, useJobTimelineCollection, useTeamCollection } from "../../lib/cloud/coreBusinessCollections";
import { isOutstandingJobTask, isJobTaskStatus, jobTaskStatuses, jobTaskStatusTransitionAllowed, jobTaskTimelineEntry, transitionJobTask } from "../../lib/jobTasks-core.mjs";
import { assistantDateKey, assistantDay } from "../../lib/assistantSignals-core.mjs";
import { filterTaskInbox, resolveTaskInboxLink, taskInboxFilters, taskMatchesInboxFilter, type TaskInboxFilter } from "../../lib/taskInbox";
import { makeId } from "../../lib/storage";
import type { JobPriority, JobTask, JobTaskCategory, JobTaskStatus, JobTaskType, JobTimelineEntry } from "../../lib/models";

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
  const [filter, setFilter] = useState<TaskInboxFilter>("Open");
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(8);
  const [targetTaskId, setTargetTaskId] = useState("");
  const [missingLink, setMissingLink] = useState(false);
  const [today, setToday] = useState(() => assistantDateKey(new Date()));
  const deepLinkHandled = useRef(false);
  const draft = useRef({ id: "", saved: false });
  const [pendingNotes, setPendingNotes] = useState<JobTimelineEntry[]>([]);
  const completedNoteIds = useRef(new Set<string>());

  const visibleTasks = useMemo(() => missingLink ? [] : targetTaskId ? tasks.items.filter((task) => task.id === targetTaskId && (!selectedJobId || task.jobId === selectedJobId)) : filterTaskInbox(tasks.items, jobs.items, { jobId: selectedJobId, filter, query, today }), [missingLink, targetTaskId, selectedJobId, tasks.items, jobs.items, filter, query, today]);
  const jobTasks = tasks.items.filter((task) => !selectedJobId || task.jobId === selectedJobId);
  const ready = jobs.isReady && tasks.isReady && timeline.isReady && team.isReady;

  useEffect(() => {
    const update = () => setToday(assistantDateKey(new Date()));
    const timer = window.setInterval(update, 60_000);
    window.addEventListener("focus", update);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", update); };
  }, []);

  useEffect(() => {
    if (!ready || deepLinkHandled.current) return;
    const frame = window.requestAnimationFrame(() => {
      const link = resolveTaskInboxLink(tasks.items, jobs.items, window.location.search);
      setTargetTaskId(link.taskId); setSelectedJobId(link.jobId); setMissingLink(link.missing);
      deepLinkHandled.current = true;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [ready, tasks.items, jobs.items]);

  function clearTarget() { setTargetTaskId(""); setMissingLink(false); setLimit(8); }
  function resetInbox() { clearTarget(); setSelectedJobId(""); setFilter("Open"); setQuery(""); }

  function openForm(type: JobTaskType) {
    draft.current = { id: "", saved: false };
    setForm({ ...blankForm, jobId: selectedJobId, type });
    setShowForm(true);
    setMessage("");
  }

  function createTask(event: FormEvent) {
    event.preventDefault();
    if (draft.current.saved || !showForm) return;
    if (!ready) { setMessage("Wait for task records to finish loading. Your draft is still here."); return; }
    if (!jobs.items.some((job) => job.id === form.jobId)) { setMessage("Choose an available job this task belongs to."); return; }
    if (!form.title.trim()) { setMessage("Enter a task or snag title."); return; }
    if (form.dueDate && assistantDay(form.dueDate) === null) { setMessage("Choose a valid due date, or leave it blank. Your draft is still here."); return; }
    const now = new Date().toISOString();
    draft.current.id ||= makeId(form.type === "Snag" ? "snag" : "task");
    const task: JobTask = {
      id: draft.current.id,
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
    try {
      // Persist before dismissing the form. setItems alone writes later in an effect.
      tasks.createItem(task);
    } catch (error) {
      setMessage(`${task.type} save could not be confirmed. Your draft is still here. ${error instanceof Error ? error.message : "Please try again."}`);
      return;
    }
    draft.current.saved = true;
    setSelectedJobId(task.jobId);
    clearTarget(); setFilter("Open"); setQuery("");
    setForm(blankForm);
    setShowForm(false);
    const note: JobTimelineEntry = {
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
    };
    try {
      timeline.createItem(note);
      completedNoteIds.current.add(note.id);
      setMessage(`${task.type} and timeline note saved on this device. Check sync status before switching devices.`);
    } catch (error) {
      setPendingNotes((current) => [...current, note]);
      setMessage(`${task.type} saved on this device, but its timeline note was not saved. Retry the note below; do not recreate the task. ${error instanceof Error ? error.message : ""}`);
    }
  }

  function retryTaskNote(note: JobTimelineEntry) {
    if (!ready) { setMessage("Wait for task records to finish loading before retrying the note."); return; }
    const existing = timeline.items.find((item) => item.id === note.id);
    if (existing && (existing.jobId !== note.jobId || existing.sourceId !== note.sourceId || existing.sourceType !== note.sourceType)) {
      setMessage("The timeline note ID is already used by a different record. Review the job timeline before retrying."); return;
    }
    if (!existing && !completedNoteIds.current.has(note.id)) {
      if (!tasks.items.some((task) => task.id === note.sourceId && task.jobId === note.jobId)) {
        setMessage("The saved task is no longer available on this job. Review its current record before retrying the note."); return;
      }
      try { timeline.createItem(note); }
      catch (error) { setMessage(`The task remains saved, but its timeline note could not be saved. ${error instanceof Error ? error.message : "Please try again."}`); return; }
    }
    completedNoteIds.current.add(note.id);
    setPendingNotes((current) => current.filter((item) => item.id !== note.id));
    setMessage("Timeline note saved on this device. Check sync status before switching devices.");
  }

  function changeStatus(task: JobTask, nextStatus: JobTaskStatus) {
    if (!ready) { setMessage("Wait for task records to finish loading before changing status."); return; }
    const now = new Date().toISOString();
    let previousStatus: JobTaskStatus | undefined;
    let updated: JobTask;
    try {
      updated = tasks.updateItem(task.id, (current) => {
        if (current.jobId !== task.jobId) throw new Error("This task has moved to another job. Review its current record before changing status.");
        if (current.status === nextStatus) return current;
        if (current.status !== task.status) throw new Error("This task's status has changed. Review its current record before retrying.");
        if (!jobTaskStatusTransitionAllowed(current.status, nextStatus)) throw new Error(`${current.type} cannot move from ${current.status} to ${nextStatus}.`);
        previousStatus = current.status;
        return transitionJobTask({ task: current, nextStatus, now });
      });
    } catch (error) {
      setMessage(`Status save could not be confirmed. Review the task and retry. ${error instanceof Error ? error.message : ""}`);
      return;
    }
    if (previousStatus === undefined) { setMessage(`${updated.type} is already ${nextStatus}.`); return; }
    const note = jobTaskTimelineEntry({ task: updated, fromStatus: previousStatus, toStatus: nextStatus, timelineId: makeId("timeline"), completedBy: "JR OS", now });
    try {
      timeline.createItem(note);
      completedNoteIds.current.add(note.id);
      setMessage(`${updated.type} updated to ${nextStatus} and timeline note saved on this device. Check sync status before switching devices.`);
    } catch (error) {
      setPendingNotes((current) => [...current, note]);
      setMessage(`${updated.type} updated to ${nextStatus} on this device, but its timeline note was not saved. Retry the note below. ${error instanceof Error ? error.message : ""}`);
    }
  }

  function removeTask(task: JobTask) {
    if (!ready) { setMessage("Wait for task records to finish loading before deleting."); return; }
    if (!window.confirm(`Delete ${task.type.toLowerCase()} “${task.title}”?`)) return;
    try {
      tasks.removeItem(task.id, (current) => {
        if (JSON.stringify(current) !== JSON.stringify(task)) throw new Error("This task has changed. Review its current record before deleting.");
      });
      setMessage(`${task.type} deleted on this device. Check sync status before switching devices.`);
    } catch (error) {
      setMessage(`Deletion could not be confirmed. Review the task and retry. ${error instanceof Error ? error.message : ""}`);
    }
  }

  if (!ready) return <Card>Loading job tasks…</Card>;

  return <main className="space-y-6 pb-24">
    <PageHeader eyebrow="Job Management Pro" title="Tasks & Snagging" description="Track site actions, defects and customer-confirmed completion from one mobile workspace." action={<Button onClick={() => openForm("Task")}><Plus className="mr-2 size-4" />Add task</Button>} />

    {message ? <div role="status" className="break-words rounded-xl border border-cyan-500/20 bg-cyan-500/5 px-4 py-3 text-sm text-cyan-200">{message}</div> : null}
    {pendingNotes.length ? <Card className="border-amber-400/30" aria-label="Unsaved task timeline notes"><h2 className="font-bold">Task saved — timeline note needs retrying</h2><p className="mt-2 text-sm text-slate-400">Your task change has been saved on this device. Keep this page open to retry its timeline note; leaving keeps the task change but loses this unsaved note.</p><div className="mt-3 space-y-3">{pendingNotes.map((note) => <div key={note.id} className="rounded-xl border border-slate-700 p-3"><p className="break-words text-sm">{note.note}</p><button type="button" onClick={() => retryTaskNote(note)} className="mt-3 min-h-12 rounded-xl border border-amber-400/30 px-3 text-sm font-semibold text-amber-200">Retry timeline note</button></div>)}</div></Card> : null}

    <Card>
      <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Job</span><select value={selectedJobId} onChange={(event) => { setSelectedJobId(event.target.value); clearTarget(); }} className="min-h-12 rounded-xl border border-slate-700 bg-slate-950 px-3 text-base"><option value="">All jobs</option>{jobs.items.toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map((job) => <option key={job.id} value={job.id}>{job.title} · {job.siteAddress || "No address"}</option>)}</select></label>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <button type="button" onClick={() => openForm("Task")} className="min-h-12 rounded-xl border border-cyan-500/20 bg-cyan-500/5 px-3 text-sm font-semibold text-cyan-200"><Plus className="mx-auto mb-1 size-4" />Task</button>
        <button type="button" onClick={() => openForm("Snag")} className="min-h-12 rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 text-sm font-semibold text-amber-200"><Wrench className="mx-auto mb-1 size-4" />Snag</button>
        <div className="rounded-xl bg-slate-950 p-3"><p className="text-xs text-slate-500">Outstanding</p><p className="mt-1 text-xl font-black">{jobTasks.filter(isOutstandingJobTask).length}</p></div>
        <div className="rounded-xl bg-slate-950 p-3"><p className="text-xs text-slate-500">Completed</p><p className="mt-1 text-xl font-black text-emerald-300">{jobTasks.filter((task) => !isOutstandingJobTask(task)).length}</p></div>
      </div>
    </Card>

    <section aria-label="Find tasks" className="space-y-3">
      {targetTaskId || missingLink ? <Card role="status"><p className="font-semibold">{missingLink || !visibleTasks.length ? "This task link is unavailable in the loaded records." : "Showing the task you opened"}</p><p className="mt-1 text-sm text-slate-400">{missingLink || !visibleTasks.length ? "The record may have changed or may not be available to this account." : "Its current status is shown below, including any changes since the assistant answer."}</p><button type="button" onClick={resetInbox} className="mt-3 min-h-12 rounded-xl border border-slate-700 px-3 text-sm font-semibold text-cyan-200">Show all open tasks</button></Card> : null}
      <div role="group" aria-label="Task filters" className="grid grid-cols-3 gap-2 sm:grid-cols-5">{taskInboxFilters.map((item) => <button key={item} type="button" aria-pressed={!targetTaskId && !missingLink && filter === item} onClick={() => { clearTarget(); setFilter(item); }} className={`min-h-12 rounded-xl border px-2 text-sm font-semibold ${!targetTaskId && !missingLink && filter === item ? "border-cyan-400/50 bg-cyan-400/10 text-cyan-200" : "border-slate-700 bg-slate-900 text-slate-300"}`}>{item} <span className="text-xs opacity-70">{jobTasks.filter((task) => taskMatchesInboxFilter(task, item, today)).length}</span></button>)}</div>
      <label className="block text-sm font-semibold">Search tasks or site address<input type="search" maxLength={160} autoComplete="off" value={query} onChange={(event) => { clearTarget(); setQuery(event.target.value); }} placeholder="Task, job, snag or address…" className="mt-2 min-h-12 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-base" /></label>
      <p role="status" className="text-sm text-slate-400">{visibleTasks.length} matching {visibleTasks.length === 1 ? "item" : "items"} · Due includes today and earlier ({today}). Counts are for the selected job, before search.</p>
      {query || selectedJobId || filter !== "Open" ? <button type="button" onClick={resetInbox} className="min-h-12 text-sm font-semibold text-cyan-200">Reset filters</button> : null}
    </section>

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
      {visibleTasks.length ? visibleTasks.slice(0, limit).map((task) => {
        const job = jobs.items.find((item) => item.id === task.jobId);
        const assignee = team.items.find((member) => member.id === task.assignedTo);
        const complete = !isOutstandingJobTask(task);
        return <Card key={task.id} aria-label={`${task.type}: ${task.title}`} className={`break-words ${targetTaskId === task.id ? "border-cyan-400/50" : complete ? "border-emerald-500/20" : task.type === "Snag" ? "border-amber-500/20" : ""}`}>
          <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${task.type === "Snag" ? "bg-amber-500/10 text-amber-300" : "bg-cyan-500/10 text-cyan-300"}`}>{task.type}</span><span className="rounded-full bg-slate-800 px-2 py-1 text-xs text-slate-300">{task.priority}</span><span className="rounded-full bg-slate-800 px-2 py-1 text-xs text-slate-300">{task.status}</span></div><h2 className="mt-3 text-lg font-bold">{task.title}</h2><p className="mt-1 text-sm text-slate-400">{job?.title ?? "Unknown job"} · {task.category}</p></div>{complete ? <CheckCircle2 className="size-6 shrink-0 text-emerald-300" /> : task.priority === "Urgent" ? <AlertTriangle className="size-6 shrink-0 text-red-300" /> : null}</div>
          {task.description ? <p className="mt-4 whitespace-pre-wrap text-sm text-slate-300">{task.description}</p> : null}
          <div className="mt-4 grid gap-2 text-xs text-slate-500 sm:grid-cols-3"><span>Assigned: {assignee?.name ?? "Unassigned"}</span><span>Due: {assistantDay(task.dueDate) !== null ? new Date(`${task.dueDate}T12:00:00`).toLocaleDateString("en-GB") : task.dueDate ? "Date needs review" : "No date"}</span><span>Photos: {task.photos.length}</span></div>
          {!isJobTaskStatus(task.status) ? <p className="mt-3 text-sm text-amber-200">Saved status needs review. Choose a supported next stage after checking the task.</p> : ["Open", "In progress"].includes(task.status) ? <p className="mt-3 text-sm text-slate-400">Complete the task before recording customer confirmation.</p> : task.status === "Customer confirmed" ? <p className="mt-3 text-sm text-slate-400">Reopen the task before moving it to another stage.</p> : null}
          <div role="group" aria-label="Task status actions" className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">{jobTaskStatuses.map((status) => <button key={status} type="button" aria-pressed={task.status === status} disabled={!jobTaskStatusTransitionAllowed(task.status, status)} onClick={() => changeStatus(task, status)} className={`min-h-12 rounded-xl border px-2 text-xs font-semibold ${task.status === status ? "border-cyan-500/30 bg-cyan-500/10 text-cyan-200" : "border-slate-700 text-slate-300 disabled:opacity-40"}`}>{status}</button>)}</div>
          <button type="button" onClick={() => removeTask(task)} className="mt-4 min-h-12 text-sm font-semibold text-red-300">Delete {task.type.toLowerCase()}</button>
        </Card>;
      }) : <Card><h2 className="font-bold">No matching tasks or snags</h2><p className="mt-2 text-sm text-slate-400">Try another filter or search, or choose a job to add an action. Only loaded records are included.</p></Card>}
      {visibleTasks.length > limit ? <button type="button" onClick={() => setLimit((value) => value + 8)} className="min-h-12 w-full rounded-xl border border-slate-700 px-3 text-sm font-semibold">Show more tasks ({visibleTasks.length - limit} remaining)</button> : null}
    </section>
  </main>;
}
