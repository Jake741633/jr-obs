"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
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
import { accountStorageKey } from "../../../../lib/cloud/adapter";
import { collectionCloudMutationRoute, fieldMutationRouteAllows } from "../../../../lib/cloud/fieldMutationPolicy-core.mjs";
import { canEditFinance } from "../../../../lib/cloud/permissions";
import { queueTargetSyncState } from "../../../../lib/cloud/repository-core.mjs";
import { getSyncQueue, type SyncState } from "../../../../lib/cloud/repository";
import { useCloudIdentity } from "../../../../lib/cloud/useCloudIdentity";
import { acceptedVariationValue as calculateAcceptedVariationValue, canonicalJobStatuses, fieldJobStatusTransitionAllowed, fieldJobStatusTransitions, normaliseFieldJobStatus, normaliseJobStatus, transitionJobStatus } from "../../../../lib/jobManagement-core.mjs";
import { normaliseJobProgress } from "../../../../lib/jobProgress-core.mjs";
import { jobTaskCounts } from "../../../../lib/jobTasks-core.mjs";
import { makeId } from "../../../../lib/storage";
import type { CanonicalJobStatus, JobTimelineEntry } from "../../../../lib/models";

type NormalisedJobProgress = {
  overall: number;
  firstFix: number;
  secondFix: number;
  testing: number;
  certificates: number;
  materials: number;
  payments: number;
};

type EditableProgressMetric = Exclude<keyof NormalisedJobProgress, "payments">;

type ProgressDraftState = {
  targetKey: string;
  values: Partial<Record<EditableProgressMetric, number>>;
};

type ProgressMessageState = {
  targetKey: string;
  text: string;
};

type ProgressSyncState = {
  targetKey: string;
  state: SyncState | null;
};

const editableProgressMetrics: { key: EditableProgressMetric; label: string }[] = [
  { key: "overall", label: "Overall" },
  { key: "firstFix", label: "First fix" },
  { key: "secondFix", label: "Second fix" },
  { key: "testing", label: "Testing" },
  { key: "certificates", label: "Certificates" },
  { key: "materials", label: "Materials" },
];

