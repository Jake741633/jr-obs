"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ClipboardCheck, FileText, Plus, Save, Trash2 } from "lucide-react";
import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { InputField, TextareaField } from "../../../components/ui/FormField";
import { PageHeader } from "../../../components/ui/PageHeader";
import { useElectricalTestingCollection, useTeamCollection } from "../../../lib/cloud/coreBusinessCollections";
import { useCloudIdentity } from "../../../lib/cloud/useCloudIdentity";
import { fieldOperatorName } from "../../../lib/siteDiaryIdentity-core.mjs";
import { isJobOnSiteStatus, normaliseJobStatus } from "../../../lib/jobManagement-core.mjs";
import { makeId, useCloudLocalCollection } from "../../../lib/storage";
import type { Customer, ElectricalCertificate, Job } from "../../../lib/models";
import {
  certificateReadySummary,
  testingProgress,
  validateTestingRecord,
  type CircuitTestResult,
  type ElectricalTestingRecord,
  type PolarityResult,
  type TestingRecordStatus,
} from "../../../lib/electricalTesting";

const fieldClass = "min-h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-white outline-none transition focus:border-cyan-400";
const statuses: TestingRecordStatus[] = ["Draft", "In progress", "Ready for certificate", "Complete"];
const polarities: PolarityResult[] = ["", "Confirmed", "Not confirmed", "Not tested"];
const fieldTestingDraftStorageKey = "jr-os-field-electrical-testing-drafts";

function blankCircuit(): CircuitTestResult {
  return { id: makeId("circuit-test"), circuitReference: "", description: "", protectiveDevice: "", r1r2: "", insulationResistance: "", polarity: "", zs: "", rcdTest: "", notes: "" };
}

function blankRecord(jobId = "", customerId?: string): ElectricalTestingRecord {
  const now = new Date().toISOString();
  return { id: makeId("testing"), jobId, customerId, status: "Draft", inspectorName: "", testDate: now.slice(0, 10), supplyDetails: "", earthingArrangement: "", circuits: [blankCircuit()], outstandingActions: [], generalNotes: "", createdAt: now, updatedAt: now };
}

