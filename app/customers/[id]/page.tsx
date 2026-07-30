"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { BriefcaseBusiness, Clock3, FileText, Mail, MapPin, MessageSquareText, Phone, ReceiptText } from "lucide-react";
import { Card } from "../../../components/ui/Card";
import { StatusBadge } from "../../../components/ui/StatusBadge";
import { buildCustomerActivity, type CustomerActivityKind } from "../../../lib/customerActivity";
import { useLocalStorageCollection } from "../../../lib/storage";
import { invoiceTotal, pricingDocumentTotal } from "../../../lib/workflow";
import type { Customer, CustomerInteraction, Invoice, Job, PricingDocument } from "../../../lib/models";

const money = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });

const activityStyles: Record<CustomerActivityKind, string> = {
  Customer: "bg-slate-800 text-slate-300",
  Estimate: "bg-violet-500/15 text-violet-300",
  Quote: "bg-cyan-500/15 text-cyan-300",
  Job: "bg-amber-500/15 text-amber-300",
  Invoice: "bg-emerald-500/15 text-emerald-300",
  Interaction: "bg-blue-500/15 text-blue-300",
};

export default function CustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const customers = useLocalStorageCollection<Customer>("jr-os-customers");
  const jobs = useLocalStorageCollection<Job>("jr-os-jobs");
  const documents = useLocalStorageCollection<PricingDocument>("jr-os-pricing-documents");
  const invoices = useLocalStorageCollection<Invoice>("jr-os-invoices");
  const interactions = useLocalStorageCollection<CustomerInteraction>("jr-os-customer-interactions");
  const customer = customers.items.find((item) => item.id === params.id);
  const linkedJobs = jobs.items.filter((job) => job.customerId === params.id).toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const linkedDocuments = documents.items.filter((document) => document.customerId === params.id).toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const linkedInvoices = invoices.items.filter((invoice) => invoice.customerId === params.id).toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const linkedInteractions = interactions.items.filter((interaction) => interaction.customerId === params.id);

  const isReady = customers.isReady && jobs.isReady && documents.isReady && invoices.isReady && interactions.isReady;
  if (!isReady) return <Card>Loading customer…</Card>;

  if (!customer) {
    return <div className="space-y-6"><Link href="/customers" className="inline-flex items-center gap-2 text-sm text-cyan-300 hover:text-cyan-200">← Back to customers</Link><Card><h1 className="text-xl font-bold">Customer not found</h1><p className="mt-2 text-sm text-slate-400">This customer may have been deleted or the link is no longer valid.</p></Card></div>;
  }

  const quotes = linkedDocuments.filter((document) => document.type === "Quote");
  const estimates = linkedDocuments.filter((document) => document.type === "Estimate");
  const activity = buildCustomerActivity({ customer, documents: linkedDocuments, jobs: linkedJobs, invoices: linkedInvoices, interactions: linkedInteractions });

  return <div className="space-y-6">
    <Link href="/customers" className="inline-flex items-center gap-2 text-sm text-cyan-300 hover:text-cyan-200">← Back to customers</Link>

    <Card className="border-cyan-400/30">
      <p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">Customer profile</p>
      <h1 className="mt-2 text-3xl font-bold">{customer.name}</h1>
      <div className="mt-6 grid gap-4 text-sm text-slate-300 md:grid-cols-2">
        <p className="flex items-center gap-2"><Phone className="size-4 text-cyan-400" />{customer.phone || "Not provided"}</p>
        <p className="flex items-center gap-2"><Mail className="size-4 text-cyan-400" />{customer.email || "Not provided"}</p>
        <p className="flex items-start gap-2 md:col-span-2"><MapPin className="mt-0.5 size-4 shrink-0 text-cyan-400" />{customer.address || "Not provided"}</p>
        <p className="md:col-span-2"><span className="font-semibold text-slate-200">Notes:</span> {customer.notes || "No notes"}</p>
      </div>
    </Card>

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Card><FileText className="size-5 text-violet-300" /><p className="mt-3 text-sm text-slate-400">Estimates</p><p className="mt-2 text-3xl font-bold">{estimates.length}</p></Card>
      <Card><FileText className="size-5 text-cyan-300" /><p className="mt-3 text-sm text-slate-400">Quotes</p><p className="mt-2 text-3xl font-bold">{quotes.length}</p></Card>
      <Card><BriefcaseBusiness className="size-5 text-amber-300" /><p className="mt-3 text-sm text-slate-400">Jobs</p><p className="mt-2 text-3xl font-bold">{linkedJobs.length}</p></Card>
      <Card><ReceiptText className="size-5 text-emerald-300" /><p className="mt-3 text-sm text-slate-400">Invoices</p><p className="mt-2 text-3xl font-bold">{linkedInvoices.length}</p></Card>
    </section>

    <section className="space-y-4">
      <div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">Linked commercial records</p><h2 className="mt-1 text-2xl font-bold">Estimates and quotes ({linkedDocuments.length})</h2></div>
      {linkedDocuments.length === 0 ? <Card><p className="text-sm text-slate-400">No estimates or quotes are linked to this customer yet.</p></Card> : <div className="grid gap-4 md:grid-cols-2">{linkedDocuments.map((document) => <Link key={document.id} href={`/quotes/${document.id}`}><Card className="h-full transition hover:border-cyan-400/40"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">{document.type} · {document.number}</p><h3 className="mt-2 text-lg font-bold">{document.title}</h3><p className="mt-1 text-sm text-slate-400">{document.siteAddress || customer.address || "No site address"}</p></div><StatusBadge status={document.status} /></div><p className="mt-4 font-bold">{money.format(pricingDocumentTotal(document))}</p></Card></Link>)}</div>}
    </section>

    <section className="space-y-4">
      <div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">Linked operations</p><h2 className="mt-1 text-2xl font-bold">Jobs ({linkedJobs.length})</h2></div>
      {linkedJobs.length === 0 ? <Card><p className="text-sm text-slate-400">No jobs are linked to this customer yet.</p></Card> : <div className="grid gap-4 md:grid-cols-2">{linkedJobs.map((job) => <Link key={job.id} href={`/jobs/${job.id}`}><Card className="h-full transition hover:border-cyan-400/40"><div className="flex items-start justify-between gap-3"><div><p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-cyan-400"><BriefcaseBusiness className="size-4" />Job</p><h3 className="mt-2 text-lg font-bold">{job.title}</h3><p className="mt-1 text-sm text-slate-400">{job.siteAddress}</p></div><StatusBadge status={job.status} /></div><p className="mt-4 font-bold">{money.format(job.value)}</p></Card></Link>)}</div>}
    </section>

    <section className="space-y-4">
      <div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">Linked accounts</p><h2 className="mt-1 text-2xl font-bold">Invoices ({linkedInvoices.length})</h2></div>
      {linkedInvoices.length === 0 ? <Card><p className="text-sm text-slate-400">No invoices are linked to this customer yet.</p></Card> : <div className="grid gap-4 md:grid-cols-2">{linkedInvoices.map((invoice) => { const total = invoiceTotal(invoice); return <Link key={invoice.id} href="/invoices"><Card className="h-full transition hover:border-cyan-400/40"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-emerald-300">{invoice.number}</p><h3 className="mt-2 text-lg font-bold">{invoice.title}</h3><p className="mt-1 text-sm text-slate-400">Due {invoice.dueDate ? new Date(`${invoice.dueDate}T12:00:00`).toLocaleDateString("en-GB") : "not set"}</p></div><span className="rounded-full bg-slate-800 px-2.5 py-1 text-xs font-semibold text-slate-300">{invoice.status}</span></div><div className="mt-4 flex justify-between text-sm"><span className="text-slate-500">Total</span><strong>{money.format(total)}</strong></div><div className="mt-1 flex justify-between text-sm"><span className="text-slate-500">Outstanding</span><strong className={total > invoice.amountPaid ? "text-amber-300" : "text-emerald-300"}>{money.format(Math.max(0, total - invoice.amountPaid))}</strong></div></Card></Link>; })}</div>}
    </section>

    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">Customer history</p><h2 className="mt-1 text-2xl font-bold">Activity timeline</h2><p className="mt-1 text-sm text-slate-400">Quotes, estimates, jobs, invoices and logged contact in one chronological view.</p></div><Link href="/crm" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 text-sm font-semibold text-slate-100 hover:bg-slate-800"><MessageSquareText className="size-4" />Log customer contact</Link></div>
      <div className="space-y-3">{activity.map((item) => <Card key={item.id}><div className="flex items-start gap-4"><div className={`rounded-xl p-2 ${activityStyles[item.kind]}`}><Clock3 className="size-5" /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{item.kind}</p><h3 className="mt-1 font-bold">{item.title}</h3></div><time className="text-xs text-slate-500">{new Date(item.occurredAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</time></div>{item.detail ? <p className="mt-2 text-sm text-slate-400">{item.detail}</p> : null}{item.href ? <Link href={item.href} className="mt-3 inline-flex text-sm font-semibold text-cyan-300 hover:text-cyan-200">Open record →</Link> : null}</div></div></Card>)}</div>
    </section>
  </div>;
}
