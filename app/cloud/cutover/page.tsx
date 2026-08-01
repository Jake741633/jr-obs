"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, CloudCog, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { runCloudCutoverCheck, type CloudCutoverReport } from "../../../lib/cloud/cutover";
import { discardSyncQueueItem, flushSyncQueue, getOrganisationSyncQueue, getSyncQueue, type SyncQueueItem } from "../../../lib/cloud/repository";
import { useCloudIdentity } from "../../../lib/cloud/useCloudIdentity";

function statusClass(status: string) {
  if (status === "Ready" || status === "Cloud only") return "text-emerald-300";
  if (status === "Empty") return "text-slate-400";
  return "text-amber-300";
}

function queueItemLabel(item: SyncQueueItem) {
  return item.storageKey || item.collectionKey || item.table;
}

export default function CloudCutoverPage() {
  const { identity, isReady, mode, refresh } = useCloudIdentity();
  const [report, setReport] = useState<CloudCutoverReport | null>(null);
  const [queueItems, setQueueItems] = useState<SyncQueueItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [identityBusy, setIdentityBusy] = useState(false);
  const [repairBusy, setRepairBusy] = useState(false);
  const [repairMessage, setRepairMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (mode !== "local" && isReady && !identity) {
      setIdentityBusy(true);
      void refresh().finally(() => setIdentityBusy(false));
    }
  }, [identity, isReady, mode, refresh]);

  function refreshQueueItems(organisationId: string) {
    setQueueItems(getOrganisationSyncQueue(organisationId));
  }

  async function refreshIdentity() {
    setIdentityBusy(true);
    setError("");
    try {
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The signed-in account could not be refreshed.");
    } finally {
      setIdentityBusy(false);
    }
  }

  async function runCheck() {
    if (!identity?.organisationId) {
      setError("Your account session exists, but the organisation profile has not loaded. Refresh the signed-in account first.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      setReport(await runCloudCutoverCheck(identity.organisationId));
      refreshQueueItems(identity.organisationId);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The cloud cutover check could not be completed.");
    } finally {
      setBusy(false);
    }
  }

  async function repairPendingQueue() {
    if (!identity?.organisationId) return;
    setRepairBusy(true);
    setRepairMessage("");
    setError("");
    try {
      const before = getSyncQueue().length;
      const result = await flushSyncQueue();
      const refreshedReport = await runCloudCutoverCheck(identity.organisationId);
      setReport(refreshedReport);
      refreshQueueItems(identity.organisationId);
      setRepairMessage(
        result.remaining === 0
          ? `Sync repair complete. ${result.cleared} of ${before} queued changes were safely cleared and the queue is now empty.`
          : `Sync repair processed ${result.processed} changes. ${result.remaining} remain (${result.conflicts} conflicts, ${result.failed} failed).`,
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The pending sync queue could not be repaired.");
    } finally {
      setRepairBusy(false);
    }
  }

  async function clearFailedQueueItem(item: SyncQueueItem) {
    if (!identity?.organisationId || item.state !== "Failed") return;
    const collection = report?.collections.find((entry) => entry.storageKey === item.storageKey || (entry.table === item.table && entry.collectionKey === item.collectionKey));
    const cloudContainsRecord = Boolean(collection && collection.cloudCount > 0 && !collection.localOnlyIds.includes(item.sourceId));
    if (!cloudContainsRecord) {
      setError("This failed queue item cannot be cleared safely because the readiness check does not confirm its record exists in Supabase.");
      return;
    }
    setError("");
    setRepairMessage("");
    const result = discardSyncQueueItem(item.id);
    if (!result.removed) {
      setError("The failed queue item was no longer present.");
      return;
    }
    const refreshedReport = await runCloudCutoverCheck(identity.organisationId);
    setReport(refreshedReport);
    refreshQueueItems(identity.organisationId);
    setRepairMessage(`Removed the stale failed queue marker for ${queueItemLabel(item)}. No local or cloud business record was deleted.`);
  }

  return <div className="space-y-6">
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">Cloud readiness</p>
      <h1 className="mt-1 text-3xl font-bold">Cloud cutover verification</h1>
      <p className="mt-2 max-w-3xl text-sm text-slate-400">Compare this browser with Supabase without replacing or deleting local data. Use this before changing Netlify from migration mode to cloud mode.</p>
    </div>

    <div className="grid gap-4 md:grid-cols-3">
      <Card><CloudCog className="size-6 text-cyan-300" /><p className="mt-3 font-bold">Current mode</p><p className="mt-2 capitalize text-slate-400">{mode}</p></Card>
      <Card><p className="text-sm text-slate-400">Organisation</p><p className="mt-2 break-all font-semibold">{identity?.organisationId || (!isReady || identityBusy ? "Loading identity…" : "Account profile unavailable")}</p></Card>
      <Card><p className="text-sm text-slate-400">Signed-in role</p><p className="mt-2 capitalize font-semibold">{identity?.role || "—"}</p></Card>
    </div>

    <Card>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><h2 className="text-xl font-bold">Run readiness check</h2><p className="mt-2 text-sm text-slate-400">The check reads cloud IDs directly even while JR OS remains in migration mode.</p></div>
        <div className="flex flex-wrap gap-3">
          <Button type="button" disabled={identityBusy} onClick={() => void refreshIdentity()}><RefreshCw className={`mr-2 size-4 ${identityBusy ? "animate-spin" : ""}`} />{identityBusy ? "Refreshing account…" : "Refresh signed-in account"}</Button>
          <Button type="button" disabled={busy || identityBusy || repairBusy || !identity?.organisationId} onClick={() => void runCheck()}><RefreshCw className={`mr-2 size-4 ${busy ? "animate-spin" : ""}`} />{busy ? "Checking…" : "Check local against cloud"}</Button>
        </div>
      </div>
      {error ? <p className="mt-4 whitespace-pre-wrap rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-200">{error}</p> : null}
    </Card>

    {report ? <>
      <Card className={report.readyForCloudMode ? "border-emerald-500/30" : "border-amber-500/30"}>
        <div className="flex items-start gap-3">
          {report.readyForCloudMode ? <CheckCircle2 className="mt-0.5 size-6 shrink-0 text-emerald-300" /> : <AlertTriangle className="mt-0.5 size-6 shrink-0 text-amber-300" />}
          <div>
            <h2 className="text-xl font-bold">{report.readyForCloudMode ? "Ready for controlled cloud-mode testing" : "Not ready for cloud mode"}</h2>
            <p className="mt-2 text-sm text-slate-400">Checked {new Date(report.checkedAt).toLocaleString("en-GB")}. This check does not change the Netlify environment variable.</p>
            {report.blockers.length ? <ul className="mt-3 space-y-1 text-sm text-amber-200">{report.blockers.map((blocker) => <li key={blocker}>• {blocker}</li>)}</ul> : <p className="mt-3 text-sm text-emerald-200">No local-only records, queued failures, conflicts or unreadable cloud collections were found.</p>}
          </div>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-4">
        <Card><p className="text-sm text-slate-400">Local records checked</p><p className="mt-2 text-3xl font-bold">{report.localTotal}</p></Card>
        <Card><p className="text-sm text-slate-400">Cloud records found</p><p className="mt-2 text-3xl font-bold">{report.cloudTotal}</p></Card>
        <Card><p className="text-sm text-slate-400">Local only</p><p className="mt-2 text-3xl font-bold">{report.localOnlyTotal}</p></Card>
        <Card><p className="text-sm text-slate-400">Cloud only</p><p className="mt-2 text-3xl font-bold">{report.cloudOnlyTotal}</p></Card>
      </div>

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><h2 className="text-xl font-bold">Queue and file checks</h2><p className="mt-2 text-sm text-slate-400">Retry queued changes safely. Entries already identical in Supabase are cleared without creating another version.</p></div>
          <Button type="button" disabled={repairBusy || report.pendingQueueCount + report.failedQueueCount === 0} onClick={() => void repairPendingQueue()}><RefreshCw className={`mr-2 size-4 ${repairBusy ? "animate-spin" : ""}`} />{repairBusy ? "Repairing queue…" : "Retry and clear pending changes"}</Button>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-4 text-sm">
          <div className="rounded-xl border border-slate-800 p-3"><p className="text-slate-400">Pending/offline</p><p className="mt-1 text-xl font-bold">{report.pendingQueueCount}</p></div>
          <div className="rounded-xl border border-slate-800 p-3"><p className="text-slate-400">Conflicts</p><p className="mt-1 text-xl font-bold">{report.conflictQueueCount}</p></div>
          <div className="rounded-xl border border-slate-800 p-3"><p className="text-slate-400">Failed</p><p className="mt-1 text-xl font-bold">{report.failedQueueCount}</p></div>
          <div className="rounded-xl border border-slate-800 p-3"><p className="text-slate-400">Files queued</p><p className="mt-1 text-xl font-bold">{report.privateUploadQueueCount}</p></div>
        </div>
        {queueItems.length ? <div className="mt-4 space-y-3">
          {queueItems.map((item) => <div key={item.id} className="rounded-xl border border-slate-800 p-4 text-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold">{queueItemLabel(item)}</p>
                <p className="mt-1 text-slate-400">{item.operation} · {item.state} · attempt {item.attempts}</p>
                <p className="mt-1 break-all text-xs text-slate-500">Record: {item.sourceId}</p>
                <p className="mt-1 break-all text-xs text-slate-500">Table: {item.table}{item.collectionKey ? ` · ${item.collectionKey}` : ""}</p>
                {item.error ? <p className="mt-2 whitespace-pre-wrap text-red-300">{item.error}</p> : null}
              </div>
              {item.state === "Failed" ? <Button type="button" variant="secondary" onClick={() => void clearFailedQueueItem(item)}><Trash2 className="mr-2 size-4" />Clear stale marker</Button> : null}
            </div>
          </div>)}
        </div> : null}
        {repairMessage ? <p className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-200">{repairMessage}</p> : null}
      </Card>

      <Card>
        <h2 className="text-xl font-bold">Collection comparison</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-slate-400"><tr><th className="px-3 py-2">Collection</th><th className="px-3 py-2">Local</th><th className="px-3 py-2">Cloud</th><th className="px-3 py-2">Matched</th><th className="px-3 py-2">Status</th></tr></thead>
            <tbody>{report.collections.map((item) => <tr key={item.storageKey} className="border-t border-slate-800"><td className="px-3 py-3"><p className="font-medium">{item.storageKey}</p><p className="text-xs text-slate-500">{item.table}{item.collectionKey ? ` · ${item.collectionKey}` : ""}</p>{item.error ? <p className="mt-1 max-w-xl text-xs text-red-300">{item.error}</p> : null}{item.localOnlyIds.length ? <p className="mt-1 max-w-xl truncate text-xs text-amber-300">Local-only IDs: {item.localOnlyIds.join(", ")}</p> : null}</td><td className="px-3 py-3">{item.localCount}</td><td className="px-3 py-3">{item.cloudCount}</td><td className="px-3 py-3">{item.matchingCount}</td><td className={`px-3 py-3 font-semibold ${statusClass(item.status)}`}>{item.status}</td></tr>)}</tbody>
          </table>
        </div>
      </Card>
    </> : null}
  </div>;
}
