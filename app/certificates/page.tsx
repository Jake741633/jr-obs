"use client";

import { FormEvent, useState } from "react";
import { ClipboardCheck, ExternalLink, FileCheck2, Plus, Search, Sparkles, Trash2 } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { businessStorageKeys, defaultCertificateDefaults } from "../../lib/businessSettings";
import { suggestCertificateObservations } from "../../lib/certificate-code-suggestions";
import { makeId, useLocalStorageCollection } from "../../lib/storage";
import type { CertificateDefaults, CertificateObservation, CertificateStatus, CertificateType, Customer, ElectricalCertificate, Job, ObservationCode } from "../../lib/models";

const certificateTypes: CertificateType[] = [
  "Electrical Installation Certificate",
  "Minor Electrical Installation Works Certificate",
  "Electrical Installation Condition Report",
  "Emergency Lighting Certificate",
  "Fire Alarm Certificate",
  "Other",
];

const statuses: CertificateStatus[] = ["Draft", "In progress", "Complete", "Issued", "Superseded"];
const observationCodes: ObservationCode[] = ["C1", "C2", "C3", "FI", "No code"];
const fieldClass = "min-h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-white outline-none transition focus:border-cyan-400";

function addYears(date: string, years: number) {
  if (!date || years <= 0) return "";
  const result = new Date(`${date}T12:00:00`);
  result.setFullYear(result.getFullYear() + years);
  return result.toISOString().slice(0, 10);
}

function blankCertificate(index: number, defaults: CertificateDefaults = defaultCertificateDefaults): ElectricalCertificate {
  const now = new Date().toISOString();
  const prefix = defaults.certificatePrefix.trim().toUpperCase() || "CERT";
  return {
    id: makeId("certificate"), number: `${prefix}-${String(index + 1).padStart(4, "0")}`,
    type: defaults.defaultType, status: "Draft", installationAddress: "", description: "",
    inspectorName: defaults.inspectorName, schemeProvider: defaults.schemeProvider, registrationNumber: defaults.registrationNumber,
    inspectionDate: "", nextInspectionDate: "", outcome: defaults.defaultOutcome,
    observations: defaults.notes, structuredObservations: [], externalPdfUrl: "", createdAt: now, updatedAt: now,
  };
}