const progressSyncMessages: Record<SyncState, string> = {
  Synced: "Operational progress synced securely.",
  Pending: "Queued for secure sync; not cloud-confirmed yet.",
  Offline: "Saved on this device and waiting for a secure connection.",
  Failed: "Failed: progress sync did not complete. Displayed values may be local; reconnect and retry sync or contact the office.",
  Conflict: "Conflict: progress sync could not be confirmed against the current cloud record. Refresh from cloud before trying again.",
};

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
  const identityState = useCloudIdentity();
  const fieldWorkspace = identityState.mode !== "local" && identityState.identity?.role === "electrician";
  const showOfficeFinance = identityState.mode === "local" || canEditFinance(identityState.identity?.role);
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
  const [progressDraft, setProgressDraft] = useState<ProgressDraftState>({ targetKey: "", values: {} });
  const [progressMessage, setProgressMessage] = useState<ProgressMessageState>({ targetKey: "", text: "" });
  const [progressSync, setProgressSync] = useState<ProgressSyncState>({ targetKey: "", state: null });

  const progressRecord = progress.items.find((item) => item.jobId === jobId);
  const progressValue = normaliseJobProgress(progressRecord?.manual ?? {}) as NormalisedJobProgress;
  const progressRecordId = progressRecord?.id ?? `job-progress-${jobId}`;
  const progressCloudTracking = identityState.mode !== "local" && Boolean(identityState.identity);
  const progressSyncIdentityKey = JSON.stringify([
    identityState.identity?.organisationId ?? null,
    identityState.identity?.userId ?? null,
    identityState.identity?.role ?? null,
    identityState.identity?.customerSourceId ?? null,
  ]);
  const progressTargetKey = `${jobId}:${progressRecordId}`;
  const progressSyncTargetKey = `${progressSyncIdentityKey}:${progressTargetKey}`;
  const progressStorageKey = identityState.identity
    ? accountStorageKey(
        "jr-os-job-progress",
        identityState.identity.organisationId,
        identityState.identity.userId,
        identityState.identity.role,
        identityState.identity.customerSourceId,
      )
    : "jr-os-job-progress";
  const activeProgressDraft = progressDraft.targetKey === progressTargetKey ? progressDraft.values : {};
  const hasActiveProgressDraft = Object.keys(activeProgressDraft).length > 0;
  const progressDraftValue: NormalisedJobProgress = { ...progressValue, ...activeProgressDraft };
  const activeProgressSyncState = progressCloudTracking && progressSync.targetKey === progressSyncTargetKey ? progressSync.state : null;
  const progressStatusMessage = hasActiveProgressDraft
    ? activeProgressSyncState === "Pending" || activeProgressSyncState === "Offline"
      ? `Unsaved progress changes. An earlier update is still ${activeProgressSyncState.toLowerCase()}.`
      : "Unsaved progress changes."
    : activeProgressSyncState
      ? progressSyncMessages[activeProgressSyncState]
      : progressMessage.targetKey === progressTargetKey ? progressMessage.text : "";
  const progressSyncBlocked = activeProgressSyncState === "Failed" || activeProgressSyncState === "Conflict";
  const progressStatusTone = progressSyncBlocked
    ? "text-rose-200"
    : activeProgressSyncState === "Synced"
      ? "text-emerald-200"
      : activeProgressSyncState
        ? "text-amber-200"
        : "text-cyan-200";
  const unsyncedProgressRecordMessage = hasActiveProgressDraft
    ? "Displayed percentages include unsaved changes and are not cloud-confirmed."
    : activeProgressSyncState === "Pending"
    ? "Displayed percentages are this device's queued attempt until cloud confirmation."
    : activeProgressSyncState === "Offline"
      ? "Displayed percentages are saved on this device and are not cloud-confirmed yet."
      : progressSyncBlocked
        ? "Displayed percentages may be local and are not confirmed by cloud."
        : "";

  useEffect(() => {
    if (!progressCloudTracking) return;
    let active = true;

    function refreshProgressSyncState() {
      if (!active) return;
      const nextState = queueTargetSyncState(getSyncQueue(), {
        table: "cloud_collections",
        collectionKey: "jr-os-job-progress",
        sourceId: progressRecordId,
      }, navigator.onLine) as SyncState;
      if (nextState === "Failed" || nextState === "Conflict") {
        setProgressDraft((current) => current.targetKey === progressTargetKey
          ? { targetKey: progressTargetKey, values: {} }
          : current);
      }
      setProgressSync((current) => {
        if (nextState === "Synced") {
          return current.targetKey === progressSyncTargetKey && current.state === "Synced"
            ? current
            : { targetKey: progressSyncTargetKey, state: null };
        }
        return { targetKey: progressSyncTargetKey, state: nextState };
      });
    }

    function confirmProgressReconciliation(event: Event) {
      const detail = (event as CustomEvent<{ storageKey?: string; sourceId?: string }>).detail;
      if (detail?.storageKey !== progressStorageKey || detail.sourceId !== progressRecordId) return;
      setProgressSync({ targetKey: progressSyncTargetKey, state: "Synced" });
    }

    window.addEventListener("jr-os-sync-status", refreshProgressSyncState);
    window.addEventListener("jr-os-cloud-cache-reconciled", confirmProgressReconciliation);
    queueMicrotask(refreshProgressSyncState);
    return () => {
      active = false;
      window.removeEventListener("jr-os-sync-status", refreshProgressSyncState);
      window.removeEventListener("jr-os-cloud-cache-reconciled", confirmProgressReconciliation);
    };
  }, [progressCloudTracking, progressRecordId, progressStorageKey, progressSyncTargetKey, progressTargetKey]);

  const ready = identityState.isReady && [jobs, customers, builders, team, tasks, diaries, variations, documents, progress, timeline].every((store) => store.isReady);
  if (!ready) return <Card>Loading job workspace…</Card>;

  const job = jobs.items.find((item) => item.id === jobId);
  if (!job) return <main className="space-y-6"><Link href="/jobs" className="inline-flex items-center gap-2 text-sm text-cyan-300"><ArrowLeft className="size-4" />Back to jobs</Link><Card><h1 className="text-xl font-bold">Job not found</h1><p className="mt-2 text-sm text-slate-400">This job may have been removed or the link is no longer available.</p></Card></main>;
  const currentJob = job;

  const customer = customers.items.find((item) => item.id === job.customerId);
  const builder = builders.items.find((item) => item.id === job.builderId);
  const assigned = team.items.filter((member) => job.assignedTo?.includes(member.id));
  const counts = jobTaskCounts(tasks.items, jobId);
  const jobDiaries = diaries.items.filter((item) => item.jobId === jobId);
  const jobVariations = variations.items.filter((item) => item.jobId === jobId);
  const acceptedVariationValue = showOfficeFinance
    ? calculateAcceptedVariationValue(jobVariations)
    : 0;
  const jobDocuments = documents.items.filter((item) => item.jobId === jobId);
  const recentActivity = timeline.items.filter((item) => item.jobId === jobId).toSorted((a, b) => b.completedAt.localeCompare(a.completedAt)).slice(0, 5);
  const currentStatus = fieldJobStatusRestricted ? normaliseFieldJobStatus(job.status) : normaliseJobStatus(job.status);
  const fieldStatusTransitions = fieldJobStatusTransitions(currentStatus);
  const statusOptions = fieldJobStatusRestricted
    ? [currentStatus, ...fieldStatusTransitions]
    : canonicalJobStatuses;
  const statusControlLocked = jobStatusMutationDenied
    || (fieldJobStatusRestricted && fieldStatusTransitions.length === 0);

  function updateStatus() {
    const nextStatus = selectedStatus === "Enquiry" && currentStatus !== "Enquiry" ? currentStatus : selectedStatus;
    if (jobStatusMutationDenied) {
      setStatusMessage("Job status changes are unavailable until an approved cloud identity is active.");
      return;
    }
    if (fieldJobStatusRestricted && !fieldJobStatusTransitionAllowed(currentStatus, nextStatus)) {
      setSelectedStatus(currentStatus);
      setStatusMessage("That stage change is not available in the field workflow. Choose an approved next stage or ask the office to update the job.");
      return;
    }
    if (nextStatus === currentStatus) { setStatusMessage("Choose a different status before saving."); return; }
    const now = new Date().toISOString();
    const result = transitionJobStatus({ job: currentJob, nextStatus, now, timelineId: makeId("timeline"), completedBy: "JR OS mobile workspace" });
    jobs.setItems((current) => current.map((item) => item.id === currentJob.id ? result.job : item));
    if (!fieldJobStatusRestricted && result.timelineEntry) {
      const entry = result.timelineEntry as JobTimelineEntry;
      timeline.setItems((current) => [entry, ...current]);
    }
    setSelectedStatus(nextStatus);
    setStatusMessage(fieldJobStatusRestricted
      ? `Job status change to ${nextStatus} queued for secure sync.`
      : `Job status updated to ${nextStatus}.`);
  }

  function updateProgressMetric(metric: EditableProgressMetric, value: string) {
    if (progressSyncBlocked) return;
    const numericValue = Number(value);
    const boundedValue = Number.isFinite(numericValue) ? Math.min(100, Math.max(0, Math.round(numericValue))) : 0;
    setProgressDraft((current) => ({
      targetKey: progressTargetKey,
      values: {
        ...(current.targetKey === progressTargetKey ? current.values : {}),
        [metric]: boundedValue,
      },
    }));
    setProgressSync((current) => current.targetKey === progressSyncTargetKey && current.state === "Synced"
      ? { targetKey: progressSyncTargetKey, state: null }
      : current);
    setProgressMessage({ targetKey: progressTargetKey, text: "" });
  }

  function saveProgress() {
    if (progressSyncBlocked) return;
    const now = new Date().toISOString();
    const normalised = normaliseJobProgress(progressDraftValue) as NormalisedJobProgress;
    const fieldManual = {
      overall: normalised.overall,
      firstFix: normalised.firstFix,
      secondFix: normalised.secondFix,
      testing: normalised.testing,
      certificates: normalised.certificates,
      materials: normalised.materials,
    };
    const nextRecord = {
      id: progressRecordId,
      jobId,
      manual: fieldWorkspace ? fieldManual : normalised,
      ...(fieldWorkspace ? {} : { suggestions: progressRecord?.suggestions ?? [] }),
      updatedBy: "JR OS mobile workspace",
      createdAt: progressRecord?.createdAt ?? now,
      updatedAt: now,
    } as unknown as (typeof progress.items)[number];

    progress.setItems((current) => {
      const existingIndex = current.findIndex((item) => item.id === nextRecord.id);
      if (existingIndex < 0) return [nextRecord, ...current];
      return current.map((item, index) => index === existingIndex ? nextRecord : item);
    });
    setProgressDraft({ targetKey: progressTargetKey, values: {} });
    if (progressCloudTracking) {
      setProgressSync({ targetKey: progressSyncTargetKey, state: navigator.onLine ? "Pending" : "Offline" });
      setProgressMessage({ targetKey: progressTargetKey, text: "" });
    } else {
      setProgressSync({ targetKey: progressTargetKey, state: null });
      setProgressMessage({ targetKey: progressTargetKey, text: "Operational progress saved on this device." });
    }
  }

  return <main className="space-y-6 pb-28">
    <Link href={`/jobs/${jobId}`} className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-cyan-300"><ArrowLeft className="size-4" />Back to job record</Link>

    <Card className="border-cyan-500/25">
      <div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">Job Management Pro</p><h1 className="mt-2 break-words text-3xl font-black">{job.title}</h1><p className="mt-2 flex items-start gap-2 text-sm text-slate-400"><MapPin className="mt-0.5 size-4 shrink-0 text-cyan-400" />{job.siteAddress || "No site address"}</p></div><StatusBadge status={currentStatus} /></div>
      <div className={`mt-5 grid grid-cols-2 gap-3 ${showOfficeFinance ? "sm:grid-cols-4" : "sm:grid-cols-2"}`}>
        {showOfficeFinance ? <>
          <div className="rounded-xl bg-slate-950/70 p-3"><p className="text-xs text-slate-500">Contract value</p><p className="mt-1 font-bold">{money.format(job.value || 0)}</p></div>
          <div className="rounded-xl bg-slate-950/70 p-3"><p className="text-xs text-slate-500">Variations</p><p className="mt-1 font-bold text-emerald-300">{money.format(acceptedVariationValue)}</p></div>
        </> : null}
        <div className="rounded-xl bg-slate-950/70 p-3"><p className="text-xs text-slate-500">Outstanding</p><p className="mt-1 font-bold text-amber-300">{counts.outstanding}</p></div>
        <div className="rounded-xl bg-slate-950/70 p-3"><p className="text-xs text-slate-500">Progress</p><p className="mt-1 font-bold text-cyan-200">{progressValue.overall}%</p></div>
      </div>
    </Card>

    <Card>
      <div className="flex items-start gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-cyan-500/10 text-cyan-300"><Gauge className="size-5" /></span><div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">Live progress</p><h2 className="mt-1 text-xl font-bold">Operational completion</h2><p className="mt-2 text-sm text-slate-400">Update assigned-job operational progress on site. Office payment progress remains private.</p></div></div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {editableProgressMetrics.map(({ key, label }) => <label key={key} htmlFor={`progress-${key}`} className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
          <span className="flex items-center justify-between gap-3 text-sm"><span className="font-medium text-slate-300">{label}</span><span className="font-semibold text-cyan-200">{progressDraftValue[key]}%</span></span>
          <input id={`progress-${key}`} type="range" min="0" max="100" step="1" value={progressDraftValue[key]} disabled={progressSyncBlocked} onChange={(event) => updateProgressMetric(key, event.target.value)} className="mt-3 min-h-11 w-full accent-cyan-400 disabled:cursor-not-allowed disabled:opacity-60" />
        </label>)}
        {!fieldWorkspace ? <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">{progressBar("Payments (office controlled)", progressValue.payments)}</div> : null}
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-3"><Button type="button" onClick={saveProgress} disabled={progressSyncBlocked}>Save field progress</Button><p className="text-xs text-slate-500">Only operational percentages are sent by the field app.</p></div>
      {progressStatusMessage ? <p role="status" className={`mt-3 text-sm ${progressStatusTone}`}>{progressStatusMessage}</p> : null}
      {!progressRecord ? <p className="mt-4 text-sm text-amber-300">No saved progress record yet. Saving will create one for this assigned job.</p> : unsyncedProgressRecordMessage ? <p className="mt-4 text-xs text-amber-200">{unsyncedProgressRecordMessage}</p> : <p className="mt-4 text-xs text-slate-500">Last updated {new Date(progressRecord.updatedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })} by {progressRecord.updatedBy || "JR OS"}.</p>}
    </Card>

    <Card>
      <p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">Mobile status control</p>
      <h2 className="mt-1 text-xl font-bold">Update job stage</h2>
      <p className="mt-2 text-sm text-slate-400">Every change is written to the job timeline automatically.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
        <select value={selectedStatus === "Enquiry" && currentStatus !== "Enquiry" ? currentStatus : selectedStatus} disabled={statusControlLocked} onChange={(event) => setSelectedStatus(event.target.value as CanonicalJobStatus)} className="min-h-12 rounded-xl border border-slate-700 bg-slate-950 px-3 text-base disabled:cursor-not-allowed disabled:opacity-60">
          {statusOptions.map((status) => <option key={status} value={status}>{status}</option>)}
        </select>
        <Button type="button" onClick={updateStatus} disabled={statusControlLocked} className="w-full sm:w-auto">Save status</Button>
      </div>
      {jobStatusMutationDenied ? <p className="mt-3 text-sm text-amber-200">Status changes remain read-only until an approved cloud identity is active.</p> : fieldJobStatusRestricted && fieldStatusTransitions.length === 0 ? <p className="mt-3 text-sm text-amber-200">Further lifecycle changes for this job require office review.</p> : null}
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
        {fieldWorkspace ? <>
          {quickLink("/field/snags", "Snags", `${counts.outstandingSnags} snag${counts.outstandingSnags === 1 ? "" : "s"} outstanding`, CheckSquare2)}
          {quickLink("/field/site-diary", "Site diary", `${jobDiaries.length} diary entr${jobDiaries.length === 1 ? "y" : "ies"}`, BookOpenText)}
          {quickLink(`/jobs/${jobId}`, "Job record & documents", `${jobDocuments.length} linked files`, FileText)}
          {quickLink("/field/testing", "Testing", "Open the field testing workflow", ClipboardList)}
        </> : <>
          {quickLink(`/job-tasks?job=${jobId}`, "Tasks & snagging", `${counts.outstandingTasks} tasks · ${counts.outstandingSnags} snags outstanding`, CheckSquare2)}
          {quickLink(`/site-management?job=${jobId}`, "Site diary", `${jobDiaries.length} diary entr${jobDiaries.length === 1 ? "y" : "ies"}`, BookOpenText)}
          {quickLink(`/site-management?job=${jobId}`, "Variations", `${jobVariations.length} recorded change${jobVariations.length === 1 ? "" : "s"}`, Wrench)}
          {quickLink(`/jobs/${jobId}`, "Documents & photos", `${jobDocuments.length} linked files`, FileText)}
          {quickLink(`/job-finance?job=${jobId}`, "Job financials", "Contract, costs, profit and payments", ReceiptText)}
          {quickLink(`/field/testing?job=${jobId}`, "Testing", "Open electrical testing records", ClipboardList)}
        </>}
      </div>
      {fieldWorkspace ? <p className="mt-4 text-sm text-amber-200">Variations and job financials remain office-managed. Use the dedicated field workflows above for assigned-job work.</p> : null}
    </Card>

    <Card>
      <div className="flex items-end justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">Latest activity</p><h2 className="mt-1 text-xl font-bold">Job timeline</h2></div><Link href={`/jobs/${jobId}`} className="text-sm font-semibold text-cyan-300">View full timeline</Link></div>
      <div className="mt-4 space-y-3">{recentActivity.length ? recentActivity.map((entry) => <div key={entry.id} className="rounded-xl border border-slate-800 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold">{entry.eventType || entry.milestone}</p><p className="text-xs text-slate-500">{new Date(entry.completedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</p></div>{entry.note ? <p className="mt-2 text-sm text-slate-400">{entry.note}</p> : null}</div>) : <p className="text-sm text-slate-400">No activity recorded yet.</p>}</div>
    </Card>
  </main>;
}
