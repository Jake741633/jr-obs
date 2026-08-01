"use client";

import Link from "next/link";
import { ChangeEvent, FormEvent, useState } from "react";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Download,
  ExternalLink,
  FileText,
  FolderOpen,
  MapPin,
  Plus,
  ReceiptText,
  Trash2,
  User,
  WalletCards,
} from "lucide-react";
import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { InputField, TextareaField } from "../../../components/ui/FormField";
import { StatusBadge } from "../../../components/ui/StatusBadge";
import { ProjectTimeline } from "../../../components/workflow/ProjectTimeline";
import { businessStorageKeys, defaultBankDetails, defaultPaymentTermsTemplates } from "../../../lib/businessSettings";
import { useJobVariationsCollection } from "../../../lib/cloud/coreBusinessCollections";
import { isAcceptedVariationStatus, transitionVariation, variationTimelineEntry } from "../../../lib/jobManagement-core.mjs";
import { makeId, useLocalStorageCollection } from "../../../lib/storage";
import { createInvoiceFromCompletedJob } from "../../../lib/workflow";
import type {
  Builder,
  BusinessBankDetails,
  Customer,
  Invoice,
  Job,
  JobDocument,
  JobDocumentCategory,
  JobMilestoneType,
  JobTimelineEntry,
  PaymentTermsTemplate,
  PricingDocument,
} from "../../../lib/models";

const milestones: JobMilestoneType[] = [
  "Enquiry received",
  "Site survey booked",
  "Quote prepared",
  "Quote sent",
  "Quote accepted",
  "Job created",
  "Deposit received",
  "Materials ordered",
  "Materials delivered",
  "First fix complete",
  "Second fix complete",
  "Testing complete",
  "Job completed",
  "Certificate uploaded",
  "Invoice created",
  "Invoice sent",
  "Payment received",
  "Review requested",
  "Custom update",
];

const documentCategories: JobDocumentCategory[] = [
  "Certificate",
  "Photo",
  "Drawing",
  "RAMS",
  "Site note",
  "Material order",
  "Handover",
  "Other",
];

const blankEntry = {
  milestone: "Enquiry received" as JobMilestoneType,
  note: "",
  completedBy: "Jake",
  completedAt: "",
};

const blankDocument = {
  name: "",
  category: "Certificate" as JobDocumentCategory,
  externalUrl: "",
  notes: "",
  uploadedBy: "Jake",
};

function documentTotal(document: PricingDocument | Invoice) {
  const subtotal = document.items.reduce((total, item) => total + item.quantity * item.unitPrice, 0);
  return subtotal + (document.vatEnabled ? subtotal * (document.vatRate / 100) : 0);
}

