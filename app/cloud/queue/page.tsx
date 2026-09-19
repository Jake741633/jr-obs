"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";
import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { flushSyncQueue, getSyncQueue, type SyncQueueItem } from "../../../lib/cloud/repository";

function stateClass(state: string) {
  if (state === "Synced") return "text-emerald-300";
  if (state === "Failed" || state === "Conflict") return "text-red-300";
  return "text-amber-300";
}

export default function CloudQueuePage() {
  const [items, setItems] = useState<SyncQueueItem[]>(() => getSyncQueue());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  function refresh() {
    setItems(getSyncQueue());
  }

  useEffect(() => {
    window.addEventListener("jr-os-sync-status", refresh);
    return () => window.removeEventListener("jr-os-sync-status", refresh);
  }, []);

  async function retry() {
    setBusy(true);
    setMessage("");
    try {
      const result = await flushSyncQueue();
      refresh();
      setMessage(`Processed ${result.processed}. ${result.remaining} remain (${result.conflicts} conflicts, ${result.failed} failed).`);
    } finally {
      setBusy(false);
    }
  }

  return <div className="space-y-6">
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">Cloud diagnostics</p>
      <h1 className="mt-1 text-3xl font-bold">Sync queue</h1>
      <p className="mt-2 max-w-3xl text-sm text-slate-400">See exactly which queued change is blocking cloud cutover. This page does not delete local business records.</p>
    </div>

    <Card>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold">Queued changes</h2>
          <p className="mt-2 text-sm text-slate-400">{items.length ? `${items.length} change${items.length === 1 ? "" : "s"} remain.` : "The queue is empty."}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button type="button" onClick={refresh}><RefreshCw className="mr-2 size-4" />Refresh details</Button>
          <Button type="button" disabled={busy || items.length === 0} onClick={() => void retry()}><RefreshCw className={`mr-2 size-4 ${busy ? "animate-spin" : ""}`} />{busy ? "Retrying…" : "Retry queue"}</Button>
        </div>
      </div>
      {message ? <p className="mt-4 rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-3 text-sm text-cyan-100">{message}</p> : null}
    </Card>

    {!items.length ? <Card className="border-emerald-500/30"><div className="flex items-center gap-3"><CheckCircle2 className="size-6 text-emerald-300" /><p className="font-semibold text-emerald-200">No queued changes remain.</p></div></Card> : null}

    {items.map((item) => <Card key={item.id} className={item.state === "Failed" || item.state === "Conflict" ? "border-red-500/30" : "border-amber-500/30"}>
      <div className="flex items-start gap-3">
        <AlertTriangle className={`mt-0.5 size-5 shrink-0 ${stateClass(item.state)}`} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-bold">{item.operation === "delete" ? "Delete" : "Upload/update"} · {item.table}</p>
            <p className={`font-semibold ${stateClass(item.state)}`}>{item.state}</p>
          </div>
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            <div><dt className="text-slate-500">Storage collection</dt><dd className="break-all text-slate-200">{item.storageKey || "—"}</dd></div>
            <div><dt className="text-slate-500">Cloud collection key</dt><dd className="break-all text-slate-200">{item.collectionKey || "Typed table"}</dd></div>
            <div><dt className="text-slate-500">Record ID</dt><dd className="break-all text-slate-200">{item.sourceId}</dd></div>
            <div><dt className="text-slate-500">Attempts</dt><dd className="text-slate-200">{item.attempts}</dd></div>
          </dl>
          {item.error ? <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/5 p-3"><p className="text-xs font-semibold uppercase tracking-wide text-red-300">Exact error</p><p className="mt-1 whitespace-pre-wrap break-words text-sm text-red-100">{item.error}</p></div> : null}
        </div>
      </div>
    </Card>)}
  </div>;
}