export default function CertificatesPage() {
  const certificates = useLocalStorageCollection<ElectricalCertificate>("jr-os-certificates");
  const customers = useLocalStorageCollection<Customer>("jr-os-customers");
  const jobs = useLocalStorageCollection<Job>("jr-os-jobs");
  const defaultsStore = useLocalStorageCollection<CertificateDefaults>(businessStorageKeys.certificates, [defaultCertificateDefaults]);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<ElectricalCertificate>(() => blankCertificate(0));
  const [findingText, setFindingText] = useState("");

  const certificateDefaults = defaultsStore.items[0] ?? defaultCertificateDefaults;
  const isReady = certificates.isReady && customers.isReady && jobs.isReady && defaultsStore.isReady;
  if (!isReady) return <Card>Loading certificates…</Card>;

  const filtered = certificates.items.filter((certificate) => {
    const customer = customers.items.find((item) => item.id === certificate.customerId)?.name ?? "";
    const job = jobs.items.find((item) => item.id === certificate.jobId)?.title ?? "";
    return `${certificate.number} ${certificate.type} ${certificate.status} ${certificate.installationAddress} ${customer} ${job}`.toLowerCase().includes(search.toLowerCase());
  });

  function startNewCertificate() { setForm(blankCertificate(certificates.items.length, certificateDefaults)); setFindingText(""); setShowForm(true); }
  function saveCertificate(event: FormEvent) {
    event.preventDefault();
    const now = new Date().toISOString();
    certificates.setItems((current) => {
      const exists = current.some((item) => item.id === form.id);
      const record = { ...form, updatedAt: now };
      return exists ? current.map((item) => item.id === form.id ? record : item) : [record, ...current];
    });
    setShowForm(false);
  }
  function editCertificate(certificate: ElectricalCertificate) {
    setForm({ ...certificate, structuredObservations: certificate.structuredObservations ?? [] });
    setFindingText(""); setShowForm(true); window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function deleteCertificate(certificate: ElectricalCertificate) {
    if (window.confirm(`Delete ${certificate.number}?`)) certificates.remove((item) => item.id === certificate.id);
  }
  function generateSuggestions() {
    if (!findingText.trim()) return;
    const suggestions = suggestCertificateObservations(findingText);
    setForm((current) => ({ ...current, structuredObservations: [...(current.structuredObservations ?? []), ...suggestions] }));
    setFindingText("");
  }
  function updateObservation(id: string, patch: Partial<CertificateObservation>) {
    setForm((current) => ({ ...current, structuredObservations: (current.structuredObservations ?? []).map((item) => item.id === id ? { ...item, ...patch } : item) }));
  }
  function removeObservation(id: string) {
    setForm((current) => ({ ...current, structuredObservations: (current.structuredObservations ?? []).filter((item) => item.id !== id) }));
  }

  const completeCount = certificates.items.filter((item) => item.status === "Complete" || item.status === "Issued").length;
  const draftCount = certificates.items.filter((item) => item.status === "Draft" || item.status === "In progress").length;

  return <div className="space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">Testing and compliance</p><h1 className="mt-1 text-3xl font-bold">Certificates</h1><p className="mt-2 text-sm text-slate-400">Manage electrical certificates and use JR Assist to prepare editable observation and code suggestions.</p></div>
      <Button onClick={startNewCertificate}><Plus className="mr-2 size-4" />New certificate</Button>
    </div>

    <div className="grid gap-4 md:grid-cols-3">
      <Card><p className="text-sm text-slate-400">Total records</p><p className="mt-2 text-3xl font-bold">{certificates.items.length}</p></Card>
      <Card><p className="text-sm text-slate-400">Draft / in progress</p><p className="mt-2 text-3xl font-bold text-amber-300">{draftCount}</p></Card>
      <Card><p className="text-sm text-slate-400">Complete / issued</p><p className="mt-2 text-3xl font-bold text-emerald-300">{completeCount}</p></Card>
    </div>

    {showForm ? <Card className="border-cyan-400/30"><form onSubmit={saveCertificate} className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">Certificate record</p><h2 className="mt-1 text-xl font-bold">{form.number}</h2></div><Button type="button" variant="secondary" onClick={() => setShowForm(false)}>Close</Button></div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <label className="grid gap-2 text-sm">Certificate number<input required className={fieldClass} value={form.number} onChange={(event) => setForm({ ...form, number: event.target.value })} /></label>
        <label className="grid gap-2 text-sm">Certificate type<select className={fieldClass} value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value as CertificateType })}>{certificateTypes.map((type) => <option key={type}>{type}</option>)}</select></label>
        <label className="grid gap-2 text-sm">Status<select className={fieldClass} value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as CertificateStatus })}>{statuses.map((status) => <option key={status}>{status}</option>)}</select></label>
        <label className="grid gap-2 text-sm">Customer<select className={fieldClass} value={form.customerId ?? ""} onChange={(event) => setForm({ ...form, customerId: event.target.value || undefined })}><option value="">No customer selected</option>{customers.items.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></label>
        <label className="grid gap-2 text-sm">Job<select className={fieldClass} value={form.jobId ?? ""} onChange={(event) => { const jobId = event.target.value || undefined; const job = jobs.items.find((item) => item.id === jobId); setForm({ ...form, jobId, installationAddress: form.installationAddress || job?.siteAddress || "" }); }}><option value="">No job selected</option>{jobs.items.map((job) => <option key={job.id} value={job.id}>{job.title}</option>)}</select></label>
        <label className="grid gap-2 text-sm">Inspector<input className={fieldClass} value={form.inspectorName} onChange={(event) => setForm({ ...form, inspectorName: event.target.value })} /></label>
        <label className="grid gap-2 text-sm">Scheme provider<input className={fieldClass} value={form.schemeProvider ?? ""} onChange={(event) => setForm({ ...form, schemeProvider: event.target.value })} placeholder="NICEIC, NAPIT or other" /></label>
        <label className="grid gap-2 text-sm">Registration number<input className={fieldClass} value={form.registrationNumber ?? ""} onChange={(event) => setForm({ ...form, registrationNumber: event.target.value })} /></label>
        <label className="grid gap-2 text-sm md:col-span-2">Installation address<input required className={fieldClass} value={form.installationAddress} onChange={(event) => setForm({ ...form, installationAddress: event.target.value })} /></label>
        <label className="grid gap-2 text-sm">Outcome<select className={fieldClass} value={form.outcome} onChange={(event) => setForm({ ...form, outcome: event.target.value as ElectricalCertificate["outcome"] })}><option>Satisfactory</option><option>Unsatisfactory</option><option>Not applicable</option></select></label>
        <label className="grid gap-2 text-sm">Inspection date<input type="date" className={fieldClass} value={form.inspectionDate} onChange={(event) => { const inspectionDate = event.target.value; setForm({ ...form, inspectionDate, nextInspectionDate: form.nextInspectionDate || addYears(inspectionDate, certificateDefaults.nextInspectionYears) }); }} /></label>
        <label className="grid gap-2 text-sm">Next inspection date<input type="date" className={fieldClass} value={form.nextInspectionDate} onChange={(event) => setForm({ ...form, nextInspectionDate: event.target.value })} /></label>
        <label className="grid gap-2 text-sm">Existing PDF link<input type="url" className={fieldClass} placeholder="https://…" value={form.externalPdfUrl} onChange={(event) => setForm({ ...form, externalPdfUrl: event.target.value })} /></label>
        <label className="grid gap-2 text-sm md:col-span-2 lg:col-span-3">Description<textarea className={`${fieldClass} min-h-24 py-3`} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
      </div>

      <div className="rounded-2xl border border-violet-400/20 bg-violet-500/5 p-5">
        <div className="flex items-start gap-3"><div className="rounded-xl bg-violet-400/10 p-2 text-violet-300"><Sparkles className="size-5" /></div><div><h3 className="font-bold">JR Assist observation helper</h3><p className="mt-1 text-sm text-slate-400">Type or dictate what you found. JR OS will create editable draft wording, a suggested classification and a reference. You remain responsible for checking and approving every entry.</p></div></div>
        <textarea className={`${fieldClass} mt-4 min-h-28 py-3`} placeholder="Example: No main bonding visible to gas and signs of overheating on a neutral terminal…" value={findingText} onChange={(event) => setFindingText(event.target.value)} />
        <div className="mt-3 flex justify-end"><Button type="button" onClick={generateSuggestions}><Sparkles className="mr-2 size-4" />Suggest observations</Button></div>
      </div>

      {(form.structuredObservations ?? []).length > 0 ? <div className="space-y-4">
        <div><h3 className="text-lg font-bold">Structured observations</h3><p className="mt-1 text-sm text-slate-400">Edit the location, wording, recommendation, reference and code before accepting.</p></div>
        {(form.structuredObservations ?? []).map((item, index) => <div key={item.id} className="rounded-2xl border border-slate-700 bg-slate-950/50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">Observation {index + 1}</p><p className="mt-1 text-xs text-slate-500">Suggestion confidence: {item.confidence}</p></div><button type="button" onClick={() => removeObservation(item.id)} className="rounded-xl p-2 text-slate-500 hover:bg-red-500/10 hover:text-red-300"><Trash2 className="size-4" /></button></div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm">Location<input className={fieldClass} value={item.location} onChange={(event) => updateObservation(item.id, { location: event.target.value })} placeholder="Consumer unit, kitchen, circuit 4…" /></label>
            <label className="grid gap-2 text-sm">Suggested code<select className={fieldClass} value={item.code} onChange={(event) => updateObservation(item.id, { code: event.target.value as ObservationCode })}>{observationCodes.map((code) => <option key={code}>{code}</option>)}</select></label>
            <label className="grid gap-2 text-sm md:col-span-2">Observation<textarea className={`${fieldClass} min-h-24 py-3`} value={item.observation} onChange={(event) => updateObservation(item.id, { observation: event.target.value })} /></label>
            <label className="grid gap-2 text-sm md:col-span-2">Recommendation<textarea className={`${fieldClass} min-h-24 py-3`} value={item.recommendation} onChange={(event) => updateObservation(item.id, { recommendation: event.target.value })} /></label>
            <label className="grid gap-2 text-sm">Regulation reference<input className={fieldClass} value={item.regulationReference} onChange={(event) => updateObservation(item.id, { regulationReference: event.target.value })} /></label>
            <label className="flex min-h-11 items-center gap-3 rounded-xl border border-slate-700 px-3 text-sm"><input type="checkbox" checked={item.accepted} onChange={(event) => updateObservation(item.id, { accepted: event.target.checked })} /><span>Checked and accepted by inspector</span></label>
          </div>
        </div>)}
      </div> : null}

      <label className="grid gap-2 text-sm">General certificate notes<textarea className={`${fieldClass} min-h-32 py-3`} value={form.observations} onChange={(event) => setForm({ ...form, observations: event.target.value })} /></label>
      <div className="flex justify-end"><Button type="submit"><FileCheck2 className="mr-2 size-4" />Save certificate</Button></div>
    </form></Card> : null}

    <Card><div className="relative"><Search className="pointer-events-none absolute left-3 top-3 size-5 text-slate-500" /><input aria-label="Search certificates" className={`${fieldClass} pl-10`} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search certificate, customer, job or address" /></div></Card>

    {filtered.length === 0 ? <Card><div className="grid place-items-center py-10 text-center"><ClipboardCheck className="size-10 text-slate-600" /><h2 className="mt-4 text-lg font-bold">No certificates found</h2><p className="mt-2 max-w-md text-sm text-slate-400">Create a certificate record to track testing, observations, issue status and the final PDF.</p></div></Card> : <div className="grid gap-4 xl:grid-cols-2">{filtered.map((certificate) => {
      const customer = customers.items.find((item) => item.id === certificate.customerId);
      const job = jobs.items.find((item) => item.id === certificate.jobId);
      const statusClass = certificate.status === "Issued" || certificate.status === "Complete" ? "bg-emerald-500/10 text-emerald-300" : certificate.status === "Superseded" ? "bg-slate-700 text-slate-300" : "bg-amber-500/10 text-amber-300";
      return <Card key={certificate.id} className="h-full"><div className="flex items-start gap-4"><div className="rounded-xl bg-cyan-400/10 p-3 text-cyan-300"><FileCheck2 className="size-6" /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">{certificate.number}</p><h2 className="mt-1 font-bold">{certificate.type}</h2></div><span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass}`}>{certificate.status}</span></div><p className="mt-3 text-sm text-slate-300">{certificate.installationAddress}</p><p className="mt-1 text-sm text-slate-500">{customer?.name || "No customer"}{job ? ` · ${job.title}` : ""}</p><p className="mt-2 text-xs text-slate-500">{certificate.structuredObservations?.length ?? 0} structured observation(s)</p><div className="mt-4 flex flex-wrap gap-2"><Button variant="secondary" onClick={() => editCertificate(certificate)}>Open record</Button>{certificate.externalPdfUrl ? <a href={certificate.externalPdfUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center rounded-xl border border-slate-700 bg-slate-900 px-4 text-sm font-semibold text-slate-100 hover:bg-slate-800"><ExternalLink className="mr-2 size-4" />Open PDF</a> : null}<button onClick={() => deleteCertificate(certificate)} aria-label={`Delete ${certificate.number}`} className="rounded-xl p-3 text-slate-500 hover:bg-red-500/10 hover:text-red-300"><Trash2 className="size-4" /></button></div></div></div></Card>;
    })}</div>}
  </div>;
}
