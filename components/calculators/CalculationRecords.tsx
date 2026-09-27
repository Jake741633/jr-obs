"use client";

import Link from "next/link";
import { useState } from "react";
import { Card } from "../ui/Card";
import { InputField, TextareaField } from "../ui/FormField";
import { buildCalculationSnapshot, CALCULATION_RECORDS_STORAGE_KEY, createCalculationRecord, isCalculationRecord } from "../../lib/calculationRecords-core.mjs";
import { formatCalculatorNumber } from "../../lib/electricalCalculatorNumbers-core.mjs";
import { useJobsCollection } from "../../lib/cloud/coreBusinessCollections";
import { canAccessPath } from "../../lib/cloud/permissions";
import { activeSyncAuthorizationMatches } from "../../lib/cloud/repository";
import { useCloudIdentity, type CloudIdentity } from "../../lib/cloud/useCloudIdentity";
import { useCloudLocalCollection } from "../../lib/storage";

type CalculationRecord = ReturnType<typeof createCalculationRecord>;
type CalculationProps = { kind: string; input: Record<string, unknown>; label: string };
const scopeKey = (identity: CloudIdentity) => JSON.stringify([identity.organisationId, identity.userId, identity.role, identity.customerSourceId ?? null]);
const allowed = (identity: CloudIdentity | null) => Boolean(identity && canAccessPath(identity.role, "/electrical-calculators"));
const linkClass = "inline-flex min-h-11 items-center rounded-xl border border-slate-700 px-3 text-sm font-semibold text-cyan-200";

export function SaveCalculation(props: CalculationProps) {
  const { identity, isReady } = useCloudIdentity();
  if (!isReady) return <Card>Loading calculation storage…</Card>;
  if (!identity) return <Card><p className="text-sm text-slate-400">Sign in to save {props.label.toLowerCase()} as a design note or job record.</p><Link href="/cloud" className={`${linkClass} mt-3`}>Open account</Link></Card>;
  if (!allowed(identity)) return null;
  return <CalculationSaveForm key={`${scopeKey(identity)}:${props.kind}`} {...props} identity={identity} />;
}

