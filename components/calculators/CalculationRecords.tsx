"use client";

import Link from "next/link";
import { useState } from "react";
import { Card } from "../ui/Card";
import { InputField, TextareaField } from "../ui/FormField";
import { buildCalculationSnapshot, calculationRecordBindings, CALCULATION_RECORDS_STORAGE_KEY, createCalculationRecord, isCalculationRecord } from "../../lib/calculationRecords-core.mjs";
import { formatCalculatorNumber } from "../../lib/electricalCalculatorNumbers-core.mjs";
import { useJobsCollection, usePricingDocumentsCollection, useSurveysCollection } from "../../lib/cloud/coreBusinessCollections";
import { canAccessPath } from "../../lib/cloud/permissions";
import { activeSyncAuthorizationMatches } from "../../lib/cloud/repository";
import { useCloudIdentity, type CloudIdentity } from "../../lib/cloud/useCloudIdentity";
import { useCloudLocalCollection } from "../../lib/storage";

type CalculationRecord = ReturnType<typeof createCalculationRecord>;
type CalculationProps = { kind: string; input: Record<string, unknown>; label: string };
type CalculationFilter = { jobId?: string; quoteId?: string; surveyId?: string };
const scopeKey = (identity: CloudIdentity) => JSON.stringify([identity.organisationId, identity.userId, identity.role, identity.customerSourceId ?? null]);
const allowed = (identity: CloudIdentity | null) => Boolean(identity && canAccessPath(identity.role, "/electrical-calculators"));
const linkClass = "inline-flex min-h-11 max-w-full items-center rounded-xl border border-slate-700 px-3 text-sm font-semibold text-cyan-200";

export function SaveCalculation(props: CalculationProps) {
  const { identity, isReady } = useCloudIdentity();
  if (!isReady) return <Card>Loading calculation storage…</Card>;
  if (!identity) return <Card><p className="text-sm text-slate-400">Sign in to save {props.label.toLowerCase()} as a design note or link it to a job, quote or survey.</p><Link href="/cloud" className={`${linkClass} mt-3`}>Open account</Link></Card>;
  if (!allowed(identity)) return null;
  return <CalculationSaveForm key={`${scopeKey(identity)}:${props.kind}`} {...props} identity={identity} />;
}

