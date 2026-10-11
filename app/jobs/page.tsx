"use client";

import Link from "next/link";
import { FormEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { BriefcaseBusiness, CalendarDays, Eye, MapPin, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { InputField, TextareaField } from "../../components/ui/FormField";
import { PageHeader } from "../../components/ui/PageHeader";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { EntityEmptyState } from "../../components/crm/EntityEmptyState";
import { accountStorageKey } from "../../lib/cloud/adapter";
import { useBuildersCollection, useCustomersCollection, useJobsCollection, useJobTimelineCollection, useTeamCollection } from "../../lib/cloud/coreBusinessCollections";
import { collectionCloudMutationRoute, fieldMutationRouteAllows } from "../../lib/cloud/fieldMutationPolicy-core.mjs";
import { canDeleteRecords, canEditFinance } from "../../lib/cloud/permissions";
import { queueTargetSyncState } from "../../lib/cloud/repository-core.mjs";
import { getSyncQueue, type SyncState } from "../../lib/cloud/repository";
import { useCloudIdentity } from "../../lib/cloud/useCloudIdentity";
import { canonicalJobStatuses, fieldJobStatusTransitionAllowed, fieldJobStatusTransitions, initialJobTimelineEntry, normaliseFieldJobStatus, normaliseJobStatus, transitionJobStatus } from "../../lib/jobManagement-core.mjs";
import { fieldOperatorMemberId } from "../../lib/siteDiaryIdentity-core.mjs";
import { assistantJobBriefingHref } from "../../lib/assistantJobLink";
import { savedIdentityIndex } from "../../lib/assistantIdentity";
import { assistantDay } from "../../lib/assistantSignals-core.mjs";
import { makeId } from "../../lib/storage";
import type { CanonicalJobStatus, Job, JobTimelineEntry } from "../../lib/models";

const blank = { title: "", customerId: "", builderId: "", siteAddress: "", status: "Enquiry" as CanonicalJobStatus | "", startDate: "", value: "", notes: "" };
type JobDraft = { id: string; createdAt: string; editingId: string | null; expected: string; form: typeof blank; scopeKey: string; saved: boolean };
type PendingJobNote = { note: JobTimelineEntry; jobTitle: string; jobCreatedAt: string; scopeKey: string };
function jobEditSnapshot(job: Job) {
  return JSON.stringify([job.createdAt, job.title, job.customerId ?? "", job.builderId ?? "", job.siteAddress, job.status, job.startDate ?? "", job.value ?? 0, job.notes ?? ""]);
}
function sameJobNote(left: JobTimelineEntry, right: JobTimelineEntry) {
  const fields: (keyof JobTimelineEntry)[] = ["id", "jobId", "milestone", "eventType", "sourceId", "sourceType", "fromStatus", "toStatus", "note", "completedBy", "completedAt", "createdAt"];
  return fields.every((field) => left[field] === right[field]);
}
const jobEditHandoffMessage = "Job creation and commercial editing are managed by the office. Deletion requires an owner or administrator. Assigned jobs remain available to view, and status changes use the secure field job route.";
const jobDeleteHandoffMessage = "Only an owner or administrator can delete a job.";
const fieldStatusHandoffMessage = "That stage change is not available in the field workflow. Choose an approved next stage or ask the office to update the job.";
const unavailableStatusMessage = "Job status changes are unavailable until an approved cloud identity is active.";
const unresolvedFieldIdentityMessage = "Your active team identity could not be resolved. Refresh your account before changing a job stage.";

type JobStatusSyncProjection = {
  scopeKey: string;
  states: Partial<Record<string, SyncState>>;
};

const jobStatusSyncMessages: Record<SyncState, string> = {
  Synced: "Job stage confirmed by cloud.",
  Pending: "Displayed job stage is this device's queued attempt until cloud confirmation.",
  Offline: "Displayed job stage is saved on this device and is not cloud-confirmed yet.",
  Failed: "Job stage sync failed. Displayed stage may be local and is not cloud-confirmed. Refresh or resolve sync before another change.",
  Conflict: "Job stage sync conflicted with the cloud record. Displayed stage may be local and is not cloud-confirmed. Refresh or resolve sync before another change.",
};

function jobCurrentStatus(job: Job, fieldRestricted: boolean) {
  return fieldRestricted ? normaliseFieldJobStatus(job.status) : normaliseJobStatus(job.status);
}

const closedJobStages = new Set(["Complete", "Invoiced", "Paid", "Cancelled"]);
type JobFilter = "All" | "Active" | "Closed" | "Review" | CanonicalJobStatus;

function jobBrowseStatus(job: Job, fieldRestricted: boolean) {
  const saved = typeof job.status === "string" ? (fieldRestricted ? job.status.replace(/^ +| +$/g, "") : job.status) : "";
  return canonicalJobStatuses.includes(saved as CanonicalJobStatus) || saved === "Lead" || saved === "In progress"
    ? jobCurrentStatus(job, fieldRestricted)
    : null;
}

export default function JobsPage() {
  const identityState = useCloudIdentity();
  const directJobMutation = identityState.identity
    ? collectionCloudMutationRoute("jobs", identityState.identity.role).kind === "direct"
    : false;
  const jobStatusMutationRoute = identityState.identity
    ? collectionCloudMutationRoute("jobs", identityState.identity.role)
    : { kind: "deny" as const };
  const directJobStatusMutation = identityState.identity
    ? canEditFinance(identityState.identity.role) && jobStatusMutationRoute.kind === "direct"
    : false;
  const fieldJobStatusRestricted = identityState.mode !== "local"
    && fieldMutationRouteAllows(jobStatusMutationRoute, "upsert", "update");
  const jobStatusMutationDenied = identityState.mode !== "local"
    && !directJobStatusMutation
    && !fieldJobStatusRestricted;
  const jobEditRestricted = identityState.mode !== "local" && (
    !identityState.identity
    || !canEditFinance(identityState.identity.role)
    || !directJobMutation
  );
  const jobDeleteRestricted = identityState.mode !== "local" && (
    !identityState.identity
    || !canDeleteRecords(identityState.identity.role)
    || !directJobMutation
  );
  const jobs = useJobsCollection();
  const customers = useCustomersCollection();
  const builders = useBuildersCollection();
  const timeline = useJobTimelineCollection();
  const team = useTeamCollection();
  const [form, setForm] = useState(blank);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<JobFilter>("All");
  const [limit, setLimit] = useState(8);
  const [error, setError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const draft = useRef<JobDraft | null>(null);
  const [pendingNotes, setPendingNotes] = useState<PendingJobNote[]>([]);
  const completedNoteIds = useRef(new Set<string>());
  const deletedRecords = useRef(new WeakSet<Job>());
  const jobIndex = useMemo(() => savedIdentityIndex(jobs.items), [jobs.items]);
  const customerIndex = useMemo(() => savedIdentityIndex(customers.items), [customers.items]);
  const builderIndex = useMemo(() => savedIdentityIndex(builders.items), [builders.items]);
  const [jobStatusSyncProjection, setJobStatusSyncProjection] = useState<JobStatusSyncProjection>({ scopeKey: "", states: {} });
  const customerNames = useMemo(() => new Map(customers.items.map((item) => [item.id, item.name])), [customers.items]);
  const builderNames = useMemo(() => new Map(builders.items.map((item) => [item.id, item.companyName])), [builders.items]);
  const fieldJobOperatorMemberId = useMemo(() => fieldOperatorMemberId({
    identity: identityState.identity,
    teamMembers: team.items,
    mode: identityState.mode,
  }), [identityState.identity, identityState.mode, team.items]);
  const jobStatusBoundaryReady = identityState.isReady && (!fieldJobStatusRestricted || team.isReady);
  const filtered = useMemo(() => {
    const words = search.toLocaleLowerCase("en-GB").trim().split(/\s+/).filter(Boolean);
    return jobs.items.filter((job) => {
      const stage = jobBrowseStatus(job, fieldJobStatusRestricted);
      const matchesStage = status === "All" || (status === "Review" ? stage === null : status === "Active" ? stage !== null && !closedJobStages.has(stage) && stage !== "On hold" : status === "Closed" ? stage !== null && closedJobStages.has(stage) : stage === status);
      const searchable = [job.title, job.siteAddress, job.status, customerNames.get(job.customerId ?? ""), builderNames.get(job.builderId ?? "")].filter(Boolean).join(" ").toLocaleLowerCase("en-GB");
      return matchesStage && words.every((word) => searchable.includes(word));
    });
  }, [jobs.items, status, search, customerNames, builderNames, fieldJobStatusRestricted]);
  const jobStatusCloudTracking = fieldJobStatusRestricted && Boolean(identityState.identity);
  const jobStatusSyncScopeKey = JSON.stringify([
    identityState.identity?.organisationId ?? null,
    identityState.identity?.userId ?? null,
    identityState.identity?.role ?? null,
    identityState.identity?.customerSourceId ?? null,
  ]);
  const jobMutationScopeKey = JSON.stringify([identityState.mode, jobStatusSyncScopeKey]);
  const jobFormReady = identityState.isReady && jobs.isReady && customers.isReady && builders.isReady && timeline.isReady;
  const latestSources = useRef({ ready: false, scopeKey: "", editRestricted: true, deleteRestricted: true, jobs: jobs.items, customers: customers.items, builders: builders.items, timeline: timeline.items });
  useLayoutEffect(() => {
    latestSources.current = { ready: jobFormReady, scopeKey: jobMutationScopeKey, editRestricted: jobEditRestricted, deleteRestricted: jobDeleteRestricted, jobs: jobs.items, customers: customers.items, builders: builders.items, timeline: timeline.items };
    return () => { latestSources.current = { ...latestSources.current, ready: false, editRestricted: true, deleteRestricted: true }; };
  }, [jobFormReady, jobMutationScopeKey, jobEditRestricted, jobDeleteRestricted, jobs.items, customers.items, builders.items, timeline.items]);
  const visiblePendingNotes = pendingNotes.filter((pending) => pending.scopeKey === jobMutationScopeKey);
  const jobsStorageKey = identityState.identity
    ? accountStorageKey(
        "jr-os-jobs",
        identityState.identity.organisationId,
        identityState.identity.userId,
        identityState.identity.role,
        identityState.identity.customerSourceId,
      )
    : "jr-os-jobs";
  const activeJobStatusSyncStates = jobStatusSyncProjection.scopeKey === jobStatusSyncScopeKey
    ? jobStatusSyncProjection.states
    : {};
  const activeJobStatusSyncSummary = (["Conflict", "Failed", "Offline", "Pending", "Synced"] as SyncState[])
    .find((syncState) => Object.values(activeJobStatusSyncStates).includes(syncState)) ?? null;
  const displayedStatusMessage = activeJobStatusSyncSummary
    ? jobStatusSyncMessages[activeJobStatusSyncSummary]
    : statusMessage;
  const statusMessageTone = activeJobStatusSyncSummary === "Conflict" || activeJobStatusSyncSummary === "Failed"
    ? "border-rose-400/20 bg-rose-400/5 text-rose-200"
    : activeJobStatusSyncSummary === "Synced"
      ? "border-emerald-400/20 bg-emerald-400/5 text-emerald-200"
      : activeJobStatusSyncSummary
        ? "border-amber-400/20 bg-amber-400/5 text-amber-200"
        : "border-cyan-400/20 bg-cyan-400/5 text-cyan-200";

  useEffect(() => {
    if (!jobStatusCloudTracking) return;
    let active = true;

    function refreshJobStatusSyncStates() {
      if (!active) return;
      setJobStatusSyncProjection((current) => {
        const currentStates = current.scopeKey === jobStatusSyncScopeKey ? current.states : {};
        const nextStates: Partial<Record<string, SyncState>> = {};
        for (const job of jobs.items) {
          const nextState = queueTargetSyncState(getSyncQueue(), {
            table: "jobs",
            sourceId: job.id,
          }, navigator.onLine) as SyncState;
          if (nextState !== "Synced" || currentStates[job.id] === "Synced") nextStates[job.id] = nextState;
        }
        return { scopeKey: jobStatusSyncScopeKey, states: nextStates };
      });
    }

    function confirmJobStatusReconciliation(event: Event) {
      const detail = (event as CustomEvent<{ storageKey?: string; sourceId?: string }>).detail;
      if (detail?.storageKey !== jobsStorageKey || !detail.sourceId) return;
      setJobStatusSyncProjection((current) => ({
        scopeKey: jobStatusSyncScopeKey,
        states: {
          ...(current.scopeKey === jobStatusSyncScopeKey ? current.states : {}),
          [detail.sourceId!]: "Synced",
        },
      }));
    }

    window.addEventListener("jr-os-sync-status", refreshJobStatusSyncStates);
    window.addEventListener("jr-os-cloud-cache-reconciled", confirmJobStatusReconciliation);
    queueMicrotask(refreshJobStatusSyncStates);
    return () => {
      active = false;
      window.removeEventListener("jr-os-sync-status", refreshJobStatusSyncStates);
      window.removeEventListener("jr-os-cloud-cache-reconciled", confirmJobStatusReconciliation);
    };
  }, [jobStatusCloudTracking, jobStatusSyncScopeKey, jobs.items, jobsStorageKey]);

  function resetForm() { draft.current = null; setForm(blank); setEditingId(null); setShowForm(false); setError(""); }
  function openForm() {
    if (blockJobEdit()) return;
    draft.current = { id: "", createdAt: "", editingId: null, expected: "", form: blank, scopeKey: jobMutationScopeKey, saved: false };
    setForm(blank); setEditingId(null); setShowForm(true); setError(""); setStatusMessage("");
  }
  function changeForm(next: typeof blank) {
    if (!draft.current || draft.current.form !== form || draft.current.scopeKey !== jobMutationScopeKey) return;
    draft.current.form = next;
    setForm(next); setError("");
  }
  function blockJobEdit() {
    if (!jobEditRestricted && !latestSources.current.editRestricted && latestSources.current.scopeKey === jobMutationScopeKey) return false;
    setError(jobEditHandoffMessage);
    return true;
  }
  function blockJobDelete() {
    if (!jobDeleteRestricted && !latestSources.current.deleteRestricted && latestSources.current.scopeKey === jobMutationScopeKey) return false;
    setError(jobDeleteHandoffMessage);
    return true;
  }
  function jobStatusOptions(job: Job) {
    const currentStatus = jobCurrentStatus(job, fieldJobStatusRestricted);
    return fieldJobStatusRestricted
      ? [currentStatus, ...fieldJobStatusTransitions(currentStatus)]
      : canonicalJobStatuses;
  }
  function jobStatusLocked(job: Job) {
    return jobStatusMutationDenied
      || (fieldJobStatusRestricted && !fieldJobOperatorMemberId)
      || (fieldJobStatusRestricted && fieldJobStatusTransitions(job.status).length === 0)
      || jobStatusSyncBlocked(job);
  }
  function jobStatusSyncState(job: Job) {
    return activeJobStatusSyncStates[job.id] ?? null;
  }
  function jobStatusSyncBlocked(job: Job) {
    const syncState = jobStatusSyncState(job);
    return syncState === "Failed" || syncState === "Conflict";
  }
  function jobStatusNotice(job: Job) {
    const syncState = jobStatusSyncState(job);
    if (syncState) return jobStatusSyncMessages[syncState];
    if (jobStatusMutationDenied) return unavailableStatusMessage;
    if (fieldJobStatusRestricted && !fieldJobOperatorMemberId) return unresolvedFieldIdentityMessage;
    if (fieldJobStatusRestricted && fieldJobStatusTransitions(job.status).length === 0) {
      return "Further lifecycle changes for this job require office review.";
    }
    return "";
  }
  function startEdit(job: Job) {
    if (blockJobEdit()) return;
    try {
      const current = requireUniqueJob(job.id);
      if (jobEditSnapshot(current) !== jobEditSnapshot(job)) throw new Error("This job has changed. Review its current record before editing.");
    } catch (error) { setError(error instanceof Error ? error.message : "This job is unavailable."); return; }
    const next: typeof blank = { title: job.title, customerId: job.customerId ?? "", builderId: job.builderId ?? "", siteAddress: job.siteAddress, status: jobBrowseStatus(job, false) ?? "", startDate: job.startDate ?? "", value: job.value == null ? "" : String(job.value), notes: job.notes ?? "" };
    draft.current = { id: job.id, createdAt: job.createdAt, editingId: job.id, expected: jobEditSnapshot(job), form: next, scopeKey: jobMutationScopeKey, saved: false };
    setForm(next);
    setEditingId(job.id);
    setShowForm(true); setError(""); setStatusMessage("");
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (blockJobEdit()) return;
    const active = draft.current;
    if (!showForm || !active || active.saved || active.form !== form || active.editingId !== editingId || active.scopeKey !== jobMutationScopeKey) return;
    if (!latestSources.current.ready) { setError("Wait for job records to finish loading. Your draft is still here."); return; }
    if (!form.title.trim()) { setError("Job title is required."); return; }
    if (!form.siteAddress.trim()) { setError("Site address is required."); return; }
    const parsedValue = Number(form.value || 0);
    if (!Number.isFinite(parsedValue) || parsedValue < 0) { setError("Estimated value must be a finite amount of zero or above."); return; }
    if (form.startDate && assistantDay(form.startDate) === null) { setError("Choose a valid start date, or leave it blank."); return; }
    if (!canonicalJobStatuses.includes(form.status as CanonicalJobStatus)) { setError("Choose a reviewed job stage before saving."); return; }
    if (form.customerId && form.builderId) { setError("Choose either a customer or a builder for this job."); return; }
    if (form.customerId && !savedIdentityIndex(latestSources.current.customers).unique.has(form.customerId)) { setError("The selected customer is unavailable or ambiguous. Review your selection; your draft is retained."); return; }
    if (form.builderId && !savedIdentityIndex(latestSources.current.builders).unique.has(form.builderId)) { setError("The selected builder is unavailable or ambiguous. Review your selection; your draft is retained."); return; }
    const now = new Date().toISOString();
    const payload = { title: form.title.trim(), customerId: form.customerId || undefined, builderId: form.builderId || undefined, siteAddress: form.siteAddress.trim(), status: form.status as CanonicalJobStatus, startDate: form.startDate, value: parsedValue, notes: form.notes };
    let saved: Job;
    let note: JobTimelineEntry | null = null;
    try {
      if (editingId) {
        requireUniqueJob(editingId);
        saved = jobs.updateItem(editingId, (current) => {
          if (jobEditSnapshot(current) !== active.expected) throw new Error("This job's editable details or stage have changed. Your draft is retained; use saved values to review the current record before editing again.");
          const timelineId = makeId("timeline");
          const result = transitionJobStatus({ job: { ...current, ...payload, status: current.status }, nextStatus: payload.status, now, timelineId, completedBy: "JR OS Jobs" });
          note = result.timelineEntry;
          if (jobBrowseStatus(current, false) === null) {
            note = { ...initialJobTimelineEntry({ job: result.job, now, timelineId, completedBy: "JR OS Jobs" }), milestone: payload.status === "Complete" ? "Job completed" : "Custom update", note: `Job status set to ${payload.status} after review of the unrecognised saved stage.` };
          }
          return result.job;
        });
      } else {
        active.id ||= makeId("job");
        active.createdAt ||= now;
        saved = jobs.createItem({ id: active.id, ...payload, createdAt: active.createdAt, updatedAt: now });
        note = initialJobTimelineEntry({ job: saved, now, timelineId: makeId("timeline"), completedBy: "JR OS Jobs" });
      }
    } catch (error) {
      setError(`Job save could not be confirmed. Your draft is still here. ${error instanceof Error ? error.message : "Please try again."}`);
      return;
    }
    active.saved = true;
    resetForm();
    setSearch(""); setStatus("All"); setLimit(8);
    if (note) saveJobNote({ note, jobTitle: saved.title, jobCreatedAt: saved.createdAt, scopeKey: jobMutationScopeKey });
    else setStatusMessage("Job changes saved on this device. Check sync status before switching devices.");
  }
  function requireUniqueJob(id: string) {
    if (!latestSources.current.ready || latestSources.current.scopeKey !== jobMutationScopeKey) throw new Error("Wait for the current account's job records to finish loading.");
    const current = savedIdentityIndex(latestSources.current.jobs).unique.get(id);
    if (!current) throw new Error("This job is unavailable or its saved identity is ambiguous. Review the current records before making changes.");
    return current;
  }
  function saveJobNote(pending: PendingJobNote) {
    try {
      timeline.createItem(pending.note);
      completedNoteIds.current.add(JSON.stringify([pending.scopeKey, pending.note.id]));
      setStatusMessage("Job and timeline note saved on this device. Check sync status before switching devices.");
    } catch (error) {
      setPendingNotes((current) => [...current, pending]);
      setStatusMessage(`Job saved on this device, but its timeline note was not saved. Retry the note below; do not recreate the job. ${error instanceof Error ? error.message : ""}`);
    }
  }
  function retryJobNote(pending: PendingJobNote) {
    if (blockJobEdit()) return;
    if (pending.scopeKey !== jobMutationScopeKey) return;
    const { note } = pending;
    try {
      const job = requireUniqueJob(note.jobId);
      if (job.createdAt !== pending.jobCreatedAt || note.sourceId !== job.id || note.sourceType !== "Job") throw new Error("The original saved job is no longer available. Review its current record before retrying the note.");
      const matches = latestSources.current.timeline.filter((item) => item.id === note.id);
      if (matches.length > 1 || (matches[0] && !sameJobNote(matches[0], note))) throw new Error("The timeline note identity is ambiguous or contains different details. Review the timeline before retrying.");
      const key = JSON.stringify([pending.scopeKey, note.id]);
      if (!matches.length && !completedNoteIds.current.has(key)) timeline.createItem(note);
      completedNoteIds.current.add(key);
      setPendingNotes((current) => current.filter((item) => item !== pending));
      setError(""); setStatusMessage("Timeline note saved on this device. Check sync status before switching devices.");
    } catch (error) { setError(`The job remains saved, but its timeline note could not be saved. ${error instanceof Error ? error.message : "Please try again."}`); }
  }
  function updateStatus(id: string, nextStatus: CanonicalJobStatus) {
    const job = jobs.items.find((item) => item.id === id);
    if (!job) return;
    const syncState = jobStatusSyncState(job);
    if (syncState === "Failed" || syncState === "Conflict") {
      setStatusMessage(jobStatusSyncMessages[syncState]);
      return;
    }
    if (jobStatusMutationDenied) { setStatusMessage(""); setError(unavailableStatusMessage); return; }
    if (fieldJobStatusRestricted && !fieldJobOperatorMemberId) { setStatusMessage(""); setError(unresolvedFieldIdentityMessage); return; }
    if (fieldJobStatusRestricted && !fieldJobStatusTransitionAllowed(job.status, nextStatus)) {
      setStatusMessage("");
      setError(fieldStatusHandoffMessage);
      return;
    }
    setError("");
    const result = transitionJobStatus({ job, nextStatus, now: new Date().toISOString(), timelineId: makeId("timeline"), completedBy: "JR OS Jobs" });
    jobs.setItems((current) => current.map((item) => item.id === id ? result.job : item));
    if (!fieldJobStatusRestricted && result.timelineEntry) timeline.setItems((current) => [result.timelineEntry!, ...current]);
    if (jobStatusCloudTracking) {
      setJobStatusSyncProjection((current) => ({
        scopeKey: jobStatusSyncScopeKey,
        states: {
          ...(current.scopeKey === jobStatusSyncScopeKey ? current.states : {}),
          [id]: navigator.onLine ? "Pending" : "Offline",
        },
      }));
    }
    setStatusMessage(fieldJobStatusRestricted
      ? `${job.title} stage change to ${nextStatus} queued for secure sync.`
      : "");
  }
  function deleteJob(job: Job) {
    if (blockJobDelete()) return;
    if (deletedRecords.current.has(job)) return;
    if (draft.current?.editingId === job.id) { setError("Save or close this job's edit form before deleting it."); return; }
    try {
      const current = requireUniqueJob(job.id);
      if (JSON.stringify(current) !== JSON.stringify(job)) throw new Error("This job has changed. Review its current record before deleting.");
      if (!window.confirm(`Delete ${job.title}? This cannot be undone.`)) return;
      if (blockJobDelete()) return;
      requireUniqueJob(job.id);
      jobs.removeItem(job.id, (current) => {
        if (JSON.stringify(current) !== JSON.stringify(job)) throw new Error("This job has changed. Review its current record before deleting.");
      });
      deletedRecords.current.add(job);
      setError(""); setStatusMessage("Job deleted on this device. Check sync status before switching devices.");
    } catch (error) { setError(`Deletion could not be confirmed. ${error instanceof Error ? error.message : "Review the saved job and retry."}`); }
  }
  if (!jobStatusBoundaryReady) return <Card>Loading jobs…</Card>;
  const relatedName = (job: Job) => customerNames.get(job.customerId ?? "") || builderNames.get(job.builderId ?? "") || "Direct job";

  return <div className="space-y-5 pb-24 sm:space-y-6 sm:pb-0">
    <PageHeader eyebrow="Operations" title="Jobs" description="Track opportunities from first enquiry through scheduling, delivery and completion." action={jobEditRestricted ? undefined : <Button className="w-full sm:w-auto" onClick={() => showForm ? resetForm() : openForm()}><Plus className="mr-2 size-4" />{showForm ? "Close form" : "Create job"}</Button>} />
    {jobEditRestricted ? <Card><h2 className="font-semibold text-amber-200">Office-managed job records</h2><p className="mt-2 text-sm text-slate-400">{jobEditHandoffMessage}</p></Card> : null}
    {error && (jobEditRestricted || !showForm) ? <p role="alert" className="rounded-xl border border-red-400/20 bg-red-400/5 px-4 py-3 text-sm text-red-300">{error}</p> : null}
    {displayedStatusMessage ? <p role="status" className={`rounded-xl border px-4 py-3 text-sm ${statusMessageTone}`}>{displayedStatusMessage}</p> : null}
    {visiblePendingNotes.length && !jobEditRestricted ? <Card aria-label="Unsaved job timeline notes" className="border-amber-400/30">
      <h2 className="font-bold">Job timeline notes need retrying</h2>
      <p className="mt-2 text-sm text-slate-400">The job changes were saved on this device. Keep this page open to retry their timeline notes; leaving loses these unsaved notes.</p>
      <div className="mt-3 space-y-3">{visiblePendingNotes.map((pending) => <div key={pending.note.id} className="rounded-xl border border-slate-700 p-3"><p className="break-words text-sm font-semibold">{pending.jobTitle}</p><p className="mt-1 break-words text-sm">{pending.note.note}</p><button type="button" onClick={() => retryJobNote(pending)} className="mt-3 min-h-12 rounded-xl border border-amber-400/30 px-3 text-sm font-semibold text-amber-200">Retry timeline note</button></div>)}</div>
    </Card> : null}
    {showForm && !jobEditRestricted ? <Card><form onSubmit={submit} aria-label={editingId ? "Edit job" : "Create job"} className="grid gap-4 md:grid-cols-2">
      <p className="text-sm text-slate-400 md:col-span-2">Keep this page open until the job is saved. Leaving or closing this form loses unsaved changes.</p>
      <InputField required label="Job title" value={form.title} onChange={(e) => changeForm({ ...form, title: e.target.value })} />
      <InputField required label="Site address" value={form.siteAddress} onChange={(e) => changeForm({ ...form, siteAddress: e.target.value })} />
      <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Customer</span><select value={form.customerId} onChange={(e) => changeForm({ ...form, customerId: e.target.value, builderId: "" })} className="min-h-12 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-base sm:text-sm"><option value="">No customer selected</option>{form.customerId && !customerIndex.unique.has(form.customerId) ? <option value={form.customerId}>Selected customer unavailable or ambiguous</option> : null}{customerIndex.selectable.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Builder</span><select value={form.builderId} onChange={(e) => changeForm({ ...form, builderId: e.target.value, customerId: "" })} className="min-h-12 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-base sm:text-sm"><option value="">No builder selected</option>{form.builderId && !builderIndex.unique.has(form.builderId) ? <option value={form.builderId}>Selected builder unavailable or ambiguous</option> : null}{builderIndex.selectable.map((item) => <option key={item.id} value={item.id}>{item.companyName}</option>)}</select></label>
      <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Status</span><select value={form.status} onChange={(e) => changeForm({ ...form, status: e.target.value as CanonicalJobStatus })} className="min-h-12 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-base sm:text-sm">{!form.status ? <option value="" disabled>Choose a reviewed stage</option> : null}{canonicalJobStatuses.map((item) => <option key={item}>{item}</option>)}</select></label>
      <InputField label="Start date" type="date" value={form.startDate} onChange={(e) => changeForm({ ...form, startDate: e.target.value })} />
      <InputField label="Estimated value (£)" type="number" min="0" step="0.01" value={form.value} onChange={(e) => changeForm({ ...form, value: e.target.value })} />
      <div className="md:col-span-2"><TextareaField label="Job notes" value={form.notes} onChange={(e) => changeForm({ ...form, notes: e.target.value })} /></div>
      {error ? <p role="alert" className="md:col-span-2 text-sm text-red-300">{error}</p> : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-end md:col-span-2">{editingId ? <Button type="button" variant="secondary" onClick={() => { try { startEdit(requireUniqueJob(editingId)); } catch (error) { setError(error instanceof Error ? error.message : "This job is unavailable."); } }}>Use saved values</Button> : null}<Button className="w-full sm:w-auto" type="submit" disabled={!jobFormReady}>{editingId ? "Update job" : "Save job"}</Button></div>
    </form></Card> : null}
    <section aria-label="Find jobs" className="space-y-3">
      <div className="grid gap-3 md:grid-cols-[1fr_auto]">
        <label className="grid gap-2 text-sm font-semibold"><span>Find a job</span><span className="relative"><Search aria-hidden="true" className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" /><input type="search" value={search} onChange={(e) => { setSearch(e.target.value); setLimit(8); }} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} autoComplete="off" enterKeyHint="search" placeholder="Job, site, customer or builder" className="min-h-12 w-full rounded-xl border border-slate-800 bg-slate-900 pl-10 pr-4 text-base outline-none focus:border-cyan-400 sm:text-sm" /></span></label>
        <label className="grid gap-2 text-sm font-semibold"><span>Job stage filter</span><select value={status} onChange={(e) => { setStatus(e.target.value as JobFilter); setLimit(8); }} className="min-h-12 w-full rounded-xl border border-slate-800 bg-slate-900 px-4 text-base sm:text-sm"><option value="All">All stages</option><option value="Active">Active work</option><option value="Closed">Closed jobs</option><option value="Review">Needs status review</option>{canonicalJobStatuses.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {jobs.isReady ? <p role="status" className="text-sm text-slate-400">Showing {Math.min(limit, filtered.length)} of {filtered.length} matching job records</p> : null}
        <button type="button" onClick={() => { setSearch(""); setStatus("All"); setLimit(8); }} className="min-h-12 rounded-xl border border-slate-700 px-4 text-sm font-semibold text-slate-300">Clear job filters</button>
      </div>
      <p className="text-xs leading-5 text-slate-500">Closed jobs includes Complete, Invoiced, Paid and Cancelled; it does not mean all invoices are paid. Active work excludes closed and on-hold jobs. Needs status review shows records with a missing or unsupported saved stage. Filtering does not change a job.</p>
    </section>
    {!jobs.isReady ? <Card>Loading jobs…</Card> : filtered.length === 0 ? <EntityEmptyState icon={<BriefcaseBusiness className="size-6" />} title={jobs.items.length ? "No matching jobs" : "No jobs yet"} description={jobs.items.length ? "Change the search or status filter." : jobEditRestricted ? "No assigned jobs are currently available." : "Create the first job and connect it to a customer or builder."} /> : <section aria-label="Job records" className="grid gap-4 xl:grid-cols-2">{filtered.slice(0, limit).map((job) => <Card key={job.id}><div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-start"><div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">{relatedName(job)}</p><h2 className="mt-1 break-words text-lg font-bold sm:text-xl">{job.title}</h2><div className="mt-2">{jobBrowseStatus(job, fieldJobStatusRestricted) !== null ? <StatusBadge status={jobBrowseStatus(job, fieldJobStatusRestricted)!} /> : <span className="inline-flex rounded-lg bg-amber-400/10 px-2 py-1 text-xs font-semibold text-amber-200">Needs status review</span>}{jobBrowseStatus(job, fieldJobStatusRestricted) === null ? <p className="mt-2 break-words text-sm text-amber-200">Saved stage: {typeof job.status === "string" && job.status.trim() ? job.status : "Not recorded"}. Review before choosing a stage.</p> : null}</div></div><div className={`grid ${jobEditRestricted ? "grid-cols-1" : jobDeleteRestricted ? "grid-cols-2" : "grid-cols-3"} gap-2`}><Link href={`/jobs/${encodeURIComponent(job.id)}`} aria-label={`View ${job.title}`} className="grid min-h-12 min-w-12 place-items-center rounded-xl border border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-cyan-300"><Eye className="size-4" /></Link>{!jobEditRestricted ? <button disabled={!jobFormReady || !jobIndex.unique.has(job.id)} onClick={() => startEdit(job)} aria-label={`Edit ${job.title}`} className="grid min-h-12 min-w-12 place-items-center rounded-xl border border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-cyan-300"><Pencil className="size-4" /></button> : null}{!jobDeleteRestricted ? <button disabled={!jobFormReady || !jobIndex.unique.has(job.id)} onClick={() => deleteJob(job)} aria-label={`Delete ${job.title}`} className="grid min-h-12 min-w-12 place-items-center rounded-xl border border-slate-800 text-slate-400 hover:bg-red-500/10 hover:text-red-300"><Trash2 className="size-4" /></button> : null}</div></div><div className="mt-4 grid gap-3 text-sm text-slate-400 sm:flex sm:flex-wrap sm:gap-4">{job.siteAddress ? <span className="flex min-w-0 items-start gap-2"><MapPin className="mt-0.5 size-4 shrink-0 text-cyan-400" /><span className="break-words">{job.siteAddress}</span></span> : null}{job.startDate ? <span className="flex items-center gap-2"><CalendarDays className="size-4 text-cyan-400" />{new Date(`${job.startDate}T12:00:00`).toLocaleDateString("en-GB")}</span> : null}{job.value ? <span className="font-semibold text-slate-200">{new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(job.value)}</span> : null}</div>{!jobEditRestricted && assistantJobBriefingHref(job.id) ? <Link href={assistantJobBriefingHref(job.id)!} className="mt-4 flex min-h-12 items-center rounded-xl border border-cyan-400/30 px-3 text-sm font-semibold text-cyan-200">Ask JR AI about this job</Link> : null}<div className="mt-5 grid gap-2 border-t border-slate-800 pt-4 sm:grid-cols-[auto_1fr] sm:items-center"><span className="text-xs text-slate-500">Quick status</span><select aria-label={`Update ${job.title} status`} value={jobBrowseStatus(job, fieldJobStatusRestricted) ?? ""} disabled={jobStatusLocked(job)} onChange={(e) => updateStatus(job.id, e.target.value as CanonicalJobStatus)} className="min-h-12 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-base disabled:cursor-not-allowed disabled:opacity-60 sm:text-sm">{jobBrowseStatus(job, fieldJobStatusRestricted) === null ? <option value="" disabled>Review saved status</option> : null}{jobStatusOptions(job).filter((item) => canonicalJobStatuses.includes(item)).map((item) => <option key={item}>{item}</option>)}</select>{jobStatusNotice(job) ? <span role="status" className="text-xs text-amber-200 sm:col-span-2">{jobStatusNotice(job)}</span> : null}</div></Card>)}</section>}
    {jobs.isReady && filtered.length > limit ? <button type="button" onClick={() => setLimit((value) => value + 8)} className="min-h-12 w-full rounded-xl border border-slate-700 px-4 text-sm font-semibold">Show more jobs ({filtered.length - limit} remaining)</button> : null}
    {!jobEditRestricted ? <div className="fixed inset-x-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-30 sm:hidden"><Button className="w-full shadow-2xl" onClick={() => showForm ? resetForm() : openForm()}><Plus className="mr-2 size-4" />{showForm ? "Close job form" : "Create job"}</Button></div> : null}
  </div>;
}