function CalculationSaveForm({ kind, input, label, identity }: CalculationProps & { identity: CloudIdentity }) {
  const records = useCloudLocalCollection<CalculationRecord>(CALCULATION_RECORDS_STORAGE_KEY);
  const jobs = useJobsCollection();
  const { mode } = useCloudIdentity();
  const [title, setTitle] = useState("");
  const [evidenceReference, setEvidenceReference] = useState("");
  const [designNote, setDesignNote] = useState("");
  const [jobId, setJobId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const snapshot = buildCalculationSnapshot(kind, input);
  const ready = records.isReady && jobs.isReady;
  const job = jobId ? jobs.items.find((item) => item.id === jobId) : null;
  const canSave = ready && Boolean(snapshot) && Boolean(title.trim()) && Boolean(evidenceReference.trim()) && (!jobId || Boolean(job));

  function save() {
    setMessage("");
    setError("");
    try {
      if (!allowed(identity) || !activeSyncAuthorizationMatches(identity)) throw new Error("Your account changed. Reopen this calculation before saving.");
      if (!ready) throw new Error("Wait for jobs and saved calculations to finish loading.");
      if (jobId && !job) throw new Error("The selected job is no longer available. Choose another job or a standalone design note.");
      const record = createCalculationRecord({ id: `calculation_${crypto.randomUUID()}`, createdAt: new Date().toISOString(), title, evidenceReference, designNote, kind, input, job });
      records.createItem(record);
      setMessage(mode === "local" ? "Saved on this device." : "Saved on this device and queued for sync. Check Cloud status to confirm upload.");
      setTitle("");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "The calculation could not be saved. Please try again.");
    }
  }

  return <Card>
    <details>
      <summary className="min-h-11 cursor-pointer py-2 font-semibold text-cyan-200">Save {label.toLowerCase()}</summary>
      <p className="mt-2 text-sm text-slate-400">Keep a snapshot of this calculation, its assumptions and your evidence. Saved records are design aids and can be reviewed later from the linked job.</p>
      {!snapshot ? <p className="mt-3 text-sm text-amber-200">Complete the calculation inputs to enable saving. A result requiring review can still be recorded.</p> : null}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <InputField label="Calculation title" maxLength={120} value={title} onChange={(event) => { setTitle(event.target.value); setMessage(""); }} placeholder="Circuit, location and purpose" />
        <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Attach to job</span><select value={jobId} disabled={!jobs.isReady} onChange={(event) => { setJobId(event.target.value); setMessage(""); }} className="min-h-12 w-full min-w-0 rounded-xl border border-slate-700 bg-slate-950 px-3 text-base text-white"><option value="">Standalone design note</option>{jobs.items.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
        <div className="sm:col-span-2"><TextareaField label="Evidence source and revision" maxLength={2000} value={evidenceReference} onChange={(event) => { setEvidenceReference(event.target.value); setMessage(""); }} placeholder="Manufacturer data sheet/revision, installation method and circuit/site evidence" /></div>
        <div className="sm:col-span-2"><TextareaField label="Design note (optional)" maxLength={4000} value={designNote} onChange={(event) => { setDesignNote(event.target.value); setMessage(""); }} placeholder="Reason for selected factors, remaining checks and review actions" /></div>
      </div>
      <div className="mt-4 flex flex-wrap gap-3"><button type="button" disabled={!canSave} onClick={save} className="min-h-11 rounded-xl bg-cyan-300 px-4 font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-40">Save calculation record</button><Link href="/electrical-calculators/records" className={linkClass}>View saved calculations</Link></div>
      {message ? <p role="status" className="mt-3 text-sm text-cyan-200">{message}</p> : null}
      {error ? <p role="alert" className="mt-3 text-sm text-rose-200">{error}</p> : null}
    </details>
  </Card>;
}

export function SavedCalculationRecords({ jobId }: { jobId?: string }) {
  const { identity, isReady } = useCloudIdentity();
  if (!isReady) return jobId ? null : <Card>Loading your account…</Card>;
  if (!allowed(identity) || !identity) return jobId ? null : <Card>Sign in with an account that can access Electrical Calculators to view saved records.</Card>;
  return <CalculationRecordList key={`${scopeKey(identity)}:${jobId ?? "all"}`} jobId={jobId} />;
}

function CalculationRecordList({ jobId }: { jobId?: string }) {
  const store = useCloudLocalCollection<CalculationRecord>(CALCULATION_RECORDS_STORAGE_KEY);
  const [query, setQuery] = useState("");
  if (!store.isReady) return <Card>Loading saved calculations…</Card>;
  const validRecords = store.items.filter(isCalculationRecord);
  const records = validRecords.filter((record) => (!jobId || record.jobId === jobId) && `${record.title} ${record.jobTitle ?? ""} ${record.snapshot.title} ${record.evidenceReference}`.toLowerCase().includes(query.trim().toLowerCase())).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  return <section className="space-y-4" aria-label="Saved calculation records">
    <Card><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-bold">Saved calculations</h2><Link href="/electrical-calculators" className={linkClass}>Open calculators</Link></div><p className="mt-2 text-sm text-slate-400">Historical design aids with recorded evidence. Check Cloud status for pending uploads or conflicts.</p>{!jobId ? <div className="mt-4"><InputField label="Search saved calculations" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Title, job, calculator or evidence source" /></div> : null}</Card>
    {store.items.length !== validRecords.length ? <p role="alert" className="text-sm text-amber-200">Some records use an unsupported format and cannot be displayed. They have been retained.</p> : null}
    {records.length === 0 ? <Card><p className="text-sm text-slate-400">{query ? "No calculations match your search." : jobId ? "No saved calculations are linked to this job yet." : "No saved calculations yet. Complete a calculator and save a design note or job record."}</p></Card> : null}
    {records.map((record) => <Card key={record.id}>
      <details>
        <summary className="min-h-11 cursor-pointer py-2"><span className="break-words font-semibold">{record.title}</span><span className="mt-1 block text-sm text-slate-400">{record.snapshot.title} · {new Date(record.createdAt).toLocaleString("en-GB")} · {record.snapshot.assessment}</span></summary>
        <p className="mt-3 text-sm text-amber-200">{record.snapshot.warning}</p>
        <p className="mt-3 whitespace-pre-wrap break-words text-sm text-slate-300"><strong>Evidence: </strong>{record.evidenceReference}</p>
        {record.designNote ? <p className="mt-3 whitespace-pre-wrap break-words text-sm text-slate-300"><strong>Design note: </strong>{record.designNote}</p> : null}
        {record.jobId ? <Link href={`/jobs/${encodeURIComponent(record.jobId)}`} className={`${linkClass} mt-3`}>Open job: {record.jobTitle}</Link> : <p className="mt-3 text-sm text-slate-400">Standalone design note</p>}
        <div className="mt-4 grid gap-5 lg:grid-cols-2">{(["inputs", "outputs"] as const).map((section) => <div key={section}><h3 className="font-semibold">{section === "inputs" ? "Recorded inputs" : "Recorded results"}</h3><dl className="mt-3 space-y-2">{record.snapshot[section].map((row: { label: string; value: string | number; unit: string }, index: number) => <div key={index} className="rounded-xl bg-slate-950/70 p-3"><dt className="text-sm text-slate-400">{row.label}</dt><dd className="mt-1 break-words font-medium">{typeof row.value === "number" ? formatCalculatorNumber(row.value) : row.value} {row.unit}</dd></div>)}</dl></div>)}</div>
        <h3 className="mt-5 font-semibold">Recorded assumptions and limits</h3><ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-400">{record.snapshot.assumptions.map((assumption: string, index: number) => <li key={index}>{assumption}</li>)}</ul>
        <p className="mt-3 text-xs text-slate-500">Saved results are not recalculated when inputs or calculator versions change. Displayed numeric results are rounded.</p>
      </details>
    </Card>)}
  </section>;
}