function CalculationSaveForm({ kind, input, label, identity }: CalculationProps & { identity: CloudIdentity }) {
  const records = useCloudLocalCollection<CalculationRecord>(CALCULATION_RECORDS_STORAGE_KEY);
  const jobs = useJobsCollection();
  const quotes = usePricingDocumentsCollection();
  const surveys = useSurveysCollection();
  const { mode } = useCloudIdentity();
  const [title, setTitle] = useState("");
  const [evidenceReference, setEvidenceReference] = useState("");
  const [designNote, setDesignNote] = useState("");
  const [attachmentType, setAttachmentType] = useState("note");
  const [attachmentId, setAttachmentId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const snapshot = buildCalculationSnapshot(kind, input);
  const ready = records.isReady && jobs.isReady && (attachmentType !== "quote" || quotes.isReady) && (attachmentType !== "survey" || surveys.isReady);
  const quote = attachmentType === "quote" ? quotes.items.find((item) => item.id === attachmentId) ?? null : null;
  const survey = attachmentType === "survey" ? surveys.items.find((item) => item.id === attachmentId) ?? null : null;
  const jobId = attachmentType === "job" ? attachmentId : quote?.jobId ?? survey?.jobId;
  const job = jobId ? jobs.items.find((item) => item.id === jobId) ?? null : null;
  const targets = attachmentType === "job" ? jobs.items.map((item) => ({ id: item.id, label: item.title }))
    : attachmentType === "quote" ? quotes.items.map((item) => ({ id: item.id, label: `${item.number} · ${item.title} (${item.type})` }))
      : surveys.items.map((item) => ({ id: item.id, label: item.number }));
  let bindingError = "";
  try {
    if (!["note", "job", "quote", "survey"].includes(attachmentType)) throw new Error("Choose a supported record type.");
    if (attachmentType !== "note" && !targets.some((item) => item.id === attachmentId)) throw new Error(attachmentId ? "The selected record is no longer available. Choose another record or a standalone design note." : "Choose a record to attach this calculation to.");
    calculationRecordBindings({ job, quote, survey });
  } catch (failure) {
    bindingError = failure instanceof Error ? failure.message : "Review the selected record before saving.";
  }
  const canSave = ready && Boolean(snapshot) && Boolean(title.trim()) && Boolean(evidenceReference.trim()) && !bindingError;

  function save() {
    setMessage("");
    setError("");
    try {
      if (!allowed(identity) || !activeSyncAuthorizationMatches(identity)) throw new Error("Your account changed. Reopen this calculation before saving.");
      if (!ready) throw new Error("Wait for linked records and saved calculations to finish loading.");
      if (bindingError) throw new Error(bindingError);
      const record = createCalculationRecord({ id: `calculation_${crypto.randomUUID()}`, createdAt: new Date().toISOString(), title, evidenceReference, designNote, kind, input, job, quote, survey });
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
      <p className="mt-2 text-sm text-slate-400">Keep a snapshot of this calculation, its assumptions and your evidence. Review it later from the linked job, quote or survey.</p>
      {!snapshot ? <p className="mt-3 text-sm text-amber-200">Complete the calculation inputs to enable saving. A result requiring review can still be recorded.</p> : null}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <InputField label="Calculation title" maxLength={120} value={title} onChange={(event) => { setTitle(event.target.value); setMessage(""); }} placeholder="Circuit, location and purpose" />
        <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Attach to</span><select aria-label="Attach to" value={attachmentType} onChange={(event) => { setAttachmentType(event.target.value); setAttachmentId(""); setMessage(""); setError(""); }} className="min-h-12 w-full min-w-0 rounded-xl border border-slate-700 bg-slate-950 px-3 text-base text-white"><option value="note">Standalone design note</option><option value="job">Job</option><option value="quote">Quote or estimate</option><option value="survey">Survey</option></select></label>
        {attachmentType !== "note" ? <div className="sm:col-span-2"><label className="grid gap-2 text-sm font-medium text-slate-300"><span>{attachmentType === "quote" ? "Quote or estimate" : attachmentType === "survey" ? "Survey" : "Job"}</span><select aria-label="Linked record" value={attachmentId} disabled={!ready} onChange={(event) => { setAttachmentId(event.target.value); setMessage(""); setError(""); }} className="min-h-12 w-full min-w-0 rounded-xl border border-slate-700 bg-slate-950 px-3 text-base text-white"><option value="">Choose a record</option>{targets.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>{ready && bindingError ? <p className="mt-2 text-sm text-amber-200">{bindingError}</p> : null}{!bindingError && job && attachmentType !== "job" ? <p className="mt-2 text-sm text-slate-400">Also linked to job: {job.title}</p> : null}</div> : null}
        <div className="sm:col-span-2"><TextareaField label="Evidence source and revision" maxLength={2000} value={evidenceReference} onChange={(event) => { setEvidenceReference(event.target.value); setMessage(""); }} placeholder="Manufacturer data sheet/revision, installation method and circuit/site evidence" /></div>
        <div className="sm:col-span-2"><TextareaField label="Design note (optional)" maxLength={4000} value={designNote} onChange={(event) => { setDesignNote(event.target.value); setMessage(""); }} placeholder="Reason for selected factors, remaining checks and review actions" /></div>
      </div>
      <div className="mt-4 flex flex-wrap gap-3"><button type="button" disabled={!canSave} onClick={save} className="min-h-11 rounded-xl bg-cyan-300 px-4 font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-40">Save calculation record</button><Link href="/electrical-calculators/records" className={linkClass}>View saved calculations</Link></div>
      {message ? <p role="status" className="mt-3 text-sm text-cyan-200">{message}</p> : null}
      {error ? <p role="alert" className="mt-3 text-sm text-rose-200">{error}</p> : null}
    </details>
  </Card>;
}

export function SavedCalculationRecords({ jobId, quoteId, surveyId }: CalculationFilter) {
  const filtered = jobId !== undefined || quoteId !== undefined || surveyId !== undefined;
  const { identity, isReady } = useCloudIdentity();
  if (!isReady) return filtered ? null : <Card>Loading your account…</Card>;
  if (!allowed(identity) || !identity) return filtered ? null : <Card>Sign in with an account that can access Electrical Calculators to view saved records.</Card>;
  return <CalculationRecordList key={`${scopeKey(identity)}:${JSON.stringify([jobId, quoteId, surveyId])}`} jobId={jobId} quoteId={quoteId} surveyId={surveyId} />;
}

function CalculationRecordList({ jobId, quoteId, surveyId }: CalculationFilter) {
  const filtered = jobId !== undefined || quoteId !== undefined || surveyId !== undefined;
  const store = useCloudLocalCollection<CalculationRecord>(CALCULATION_RECORDS_STORAGE_KEY);
  const [query, setQuery] = useState("");
  if (!store.isReady) return <Card>Loading saved calculations…</Card>;
  const validRecords = store.items.filter(isCalculationRecord);
  const records = validRecords.filter((record) => (jobId === undefined || record.jobId === jobId) && (quoteId === undefined || record.quoteId === quoteId) && (surveyId === undefined || record.surveyId === surveyId) && `${record.title} ${record.jobTitle ?? ""} ${record.quoteNumber ?? ""} ${record.quoteTitle ?? ""} ${record.surveyNumber ?? ""} ${record.snapshot.title} ${record.evidenceReference}`.toLowerCase().includes(query.trim().toLowerCase())).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  return <section className="space-y-4 print:hidden" aria-label="Saved calculation records">
    <Card><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-bold">Saved calculations</h2><Link href="/electrical-calculators" className={linkClass}>Open calculators</Link></div><p className="mt-2 text-sm text-slate-400">Historical design aids with recorded evidence. Check Cloud status for pending uploads or conflicts.</p>{!filtered ? <div className="mt-4"><InputField label="Search saved calculations" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Title, job, quote, survey, calculator or evidence source" /></div> : null}</Card>
    {store.items.length !== validRecords.length ? <p role="alert" className="text-sm text-amber-200">Some records use an unsupported format and cannot be displayed. They have been retained.</p> : null}
    {records.length === 0 ? <Card><p className="text-sm text-slate-400">{query ? "No calculations match your search." : filtered ? "No saved calculations are linked to this record yet." : "No saved calculations yet. Complete a calculator and save a design note or linked record."}</p></Card> : null}
    {records.map((record) => <Card key={record.id}>
      <details>
        <summary className="min-h-11 cursor-pointer py-2"><span className="break-words font-semibold">{record.title}</span><span className="mt-1 block text-sm text-slate-400">{record.snapshot.title} · {new Date(record.createdAt).toLocaleString("en-GB")} · {record.snapshot.assessment}</span></summary>
        <p className="mt-3 text-sm text-amber-200">{record.snapshot.warning}</p>
        <p className="mt-3 whitespace-pre-wrap break-words text-sm text-slate-300"><strong>Evidence: </strong>{record.evidenceReference}</p>
        {record.designNote ? <p className="mt-3 whitespace-pre-wrap break-words text-sm text-slate-300"><strong>Design note: </strong>{record.designNote}</p> : null}
        <div className="mt-3 flex flex-wrap gap-3">
          {record.jobId ? <Link href={`/jobs/${encodeURIComponent(record.jobId)}`} className={linkClass}><span className="min-w-0 break-words">Open job: {record.jobTitle}</span></Link> : null}
          {record.quoteId ? <Link href={`/quotes/${encodeURIComponent(record.quoteId)}`} className={linkClass}><span className="min-w-0 break-words">Open {record.quoteType?.toLowerCase()}: {record.quoteNumber} · {record.quoteTitle}</span></Link> : null}
          {record.surveyId ? <Link href={`/surveys/${encodeURIComponent(record.surveyId)}`} className={linkClass}><span className="min-w-0 break-words">Open survey: {record.surveyNumber}</span></Link> : null}
        </div>
        {!record.jobId && !record.quoteId && !record.surveyId ? <p className="mt-3 text-sm text-slate-400">Standalone design note</p> : null}
        <div className="mt-4 grid gap-5 lg:grid-cols-2">{(["inputs", "outputs"] as const).map((section) => <div key={section}><h3 className="font-semibold">{section === "inputs" ? "Recorded inputs" : "Recorded results"}</h3><dl className="mt-3 space-y-2">{record.snapshot[section].map((row: { label: string; value: string | number; unit: string }, index: number) => <div key={index} className="rounded-xl bg-slate-950/70 p-3"><dt className="text-sm text-slate-400">{row.label}</dt><dd className="mt-1 break-words font-medium">{typeof row.value === "number" ? formatCalculatorNumber(row.value) : row.value} {row.unit}</dd></div>)}</dl></div>)}</div>
        <h3 className="mt-5 font-semibold">Recorded assumptions and limits</h3><ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-400">{record.snapshot.assumptions.map((assumption: string, index: number) => <li key={index}>{assumption}</li>)}</ul>
        <p className="mt-3 text-xs text-slate-500">Saved results are not recalculated when inputs or calculator versions change. Displayed numeric results are rounded.</p>
      </details>
    </Card>)}
  </section>;
}
