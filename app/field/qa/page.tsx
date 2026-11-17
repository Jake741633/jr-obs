"use client";

import Link from "next/link";
import { FormEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, ClipboardCheck, Plus, ShieldCheck, XCircle } from "lucide-react";
import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { TextareaField } from "../../../components/ui/FormField";
import { PageHeader } from "../../../components/ui/PageHeader";
import { hasSavedIdentity, savedIdentityIndex } from "../../../lib/assistantIdentity";
import { normalCloudPageSessionUserId } from "../../../lib/cloud/cloudPageIdentity-core.mjs";
import { useJobsCollection, useJobQaInspectionsCollection, useJobTasksCollection, useJobTimelineCollection, useTeamCollection } from "../../../lib/cloud/coreBusinessCollections";
import { activeSyncAuthorizationMatches } from "../../../lib/cloud/repository";
import { useCloudIdentity } from "../../../lib/cloud/useCloudIdentity";
import { buildQaInspection, completeQaInspection, failedQaTask, jobQaTypes, qaCompletion, qaSummary, qaTimelineEntry } from "../../../lib/jobQa-core.mjs";
import { qaTaskCategory } from "../../../lib/jobQaTypes";
import { makeId } from "../../../lib/storage";
import { readSupabaseSession } from "../../../lib/supabase/client";
import type { JobQaInspection, JobQaInspectionType } from "../../../lib/jobQaTypes";
import type { JobTimelineEntry } from "../../../lib/models";

const blankForm = { jobId: "", type: "First fix" as JobQaInspectionType, inspectorId: "", notes: "" };

function linkedRecordState<T extends { id: string }>(index: ReturnType<typeof savedIdentityIndex<T>>, id: string, belongs: (record: T) => boolean) {
  if (!index.counts.has(id)) return "missing";
  const record = index.unique.get(id);
  return record && belongs(record) ? "saved" : "conflict";
}

