"use client";

import { FormEvent, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Archive, FileCheck2, FileDown, History, PenLine, Plus, Save, Search, Sparkles, Trash2 } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { businessStorageKeys, defaultCertificateDefaults } from "../../lib/businessSettings";
import { suggestCertificateObservations } from "../../lib/certificate-code-suggestions";
import { useCertificatesCollection } from "../../lib/cloud/coreBusinessCollections";
import {
  certificatePdfHtml,
  complianceStatuses,
  createCertificateDraft,
  nextCertificateNumber,
  saveCertificateRevision,
  supportedCertificateTypes,
  type ComplianceCertificate,
  type ComplianceCertificateStatus,
  type SupportedComplianceCertificateType,
} from "../../lib/complianceCertificates";
import type { ElectricalTestingRecord } from "../../lib/electricalTesting";
import { makeId, useCloudLocalCollection } from "../../lib/storage";
import type { CertificateDefaults, CertificateObservation, Customer, Invoice, Job, ObservationCode } from "../../lib/models";

const observationCodes: ObservationCode[] = ["C1", "C2", "C3", "FI", "No code"];
const fieldClass = "min-h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-white outline-none transition focus:border-cyan-400";
const changedCertificateMessage = "The saved certificate has changed. Use saved values to review its current revision before saving.";
const unavailableCertificateMessage = "The saved certificate is unavailable or ambiguous. Keep your edits open and review the saved records.";
class CertificateReviewError extends Error {}
type CertificateDraft = { form: ComplianceCertificate; expected: string | null; owner: object; pending?: { input: string; record: ComplianceCertificate } };

