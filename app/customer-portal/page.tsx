"use client";

import { FormEvent, useMemo, useState } from "react";
import { CalendarDays, CheckCircle2, Clock3, FileCheck2, FileText, MessageSquare, Receipt, Send, ShieldCheck, XCircle } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { TextareaField } from "../../components/ui/FormField";
import { PageHeader } from "../../components/ui/PageHeader";
import { makeId, useLocalStorageCollection } from "../../lib/storage";
import type { Customer, ElectricalCertificate, Invoice, Job, JobTimelineEntry, PricingDocument, PricingDocumentStatus } from "../../lib/models";

const money = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });

type PortalMessage = {
  id: string;
  customerId: string;
  jobId?: string;
  sender: "Customer" | "JR Electrical";
  message: string;
  sentAt: string;
};

function pricingTotal(document: PricingDocument) {
  const subtotal = document.items.reduce((total, item) => total + item.quantity * item.unitPrice, 0);
  return document.vatEnabled ? subtotal * (1 + document.vatRate / 100) : subtotal;
}

function invoiceTotal(invoice: Invoice) {
  const subtotal = invoice.items.reduce((total, item) => total + item.quantity * item.unitPrice, 0);
  return invoice.vatEnabled ? subtotal * (1 + invoice.vatRate / 100) : subtotal;
}

