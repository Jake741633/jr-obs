"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState, type ReactNode } from "react";
import {
  BadgePoundSterling,
  BriefcaseBusiness,
  Clock3,
  FileText,
  GitBranch,
  Mail,
  MapPin,
  MessageSquareText,
  Phone,
  PoundSterling,
  ReceiptText,
  Repeat2,
  Star,
  UsersRound,
} from "lucide-react";
import { CustomerWorkflowActions } from "../../../components/crm/CustomerWorkflowActions";
import { Card } from "../../../components/ui/Card";
import { StatusBadge } from "../../../components/ui/StatusBadge";
import {
  useAiRemindersCollection,
  useBuildersCollection,
  useCertificatesCollection,
  useCustomerInteractionsCollection,
  useCustomerProfilesCollection,
  useCustomersCollection,
  useInvoicesCollection,
  useJobDocumentsCollection,
  useJobsCollection,
  useJobTimelineCollection,
  useJobVariationsCollection,
  usePaymentsCollection,
  usePricingDocumentsCollection,
  useSalesLeadsCollection,
  useSiteDiariesCollection,
} from "../../../lib/cloud/coreBusinessCollections";
import {
  buildCustomerIntelligence,
  buildCustomerTimeline,
  type CustomerTimelineKind,
} from "../../../lib/crmPro";
import { invoiceTotal, pricingDocumentTotal } from "../../../lib/workflow";
import { savedIdentityIndex } from "../../../lib/assistantIdentity";
import { contactEmailHref, contactPhoneHref } from "../../../lib/contactLinks";
import { assistantJobBriefingHref } from "../../../lib/assistantJobLink";

const money = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });

const timelineStyles: Record<CustomerTimelineKind, string> = {
  Customer: "bg-slate-800 text-slate-300",
  Enquiry: "bg-blue-500/15 text-blue-300",
  Estimate: "bg-violet-500/15 text-violet-300",
  Quote: "bg-cyan-500/15 text-cyan-300",
  Job: "bg-amber-500/15 text-amber-300",
  "Site diary": "bg-sky-500/15 text-sky-300",
  Variation: "bg-orange-500/15 text-orange-300",
  Invoice: "bg-emerald-500/15 text-emerald-300",
  Payment: "bg-green-500/15 text-green-300",
  Certificate: "bg-teal-500/15 text-teal-300",
  Photo: "bg-fuchsia-500/15 text-fuchsia-300",
  Note: "bg-slate-700 text-slate-200",
  Email: "bg-indigo-500/15 text-indigo-300",
  "Phone call": "bg-sky-500/15 text-sky-300",
  "AI activity": "bg-purple-500/15 text-purple-300",
};

function CompactMetric({ label, value, detail, icon }: { label: string; value: string; detail: string; icon: ReactNode }) {
  return <Card className="min-h-32"><div className="flex items-start justify-between gap-2"><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p><span className="text-cyan-300">{icon}</span></div><p className="mt-3 break-words text-xl font-bold">{value}</p><p className="mt-2 text-xs leading-5 text-slate-500">{detail}</p></Card>;
}

const customerBrowseDefaults = (customerId: string) => ({ customerId, historySearch: "", historyKind: "All", historyLimit: 8, jobsLimit: 4, documentsLimit: 4, invoicesLimit: 4 });