export default function JobDetailPage() {
  const params = useParams<{ id: string }>();
  const jobId = params.id;
  const jobs = useLocalStorageCollection<Job>("jr-os-jobs");
  const customers = useLocalStorageCollection<Customer>("jr-os-customers");
  const builders = useLocalStorageCollection<Builder>("jr-os-builders");
  const timeline = useLocalStorageCollection<JobTimelineEntry>("jr-os-job-timeline");
  const documents = useLocalStorageCollection<JobDocument>("jr-os-job-documents");
  const quotes = useLocalStorageCollection<PricingDocument>("jr-os-pricing-documents");
  const invoices = useLocalStorageCollection<Invoice>("jr-os-invoices");
  const variations = useJobVariationsCollection();
  const bankDetailsStore = useLocalStorageCollection<BusinessBankDetails>(businessStorageKeys.bank, [defaultBankDetails]);
  const paymentTermsStore = useLocalStorageCollection<PaymentTermsTemplate>(businessStorageKeys.paymentTerms, defaultPaymentTermsTemplates);
  const [showTimelineForm, setShowTimelineForm] = useState(false);
  const [showDocumentForm, setShowDocumentForm] = useState(false);
  const [timelineForm, setTimelineForm] = useState(blankEntry);
  const [documentForm, setDocumentForm] = useState(blankDocument);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [timelineError, setTimelineError] = useState("");
  const [documentError, setDocumentError] = useState("");
  const [invoiceMessage, setInvoiceMessage] = useState("");

  const job = jobs.items.find((item) => item.id === jobId);
  const customer = customers.items.find((item) => item.id === job?.customerId);
  const builder = builders.items.find((item) => item.id === job?.builderId);
  const entries = timeline.items
    .filter((item) => item.jobId === jobId)
    .toSorted((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());
  const jobDocuments = documents.items
    .filter((item) => item.jobId === jobId)
    .toSorted((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
  const linkedQuotes = quotes.items.filter((item) => item.jobId === jobId);
  const linkedInvoices = invoices.items.filter((item) => item.jobId === jobId);
  const linkedVariations = variations.items.filter((item) => item.jobId === jobId);

  const isReady = jobs.isReady && customers.isReady && builders.isReady && timeline.isReady && documents.isReady && quotes.isReady && invoices.isReady && variations.isReady && bankDetailsStore.isReady && paymentTermsStore.isReady;
  if (!isReady) return <Card>Loading job…</Card>;

  if (!job) {
    return <div className="space-y-6"><Link href="/jobs" className="inline-flex items-center gap-2 text-sm text-cyan-300 hover:text-cyan-200"><ArrowLeft className="size-4" />Back to jobs</Link><Card><h1 className="text-xl font-bold">Job not found</h1><p className="mt-2 text-sm text-slate-400">This job may have been deleted or the link is no longer valid.</p></Card></div>;
  }

  const formattedValue = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(job.value || 0);
  const formattedDate = job.startDate ? new Date(`${job.startDate}T12:00:00`).toLocaleDateString("en-GB") : "Not scheduled";
  const completedMilestones = new Set(entries.map((entry) => entry.milestone));
  const nextMilestone = milestones.find((milestone) => milestone !== "Custom update" && !completedMilestones.has(milestone));
  const sourceQuote = linkedQuotes.find((quote) => quote.id === job.sourceQuoteId)
    ?? quotes.items.find((quote) => quote.id === job.sourceQuoteId)
    ?? linkedQuotes[0];

  function addTimelineEntry(event: FormEvent) {
    event.preventDefault();
    if (!timelineForm.completedAt) { setTimelineError("Choose the date and time this milestone was completed."); return; }
    const now = new Date().toISOString();
    const entry: JobTimelineEntry = {
      id: makeId("timeline"),
      jobId,
      milestone: timelineForm.milestone,
      note: timelineForm.note.trim(),
      completedBy: timelineForm.completedBy.trim() || "Jake",
      completedAt: new Date(timelineForm.completedAt).toISOString(),
      createdAt: now,
    };
    timeline.setItems((current) => [entry, ...current]);
    setTimelineForm(blankEntry);
    setTimelineError("");
    setShowTimelineForm(false);
  }

  function addMilestoneNow(milestone: JobMilestoneType) {
    const now = new Date().toISOString();
    timeline.setItems((current) => [{ id: makeId("timeline"), jobId, milestone, note: "", completedBy: "Jake", completedAt: now, createdAt: now }, ...current]);
  }

  function deleteEntry(entry: JobTimelineEntry) {
    if (window.confirm(`Delete ${entry.milestone} from this job timeline?`)) timeline.remove((item) => item.id === entry.id);
  }

  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setSelectedFile(file);
    if (file && !documentForm.name) setDocumentForm((current) => ({ ...current, name: file.name.replace(/\.[^/.]+$/, "") }));
  }

  async function addDocument(event: FormEvent) {
    event.preventDefault();
    const name = documentForm.name.trim();
    const externalUrl = documentForm.externalUrl.trim();
    if (!name) { setDocumentError("Enter a document name."); return; }
    if (!selectedFile && !externalUrl) { setDocumentError("Choose a file or add an external document link."); return; }
    if (selectedFile && selectedFile.size > 2_000_000) { setDocumentError("For local storage, choose a file smaller than 2 MB. Larger cloud uploads will be added later."); return; }

    let dataUrl = "";
    if (selectedFile) {
      dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ""));
        reader.onerror = () => reject(new Error("Unable to read file"));
        reader.readAsDataURL(selectedFile);
      }).catch(() => "");
      if (!dataUrl) { setDocumentError("The selected file could not be read."); return; }
    }

    const now = new Date().toISOString();
    const record: JobDocument = {
      id: makeId("document"),
      jobId,
      name,
      category: documentForm.category,
      fileName: selectedFile?.name ?? "",
      mimeType: selectedFile?.type ?? "",
      dataUrl,
      externalUrl,
      notes: documentForm.notes.trim(),
      uploadedBy: documentForm.uploadedBy.trim() || "Jake",
      uploadedAt: now,
      createdAt: now,
    };
    documents.setItems((current) => [record, ...current]);
    setDocumentForm(blankDocument);
    setSelectedFile(null);
    setDocumentError("");
    setShowDocumentForm(false);
  }

  function deleteDocument(document: JobDocument) {
    if (window.confirm(`Delete ${document.name} from this job?`)) documents.remove((item) => item.id === document.id);
  }

  function generateInvoice() {
    if (!job) return;
    if (job.status !== "Complete") { setInvoiceMessage("Mark the job as Complete before generating its final invoice."); return; }
    if (linkedInvoices.length) { setInvoiceMessage(`${linkedInvoices[0].number} is already linked to this job.`); return; }
    const now = new Date().toISOString();
    const generated = createInvoiceFromCompletedJob({
      job,
      quote: sourceQuote,
      variations: linkedVariations,
      invoices: invoices.items,
      invoiceId: makeId("invoice"),
      now,
      createId: makeId,
      bankDetails: bankDetailsStore.items[0] ?? defaultBankDetails,
      defaultPaymentTerms: paymentTermsStore.items.find((item) => item.active && item.isDefault),
    });
    invoices.setItems((current) => [generated.invoice, ...current]);
    const includedVariationIds = new Set(generated.invoice.items.map((item) => item.variationId).filter(Boolean));
    const includedVariations = linkedVariations.filter((variation) => includedVariationIds.has(variation.id) && isAcceptedVariationStatus(variation.status));
    variations.setItems((current) => current.map((variation) => {
      if (!includedVariationIds.has(variation.id)) return variation;
      return transitionVariation({ variation, nextStatus: "Invoiced", now, auditId: makeId("variation-audit"), completedBy: "JR OS", invoiceId: generated.invoice.id, detail: `${variation.number} included on ${generated.invoice.number}.` });
    }));
    timeline.setItems((current) => {
      const additions: JobTimelineEntry[] = [generated.timelineEntry, ...includedVariations.map((variation) => variationTimelineEntry({ variation, fromStatus: variation.status, toStatus: "Invoiced", timelineId: makeId("timeline"), completedBy: "JR OS", now }))];
      if (!current.some((entry) => entry.jobId === jobId && entry.milestone === "Job completed")) {
        additions.push({ id: makeId("timeline"), jobId, milestone: "Job completed", note: "Job marked complete before final invoice generation.", completedBy: "JR OS", completedAt: now, createdAt: now });
      }
      return [...additions, ...current];
    });
    setInvoiceMessage(`${generated.invoice.number} created as a draft and linked to this job and its source quote.`);
  }

  return <div className="space-y-6">
    <Link href="/jobs" className="inline-flex items-center gap-2 text-sm text-cyan-300 hover:text-cyan-200"><ArrowLeft className="size-4" />Back to jobs</Link>

    <Card className="border-cyan-400/30">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">Job record</p><h1 className="mt-2 text-3xl font-bold">{job.title}</h1></div><StatusBadge status={job.status} /></div>
      <div className="mt-6 grid gap-4 text-sm text-slate-300 md:grid-cols-2">
        <p className="flex items-start gap-2"><MapPin className="mt-0.5 size-4 shrink-0 text-cyan-400" />{job.siteAddress}</p>
        <p className="flex items-center gap-2"><CalendarDays className="size-4 text-cyan-400" />{formattedDate}</p>
        <p className="flex items-center gap-2"><WalletCards className="size-4 text-cyan-400" />{formattedValue}</p>
        <p className="md:col-span-2 whitespace-pre-wrap"><span className="font-semibold text-slate-200">Notes:</span> {job.notes || "No notes"}</p>
      </div>
    </Card>

    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">Project workflow</p><h2 className="mt-1 text-2xl font-bold">Quote → Job → Invoice → Payment</h2><p className="mt-1 text-sm text-slate-400">A live view built from the linked records, with no duplicate data entry.</p></div>{linkedInvoices.length ? <Link href="/invoices" className="inline-flex min-h-11 items-center rounded-xl border border-slate-700 bg-slate-900 px-4 text-sm font-semibold text-slate-100 hover:bg-slate-800"><ReceiptText className="mr-2 size-4" />View invoice</Link> : <Button type="button" disabled={job.status !== "Complete"} onClick={generateInvoice}><ReceiptText className="mr-2 size-4" />Generate invoice</Button>}</div>
      {invoiceMessage ? <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-300">{invoiceMessage}</div> : null}
      {job.status !== "Complete" && !linkedInvoices.length ? <p className="text-sm text-amber-300">Invoice generation unlocks when the job status is Complete.</p> : null}
      <ProjectTimeline job={job} quote={sourceQuote} invoices={linkedInvoices} />
      {job.quoteSnapshot ? <Card><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-violet-300">Accepted pricing snapshot</p><h3 className="mt-1 text-lg font-bold">{job.quoteSnapshot.quoteNumber}</h3><p className="mt-1 text-sm text-slate-500">{job.quoteSnapshot.items.length} copied labour, material and allowance line{job.quoteSnapshot.items.length === 1 ? "" : "s"}</p></div>{sourceQuote ? <Link href={`/quotes/${sourceQuote.id}`} className="text-sm font-semibold text-cyan-300 hover:text-cyan-200">Open source quote</Link> : null}</div>{job.quoteSnapshot.profitability ? <div className="mt-4 grid gap-3 sm:grid-cols-3"><div className="rounded-xl bg-slate-950/60 p-3"><p className="text-xs text-slate-500">Cost price</p><p className="mt-1 font-bold">{new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(job.quoteSnapshot.profitability.costPrice)}</p></div><div className="rounded-xl bg-slate-950/60 p-3"><p className="text-xs text-slate-500">Selling price</p><p className="mt-1 font-bold">{new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(job.quoteSnapshot.profitability.sellingPrice)}</p></div><div className="rounded-xl bg-emerald-500/5 p-3"><p className="text-xs text-slate-500">Expected profit</p><p className="mt-1 font-bold text-emerald-300">{new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(job.quoteSnapshot.profitability.expectedProfit)}</p></div></div> : null}</Card> : null}
    </section>

    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">Job folder</p><h2 className="mt-1 text-2xl font-bold">Documents and records</h2><p className="mt-1 text-sm text-slate-400">Keep certificates, photos, drawings, RAMS, handover documents and site records together.</p></div><Button onClick={() => setShowDocumentForm((current) => !current)}><Plus className="mr-2 size-4" />{showDocumentForm ? "Close document" : "Add document"}</Button></div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card><p className="text-sm text-slate-400">Uploaded documents</p><p className="mt-2 text-3xl font-bold">{jobDocuments.length}</p></Card>
        <Card><p className="text-sm text-slate-400">Linked quotes</p><p className="mt-2 text-3xl font-bold">{linkedQuotes.length}</p></Card>
        <Card><p className="text-sm text-slate-400">Linked invoices</p><p className="mt-2 text-3xl font-bold">{linkedInvoices.length}</p></Card>
      </div>

      {showDocumentForm ? <Card><form onSubmit={addDocument} className="grid gap-4 md:grid-cols-2">
        <InputField required label="Document name" value={documentForm.name} onChange={(event) => setDocumentForm({ ...documentForm, name: event.target.value })} />
        <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Category</span><select value={documentForm.category} onChange={(event) => setDocumentForm({ ...documentForm, category: event.target.value as JobDocumentCategory })} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3">{documentCategories.map((category) => <option key={category}>{category}</option>)}</select></label>
        <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Upload file</span><input type="file" onChange={chooseFile} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-slate-800 file:px-3 file:py-1 file:text-slate-200" /><span className="text-xs font-normal text-slate-500">Local files must be under 2 MB.</span></label>
        <InputField label="External link" type="url" placeholder="https://..." value={documentForm.externalUrl} onChange={(event) => setDocumentForm({ ...documentForm, externalUrl: event.target.value })} />
        <InputField label="Added by" value={documentForm.uploadedBy} onChange={(event) => setDocumentForm({ ...documentForm, uploadedBy: event.target.value })} />
        <div className="md:col-span-2"><TextareaField label="Notes" value={documentForm.notes} onChange={(event) => setDocumentForm({ ...documentForm, notes: event.target.value })} /></div>
        {documentError ? <p className="md:col-span-2 text-sm text-red-300">{documentError}</p> : null}
        <div className="md:col-span-2 flex justify-end"><Button type="submit">Save document</Button></div>
      </form></Card> : null}

      {jobDocuments.length === 0 ? <Card><div className="flex items-start gap-3"><FolderOpen className="mt-0.5 size-5 text-slate-500" /><div><h3 className="font-semibold">No uploaded documents yet</h3><p className="mt-1 text-sm text-slate-400">Add certificates, site photos, drawings, RAMS or external cloud links to build this job folder.</p></div></div></Card> : <div className="grid gap-3 md:grid-cols-2">{jobDocuments.map((document) => <Card key={document.id}><div className="flex items-start gap-3"><div className="rounded-xl bg-cyan-500/10 p-2 text-cyan-300"><FileText className="size-5" /></div><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">{document.category}</p><h3 className="mt-1 truncate font-bold">{document.name}</h3><p className="mt-1 text-xs text-slate-500">{new Date(document.uploadedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })} · {document.uploadedBy}</p></div><button onClick={() => deleteDocument(document)} aria-label={`Delete ${document.name}`} className="rounded-lg p-2 text-slate-500 hover:bg-red-500/10 hover:text-red-300"><Trash2 className="size-4" /></button></div>{document.notes ? <p className="mt-3 whitespace-pre-wrap text-sm text-slate-300">{document.notes}</p> : null}<div className="mt-4 flex flex-wrap gap-2">{document.dataUrl ? <a href={document.dataUrl} download={document.fileName || document.name} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:border-cyan-400/50"><Download className="size-4" />Download</a> : null}{document.externalUrl ? <a href={document.externalUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:border-cyan-400/50"><ExternalLink className="size-4" />Open link</a> : null}</div></div></div></Card>)}</div>}

      {(linkedQuotes.length > 0 || linkedInvoices.length > 0) ? <div className="grid gap-4 md:grid-cols-2">
        <Card><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">Commercial documents</p><h3 className="mt-1 text-lg font-bold">Quotes and estimates</h3></div><Link href="/quotes" className="text-sm text-cyan-300 hover:text-cyan-200">View all</Link></div><div className="mt-4 space-y-3">{linkedQuotes.length === 0 ? <p className="text-sm text-slate-400">No linked quotes.</p> : linkedQuotes.map((quote) => <div key={quote.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 p-3"><div><p className="font-semibold">{quote.number} · {quote.title}</p><p className="mt-1 text-xs text-slate-500">{quote.type} · {quote.status}</p></div><p className="font-semibold">{new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(documentTotal(quote))}</p></div>)}</div></Card>
        <Card><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">Accounts</p><h3 className="mt-1 text-lg font-bold">Invoices</h3></div><Link href="/invoices" className="text-sm text-cyan-300 hover:text-cyan-200">View all</Link></div><div className="mt-4 space-y-3">{linkedInvoices.length === 0 ? <p className="text-sm text-slate-400">No linked invoices.</p> : linkedInvoices.map((invoice) => <div key={invoice.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 p-3"><div className="flex items-start gap-2"><ReceiptText className="mt-0.5 size-4 text-cyan-400" /><div><p className="font-semibold">{invoice.number} · {invoice.title}</p><p className="mt-1 text-xs text-slate-500">{invoice.status} · Due {invoice.dueDate ? new Date(`${invoice.dueDate}T12:00:00`).toLocaleDateString("en-GB") : "not set"}</p></div></div><p className="font-semibold">{new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(documentTotal(invoice))}</p></div>)}</div></Card>
      </div> : null}
    </section>

    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">Live workflow</p><h2 className="mt-1 text-2xl font-bold">Job timeline</h2><p className="mt-1 text-sm text-slate-400">Record every important stage from enquiry through payment and review request.</p></div><Button onClick={() => setShowTimelineForm((current) => !current)}><Plus className="mr-2 size-4" />{showTimelineForm ? "Close update" : "Add update"}</Button></div>
      {nextMilestone ? <Card className="border-emerald-500/20 bg-emerald-500/5"><div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between"><div><p className="text-xs font-semibold uppercase tracking-wider text-emerald-300">Suggested next step</p><h3 className="mt-1 text-lg font-bold">{nextMilestone}</h3></div><Button onClick={() => addMilestoneNow(nextMilestone)}>Mark complete now</Button></div></Card> : null}
      {showTimelineForm ? <Card><form onSubmit={addTimelineEntry} className="grid gap-4 md:grid-cols-2"><label className="grid gap-2 text-sm font-medium text-slate-300"><span>Milestone</span><select value={timelineForm.milestone} onChange={(event) => setTimelineForm({ ...timelineForm, milestone: event.target.value as JobMilestoneType })} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3">{milestones.map((milestone) => <option key={milestone}>{milestone}</option>)}</select></label><InputField required label="Completed date and time" type="datetime-local" value={timelineForm.completedAt} onChange={(event) => setTimelineForm({ ...timelineForm, completedAt: event.target.value })} /><InputField label="Completed by" value={timelineForm.completedBy} onChange={(event) => setTimelineForm({ ...timelineForm, completedBy: event.target.value })} /><div className="md:col-span-2"><TextareaField label="Notes" value={timelineForm.note} onChange={(event) => setTimelineForm({ ...timelineForm, note: event.target.value })} /></div>{timelineError ? <p className="md:col-span-2 text-sm text-red-300">{timelineError}</p> : null}<div className="md:col-span-2 flex justify-end"><Button type="submit">Save timeline update</Button></div></form></Card> : null}
      {entries.length === 0 ? <Card><div className="flex items-start gap-3"><Clock3 className="mt-0.5 size-5 text-slate-500" /><div><h3 className="font-semibold">No workflow updates yet</h3><p className="mt-1 text-sm text-slate-400">Add the enquiry, quote, materials, installation, testing and payment milestones as the job progresses.</p></div></div></Card> : <div className="space-y-3">{entries.map((entry) => <Card key={entry.id}><div className="flex items-start gap-4"><div className="mt-0.5 rounded-full bg-emerald-500/10 p-2 text-emerald-300"><CheckCircle2 className="size-5" /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-bold">{entry.milestone}</h3><p className="mt-1 text-sm text-slate-500">{new Date(entry.completedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })} · {entry.completedBy}</p></div><button onClick={() => deleteEntry(entry)} aria-label={`Delete ${entry.milestone}`} className="rounded-lg p-2 text-slate-500 hover:bg-red-500/10 hover:text-red-300"><Trash2 className="size-4" /></button></div>{entry.note ? <p className="mt-3 whitespace-pre-wrap text-sm text-slate-300">{entry.note}</p> : null}</div></div></Card>)}</div>}
    </section>

    <section className="space-y-4">
      <div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">Relationships</p><h2 className="mt-1 text-2xl font-bold">Linked CRM records</h2></div>
      <div className="grid gap-4 md:grid-cols-2">
        {customer ? <Link href={`/customers/${customer.id}`}><Card className="h-full transition hover:border-cyan-400/40"><p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-cyan-400"><User className="size-4" />Customer</p><h3 className="mt-2 text-lg font-bold">{customer.name}</h3><p className="mt-1 text-sm text-slate-400">{customer.phone || customer.email || "No contact details"}</p></Card></Link> : null}
        {builder ? <Link href={`/builders/${builder.id}`}><Card className="h-full transition hover:border-cyan-400/40"><p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-cyan-400"><Building2 className="size-4" />Builder</p><h3 className="mt-2 text-lg font-bold">{builder.companyName}</h3><p className="mt-1 text-sm text-slate-400">{builder.contactName || builder.phone || builder.email || "No contact details"}</p></Card></Link> : null}
        {!customer && !builder ? <Card><p className="text-sm text-slate-400">This is currently recorded as a direct job with no linked customer or builder.</p></Card> : null}
      </div>
    </section>
  </div>;
}