export default function CertificatesPage() {
  const certificates = useCertificatesCollection();
  const customers = useCloudLocalCollection<Customer>("jr-os-customers");
  const jobs = useCloudLocalCollection<Job>("jr-os-jobs");
  const invoices = useCloudLocalCollection<Invoice>("jr-os-invoices");
  const testing = useCloudLocalCollection<ElectricalTestingRecord>("jr-os-electrical-testing");
  const defaultsStore = useCloudLocalCollection<CertificateDefaults>(businessStorageKeys.certificates, [defaultCertificateDefaults]);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<ComplianceCertificate | null>(null);
  const [findingText, setFindingText] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [canReload, setCanReload] = useState(false);
  const [canReviewWorkspace, setCanReviewWorkspace] = useState(false);
  const draft = useRef<CertificateDraft | null>(null);
  const owner = useMemo(() => ({ createItem: certificates.createItem, updateItem: certificates.updateItem }), [certificates.createItem, certificates.updateItem]);

  const defaults = defaultsStore.items[0] ?? defaultCertificateDefaults;
  const ready = certificates.isReady && customers.isReady && jobs.isReady && invoices.isReady && testing.isReady && defaultsStore.isReady;
  const latest = useRef({ owner, ready: false, active: false, items: certificates.items });
  useLayoutEffect(() => {
    latest.current = { owner, ready, active: true, items: certificates.items };
    return () => { latest.current.active = false; };
  }, [owner, ready, certificates.items]);

  const filtered = useMemo(() => certificates.items.filter((certificate) => {
    const customer = customers.items.find((item) => item.id === certificate.customerId)?.name ?? "";
    const job = jobs.items.find((item) => item.id === certificate.jobId)?.title ?? "";
    return `${certificate.number} ${certificate.type} ${certificate.status} ${certificate.installationAddress} ${customer} ${job}`.toLowerCase().includes(search.toLowerCase());
  }), [certificates.items, customers.items, jobs.items, search]);

  if (!ready) return <Card>Loading Compliance & Certificate Centre…</Card>;

  function currentDraft() {
    const active = draft.current;
    return active && active.form === form && latest.current.owner === owner && latest.current.active ? active : null;
  }

  function requireAccess() {
    if (!latest.current.active || latest.current.owner !== owner || !latest.current.ready) throw new CertificateReviewError("Wait for the current certificate records to finish loading before saving.");
  }

  function savedCertificate(id: string) {
    const matches = latest.current.items.filter(item => item.id === id);
    if (!id.trim() || matches.length !== 1) throw new CertificateReviewError(unavailableCertificateMessage);
    return matches[0];
  }

  function changeForm(next: ComplianceCertificate) {
    const active = currentDraft();
    if (!active || !latest.current.ready) return false;
    active.form = next;
    setForm(next); setError(""); setMessage("");
    return true;
  }

  function closeForm() {
    if (!currentDraft()) return;
    draft.current = null;
    setForm(null); setShowForm(false); setCanReload(false); setCanReviewWorkspace(false); setError(""); setMessage("");
  }

  function startNewCertificate() {
    try { requireAccess(); } catch { setError("Wait for the current certificate records before creating a draft."); return; }
    const type = (supportedCertificateTypes.includes(defaults.defaultType as SupportedComplianceCertificateType)
      ? defaults.defaultType
      : supportedCertificateTypes[0]) as SupportedComplianceCertificateType;
    const next = createCertificateDraft({
      id: makeId("certificate"),
      number: nextCertificateNumber(defaults.certificatePrefix, certificates.items),
      type,
      inspectorName: defaults.inspectorName,
      schemeProvider: defaults.schemeProvider,
      registrationNumber: defaults.registrationNumber,
      notes: defaults.notes,
    });
    draft.current = { form: next, expected: null, owner };
    setForm(next); setCanReload(false); setCanReviewWorkspace(false); setError(""); setMessage("");
    setFindingText("");
    setShowForm(true);
  }

  function editCertificate(certificate: ComplianceCertificate) {
    try {
      requireAccess();
      if (JSON.stringify(savedCertificate(certificate.id)) !== JSON.stringify(certificate)) throw new CertificateReviewError(changedCertificateMessage);
    } catch (reason) { setError(reason instanceof CertificateReviewError ? reason.message : unavailableCertificateMessage); return; }
    const next = { ...certificate, revisionHistory: certificate.revisionHistory ?? [], structuredObservations: certificate.structuredObservations ?? [] };
    draft.current = { form: next, expected: JSON.stringify(certificate), owner };
    setForm(next); setCanReload(true); setCanReviewWorkspace(false); setError(""); setMessage("");
    setFindingText("");
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function useSavedValues() {
    const active = currentDraft();
    if (!active) return;
    try { requireAccess(); editCertificate(savedCertificate(active.form.id)); }
    catch { setError(unavailableCertificateMessage); }
  }

  function reviewDraftWorkspace() {
    const active = currentDraft();
    if (!active || active.expected !== null) return;
    try {
      requireAccess();
      const matches = latest.current.items.filter(item => item.id === active.form.id);
      if (!active.form.id.trim() || matches.length > 1) throw new CertificateReviewError(unavailableCertificateMessage);
      if (matches.length && (!active.pending || JSON.stringify(matches[0]) !== JSON.stringify(active.pending.record))) throw new CertificateReviewError(changedCertificateMessage);
      // Rebind only after explicit review. Retain the exact pending revision so
      // an uncertain acknowledgement cannot create another revision on retry.
      active.owner = owner;
      setCanReviewWorkspace(false); setCanReload(matches.length === 1); setError("");
      setMessage("Draft reviewed for the current workspace. Review its details, then save.");
    } catch (reason) {
      const recovery = reason instanceof CertificateReviewError ? reason.message : "Review the current certificate records and retry.";
      setError(`Draft review could not be completed. Your edits are retained. ${recovery}`);
    }
  }

  function populateFromJob(jobId: string) {
    if (!form) return;
    const job = jobs.items.find((item) => item.id === jobId);
    const customer = customers.items.find((item) => item.id === job?.customerId);
    const linkedTesting = [...testing.items].filter((item) => item.jobId === jobId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
    const linkedInvoice = invoices.items.find((item) => item.jobId === jobId);
    changeForm({
      ...form,
      jobId: job?.id,
      customerId: customer?.id,
      invoiceId: linkedInvoice?.id,
      testingRecordId: linkedTesting?.id,
      installationAddress: job?.siteAddress || customer?.address || form.installationAddress,
      description: [job?.title, linkedTesting ? `Testing record ${linkedTesting.id}: ${linkedTesting.circuits.length} circuit results captured.` : ""].filter(Boolean).join("\n"),
      inspectionDate: linkedTesting?.testDate || form.inspectionDate,
      remedialActions: linkedTesting?.outstandingActions.join("\n") || form.remedialActions,
    });
  }

  function saveCertificate(event: FormEvent) {
    event.preventDefault();
    const active = currentDraft();
    if (!active || !form) return;
    setMessage("");
    try {
      requireAccess();
      if (active.owner !== owner) {
        setCanReviewWorkspace(active.expected === null);
        throw new CertificateReviewError(active.expected === null
          ? "Certificate records were reloaded. Review draft in current workspace before saving."
          : "Certificate records were reloaded. Use saved values to review the saved certificate before saving.");
      }
      const matches = latest.current.items.filter(item => item.id === form.id);
      if (!form.id.trim() || matches.length > 1) throw new CertificateReviewError(unavailableCertificateMessage);
      let saved: ComplianceCertificate | undefined;
      if (active.pending && matches.length === 1 && JSON.stringify(matches[0]) === JSON.stringify(active.pending.record)) {
        if (JSON.stringify(form) === active.pending.input) saved = matches[0];
        else {
          active.expected = JSON.stringify(matches[0]);
          active.pending = undefined;
        }
      }
      if (!saved) {
        if (active.expected === null) {
          if (matches.length) throw new CertificateReviewError(unavailableCertificateMessage);
        } else {
          if (!matches.length) throw new CertificateReviewError(unavailableCertificateMessage);
          if (JSON.stringify(matches[0]) !== active.expected) throw new CertificateReviewError(changedCertificateMessage);
        }
        const input = JSON.stringify(form);
        if (!active.pending || active.pending.input !== input) {
          const revisionInput = active.expected === null ? form : { ...form, revisionHistory: matches[0].revisionHistory };
          active.pending = { input, record: saveCertificateRevision(revisionInput, form.inspectorName) };
        }
        const candidate = active.pending.record;
        saved = active.expected === null ? certificates.createItem(candidate) : certificates.updateItem(candidate.id, current => {
          if (JSON.stringify(current) === JSON.stringify(candidate)) return current;
          if (JSON.stringify(current) !== active.expected) throw new CertificateReviewError(changedCertificateMessage);
          return candidate;
        });
      }
      active.pending = undefined;
      active.expected = JSON.stringify(saved);
      active.form = saved;
      setForm(saved); setCanReload(true); setCanReviewWorkspace(false); setError("");
      setMessage(`Revision ${saved.revisionHistory?.length ?? 1} of ${saved.number} saved on this device. Check sync status before switching devices.`);
    } catch (reason) {
      setCanReload(active.expected !== null || latest.current.items.some(item => item.id === form.id));
      const recovery = reason instanceof CertificateReviewError ? reason.message : "Check device storage and sync status, then retry.";
      setError(`Certificate save could not be confirmed. Your edits are retained. ${recovery}`);
    }
  }

  function sign(role: "inspector" | "customer", name: string) {
    if (!form || !name.trim()) return;
    const signature = { name: name.trim(), signedAt: new Date().toISOString() };
    changeForm(role === "inspector" ? { ...form, inspectorSignature: signature } : { ...form, customerSignature: signature });
  }

  function generateSuggestions() {
    if (!form || !findingText.trim()) return;
    if (changeForm({ ...form, structuredObservations: [...(form.structuredObservations ?? []), ...suggestCertificateObservations(findingText)] })) setFindingText("");
  }

  function updateObservation(id: string, patch: Partial<CertificateObservation>) {
    if (!form) return;
    changeForm({ ...form, structuredObservations: (form.structuredObservations ?? []).map((item) => item.id === id ? { ...item, ...patch } : item) });
  }

  function printCertificate() {
    if (!form) return;
    let popup: Window | null = null;
    try {
      // Retain the same-origin handle, then detach its opener before writing private content.
      popup = window.open("", "_blank");
      if (!popup) return setMessage("Allow pop-ups to open the PDF-ready certificate.");
      popup.opener = null;
      if (popup.opener !== null) throw new Error("Certificate preview opener could not be detached.");
      popup.document.write(certificatePdfHtml(
        form,
        customers.items.find((item) => item.id === form.customerId),
        jobs.items.find((item) => item.id === form.jobId),
        invoices.items.find((item) => item.id === form.invoiceId),
      ));
      popup.document.close();
      popup.focus();
      popup.print();
      setMessage("");
    } catch {
      if (popup) {
        // Clear any partial private preview even if the browser refuses to close its window.
        try { popup.document.open(); popup.document.close(); } catch { /* Best-effort cleanup. */ }
        try { popup.close(); } catch { /* Best-effort cleanup. */ }
      }
      setMessage("The certificate preview could not be opened. Please try again.");
    }
  }

  const awaitingIssue = certificates.items.filter((item) => item.status === "Ready for Review").length;
  const awaitingSignatures = certificates.items.filter((item) => item.status !== "Archived" && (!item.inspectorSignature?.signedAt || !item.customerSignature?.signedAt)).length;
  const issued = certificates.items.filter((item) => item.status === "Issued").length;

  return <div className="space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">Compliance & Certificate Centre</p><h1 className="mt-1 text-3xl font-bold">Certificates</h1><p className="mt-2 text-sm text-slate-400">Prepare, review, sign, issue and archive EIC, MEIWC and EICR records without replacing the existing JR OS certificate workflow.</p></div><Button onClick={startNewCertificate}><Plus className="mr-2 size-4" />New certificate</Button></div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Card><p className="text-sm text-slate-400">Total certificates</p><p className="mt-2 text-3xl font-bold">{certificates.items.length}</p></Card><Card><p className="text-sm text-slate-400">Awaiting issue</p><p className="mt-2 text-3xl font-bold text-amber-300">{awaitingIssue}</p></Card><Card><p className="text-sm text-slate-400">Awaiting signatures</p><p className="mt-2 text-3xl font-bold text-violet-300">{awaitingSignatures}</p></Card><Card><p className="text-sm text-slate-400">Issued</p><p className="mt-2 text-3xl font-bold text-emerald-300">{issued}</p></Card></div>
    {error ? <div role="alert" className="rounded-xl border border-red-400/20 bg-red-400/5 px-4 py-3 text-sm text-red-200">{error}</div> : null}
    {message ? <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/5 px-4 py-3 text-sm text-cyan-200">{message}</div> : null}

    {showForm && form ? <Card className="border-cyan-400/30"><form onSubmit={saveCertificate} className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">Certificate record</p><h2 className="mt-1 text-xl font-bold">{form.number}</h2></div><div className="flex gap-2"><Button type="button" variant="secondary" onClick={printCertificate}><FileDown className="mr-2 size-4" />PDF-ready</Button><Button type="button" variant="secondary" onClick={closeForm}>Close</Button></div></div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <label className="grid gap-2 text-sm">Number<input className={fieldClass} value={form.number} onChange={(e) => changeForm({ ...form, number: e.target.value })} /></label>
        <label className="grid gap-2 text-sm">Type<select className={fieldClass} value={form.type} onChange={(e) => changeForm({ ...form, type: e.target.value as SupportedComplianceCertificateType })}>{supportedCertificateTypes.map((type) => <option key={type}>{type}</option>)}</select></label>
        <label className="grid gap-2 text-sm">Status<select className={fieldClass} value={form.status} onChange={(e) => changeForm({ ...form, status: e.target.value as ComplianceCertificateStatus, issuedAt: e.target.value === "Issued" ? new Date().toISOString() : form.issuedAt, archivedAt: e.target.value === "Archived" ? new Date().toISOString() : form.archivedAt })}>{complianceStatuses.map((status) => <option key={status}>{status}</option>)}</select></label>
        <label className="grid gap-2 text-sm">Job<select className={fieldClass} value={form.jobId ?? ""} onChange={(e) => populateFromJob(e.target.value)}><option value="">Choose job</option>{jobs.items.map((job) => <option key={job.id} value={job.id}>{job.title}</option>)}</select></label>
        <label className="grid gap-2 text-sm">Customer<select className={fieldClass} value={form.customerId ?? ""} onChange={(e) => changeForm({ ...form, customerId: e.target.value || undefined })}><option value="">Choose customer</option>{customers.items.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></label>
        <label className="grid gap-2 text-sm">Invoice<select className={fieldClass} value={form.invoiceId ?? ""} onChange={(e) => changeForm({ ...form, invoiceId: e.target.value || undefined })}><option value="">No linked invoice</option>{invoices.items.filter((item) => !form.jobId || item.jobId === form.jobId).map((invoice) => <option key={invoice.id} value={invoice.id}>{invoice.number} · {invoice.title}</option>)}</select></label>
        <label className="grid gap-2 text-sm">Testing record<select className={fieldClass} value={form.testingRecordId ?? ""} onChange={(e) => changeForm({ ...form, testingRecordId: e.target.value || undefined })}><option value="">No linked testing</option>{testing.items.filter((item) => !form.jobId || item.jobId === form.jobId).map((record) => <option key={record.id} value={record.id}>{record.testDate} · {record.circuits.length} circuits</option>)}</select></label>
        <label className="grid gap-2 text-sm">Inspector<input className={fieldClass} value={form.inspectorName} onChange={(e) => changeForm({ ...form, inspectorName: e.target.value })} /></label>
        <label className="grid gap-2 text-sm">Inspection date<input type="date" className={fieldClass} value={form.inspectionDate} onChange={(e) => changeForm({ ...form, inspectionDate: e.target.value })} /></label>
        <label className="grid gap-2 text-sm md:col-span-2 xl:col-span-3">Installation address<input className={fieldClass} value={form.installationAddress} onChange={(e) => changeForm({ ...form, installationAddress: e.target.value })} /></label>
        <label className="grid gap-2 text-sm md:col-span-2 xl:col-span-3">Description and testing summary<textarea className={`${fieldClass} min-h-28 py-3`} value={form.description} onChange={(e) => changeForm({ ...form, description: e.target.value })} /></label>
      </div>

      <div className="rounded-2xl border border-violet-400/20 bg-violet-500/5 p-5"><div className="flex items-start gap-3"><Sparkles className="mt-1 size-5 text-violet-300" /><div><h3 className="font-bold">JR Assist observations</h3><p className="mt-1 text-sm text-slate-400">Suggestions remain editable and require inspector review.</p></div></div><textarea className={`${fieldClass} mt-4 min-h-24 py-3`} value={findingText} onChange={(e) => setFindingText(e.target.value)} placeholder="Describe an observation…" /><div className="mt-3 flex justify-end"><Button type="button" onClick={generateSuggestions}>Suggest observations</Button></div></div>

      {(form.structuredObservations ?? []).map((item, index) => <div key={item.id} className="rounded-2xl border border-slate-700 p-4"><div className="flex items-center justify-between"><p className="font-bold">Observation {index + 1}</p><button type="button" onClick={() => changeForm({ ...form, structuredObservations: form.structuredObservations?.filter((entry) => entry.id !== item.id) })}><Trash2 className="size-4 text-slate-500" /></button></div><div className="mt-4 grid gap-4 md:grid-cols-2"><label className="grid gap-2 text-sm">Location<input className={fieldClass} value={item.location} onChange={(e) => updateObservation(item.id, { location: e.target.value })} /></label><label className="grid gap-2 text-sm">Code<select className={fieldClass} value={item.code} onChange={(e) => updateObservation(item.id, { code: e.target.value as ObservationCode })}>{observationCodes.map((code) => <option key={code}>{code}</option>)}</select></label><label className="grid gap-2 text-sm md:col-span-2">Observation<textarea className={`${fieldClass} min-h-20 py-3`} value={item.observation} onChange={(e) => updateObservation(item.id, { observation: e.target.value })} /></label><label className="grid gap-2 text-sm md:col-span-2">Recommendation<textarea className={`${fieldClass} min-h-20 py-3`} value={item.recommendation} onChange={(e) => updateObservation(item.id, { recommendation: e.target.value })} /></label></div></div>)}

      <div className="grid gap-4 md:grid-cols-3"><label className="grid gap-2 text-sm">Remedial actions<textarea className={`${fieldClass} min-h-28 py-3`} value={form.remedialActions ?? ""} onChange={(e) => changeForm({ ...form, remedialActions: e.target.value })} /></label><label className="grid gap-2 text-sm">Limitations<textarea className={`${fieldClass} min-h-28 py-3`} value={form.limitations ?? ""} onChange={(e) => changeForm({ ...form, limitations: e.target.value })} /></label><label className="grid gap-2 text-sm">Recommendations<textarea className={`${fieldClass} min-h-28 py-3`} value={form.recommendations ?? ""} onChange={(e) => changeForm({ ...form, recommendations: e.target.value })} /></label></div>

      <div className="grid gap-4 md:grid-cols-2"><Card><h3 className="font-bold">Inspector signature</h3><input className={`${fieldClass} mt-3`} value={form.inspectorSignature?.name ?? form.inspectorName} onChange={(e) => changeForm({ ...form, inspectorSignature: { name: e.target.value, signedAt: form.inspectorSignature?.signedAt ?? "" } })} /><Button type="button" className="mt-3" onClick={() => sign("inspector", form.inspectorSignature?.name ?? form.inspectorName)}><PenLine className="mr-2 size-4" />Sign as inspector</Button>{form.inspectorSignature?.signedAt ? <p className="mt-2 text-xs text-emerald-300">Signed {new Date(form.inspectorSignature.signedAt).toLocaleString("en-GB")}</p> : null}</Card><Card><h3 className="font-bold">Customer signature</h3><input className={`${fieldClass} mt-3`} value={form.customerSignature?.name ?? ""} onChange={(e) => changeForm({ ...form, customerSignature: { name: e.target.value, signedAt: form.customerSignature?.signedAt ?? "" } })} /><Button type="button" className="mt-3" onClick={() => sign("customer", form.customerSignature?.name ?? "")}><PenLine className="mr-2 size-4" />Capture customer sign-off</Button>{form.customerSignature?.signedAt ? <p className="mt-2 text-xs text-emerald-300">Signed {new Date(form.customerSignature.signedAt).toLocaleString("en-GB")}</p> : null}</Card></div>

      <Card><div className="flex items-center gap-2"><History className="size-5 text-cyan-300" /><h3 className="font-bold">Revision history</h3></div><div className="mt-3 space-y-2">{form.revisionHistory?.length ? [...form.revisionHistory].reverse().map((revision) => <div key={revision.id} className="rounded-xl border border-slate-800 px-3 py-2 text-sm">Revision {revision.revisionNumber} · {new Date(revision.savedAt).toLocaleString("en-GB")} · {revision.savedBy}</div>) : <p className="text-sm text-slate-500">The first revision will be stored when saved.</p>}</div></Card>
      <div className="flex flex-wrap justify-end gap-2">{canReviewWorkspace ? <Button type="button" variant="secondary" onClick={reviewDraftWorkspace}>Review draft in current workspace</Button> : null}{canReload ? <Button type="button" variant="secondary" onClick={useSavedValues}>Use saved values</Button> : null}<Button type="button" variant="secondary" onClick={() => changeForm({ ...form, status: "Archived", archivedAt: new Date().toISOString() })}><Archive className="mr-2 size-4" />Archive</Button><Button type="submit"><Save className="mr-2 size-4" />Save new revision</Button></div>
    </form></Card> : null}

    <Card><div className="flex items-center gap-3"><Search className="size-5 text-cyan-300" /><input className={fieldClass} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search number, customer, job, type or status" /></div></Card>
    <div className="space-y-3">{filtered.map((certificate) => <Card key={certificate.id}><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">{certificate.status}</p><h2 className="mt-1 text-lg font-bold">{certificate.number} · {certificate.type}</h2><p className="mt-1 text-sm text-slate-400">{certificate.installationAddress || "No installation address"}</p><p className="mt-2 text-xs text-slate-500">{certificate.revisionHistory?.length ?? 0} saved revision{certificate.revisionHistory?.length === 1 ? "" : "s"}{certificate.issuedAt ? ` · issued ${new Date(certificate.issuedAt).toLocaleDateString("en-GB")}` : ""}</p></div><Button type="button" variant="secondary" onClick={() => editCertificate(certificate)}><FileCheck2 className="mr-2 size-4" />Open</Button></div></Card>)}{filtered.length === 0 ? <Card>No matching certificates.</Card> : null}</div>
  </div>;
}
