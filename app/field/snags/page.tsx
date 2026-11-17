"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, ClipboardCheck, Plus, Wrench } from "lucide-react";
import { TimelineNoteRetries } from "../../../components/mobile/TimelineNoteRetries";
import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { InputField, TextareaField } from "../../../components/ui/FormField";
import { PageHeader } from "../../../components/ui/PageHeader";
import { normalCloudPageSessionUserId } from "../../../lib/cloud/cloudPageIdentity-core.mjs";
import { useJobsCollection, useJobTasksCollection, useJobTimelineCollection, useTeamCollection } from "../../../lib/cloud/coreBusinessCollections";
import { activeSyncAuthorizationMatches, getSyncQueue, type SyncState } from "../../../lib/cloud/repository";
import { useCloudIdentity } from "../../../lib/cloud/useCloudIdentity";
import { fieldJobTaskStatusTransitionAllowed, jobTaskTimelineEntry, transitionJobTask } from "../../../lib/jobTasks-core.mjs";
import { prioritiseSnags, snagCategories, snagSummary } from "../../../lib/mobileSnagControl-core.mjs";
import { fieldJobAssignedToOperator, fieldOperatorMemberId } from "../../../lib/siteDiaryIdentity-core.mjs";
import { emptySnagSyncProjection, refreshSnagSyncProjection, registerSnagSyncAttempt, snagAttemptStates, snagTaskHasUnconfirmedSync, unpairedSnagTargetStates } from "../../../lib/snagSync-core.mjs";
import { makeId } from "../../../lib/storage";
import { readSupabaseSession } from "../../../lib/supabase/client";
import type { Job, JobPriority, JobTask, JobTaskCategory, JobTimelineEntry } from "../../../lib/models";

const today = () => new Date().toISOString().slice(0, 10);
const blankForm = { jobId: "", title: "", description: "", category: "General" as JobTaskCategory, priority: "Normal" as JobPriority, assignedTo: "", dueDate: today(), notes: "" };

type SnagTargetState = SyncState | "AwaitingQueue";
type SnagSyncProjection = {
  scopeKey: string;
  initialized: boolean;
  attempts: Record<string, { timelineId: string; jobId?: string; title?: string; action?: string }>;
  taskTargets: Record<string, { seen: boolean; state: SnagTargetState }>;
  timelineTargets: Record<string, { seen: boolean; state: SnagTargetState; taskId?: string }>;
};
type SnagDraft = { form: typeof blankForm; jobId: string; assignedTo?: string; id: string; saved: boolean };

const snagTargetMessages: Record<SnagTargetState, string> = {
  AwaitingQueue: "waiting to enter the device sync queue",
  Pending: "queued for cloud confirmation",
  Offline: "saved on this device while offline",
  Failed: "failed to sync",
  Conflict: "conflicted with the current cloud record",
  Synced: "cloud-confirmed",
};