export default function MobileQaPage() {
  const jobs = useJobsCollection();
  const inspections = useJobQaInspectionsCollection();
  const tasks = useJobTasksCollection();
  const timeline = useJobTimelineCollection();
  const team = useTeamCollection();
  const identityState = useCloudIdentity();
  const qaIdentityScopeKey = JSON.stringify([
    identityState.identity?.organisationId ?? null,
    identityState.identity?.userId ?? null,
    identityState.identity?.role ?? null,
    identityState.identity?.customerSourceId ?? null,
    identityState.mode,
  ]);
  const [form, setForm] = useState(blankForm);
  const [selectedJobId, setSelectedJobId] = useState("");
  const [message, setMessage] = useState("");
  const [interactionScopeKey, setInteractionScopeKey] = useState("");
  const draft = useRef<{ form: typeof blankForm; jobId: string; id: string; saved: boolean } | null>(null);
  const renderedActions = { timelineSaved: new Set<string>(), snagsSaved: new Set<string>() };
  const activeActions = useRef<typeof renderedActions | null>(null);

  const jobIndex = useMemo(() => savedIdentityIndex(jobs.items), [jobs.items]);
  const inspectionIndex = useMemo(() => savedIdentityIndex(inspections.items), [inspections.items]);
  const timelineIndex = useMemo(() => savedIdentityIndex(timeline.items), [timeline.items]);
  const taskIndex = useMemo(() => savedIdentityIndex(tasks.items), [tasks.items]);
  const activeJobs = useMemo(() => jobs.items.filter((job) => !["Complete", "Invoiced", "Paid", "Cancelled"].includes(job.status)), [jobs.items]);

  useLayoutEffect(() => {
    activeActions.current = renderedActions;
    return () => { activeActions.current = null; };
  });

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      draft.current = null;
      setForm(blankForm);
      setSelectedJobId("");
      setMessage("");
      setInteractionScopeKey(qaIdentityScopeKey);
    });
    return () => { active = false; };
  }, [qaIdentityScopeKey]);

  const visibleJobId = selectedJobId || form.jobId || activeJobs[0]?.id || "";
  const visibleInspections = useMemo(() => inspections.items.filter((inspection) => inspection.jobId === visibleJobId).toSorted((a, b) => b.inspectedAt.localeCompare(a.inspectedAt)), [inspections.items, visibleJobId]);
  const summary = useMemo(() => qaSummary(inspections.items, visibleJobId), [inspections.items, visibleJobId]);
  const cloudFieldMode = identityState.mode !== "local" && identityState.identity?.role === "electrician";
  const interactionScopeReady = interactionScopeKey === qaIdentityScopeKey;
  const ready = [jobs, inspections, tasks, timeline, team].every((collection) => collection.isReady) && identityState.isReady && interactionScopeReady;

  if (!ready) return <Card>Loading mobile QA inspections…</Card>;

  function canWrite() {
    if (activeActions.current !== renderedActions) return false;
    if (cloudFieldMode) {
      setMessage("QA inspections are read-only for field cloud sessions until the dedicated secure QA mutation route is available.");
      return false;
    }
    const { mode, identity } = identityState;
    if (mode === "local") return true;
    const session = readSupabaseSession();
    if (!identity) return mode === "migration" && !session;
    return normalCloudPageSessionUserId(session) === identity.userId && activeSyncAuthorizationMatches(identity);
  }

  function activeJobFor(jobId: string) {
    const job = jobIndex.unique.get(jobId);
    return job && activeJobs.includes(job) ? job : undefined;
  }

  function createInspection(event: FormEvent) {
    event.preventDefault();
    if (!canWrite()) return;
    const requestedJobId = form.jobId || visibleJobId;
    const activeJob = activeJobFor(requestedJobId);
    if (!activeJob) {
      setMessage("The selected active job is no longer available for this account. Choose a current active job before creating a QA inspection.");
      return;
    }
    if (draft.current?.form !== form || draft.current.jobId !== activeJob.id) {
      draft.current = { form, jobId: activeJob.id, id: makeId("qa"), saved: false };
    }
    const attempt = draft.current;
    if (attempt.saved) return;
    const inspector = team.items.find((member) => member.id === form.inspectorId);
    try {
      const record = buildQaInspection({ id: attempt.id, jobId: activeJob.id, type: form.type, inspectorId: inspector?.id, inspectorName: inspector?.name || "JR OS engineer", notes: form.notes.trim(), now: new Date().toISOString() }) as JobQaInspection;
      inspections.createItem(record);
      attempt.saved = true;
      setSelectedJobId(activeJob.id);
      setForm({ ...blankForm, jobId: activeJob.id, inspectorId: form.inspectorId });
      setMessage(`${record.type} QA inspection created.`);
    } catch (error) {
      setMessage(`QA inspection save could not be confirmed. Your draft is still here. ${error instanceof Error ? error.message : "Try again."}`);
    }
  }

  function updatePendingInspection(inspection: JobQaInspection, update: (current: JobQaInspection) => JobQaInspection) {
    if (!activeJobFor(inspection.jobId)) throw new Error("Review the current job before changing this inspection.");
    return inspections.updateItem(inspection.id, current => {
      if (current.jobId !== inspection.jobId || current.type !== inspection.type) throw new Error("This inspection has changed. Review its current record.");
      return current.result === "Pending" ? update(current) : current;
    });
  }

  function toggleCheck(inspection: JobQaInspection, checkId: string) {
    if (!canWrite()) return;
    const displayedCheck = inspection.checks.find(check => check.id === checkId);
    try {
      updatePendingInspection(inspection, current => {
        const matching = current.checks.filter(check => check.id === checkId);
        if (matching.length !== 1 || !displayedCheck) throw new Error("Review the checklist item before retrying.");
        if (matching[0].completed !== displayedCheck.completed) return current;
        return {
          ...current,
          checks: current.checks.map(check => check.id === checkId ? { ...check, completed: !check.completed } : check),
          updatedAt: new Date().toISOString(),
        };
      });
      setMessage("");
    } catch (error) {
      setMessage(`QA checklist change could not be saved. ${error instanceof Error ? error.message : "Try again."}`);
    }
  }

  function followUpFor(inspection: JobQaInspection) {
    const timelineId = inspection.completion?.timelineId;
    if ((inspection.result !== "Pass" && inspection.result !== "Fail") || !hasSavedIdentity(timelineId)) return null;
    const snagId = inspection.result === "Fail" ? inspection.completion?.snagId : undefined;
    return {
      timelineId,
      timelineState: linkedRecordState(timelineIndex, timelineId, note => note.jobId === inspection.jobId
        && note.sourceId === inspection.id && note.sourceType === "JobQaInspection"),
      snagId,
      snagState: hasSavedIdentity(snagId) ? linkedRecordState(taskIndex, snagId, snag => snag.jobId === inspection.jobId
        && snag.type === "Snag" && snag.createdAt === inspection.inspectedAt) : null,
    };
  }

  function saveFollowUpRecords(inspection: JobQaInspection) {
    if (!canWrite()) return null;
    const followUp = followUpFor(inspection);
    if (!followUp) return null;
    const { timelineId, timelineState, snagId, snagState } = followUp;
    let saved = timelineState !== "conflict" && snagState !== "conflict";
    const now = inspection.inspectedAt;

    if (timelineState === "missing" && !renderedActions.timelineSaved.has(timelineId)) {
      try {
        timeline.createItem(qaTimelineEntry({ inspection, timelineId, completedBy: inspection.inspectorName, now }) as JobTimelineEntry);
        renderedActions.timelineSaved.add(timelineId);
      } catch {
        saved = false;
      }
    }
    if (snagId && snagState === "missing" && !renderedActions.snagsSaved.has(snagId) && canWrite()) {
      const snag = failedQaTask({ inspection, taskId: snagId, now });
      if (snag) {
        try {
          tasks.createItem({ ...snag, type: "Snag", category: qaTaskCategory(inspection.type), priority: "High", status: "Open" });
          renderedActions.snagsSaved.add(snagId);
        } catch {
          saved = false;
        }
      }
    }
    return canWrite() ? saved : null;
  }

  function retryFollowUp(inspection: JobQaInspection) {
    if (!canWrite()) return;
    const current = inspectionIndex.unique.get(inspection.id);
    if (!current || current.jobId !== inspection.jobId || !jobIndex.unique.has(current.jobId)) {
      setMessage("The saved inspection or job could not be verified. Review both records before retrying.");
      return;
    }
    const saved = saveFollowUpRecords(current);
    if (saved === null) return;
    setMessage(saved ? "QA follow-up records saved on this device." : "Review the remaining QA follow-up records below.");
  }

  function finishInspection(inspection: JobQaInspection, result: "Pass" | "Fail") {
    if (!canWrite()) return;
    let changed = false;
    let updated: JobQaInspection;
    try {
      updated = updatePendingInspection(inspection, current => {
        const resolved = completeQaInspection({ inspection: current, result, notes: current.notes, now: new Date().toISOString() }) as JobQaInspection;
        const completion = { timelineId: makeId("timeline"), snagId: result === "Fail" ? makeId("snag") : undefined };
        changed = true;
        return { ...resolved, completion };
      });
    } catch (error) {
      setMessage(`QA result save could not be confirmed. ${error instanceof Error ? error.message : "Review the inspection and try again."}`);
      return;
    }
    if (!changed) return;
    // The saved result keeps the same follow-up IDs if a write fails or the page is reopened.
    const saved = saveFollowUpRecords(updated);
    if (saved === null) return;
    if (!saved) {
      setMessage(`${updated.type} QA ${result.toLowerCase()} recorded on this device. Review its follow-up records below.`);
      return;
    }
    setMessage(result === "Pass" ? `${updated.type} QA pass recorded on this device. The inspection and timeline entry sync independently.` : `${updated.type} QA fail recorded on this device. The inspection, timeline entry and linked snag sync independently.`);
  }

  return <div className="space-y-5 pb-24 sm:space-y-6 sm:pb-0">
    <PageHeader eyebrow="Job Management Pro" title="Mobile QA inspections" description="Review first fix, second fix, testing, commissioning and handover checks from your phone. Cloud field sessions stay read-only until QA has its own secured mutation route." />

    {cloudFieldMode ? <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 px-4 py-3 text-sm text-amber-100"><p className="font-semibold">QA cloud writes are currently locked.</p><p className="mt-1 text-xs text-amber-100/70">Existing inspections can be reviewed here, but creating inspections, changing checks or recording pass/fail results is blocked rather than stored only in optimistic browser state.</p></div> : null}

    <Card>
      <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Job QA record</span><select value={visibleJobId} onChange={(event) => { setSelectedJobId(event.target.value); setForm((current) => ({ ...current, jobId: event.target.value })); }} className="min-h-12 rounded-xl border border-slate-700 bg-slate-950 px-3 text-base"><option value="">Choose job</option>{activeJobs.map((job) => <option key={job.id} value={job.id}>{job.title}</option>)}</select></label>
    </Card>

    <section className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      <Card><p className="text-xs text-slate-400">Inspections</p><p className="mt-2 text-3xl font-bold">{summary.total}</p></Card>
      <Card><p className="text-xs text-slate-400">Passed</p><p className="mt-2 text-3xl font-bold text-emerald-300">{summary.passed}</p></Card>
      <Card><p className="text-xs text-slate-400">Failed</p><p className="mt-2 text-3xl font-bold text-rose-300">{summary.failed}</p></Card>
      <Card><p className="text-xs text-slate-400">Pending</p><p className="mt-2 text-3xl font-bold text-amber-200">{summary.pending}</p></Card>
      <Card className="col-span-2 sm:col-span-1"><p className="text-xs text-slate-400">QA complete</p><p className="mt-2 text-3xl font-bold text-cyan-300">{summary.completion}%</p></Card>
    </section>

    {message ? <div role="status" className="rounded-xl border border-cyan-400/20 bg-cyan-400/5 px-4 py-3 text-sm text-cyan-200">{message}</div> : null}

    {!cloudFieldMode ? <Card>
      <form onSubmit={createInspection} className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Linked job</span><select required value={form.jobId} onChange={(event) => setForm({ ...form, jobId: event.target.value })} className="min-h-12 rounded-xl border border-slate-700 bg-slate-950 px-3 text-base"><option value="">Choose job</option>{activeJobs.map((job) => <option key={job.id} value={job.id}>{job.title}</option>)}</select></label>
        <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Inspection type</span><select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value as JobQaInspectionType })} className="min-h-12 rounded-xl border border-slate-700 bg-slate-950 px-3 text-base">{jobQaTypes.map((type) => <option key={type}>{type}</option>)}</select></label>
        <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Inspector</span><select value={form.inspectorId} onChange={(event) => setForm({ ...form, inspectorId: event.target.value })} className="min-h-12 rounded-xl border border-slate-700 bg-slate-950 px-3 text-base"><option value="">JR OS engineer</option>{team.items.filter((member) => member.status === "Active").map((member) => <option key={member.id} value={member.id}>{member.name} · {member.role}</option>)}</select></label>
        <div className="md:col-span-2"><TextareaField label="Inspection notes" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Area inspected, limitations or supervisor notes…" /></div>
        <div className="md:col-span-2"><Button type="submit" className="w-full"><Plus className="mr-2 size-4" />Create QA inspection</Button></div>
      </form>
    </Card> : null}

    <section className="space-y-4">
      {!visibleInspections.length ? <Card><ClipboardCheck className="size-5 text-slate-500" /><h2 className="mt-3 font-semibold">No QA inspections recorded</h2><p className="mt-2 text-sm text-slate-400">{cloudFieldMode ? "No QA inspections are available to review for this job." : "Choose a job and create the first quality inspection above."}</p></Card> : visibleInspections.map((inspection) => {
        const completion = qaCompletion(inspection);
        const followUp = !cloudFieldMode && inspectionIndex.unique.has(inspection.id) ? followUpFor(inspection) : null;
        const retryAvailable = followUp?.timelineState === "missing" || followUp?.snagState === "missing";
        return <Card key={inspection.id} className={inspection.result === "Fail" ? "border-rose-400/30" : inspection.result === "Pass" ? "border-emerald-400/30" : undefined}>
          <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">{inspection.type}</p><h2 className="mt-1 text-lg font-bold">{inspection.inspectorName}</h2></div><span className="rounded-full border border-slate-700 px-3 py-1 text-xs font-semibold">{inspection.result}</span></div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-800"><div className="h-full bg-cyan-400" style={{ width: `${completion}%` }} /></div><p className="mt-2 text-xs text-slate-400">Checklist {completion}% complete</p>
          <div className="mt-4 grid gap-2">{inspection.checks.map((check) => <button key={check.id} type="button" disabled={cloudFieldMode || inspection.result !== "Pending"} onClick={() => toggleCheck(inspection, check.id)} className="flex min-h-12 items-center gap-3 rounded-xl border border-slate-800 bg-slate-950/50 px-4 text-left text-sm disabled:opacity-70">{check.completed ? <CheckCircle2 className="size-5 shrink-0 text-emerald-300" /> : <span className="size-5 shrink-0 rounded-full border border-slate-600" />}<span>{check.label}</span></button>)}</div>
          {inspection.notes ? <p className="mt-4 rounded-xl border border-slate-800 bg-slate-950/50 px-4 py-3 text-sm text-slate-300">{inspection.notes}</p> : null}
          {inspection.result === "Pending" ? cloudFieldMode ? <p className="mt-4 text-sm text-amber-200">Pass/fail changes are locked in field cloud mode.</p> : <div className="mt-4 grid grid-cols-2 gap-2"><Button type="button" variant="secondary" onClick={() => finishInspection(inspection, "Fail")}><XCircle className="mr-2 size-4" />Fail</Button><Button type="button" onClick={() => finishInspection(inspection, "Pass")}><ShieldCheck className="mr-2 size-4" />Pass</Button></div> : inspection.result === "Fail" ? <p className="mt-4 flex items-center gap-2 text-sm text-rose-300"><AlertTriangle className="size-4" />{followUp?.snagState === "saved" ? "Linked snag action created" : "Inspection failed"}</p> : <p className="mt-4 flex items-center gap-2 text-sm text-emerald-300"><CheckCircle2 className="size-4" />Inspection passed</p>}
          {followUp && (retryAvailable || followUp.timelineState === "conflict" || followUp.snagState === "conflict") ? <div className="mt-4 space-y-2 text-sm text-amber-200">
            {followUp.timelineState === "missing" ? <p>Timeline note needs saving.</p> : null}
            {followUp.snagState === "missing" ? <p>Linked snag needs saving.</p> : null}
            {followUp.timelineState === "conflict" ? <p>Review the linked timeline note in the job record.</p> : null}
            {followUp.snagState === "conflict" ? <p>Review the linked snag in the job record.</p> : null}
            {retryAvailable ? <Button type="button" variant="secondary" className="min-h-12" onClick={() => retryFollowUp(inspection)}>Retry QA follow-up</Button> : null}
          </div> : null}
          <Link href={`/jobs/${inspection.jobId}`} className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-slate-700 px-4 text-sm font-semibold">Open full job</Link>
        </Card>;
      })}
    </section>
  </div>;
}