export default function CustomerPortalPage() {
  const customers = useLocalStorageCollection<Customer>("jr-os-customers");
  const jobs = useLocalStorageCollection<Job>("jr-os-jobs");
  const pricingDocuments = useLocalStorageCollection<PricingDocument>("jr-os-pricing-documents");
  const invoices = useLocalStorageCollection<Invoice>("jr-os-invoices");
  const certificates = useLocalStorageCollection<ElectricalCertificate>("jr-os-certificates");
  const timeline = useLocalStorageCollection<JobTimelineEntry>("jr-os-job-timeline");
  const messages = useLocalStorageCollection<PortalMessage>("jr-os-portal-messages");
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [message, setMessage] = useState("");
  const [messageJobId, setMessageJobId] = useState("");

  const selectedCustomer = customers.items.find((customer) => customer.id === selectedCustomerId);
  const customerJobs = useMemo(() => jobs.items.filter((job) => job.customerId === selectedCustomerId), [jobs.items, selectedCustomerId]);
  const jobIds = useMemo(() => new Set(customerJobs.map((job) => job.id)), [customerJobs]);
  const customerQuotes = useMemo(() => pricingDocuments.items.filter((document) => document.type === "Quote" && (document.customerId === selectedCustomerId || (document.jobId && jobIds.has(document.jobId)))), [pricingDocuments.items, selectedCustomerId, jobIds]);
  const customerInvoices = useMemo(() => invoices.items.filter((invoice) => invoice.customerId === selectedCustomerId || (invoice.jobId && jobIds.has(invoice.jobId))), [invoices.items, selectedCustomerId, jobIds]);
  const customerCertificates = useMemo(() => certificates.items.filter((certificate) => certificate.customerId === selectedCustomerId || (certificate.jobId && jobIds.has(certificate.jobId))), [certificates.items, selectedCustomerId, jobIds]);
  const customerTimeline = useMemo(() => timeline.items.filter((entry) => jobIds.has(entry.jobId)).sort((a, b) => b.completedAt.localeCompare(a.completedAt)), [timeline.items, jobIds]);
  const customerMessages = useMemo(() => messages.items.filter((item) => item.customerId === selectedCustomerId).sort((a, b) => a.sentAt.localeCompare(b.sentAt)), [messages.items, selectedCustomerId]);

  const outstandingQuoteValue = customerQuotes.filter((quote) => quote.status === "Sent").reduce((total, quote) => total + pricingTotal(quote), 0);
  const outstandingInvoiceValue = customerInvoices.filter((invoice) => !["Paid", "Cancelled"].includes(invoice.status)).reduce((total, invoice) => total + Math.max(0, invoiceTotal(invoice) - invoice.amountPaid), 0);

  function updateQuoteStatus(documentId: string, status: PricingDocumentStatus) {
    pricingDocuments.setItems((current) => current.map((document) => document.id === documentId ? { ...document, status, updatedAt: new Date().toISOString() } : document));
  }

  function sendMessage(event: FormEvent) {
    event.preventDefault();
    if (!selectedCustomerId || !message.trim()) return;
    messages.setItems((current) => [...current, {
      id: makeId("portal-message"),
      customerId: selectedCustomerId,
      jobId: messageJobId || undefined,
      sender: "JR Electrical",
      message: message.trim(),
      sentAt: new Date().toISOString(),
    }]);
    setMessage("");
  }

  return (
    <main className="space-y-6">
      <PageHeader title="Customer Portal" description="Preview each customer’s jobs, quotes, invoices, certificates, progress updates and messages." />

      <Card>
        <label className="space-y-1 text-sm">
          <span>Preview portal for customer</span>
          <select className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3" value={selectedCustomerId} onChange={(event) => { setSelectedCustomerId(event.target.value); setMessageJobId(""); }}>
            <option value="">Select a customer</option>
            {customers.items.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
          </select>
        </label>
      </Card>

      {!selectedCustomer && <Card><p className="text-slate-400">Select a customer to open their portal preview.</p></Card>}

      {selectedCustomer && <>
        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <p className="text-sm text-slate-400">Customer portal preview</p>
          <h1 className="mt-1 text-3xl font-semibold">Welcome, {selectedCustomer.name}</h1>
          <p className="mt-2 text-slate-400">Track work, approve quotes and access your JR Electrical documents in one place.</p>
        </section>

        <section className="grid gap-4 md:grid-cols-4">
          <Card><CalendarDays className="h-5 w-5" /><p className="mt-3 text-3xl font-semibold">{customerJobs.length}</p><p className="text-sm text-slate-400">Jobs</p></Card>
          <Card><FileText className="h-5 w-5" /><p className="mt-3 text-3xl font-semibold">{money.format(outstandingQuoteValue)}</p><p className="text-sm text-slate-400">Quotes awaiting decision</p></Card>
          <Card><Receipt className="h-5 w-5" /><p className="mt-3 text-3xl font-semibold">{money.format(outstandingInvoiceValue)}</p><p className="text-sm text-slate-400">Outstanding invoices</p></Card>
          <Card><ShieldCheck className="h-5 w-5" /><p className="mt-3 text-3xl font-semibold">{customerCertificates.length}</p><p className="text-sm text-slate-400">Certificates</p></Card>
        </section>

        <section className="grid gap-6 xl:grid-cols-2">
          <Card>
            <h2 className="flex items-center gap-2 text-xl font-semibold"><CalendarDays className="h-5 w-5" />Jobs and progress</h2>
            <div className="mt-4 space-y-3">{customerJobs.map((job) => <div key={job.id} className="rounded-xl bg-slate-950 p-4"><div className="flex items-start justify-between gap-4"><div><p className="font-medium">{job.title}</p><p className="text-sm text-slate-400">{job.siteAddress}</p></div><span className="rounded-full border border-slate-700 px-3 py-1 text-xs">{job.status}</span></div><p className="mt-3 text-sm text-slate-400">Start: {job.startDate || "To be arranged"}{job.targetCompletionDate ? ` · Target: ${job.targetCompletionDate}` : ""}</p></div>)}{customerJobs.length === 0 && <p className="text-slate-400">No jobs are linked to this customer.</p>}</div>
          </Card>

          <Card>
            <h2 className="flex items-center gap-2 text-xl font-semibold"><Clock3 className="h-5 w-5" />Recent progress</h2>
            <div className="mt-4 space-y-3">{customerTimeline.slice(0, 8).map((entry) => <div key={entry.id} className="border-l-2 border-slate-700 pl-4"><p className="font-medium">{entry.milestone}</p><p className="text-sm text-slate-400">{entry.note || "Progress updated"}</p><p className="mt-1 text-xs text-slate-500">{new Date(entry.completedAt).toLocaleString("en-GB")}</p></div>)}{customerTimeline.length === 0 && <p className="text-slate-400">No progress updates have been published yet.</p>}</div>
          </Card>
        </section>

        <Card>
          <h2 className="flex items-center gap-2 text-xl font-semibold"><FileCheck2 className="h-5 w-5" />Quotes</h2>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">{customerQuotes.map((quote) => <div key={quote.id} className="rounded-xl bg-slate-950 p-4"><div className="flex items-start justify-between gap-4"><div><p className="text-sm text-slate-400">{quote.number}</p><p className="font-medium">{quote.title}</p></div><span className="rounded-full border border-slate-700 px-3 py-1 text-xs">{quote.status}</span></div><p className="mt-4 text-2xl font-semibold">{money.format(pricingTotal(quote))}</p>{quote.status === "Sent" && <div className="mt-4 flex gap-2"><Button onClick={() => updateQuoteStatus(quote.id, "Accepted")}><CheckCircle2 className="h-4 w-4" />Accept</Button><Button variant="secondary" onClick={() => updateQuoteStatus(quote.id, "Declined")}><XCircle className="h-4 w-4" />Decline</Button></div>}</div>)}{customerQuotes.length === 0 && <p className="text-slate-400">No quotes are available.</p>}</div>
        </Card>

        <section className="grid gap-6 xl:grid-cols-2">
          <Card><h2 className="flex items-center gap-2 text-xl font-semibold"><Receipt className="h-5 w-5" />Invoices</h2><div className="mt-4 space-y-3">{customerInvoices.map((invoice) => <div key={invoice.id} className="flex items-center justify-between gap-4 rounded-xl bg-slate-950 p-4"><div><p className="font-medium">{invoice.number} · {invoice.title}</p><p className="text-sm text-slate-400">Due {invoice.dueDate || "not set"} · {invoice.status}</p></div><p className="font-semibold">{money.format(invoiceTotal(invoice))}</p></div>)}{customerInvoices.length === 0 && <p className="text-slate-400">No invoices are available.</p>}</div></Card>
          <Card><h2 className="flex items-center gap-2 text-xl font-semibold"><ShieldCheck className="h-5 w-5" />Certificates</h2><div className="mt-4 space-y-3">{customerCertificates.map((certificate) => <div key={certificate.id} className="rounded-xl bg-slate-950 p-4"><p className="font-medium">{certificate.number} · {certificate.type}</p><p className="text-sm text-slate-400">{certificate.installationAddress} · {certificate.status}</p>{certificate.externalPdfUrl && <a className="mt-2 inline-block text-sm underline" href={certificate.externalPdfUrl} target="_blank" rel="noreferrer">Open certificate</a>}</div>)}{customerCertificates.length === 0 && <p className="text-slate-400">No certificates are available.</p>}</div></Card>
        </section>

        <Card>
          <h2 className="flex items-center gap-2 text-xl font-semibold"><MessageSquare className="h-5 w-5" />Portal messages</h2>
          <div className="mt-4 max-h-80 space-y-3 overflow-y-auto">{customerMessages.map((item) => <div key={item.id} className={`rounded-xl p-4 ${item.sender === "JR Electrical" ? "ml-8 bg-slate-800" : "mr-8 bg-slate-950"}`}><div className="flex justify-between gap-4"><p className="font-medium">{item.sender}</p><p className="text-xs text-slate-500">{new Date(item.sentAt).toLocaleString("en-GB")}</p></div><p className="mt-2 text-sm">{item.message}</p></div>)}{customerMessages.length === 0 && <p className="text-slate-400">No portal messages yet.</p>}</div>
          <form onSubmit={sendMessage} className="mt-5 space-y-4"><label className="space-y-1 text-sm"><span>Link message to job</span><select className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3" value={messageJobId} onChange={(event) => setMessageJobId(event.target.value)}><option value="">General message</option>{customerJobs.map((job) => <option key={job.id} value={job.id}>{job.title}</option>)}</select></label><TextareaField label="Message" value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Send an update, appointment note or document request..." /><Button type="submit"><Send className="h-4 w-4" />Send portal message</Button></form>
        </Card>
      </>}
    </main>
  );
}