export default function MobileSnagsPage() {
  const jobs = useJobsCollection();
  const tasks = useJobTasksCollection();
  const timeline = useJobTimelineCollection();
  const team = useTeamCollection();
  const identityState = useCloudIdentity();
  const [selectedJobId, setSelectedJobId] = useState("");
  const [form, setForm] = useState(blankForm);
  const [message, setMessage] = useState("");
  const [interactionScopeKey, setInteractionScopeKey] = useState("");
  const [snagSyncProjection, renderSnagSyncProjection] = useState<SnagSyncProjection>(() => emptySnagSyncProjection());
  const liveSnagSyncProjection = useRef(snagSyncProjection);
  const setSnagSyncProjection = useCallback((next: SnagSyncProjection) => {
    liveSnagSyncProjection.current = next;
    renderSnagSyncProjection(next);
  }, []);

  const activeJobs = useMemo(() => jobs.items.filter((job) => !["Complete", "Invoiced", "Paid", "Cancelled"].includes(job.status)), [jobs.items]);
  const visibleJobId = selectedJobId || form.jobId || activeJobs[0]?.id || "";
  const visibleSnags = useMemo(() => prioritiseSnags(tasks.items.filter((task) => task.jobId === visibleJobId)), [tasks.items, visibleJobId]);
  const summary = useMemo(() => snagSummary(tasks.items, visibleJobId), [tasks.items, visibleJobId]);
  const cloudFieldMode = identityState.mode !== "local" && identityState.identity?.role === "electrician";
  const operatorMember = useMemo(() => {
    const operatorMemberId = fieldOperatorMemberId({
      identity: identityState.identity,
      teamMembers: team.items,
      mode: identityState.mode,
    });
    if (!operatorMemberId) return undefined;
    return team.items.find((member) => member.id === operatorMemberId);
  }, [identityState.identity, identityState.mode, team.items]);
  const snagSyncScopeKey = JSON.stringify([
    identityState.identity?.organisationId ?? null,
    identityState.identity?.userId ?? null,
    identityState.identity?.role ?? null,
    identityState.identity?.customerSourceId ?? null,
  ]);
  const saveOwner = useMemo(() => ({ scopeKey: snagSyncScopeKey, mode: identityState.mode }), [snagSyncScopeKey, identityState.mode]);
  const render = {};
  const activeRender = useRef<object | null>(null);
  const writes = useRef<{ owner: typeof saveOwner; draft: SnagDraft | null; notes: Map<string, JobTimelineEntry> } | null>(null);
  const [unsavedNotes, setUnsavedNotes] = useState<{ owner: typeof saveOwner; notes: JobTimelineEntry[] } | null>(null);
  const pendingNotes = unsavedNotes?.owner === saveOwner ? unsavedNotes.notes : [];
  const activeSnagSyncProjection = cloudFieldMode && snagSyncProjection.scopeKey === snagSyncScopeKey
    ? snagSyncProjection
    : emptySnagSyncProjection(snagSyncScopeKey) as SnagSyncProjection;
  const unpairedSnagTargets = cloudFieldMode ? unpairedSnagTargetStates(activeSnagSyncProjection) as { kind: "task" | "timeline"; sourceId: string; taskId?: string; state: SnagTargetState }[] : [];
  const unpairedSnagTerminal = unpairedSnagTargets.some(({ state }) => state === "Failed" || state === "Conflict");
  const refreshWithQueue = useCallback((current: SnagSyncProjection) => {
    const queue = getSyncQueue();
    return refreshSnagSyncProjection({ current, scopeKey: snagSyncScopeKey, queue, online: navigator.onLine }) as SnagSyncProjection;
  }, [snagSyncScopeKey]);

  useLayoutEffect(() => {
    if (writes.current?.owner !== saveOwner) writes.current = { owner: saveOwner, draft: null, notes: new Map() };
    activeRender.current = render;
    return () => { activeRender.current = null; };
  });

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setSnagSyncProjection(emptySnagSyncProjection(snagSyncScopeKey));
      setSelectedJobId("");
      setForm({ ...blankForm, dueDate: today() });
      setMessage("");
      setInteractionScopeKey(snagSyncScopeKey);
    });
    return () => { active = false; };
  }, [snagSyncScopeKey, setSnagSyncProjection]);

  useEffect(() => {
    const identity = identityState.identity;
    if (!cloudFieldMode || !identity) return;
    let active = true;
    const authorization = {
      organisationId: identity.organisationId,
      userId: identity.userId,
      role: identity.role,
      customerSourceId: identity.customerSourceId,
    };

    function refreshSnagSyncStates() {
      if (!active || !activeSyncAuthorizationMatches(authorization)) return;
      setSnagSyncProjection(refreshWithQueue(liveSnagSyncProjection.current));
    }

    window.addEventListener("jr-os-sync-status", refreshSnagSyncStates);
    queueMicrotask(refreshSnagSyncStates);
    return () => {
      active = false;
      window.removeEventListener("jr-os-sync-status", refreshSnagSyncStates);
    };
  }, [cloudFieldMode, identityState.identity, refreshWithQueue, setSnagSyncProjection]);

  const snagSyncReady = !cloudFieldMode || (activeSnagSyncProjection.initialized && snagSyncProjection.scopeKey === snagSyncScopeKey);
  const interactionScopeReady = interactionScopeKey === snagSyncScopeKey;
  const ready = [jobs, tasks, timeline, team].every((collection) => collection.isReady) && identityState.isReady && snagSyncReady && interactionScopeReady;
  if (!ready) return <Card>Loading mobile snag control…</Card>;

  function snagSyncNotice(taskId: string) {
    const attempt = snagAttemptStates(activeSnagSyncProjection, taskId) as {
      task: SnagTargetState;
      timeline: SnagTargetState;
      timelineId: string;
      jobId?: string;
      title?: string;
      action?: string;
    } | null;
    if (!attempt) return null;
    const terminal = [attempt.task, attempt.timeline].some((state) => state === "Failed" || state === "Conflict");
    const synced = attempt.task === "Synced" && attempt.timeline === "Synced";
    return <div key={taskId} role="status" className={`rounded-xl border px-4 py-3 text-sm ${terminal ? "border-rose-400/20 bg-rose-400/5 text-rose-200" : synced ? "border-emerald-400/20 bg-emerald-400/5 text-emerald-100" : "border-amber-400/20 bg-amber-400/5 text-amber-100"}`}>
      <p className="font-semibold">{attempt.title || "Snag change"}{attempt.action ? ` · ${attempt.action}` : ""}</p>
      <p className="mt-1 text-xs">Task record is {snagTargetMessages[attempt.task]}. Job timeline note is {snagTargetMessages[attempt.timeline]}.</p>
      <p className="mt-1 text-xs">{synced ? "The combined snag change is confirmed." : "The combined snag change is not fully cloud-confirmed."}</p>
      {terminal ? <Link href="/cloud" className="mt-2 inline-flex text-xs font-semibold underline underline-offset-2">Open Cloud &amp; account to retry pending changes</Link> : null}
    </div>;
  }

  function currentWrite() {
    if (!ready || activeRender.current !== render) return null;
    if (identityState.mode === "local") return writes.current;
    const session = readSupabaseSession();
    const authorization = identityState.identity;
    if (!authorization) return identityState.mode === "migration" && !session ? writes.current : null;
    if (normalCloudPageSessionUserId(session) !== authorization.userId || !activeSyncAuthorizationMatches(authorization)) return null;
    return writes.current;
  }

  function uniqueJob(jobId: string) {
    const matching = jobs.items.filter(job => job.id === jobId);
    return matching.length === 1 ? matching[0] : undefined;
  }

  function jobAssignedToOperator(job: Job) {
    return fieldJobAssignedToOperator({ job, operatorMemberId: operatorMember?.id });
  }

  function saveTimelineNote(task: JobTask, note: JobTimelineEntry, action: string, before: SnagSyncProjection | null) {
    const write = currentWrite();
    if (!write) return null;
    let noteSaved = true;
    try {
      timeline.createItem(note);
    } catch {
      noteSaved = false;
      write.notes.set(note.id, note);
      setUnsavedNotes({ owner: saveOwner, notes: [...write.notes.values()] });
    }
    if (before) {
      // The new task write can already have refreshed the queue. Register the pair
      // against the projection that approved the action, then read both new targets.
      const attempt = registerSnagSyncAttempt(before, {
        scopeKey: snagSyncScopeKey, taskId: task.id, timelineId: note.id, jobId: task.jobId, title: task.title, action,
      });
      setSnagSyncProjection(refreshWithQueue(attempt));
    }
    return noteSaved;
  }

  function retryTimelineNote(id: string) {
    const write = currentWrite();
    const note = write?.notes.get(id);
    if (!write || !note) return;
    const matching = tasks.items.filter(task => task.id === note.sourceId);
    const task = matching.length === 1 ? matching[0] : undefined;
    const job = uniqueJob(note.jobId);
    if (!task || task.type !== "Snag" || task.jobId !== note.jobId || !job) {
      setMessage("The original snag or job could not be verified. Review the saved records before retrying the note.");
      return;
    }
    if (cloudFieldMode && !jobAssignedToOperator(job)) {
      setMessage("The original job is no longer assigned to your active team identity. Refresh before retrying the note.");
      return;
    }
    if (cloudFieldMode && (!operatorMember || task.assignedTo !== operatorMember.id)) {
      setMessage("The original snag is no longer assigned to your active team identity. Refresh before retrying the note.");
      return;
    }
    try {
      timeline.createItem(note);
    } catch {
      setMessage("The timeline note save could not be confirmed. The snag change is still saved on this device.");
      return;
    }
    write.notes.delete(id);
    setUnsavedNotes({ owner: saveOwner, notes: [...write.notes.values()] });
    if (cloudFieldMode) setSnagSyncProjection(refreshWithQueue(liveSnagSyncProjection.current));
    setMessage("Timeline note saved on this device.");
  }

  function createSnag(event: FormEvent) {
    event.preventDefault();
    const write = currentWrite();
    if (!write) return;
    const jobId = form.jobId || visibleJobId;
    if (!jobId) return setMessage("Choose a job before creating a snag.");
    if (!form.title.trim()) return setMessage("Enter a short snag title.");
    if (cloudFieldMode && !operatorMember) return setMessage("Your active team identity could not be resolved. Refresh your account before creating a snag.");
    const job = uniqueJob(jobId);
    if (!job || (cloudFieldMode && (!activeJobs.includes(job) || !jobAssignedToOperator(job)))) {
      return setMessage("The selected job is unavailable or no longer assigned to your active team identity. Refresh the snag list before creating a snag.");
    }
    const assignedTo = cloudFieldMode ? operatorMember?.id : form.assignedTo || undefined;
    let draft = write.draft;
    if (draft?.form !== form || draft.jobId !== jobId || draft.assignedTo !== assignedTo) {
      draft = { form, jobId, assignedTo, id: makeId("snag"), saved: false };
      write.draft = draft;
    }
    if (draft.saved) return;
    const before = cloudFieldMode ? refreshWithQueue(liveSnagSyncProjection.current) : null;
    const now = new Date().toISOString();
    const snag: JobTask = {
      id: draft.id,
      jobId,
      type: "Snag",
      title: form.title.trim(),
      description: form.description.trim(),
      category: form.category,
      priority: form.priority,
      assignedTo,
      dueDate: form.dueDate,
      status: "Open",
      photos: [],
      notes: form.notes.trim(),
      createdAt: now,
      updatedAt: now,
    };
    try {
      tasks.createItem(snag);
    } catch {
      setMessage("Snag save could not be confirmed. Your draft is still here. Try saving again.");
      return;
    }
    draft.saved = true;
    const completedBy = cloudFieldMode ? operatorMember?.name || "" : "Mobile Snag Control";
    const timelineEntry: JobTimelineEntry = {
      id: makeId("timeline"),
      jobId,
      milestone: "Custom update",
      eventType: "Snag",
      sourceId: snag.id,
      sourceType: "JobTask",
      note: `Snag created · ${snag.title}.`,
      completedBy,
      completedAt: now,
      createdAt: now,
    };
    const noteSaved = saveTimelineNote(snag, timelineEntry, "created", before);
    if (noteSaved === null) return;
    setSelectedJobId(jobId);
    setForm({ ...blankForm, jobId, dueDate: today() });
    const success = cloudFieldMode
      ? `${snag.title} captured on this device; its task record and separate job timeline note are awaiting cloud confirmation.`
      : `${snag.title} added to the job snag list.`;
    setMessage(noteSaved ? success : "");
  }

  function changeStatus(task: JobTask, nextStatus: "In progress" | "Completed" | "Open") {
    if (!currentWrite()) return;
    if (cloudFieldMode && (!operatorMember || task.assignedTo !== operatorMember.id)) {
      setMessage("Only snags assigned to your active field account can be updated here.");
      return;
    }
    const job = uniqueJob(task.jobId);
    if (!job || (cloudFieldMode && (!activeJobs.includes(job) || !jobAssignedToOperator(job)))) {
      setMessage("The assigned active job is no longer available. Refresh the snag list before changing its status.");
      return;
    }
    const before = cloudFieldMode ? refreshWithQueue(liveSnagSyncProjection.current) : null;
    if (before && snagTaskHasUnconfirmedSync(before, task.id)) {
      setMessage("This snag already has a task or timeline change awaiting cloud confirmation. Resolve pending changes before changing it again.");
      return;
    }
    if (cloudFieldMode && !fieldJobTaskStatusTransitionAllowed(task.status, nextStatus)) {
      setMessage("That snag status change is unavailable in the field workflow. Ask the office to reopen a completed snag.");
      return;
    }
    const now = new Date().toISOString();
    let changed = false;
    let updated: JobTask;
    try {
      updated = tasks.updateItem(task.id, current => {
        if (current.type !== "Snag" || current.jobId !== task.jobId || (cloudFieldMode && current.assignedTo !== operatorMember?.id)) {
          throw new Error("The current snag or assignment has changed.");
        }
        if (current.status === nextStatus) return current;
        if (current.status !== task.status) throw new Error("The snag status has changed.");
        changed = true;
        return transitionJobTask({ task: current, nextStatus, now });
      });
    } catch {
      setMessage("Snag status save could not be confirmed. Review the current snag and try again.");
      return;
    }
    if (!changed) return;
    const completedBy = cloudFieldMode ? operatorMember?.name || "" : "Mobile Snag Control";
    const timelineEntry = jobTaskTimelineEntry({ task: updated, fromStatus: task.status, toStatus: nextStatus, timelineId: makeId("timeline"), completedBy, now }) as JobTimelineEntry;
    const noteSaved = saveTimelineNote(updated, timelineEntry, `marked ${nextStatus.toLowerCase()}`, before);
    if (noteSaved === null) return;
    const success = cloudFieldMode
      ? `${updated.title} status captured on this device; its task record and separate job timeline note are awaiting cloud confirmation.`
      : `${updated.title} marked ${nextStatus.toLowerCase()}.`;
    setMessage(noteSaved ? success : "");
  }

  return <div className="space-y-5 pb-24 sm:space-y-6 sm:pb-0">
    <PageHeader eyebrow="Job Management Pro" title="Mobile snag control" description={cloudFieldMode
      ? "Capture site defects and status changes on this device, then follow the task record and separate timeline note through exact cloud confirmation."
      : "Capture site defects, track responsibility and close snags using the existing local job task workflow."} />

    {message ? <div role="status" className="rounded-xl border border-cyan-400/20 bg-cyan-400/5 px-4 py-3 text-sm text-cyan-200">{message}</div> : null}
    <TimelineNoteRetries notes={pendingNotes} onRetry={retryTimelineNote} description="The snag change is saved on this device." />
    {cloudFieldMode ? Object.keys(activeSnagSyncProjection.attempts).reverse().map(snagSyncNotice) : null}
    {cloudFieldMode && unpairedSnagTargets.length ? <div role="status" className={`rounded-xl border px-4 py-3 text-sm ${unpairedSnagTerminal ? "border-rose-400/20 bg-rose-400/5 text-rose-200" : "border-amber-400/20 bg-amber-400/5 text-amber-100"}`}>
      <p className="font-semibold">One or more retained snag sync targets are not cloud-confirmed.</p>
      <p className="mt-1 text-xs opacity-80">An exact snag task or snag timeline note remains pending, offline, failed or conflicted. Affected snags stay locked until their queue targets clear.</p>
      <Link href="/cloud" className="mt-2 inline-flex text-xs font-semibold underline underline-offset-2">Open Cloud &amp; account to review pending changes</Link>
    </div> : null}

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
        const syncBlocked = cloudFieldMode && snagTaskHasUnconfirmedSync(activeSnagSyncProjection, snag.id);
        return <Card key={snag.id}>
          <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">{snag.category}</p><h2 className="mt-1 break-words text-lg font-bold">{snag.title}</h2></div><span className="rounded-full border border-slate-700 px-3 py-1 text-xs font-semibold">{snag.priority}</span></div>
          {snag.description ? <p className="mt-3 text-sm text-slate-300">{snag.description}</p> : null}
          <div className="mt-3 space-y-1 text-xs text-slate-400"><p>Status: {snag.status}</p><p>Due: {snag.dueDate || "No due date"}</p><p>Assigned: {assignee?.name || "Unassigned"}</p></div>
          {overdue ? <p className="mt-3 flex items-center gap-2 text-sm text-rose-300"><AlertTriangle className="size-4" />Overdue snag</p> : null}
          {syncBlocked ? <p className="mt-3 text-xs text-amber-200">Another status change is locked until this snag&apos;s exact task and timeline targets are cloud-confirmed.</p> : null}
          <div className="mt-4 grid grid-cols-2 gap-2">{snag.status === "Open" ? <Button type="button" variant="secondary" disabled={syncBlocked} onClick={() => changeStatus(snag, "In progress")}><Wrench className="mr-2 size-4" />Start</Button> : <Button type="button" variant="secondary" disabled={syncBlocked || (cloudFieldMode && !fieldJobTaskStatusTransitionAllowed(snag.status, "Open"))} onClick={() => changeStatus(snag, "Open")}>Reopen</Button>}<Button type="button" disabled={syncBlocked || snag.status === "Completed" || snag.status === "Customer confirmed"} onClick={() => changeStatus(snag, "Completed")}><CheckCircle2 className="mr-2 size-4" />Complete</Button></div>
          <Link href={`/jobs/${snag.jobId}`} className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-slate-700 px-4 text-sm font-semibold">Open full job</Link>
        </Card>;
      })}
    </section>
  </div>;
}