export default function MobileTestingPage() {
  const jobs = useCloudLocalCollection<Job>("jr-os-jobs");
  const customers = useCloudLocalCollection<Customer>("jr-os-customers");
  const certificates = useCloudLocalCollection<ElectricalCertificate>("jr-os-certificates");
  const canonicalRecords = useElectricalTestingCollection();
  const fieldDraftRecords = useCloudLocalCollection<ElectricalTestingRecord>(fieldTestingDraftStorageKey);
  const team = useTeamCollection();
  const identityState = useCloudIdentity();
  const fieldMode = identityState.mode !== "local" && identityState.identity?.role === "electrician";
  const localTestingMode = fieldMode || identityState.mode === "local";
  const records = fieldMode ? fieldDraftRecords : canonicalRecords;
  const [form, setForm] = useState<ElectricalTestingRecord>(() => blankRecord());
  const [actionText, setActionText] = useState("");
  const [message, setMessage] = useState("");

  const activeJobs = useMemo(() => jobs.items.filter((job) => normaliseJobStatus(job.status) === "Scheduled" || isJobOnSiteStatus(job.status)), [jobs.items]);
  const operatorName = useMemo(() => fieldOperatorName({
    identity: identityState.identity,
    teamMembers: team.items,
    mode: identityState.mode,
  }), [identityState.identity, identityState.mode, team.items]);
  const selectedJob = jobs.items.find((job) => job.id === form.jobId);
  const selectedCustomer = customers.items.find((customer) => customer.id === form.customerId);
  const linkedCertificate = certificates.items.find((certificate) => certificate.id === form.certificateId);
  const effectiveForm = useMemo(() => ({ ...form, inspectorName: operatorName || form.inspectorName }), [form, operatorName]);
  const warnings = validateTestingRecord(effectiveForm);
  const progress = testingProgress(effectiveForm);
  const summary = certificateReadySummary(effectiveForm, selectedJob?.title ?? "", selectedCustomer?.name ?? "");

  function chooseJob(jobId: string) {
    const job = jobs.items.find((item) => item.id === jobId);
    setForm((current) => ({ ...current, jobId, customerId: job?.customerId, certificateId: undefined, updatedAt: new Date().toISOString() }));
  }

  function updateCircuit(id: string, patch: Partial<CircuitTestResult>) {
    setForm((current) => ({ ...current, circuits: current.circuits.map((circuit) => circuit.id === id ? { ...circuit, ...patch } : circuit), updatedAt: new Date().toISOString() }));
  }

  function persistRecord(record: ElectricalTestingRecord) {
    records.setItems((current) => current.some((item) => item.id === record.id) ? current.map((item) => item.id === record.id ? record : item) : [record, ...current]);
  }

  function saveRecord(event?: FormEvent) {
    event?.preventDefault();
    if (!form.jobId) { setMessage("Choose the active job before saving the testing record."); return; }
    if (!operatorName) { setMessage("Your active team identity could not be resolved. Refresh your account before saving."); return; }
    const record = { ...effectiveForm, customerId: selectedJob?.customerId ?? form.customerId, inspectorName: operatorName, updatedAt: new Date().toISOString() };
    persistRecord(record);
    setForm(record);
    setMessage(localTestingMode ? "Testing draft saved locally. You can leave and resume it later." : "Testing record saved and queued for secure cloud sync.");
  }

  function resume(record: ElectricalTestingRecord) {
    setForm({ ...record, circuits: record.circuits.length ? record.circuits : [blankCircuit()], outstandingActions: record.outstandingActions ?? [] });
    setMessage(`Resumed testing record for ${jobs.items.find((job) => job.id === record.jobId)?.title ?? "job"}.`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function addAction() {
    if (!actionText.trim()) return;
    setForm((current) => ({ ...current, outstandingActions: [...current.outstandingActions, actionText.trim()], updatedAt: new Date().toISOString() }));
    setActionText("");
  }

  function markCertificateReady() {
    if (!operatorName) {
      setMessage("Your active team identity could not be resolved. Refresh your account before changing testing status.");
      return;
    }
    if (warnings.some((warning) => warning.severity === "Missing")) {
      setMessage("Complete the missing fields before marking this testing record ready for certificate preparation.");
      return;
    }
    const record = { ...effectiveForm, inspectorName: operatorName, status: "Ready for certificate" as const, updatedAt: new Date().toISOString() };
    persistRecord(record);
    setForm(record);
    setMessage("Testing record marked ready for certificate preparation. Inspector review is still required.");
  }

  function prepareCertificateSummary() {
    if (fieldMode) { setMessage("Certificate linking and authoring are office-controlled. Save the testing draft and hand the structured summary to the office for certificate preparation."); return; }
    if (!operatorName) { setMessage("Your active team identity could not be resolved. Refresh your account before preparing testing evidence."); return; }
    if (!linkedCertificate) { setMessage("Choose an existing certificate before preparing the testing summary."); return; }
    if (warnings.some((warning) => warning.severity === "Missing")) {
      setMessage("Complete the missing fields before preparing testing evidence for a certificate.");
      return;
    }
    const now = new Date().toISOString();
    const record = { ...effectiveForm, inspectorName: operatorName, status: "Ready for certificate" as const, updatedAt: now };
    persistRecord(record);
    setForm(record);
    setMessage(`Testing summary prepared for ${linkedCertificate.number}. The certificate has not been changed; open Certificates to review and transfer the results.`);
  }

  const ready = jobs.isReady && customers.isReady && certificates.isReady && records.isReady && team.isReady && identityState.isReady;
  if (!ready) return <Card>Loading electrical testing workspace…</Card>;

  return <div className="space-y-6">
    <PageHeader eyebrow="Mobile testing" title="Electrical testing workspace" description={localTestingMode ? "Capture circuit results against the active job, save drafts locally and prepare a structured summary for certificate review." : "Capture circuit results against the active job, save canonical testing records with cloud sync and prepare a structured summary for certificate review."} />

    {message ? <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/5 px-4 py-3 text-sm text-cyan-200">{message}</div> : null}

    <section className="grid gap-4 sm:grid-cols-3">
      <Card><p className="text-sm text-slate-400">Progress</p><p className="mt-2 text-3xl font-bold">{progress}%</p></Card>
      <Card><p className="text-sm text-slate-400">Circuit records</p><p className="mt-2 text-3xl font-bold">{form.circuits.length}</p></Card>
      <Card><p className="text-sm text-slate-400">Review prompts</p><p className="mt-2 text-3xl font-bold text-amber-300">{warnings.length}</p></Card>
    </section>

    <Card><form onSubmit={saveRecord} className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Active job</span><select required className={fieldClass} value={form.jobId} onChange={(event) => chooseJob(event.target.value)}><option value="">Choose job</option>{activeJobs.map((job) => <option key={job.id} value={job.id}>{job.title}</option>)}{form.jobId && !activeJobs.some((job) => job.id === form.jobId) ? <option value={form.jobId}>{selectedJob?.title ?? "Selected job"}</option> : null}</select></label>
        {fieldMode ? <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 px-4 py-3 text-sm text-amber-100"><p className="font-semibold">Certificate handoff</p><p className="mt-1 text-xs text-amber-100/70">Certificate linking, authoring and issue remain with the office. Complete the testing evidence here and send the structured summary for review.</p></div> : <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Linked certificate</span><select className={fieldClass} value={form.certificateId ?? ""} onChange={(event) => setForm({ ...form, certificateId: event.target.value || undefined })}><option value="">Not linked yet</option>{certificates.items.filter((certificate) => !form.jobId || certificate.jobId === form.jobId).map((certificate) => <option key={certificate.id} value={certificate.id}>{certificate.number} · {certificate.type}</option>)}</select></label>}
        <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Status</span><select className={fieldClass} value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as TestingRecordStatus })}>{statuses.map((status) => <option key={status}>{status}</option>)}</select></label>
        <InputField label="Inspector" value={operatorName || form.inspectorName} readOnly aria-readonly="true" />
        <InputField label="Test date" type="date" value={form.testDate} onChange={(event) => setForm({ ...form, testDate: event.target.value })} />
        <InputField label="Earthing arrangement" value={form.earthingArrangement} onChange={(event) => setForm({ ...form, earthingArrangement: event.target.value })} />
        <div className="md:col-span-2 xl:col-span-3"><TextareaField label="Supply details" value={form.supplyDetails} onChange={(event) => setForm({ ...form, supplyDetails: event.target.value })} /></div>
      </div>

      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-bold">Circuit results</h2><p className="text-sm text-slate-400">Enter measured values and units exactly as recorded on site.</p></div><Button type="button" variant="secondary" onClick={() => setForm((current) => ({ ...current, circuits: [...current.circuits, blankCircuit()] }))}><Plus className="mr-2 size-4" />Add circuit</Button></div>
        {form.circuits.map((circuit, index) => <div key={circuit.id} className="rounded-2xl border border-slate-700 bg-slate-950/50 p-4">
          <div className="mb-4 flex items-center justify-between"><p className="font-bold">Circuit {index + 1}</p><button type="button" aria-label="Remove circuit" onClick={() => setForm((current) => ({ ...current, circuits: current.circuits.filter((item) => item.id !== circuit.id) }))} className="rounded-lg p-2 text-slate-500 hover:bg-red-500/10 hover:text-red-300"><Trash2 className="size-4" /></button></div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <InputField label="Circuit reference" value={circuit.circuitReference} onChange={(event) => updateCircuit(circuit.id, { circuitReference: event.target.value })} />
            <InputField label="Description" value={circuit.description} onChange={(event) => updateCircuit(circuit.id, { description: event.target.value })} />
            <InputField label="Protective device" value={circuit.protectiveDevice} onChange={(event) => updateCircuit(circuit.id, { protectiveDevice: event.target.value })} />
            <InputField label="R1+R2 (Ω)" value={circuit.r1r2} onChange={(event) => updateCircuit(circuit.id, { r1r2: event.target.value })} />
            <InputField label="Insulation resistance" value={circuit.insulationResistance} onChange={(event) => updateCircuit(circuit.id, { insulationResistance: event.target.value })} />
            <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Polarity</span><select className={fieldClass} value={circuit.polarity} onChange={(event) => updateCircuit(circuit.id, { polarity: event.target.value as PolarityResult })}>{polarities.map((polarity) => <option key={polarity || "blank"} value={polarity}>{polarity || "Choose result"}</option>)}</select></label>
            <InputField label="Zs (Ω)" value={circuit.zs} onChange={(event) => updateCircuit(circuit.id, { zs: event.target.value })} />
            <InputField label="RCD results" value={circuit.rcdTest} onChange={(event) => updateCircuit(circuit.id, { rcdTest: event.target.value })} />
            <div className="md:col-span-2 xl:col-span-4"><TextareaField label="Circuit notes" value={circuit.notes} onChange={(event) => updateCircuit(circuit.id, { notes: event.target.value })} /></div>
          </div>
        </div>)}
      </div>

      <div className="flex flex-wrap justify-end gap-2"><Button type="submit"><Save className="mr-2 size-4" />{localTestingMode ? "Save testing draft" : "Save testing record"}</Button><Button type="button" variant="secondary" onClick={markCertificateReady}><CheckCircle2 className="mr-2 size-4" />Mark certificate-ready</Button></div>
    </form></Card>

    <section className="grid gap-4 xl:grid-cols-2">
      <Card><div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 size-5 text-amber-300" /><div><h2 className="font-bold">Validation and review prompts</h2><p className="mt-1 text-sm text-slate-400">These prompts identify missing or unusual entries only. JR OS does not decide whether the installation complies.</p></div></div><div className="mt-4 space-y-2">{warnings.length ? warnings.map((warning, index) => <div key={`${warning.field}-${warning.circuitId ?? index}`} className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-sm text-amber-100"><span className="font-semibold">{warning.severity}:</span> {warning.message}</div>) : <p className="flex items-center gap-2 text-sm text-emerald-300"><CheckCircle2 className="size-4" />No missing or unusual entries detected by the basic checks. Inspector review is still required.</p>}</div></Card>
      <Card><h2 className="font-bold">Outstanding actions</h2><div className="mt-4 flex gap-2"><input className={fieldClass} value={actionText} onChange={(event) => setActionText(event.target.value)} placeholder="Retest circuit, confirm device details…" /><Button type="button" onClick={addAction}>Add</Button></div><div className="mt-3 space-y-2">{form.outstandingActions.map((action, index) => <div key={`${action}-${index}`} className="flex items-center justify-between rounded-xl border border-slate-800 px-3 py-2 text-sm"><span>{action}</span><button type="button" aria-label="Remove outstanding action" onClick={() => setForm((current) => ({ ...current, outstandingActions: current.outstandingActions.filter((_, itemIndex) => itemIndex !== index) }))} className="text-slate-500 hover:text-red-300"><Trash2 className="size-4" /></button></div>)}</div><div className="mt-4"><TextareaField label="General testing notes" value={form.generalNotes} onChange={(event) => setForm({ ...form, generalNotes: event.target.value })} /></div></Card>
    </section>

    <Card><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="flex items-center gap-2 font-bold"><FileText className="size-5 text-cyan-300" />Certificate-ready testing summary</h2><p className="mt-1 text-sm text-slate-400">This summary supports certificate preparation but is not itself a certificate. Field testing does not directly modify certificate records.</p></div>{fieldMode ? <p className="max-w-md text-sm text-amber-200">Save the testing draft and provide this structured summary to the office. Certificate linking, authoring and issue remain office-controlled.</p> : <div className="flex flex-wrap gap-2"><Button type="button" variant="secondary" onClick={prepareCertificateSummary}>Prepare for linked certificate</Button><Link href="/certificates" className="rounded-xl border border-slate-700 px-3 py-2 text-sm font-semibold hover:border-cyan-400/50">Open certificates</Link></div>}</div><pre className="mt-4 whitespace-pre-wrap rounded-xl border border-slate-800 bg-slate-950 p-4 text-sm text-slate-300">{summary}</pre></Card>

    <section className="space-y-3"><div><h2 className="text-xl font-bold">{localTestingMode ? "Saved testing drafts" : "Saved testing records"}</h2><p className="text-sm text-slate-400">{localTestingMode ? "Resume records stored on this device." : "Resume canonical testing records available through secure cloud sync."}</p></div>{records.items.length ? records.items.map((record) => <Card key={record.id}><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">{record.status} · {testingProgress(record)}%</p><h3 className="mt-1 font-bold">{jobs.items.find((job) => job.id === record.jobId)?.title ?? "Linked job"}</h3><p className="mt-1 text-sm text-slate-400">{record.circuits.length} circuit result{record.circuits.length === 1 ? "" : "s"} · updated {new Date(record.updatedAt).toLocaleString("en-GB")}</p></div><Button type="button" variant="secondary" onClick={() => resume(record)}><ClipboardCheck className="mr-2 size-4" />Resume</Button></div></Card>) : <Card>{localTestingMode ? "No testing drafts saved yet." : "No testing records saved yet."}</Card>}</section>
  </div>;
}