export default function CustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const [browse, setBrowse] = useState(() => customerBrowseDefaults(params.id));
  const view = browse.customerId === params.id ? browse : customerBrowseDefaults(params.id);
  if (browse.customerId !== params.id) setBrowse(view);
  function updateBrowse(changes: Partial<ReturnType<typeof customerBrowseDefaults>>) {
    setBrowse((current) => ({ ...(current.customerId === params.id ? current : customerBrowseDefaults(params.id)), ...changes }));
  }
  const customers = useCustomersCollection();
  const builders = useBuildersCollection();
  const jobs = useJobsCollection();
  const documents = usePricingDocumentsCollection();
  const invoices = useInvoicesCollection();
  const payments = usePaymentsCollection();
  const profiles = useCustomerProfilesCollection();
  const interactions = useCustomerInteractionsCollection();
  const leads = useSalesLeadsCollection();
  const variations = useJobVariationsCollection();
  const certificates = useCertificatesCollection();
  const jobDocuments = useJobDocumentsCollection();
  const reminders = useAiRemindersCollection();
  const jobTimeline = useJobTimelineCollection();
  const diaries = useSiteDiariesCollection();
  const stores = [customers, builders, jobs, documents, invoices, payments, profiles, interactions, leads, variations, certificates, jobDocuments, reminders, jobTimeline, diaries];
  const isReady = stores.every((store) => store.isReady);

  const workflowActions = <CustomerWorkflowActions key={params.id} customerId={params.id} customers={customers} jobs={jobs} timeline={jobTimeline} profiles={profiles} interactions={interactions} />;
  if (!isReady) return <div className="space-y-6">{workflowActions}<Card>Loading customer CRM…</Card></div>;

  const customer = savedIdentityIndex(customers.items).unique.get(params.id);
  if (!customer) {
    return <div className="space-y-6">{workflowActions}<Link href="/customers" className="inline-flex min-h-12 items-center gap-2 text-sm text-cyan-300 hover:text-cyan-200">← Back to customers</Link><Card><h1 className="text-xl font-bold">Customer unavailable</h1><p className="mt-2 text-sm text-slate-400">This customer is missing or its saved identity is ambiguous. Review the customer records before using this workspace.</p></Card></div>;
  }
  const phoneHref = contactPhoneHref(customer.phone);
  const emailHref = contactEmailHref(customer.email);

  const profile = profiles.items.find((item) => item.customerId === customer.id);
  const linkedJobs = jobs.items.filter((job) => job.customerId === customer.id).toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const jobIds = new Set(linkedJobs.map((job) => job.id));
  const linkedDocuments = documents.items.filter((document) => document.customerId === customer.id || Boolean(document.jobId && jobIds.has(document.jobId))).toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const linkedInvoices = invoices.items.filter((invoice) => invoice.customerId === customer.id || Boolean(invoice.jobId && jobIds.has(invoice.jobId))).toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const quotes = linkedDocuments.filter((document) => document.type === "Quote");
  const estimates = linkedDocuments.filter((document) => document.type === "Estimate");
  const intelligence = buildCustomerIntelligence({
    customer,
    profile,
    builders: builders.items,
    leads: leads.items,
    documents: documents.items,
    jobs: jobs.items,
    invoices: invoices.items,
    payments: payments.items,
    interactions: interactions.items,
  });
  const timeline = buildCustomerTimeline({
    customer,
    leads: leads.items,
    documents: documents.items,
    jobs: jobs.items,
    diaries: diaries.items,
    variations: variations.items,
    invoices: invoices.items,
    payments: payments.items,
    certificates: certificates.items,
    jobDocuments: jobDocuments.items,
    interactions: interactions.items,
    reminders: reminders.items,
  });
  const historyWords = view.historySearch.trim().toLocaleLowerCase("en-GB").split(/\s+/).filter(Boolean);
  const filteredTimeline = timeline.filter((item) => {
    const searchable = [item.kind, item.title, item.detail, item.status].filter((value) => typeof value === "string").join(" ").toLocaleLowerCase("en-GB");
    return (view.historyKind === "All" || item.kind === view.historyKind) && historyWords.every((word) => searchable.includes(word));
  });

  return <div className="space-y-6 pb-[calc(12rem+env(safe-area-inset-bottom))] lg:pb-0">
    {workflowActions}
    <Link href="/customers" className="inline-flex min-h-12 items-center gap-2 text-sm text-cyan-300 hover:text-cyan-200">← Back to customers</Link>

    <Card className="border-cyan-400/30">
      <p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">CRM Pro customer</p>
      <h1 className="mt-2 break-words text-2xl font-bold sm:text-3xl">{customer.name}</h1>
      <div className="mt-5 grid gap-3 text-sm text-slate-300 sm:grid-cols-2">
        <p className="flex min-h-12 min-w-0 items-center gap-2"><Phone className="size-4 shrink-0 text-cyan-400" /><span className="break-words">{customer.phone || "Not provided"}{customer.phone && !phoneHref ? <span className="block text-xs text-amber-200">Review phone format to call or text</span> : null}</span></p>
        <p className="flex min-h-12 min-w-0 items-center gap-2"><Mail className="size-4 shrink-0 text-cyan-400" /><span className="min-w-0 break-all">{customer.email || "Not provided"}{customer.email && !emailHref ? <span className="block text-xs text-amber-200">Review email format to compose</span> : null}</span></p>
        <p className="flex items-start gap-2 sm:col-span-2"><MapPin className="mt-0.5 size-4 shrink-0 text-cyan-400" /><span className="break-words">{customer.address || "Not provided"}</span></p>
        <p className="break-words sm:col-span-2"><span className="font-semibold text-slate-200">Notes:</span> {customer.notes || "No notes"}</p>
      </div>
    </Card>

    <nav aria-label="Customer sections" className="grid grid-cols-2 gap-2 sm:grid-cols-4">{[["Jobs", "customer-jobs"], ["Quotes & estimates", "customer-pricing"], ["Invoices", "customer-invoices"], ["History", "customer-history"]].map(([label, id]) => <a key={id} href={`#${id}`} className="flex min-h-12 items-center justify-center rounded-xl border border-slate-700 px-3 text-center text-sm font-semibold text-cyan-200">{label}</a>)}</nav>

    <details className="rounded-2xl border border-slate-800 p-4">
      <summary className="flex min-h-12 cursor-pointer items-center text-base font-semibold text-fuchsia-200">Customer overview and relationship metrics</summary>
      <section className="mt-4 space-y-4">
      <div><p className="text-xs font-semibold uppercase tracking-wider text-fuchsia-300">Customer intelligence</p><h2 className="mt-1 text-2xl font-bold">Commercial relationship at a glance</h2><p className="mt-1 text-sm text-slate-400">Calculated from this customer&apos;s tenant-scoped JR OS history.</p></div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5 lg:gap-4">
        <CompactMetric label="Total spend" value={money.format(intelligence.totalSpend)} detail="Payments recorded" icon={<PoundSterling className="size-5" />} />
        <CompactMetric label="Outstanding" value={money.format(intelligence.outstandingBalance)} detail="Open invoice balance" icon={<ReceiptText className="size-5" />} />
        <CompactMetric label="Lifetime value" value={money.format(intelligence.lifetimeValue)} detail="Invoiced plus won work" icon={<BadgePoundSterling className="size-5" />} />
        <CompactMetric label="Payment speed" value={intelligence.averagePaymentDays === null ? "No history" : `${intelligence.averagePaymentDays.toFixed(1)} days`} detail="Average from issue to paid" icon={<Clock3 className="size-5" />} />
        <CompactMetric label="Repeat score" value={`${intelligence.repeatCustomerScore}/100`} detail={`${intelligence.completedJobs} completed · ${intelligence.acceptedQuotes} accepted`} icon={<Repeat2 className="size-5" />} />
        <CompactMetric label="Last job" value={intelligence.lastJob?.title || "None yet"} detail={intelligence.lastJob ? `${intelligence.lastJob.status} · ${new Date(intelligence.lastJob.updatedAt).toLocaleDateString("en-GB")}` : "No linked job"} icon={<BriefcaseBusiness className="size-5" />} />
        <CompactMetric label="Last quote" value={intelligence.lastQuote?.number || "None yet"} detail={intelligence.lastQuote ? `${intelligence.lastQuote.status} · ${intelligence.lastQuote.title}` : "No linked quote"} icon={<FileText className="size-5" />} />
        <CompactMetric label="Builder relationship" value={intelligence.builderRelationship} detail="Relationship route" icon={<UsersRound className="size-5" />} />
        <CompactMetric label="Referral source" value={intelligence.referralSource} detail="Most reliable recorded source" icon={<GitBranch className="size-5" />} />
        <CompactMetric label="Review status" value={intelligence.reviewStatus} detail={profile?.reviewRequestedAt ? `Requested ${new Date(profile.reviewRequestedAt).toLocaleDateString("en-GB")}` : "Customer care status"} icon={<Star className="size-5" />} />
      </div>
    </section>
    </details>

    <section className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
      <Card><FileText className="size-5 text-violet-300" /><p className="mt-3 text-sm text-slate-400">Estimates</p><p className="mt-2 text-3xl font-bold">{estimates.length}</p></Card>
      <Card><FileText className="size-5 text-cyan-300" /><p className="mt-3 text-sm text-slate-400">Quotes</p><p className="mt-2 text-3xl font-bold">{quotes.length}</p></Card>
      <Card><BriefcaseBusiness className="size-5 text-amber-300" /><p className="mt-3 text-sm text-slate-400">Jobs</p><p className="mt-2 text-3xl font-bold">{linkedJobs.length}</p></Card>
      <Card><ReceiptText className="size-5 text-emerald-300" /><p className="mt-3 text-sm text-slate-400">Invoices</p><p className="mt-2 text-3xl font-bold">{linkedInvoices.length}</p></Card>
    </section>

    <section id="customer-pricing" aria-label="Customer quotes and estimates" className="scroll-mt-24 space-y-4">
      <div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">Linked commercial records</p><h2 className="mt-1 text-2xl font-bold">Estimates and quotes ({linkedDocuments.length})</h2></div>
      {linkedDocuments.length === 0 ? <Card><p className="text-sm text-slate-400">No estimates or quotes are linked to this customer yet.</p></Card> : <div className="grid gap-4 md:grid-cols-2">{linkedDocuments.slice(0, view.documentsLimit).map((document) => <Link key={document.id} href={`/quotes/${encodeURIComponent(document.id)}`}><Card className="h-full transition hover:border-cyan-400/40"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">{document.type} · {document.number}</p><h3 className="mt-2 text-lg font-bold">{document.title}</h3><p className="mt-1 text-sm text-slate-400">{document.siteAddress || customer.address || "No site address"}</p></div><StatusBadge status={document.status} /></div><p className="mt-4 font-bold">{money.format(pricingDocumentTotal(document))}</p></Card></Link>)}</div>}
      {linkedDocuments.length > view.documentsLimit ? <button type="button" onClick={() => updateBrowse({ documentsLimit: view.documentsLimit + 4 })} className="min-h-12 w-full rounded-xl border border-slate-700 px-4 text-sm font-semibold">Show more quotes and estimates ({linkedDocuments.length - view.documentsLimit} remaining)</button> : null}
    </section>

    <section id="customer-jobs" aria-label="Customer jobs" className="scroll-mt-24 space-y-4">
      <div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">Linked operations</p><h2 className="mt-1 text-2xl font-bold">Jobs ({linkedJobs.length})</h2></div>
      {linkedJobs.length === 0 ? <Card><p className="text-sm text-slate-400">No jobs are linked to this customer yet.</p></Card> : <div className="grid gap-4 md:grid-cols-2">{linkedJobs.slice(0, view.jobsLimit).map((job) => <Card key={job.id} className="h-full"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-cyan-400"><BriefcaseBusiness className="size-4" />Job</p><h3 className="mt-2 break-words text-lg font-bold">{job.title}</h3><p className="mt-1 break-words text-sm text-slate-400">{job.siteAddress}</p></div><StatusBadge status={job.status} /></div><p className="mt-4 font-bold">{money.format(job.value)}</p><div className="mt-4 grid gap-2"><Link href={`/jobs/${encodeURIComponent(job.id)}`} className="flex min-h-12 items-center rounded-xl border border-slate-700 px-3 text-sm font-semibold text-cyan-200">Review job</Link>{assistantJobBriefingHref(job.id) ? <Link href={assistantJobBriefingHref(job.id)!} className="flex min-h-12 items-center rounded-xl border border-cyan-400/30 px-3 text-sm font-semibold text-cyan-200">Ask JR AI about this job</Link> : null}</div></Card>)}</div>}
      {linkedJobs.length > view.jobsLimit ? <button type="button" onClick={() => updateBrowse({ jobsLimit: view.jobsLimit + 4 })} className="min-h-12 w-full rounded-xl border border-slate-700 px-4 text-sm font-semibold">Show more jobs ({linkedJobs.length - view.jobsLimit} remaining)</button> : null}
    </section>

    <section id="customer-invoices" aria-label="Customer invoices" className="scroll-mt-24 space-y-4">
      <div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">Linked accounts</p><h2 className="mt-1 text-2xl font-bold">Invoices ({linkedInvoices.length})</h2></div>
      {linkedInvoices.length === 0 ? <Card><p className="text-sm text-slate-400">No invoices are linked to this customer yet.</p></Card> : <div className="grid gap-4 md:grid-cols-2">{linkedInvoices.slice(0, view.invoicesLimit).map((invoice) => { const total = invoiceTotal(invoice); return <Link key={invoice.id} href={`/invoices?invoice=${encodeURIComponent(invoice.id)}`}><Card className="h-full transition hover:border-cyan-400/40"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-emerald-300">{invoice.number}</p><h3 className="mt-2 text-lg font-bold">{invoice.title}</h3><p className="mt-1 text-sm text-slate-400">Due {invoice.dueDate ? new Date(`${invoice.dueDate}T12:00:00`).toLocaleDateString("en-GB") : "not set"}</p></div><span className="rounded-full bg-slate-800 px-2.5 py-1 text-xs font-semibold text-slate-300">{invoice.status}</span></div><div className="mt-4 flex justify-between text-sm"><span className="text-slate-500">Total</span><strong>{money.format(total)}</strong></div><div className="mt-1 flex justify-between text-sm"><span className="text-slate-500">Recorded outstanding</span><strong className={total > invoice.amountPaid ? "text-amber-300" : "text-emerald-300"}>{money.format(Math.max(0, total - invoice.amountPaid))}</strong></div></Card></Link>; })}</div>}
      {linkedInvoices.length > view.invoicesLimit ? <button type="button" onClick={() => updateBrowse({ invoicesLimit: view.invoicesLimit + 4 })} className="min-h-12 w-full rounded-xl border border-slate-700 px-4 text-sm font-semibold">Show more invoices ({linkedInvoices.length - view.invoicesLimit} remaining)</button> : null}
    </section>

    <section id="customer-history" aria-label="Customer history" className="scroll-mt-24 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">Customer history</p><h2 className="mt-1 text-2xl font-bold">Unified timeline</h2><p className="mt-1 text-sm text-slate-400">Every enquiry, commercial record, payment, site item and contact event, newest first.</p></div><Link href={`/crm?customer=${encodeURIComponent(customer.id)}`} className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 text-sm font-semibold text-slate-100 hover:bg-slate-800"><MessageSquareText className="size-4" />Log customer contact</Link></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-2 text-sm font-semibold"><span>Find customer history</span><input type="search" value={view.historySearch} onChange={(event) => updateBrowse({ historySearch: event.target.value, historyLimit: 8 })} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); } }} enterKeyHint="search" autoComplete="off" placeholder="Activity, notes or status" className="min-h-12 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-base sm:text-sm" /></label>
        <label className="grid gap-2 text-sm font-semibold"><span>History type</span><select value={view.historyKind} onChange={(event) => updateBrowse({ historyKind: event.target.value, historyLimit: 8 })} className="min-h-12 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-base sm:text-sm"><option value="All">All activity</option>{Object.keys(timelineStyles).map((kind) => <option key={kind} value={kind}>{kind}</option>)}</select></label>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2"><p role="status" className="text-sm text-slate-400">Showing {Math.min(view.historyLimit, filteredTimeline.length)} of {filteredTimeline.length} matching activities</p><button type="button" onClick={() => updateBrowse({ historySearch: "", historyKind: "All", historyLimit: 8 })} className="min-h-12 rounded-xl border border-slate-700 px-4 text-sm font-semibold">Clear history filters</button></div>
      {!filteredTimeline.length ? <Card><p className="text-sm text-slate-400">No matching activity. Clear the filters to review this customer&apos;s history.</p></Card> : null}
      <div className="space-y-3">{filteredTimeline.slice(0, view.historyLimit).map((item) => <Card key={item.id}><div className="flex items-start gap-3 sm:gap-4"><div className={`shrink-0 rounded-xl p-2 ${timelineStyles[item.kind]}`}><Clock3 className="size-5" /></div><div className="min-w-0 flex-1"><div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{item.kind}</p>{item.status ? <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-slate-400">{item.status}</span> : null}</div><h3 className="mt-1 font-bold">{item.title}</h3></div><time className="shrink-0 text-xs text-slate-500">{new Date(item.occurredAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</time></div>{item.detail ? <p className="mt-2 text-sm leading-6 text-slate-400">{item.detail}</p> : null}<div className="mt-3 flex items-center justify-between gap-3">{item.href ? <Link href={item.href} className="inline-flex min-h-12 items-center text-sm font-semibold text-cyan-300 hover:text-cyan-200">Open record →</Link> : <span />}{typeof item.value === "number" ? <strong className="text-sm">{money.format(item.value)}</strong> : null}</div></div></div></Card>)}</div>
      {filteredTimeline.length > view.historyLimit ? <button type="button" onClick={() => updateBrowse({ historyLimit: view.historyLimit + 8 })} className="min-h-12 w-full rounded-xl border border-slate-700 px-4 text-sm font-semibold">Show more history ({filteredTimeline.length - view.historyLimit} remaining)</button> : null}
    </section>
  </div>;
}
