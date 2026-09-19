"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  BriefcaseBusiness,
  Building2,
  CalendarClock,
  CheckCircle2,
  CirclePoundSterling,
  Clock3,
  FileText,
  Mail,
  MapPin,
  Percent,
  Phone,
  PoundSterling,
  ReceiptText,
  Repeat2,
  Sparkles,
  User,
} from "lucide-react";
import { BuilderQuickActions } from "../../../components/crm/BuilderQuickActions";
import { Card } from "../../../components/ui/Card";
import { StatusBadge } from "../../../components/ui/StatusBadge";
import {
  useBuildersCollection,
  useInvoicesCollection,
  useJobsCollection,
  usePaymentsCollection,
  usePricingDocumentsCollection,
  useSalesLeadsCollection,
} from "../../../lib/cloud/coreBusinessCollections";
import { buildBuilderCrmIntelligence, normaliseLeadStage } from "../../../lib/crmPro";

const money = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });

export default function BuilderDetailPage() {
  const params = useParams<{ id: string }>();
  const builders = useBuildersCollection();
  const jobs = useJobsCollection();
  const documents = usePricingDocumentsCollection();
  const invoices = useInvoicesCollection();
  const payments = usePaymentsCollection();
  const leads = useSalesLeadsCollection();
  const ready = [builders, jobs, documents, invoices, payments, leads].every((store) => store.isReady);

  if (!ready) return <Card>Loading builder CRM…</Card>;
  const builder = builders.items.find((item) => item.id === params.id);
  if (!builder) return <div className="space-y-6"><Link href="/builders" className="inline-flex min-h-11 items-center gap-2 text-sm text-cyan-300"><ArrowLeft className="size-4" />Back to builders</Link><Card><h1 className="text-xl font-bold">Builder not found</h1><p className="mt-2 text-sm text-slate-400">This builder may have been deleted or the link is no longer valid.</p></Card></div>;

  const intelligence = buildBuilderCrmIntelligence({
    builderId: builder.id,
    jobs: jobs.items,
    documents: documents.items,
    invoices: invoices.items,
    payments: payments.items,
    leads: leads.items,
  });
  const linkedJobs = jobs.items.filter((job) => job.builderId === builder.id).toSorted((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  const linkedQuotes = documents.items.filter((document) => document.builderId === builder.id && document.type === "Quote").toSorted((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  const linkedInvoices = invoices.items.filter((invoice) => invoice.builderId === builder.id || Boolean(invoice.jobId && linkedJobs.some((job) => job.id === invoice.jobId))).toSorted((left, right) => right.updatedAt.localeCompare(left.updatedAt));

  return <main className="space-y-6 pb-24 lg:pb-0">
    <Link href="/builders" className="inline-flex min-h-11 items-center gap-2 text-sm text-cyan-300 hover:text-cyan-200"><ArrowLeft className="size-4" />Back to builders</Link>
    <Card className="border-cyan-400/30">
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-cyan-400"><Building2 className="size-4" />Builder CRM profile</p>
      <h1 className="mt-2 text-3xl font-bold">{builder.companyName}</h1>
      <div className="mt-6 grid gap-3 text-sm text-slate-300 sm:grid-cols-2">
        <p className="flex min-h-11 items-center gap-2"><User className="size-4 text-cyan-400" />{builder.contactName || "No named contact"}</p>
        <p className="flex min-h-11 items-center gap-2"><Phone className="size-4 text-cyan-400" />{builder.phone || "Not provided"}</p>
        <p className="flex min-h-11 items-center gap-2"><Mail className="size-4 text-cyan-400" />{builder.email || "Not provided"}</p>
        <p className="flex items-start gap-2"><MapPin className="mt-0.5 size-4 shrink-0 text-cyan-400" />{builder.address || "Not provided"}</p>
        <p className="sm:col-span-2"><span className="font-semibold text-slate-200">Relationship notes:</span> {builder.notes || "No notes"}</p>
      </div>
    </Card>

    <BuilderQuickActions builder={builder} />

    <section className="space-y-4">
      <div><p className="text-xs font-semibold uppercase tracking-wider text-fuchsia-300">Builder intelligence</p><h2 className="mt-1 text-2xl font-bold">Commercial relationship</h2><p className="mt-1 text-sm text-slate-400">Calculated from tenant-scoped quotes, jobs, invoices, payments and opportunities.</p></div>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4 xl:gap-4">
        <Card><BriefcaseBusiness className="size-5 text-cyan-300" /><p className="mt-3 text-xs text-slate-400">Active jobs</p><p className="mt-2 text-3xl font-bold">{intelligence.activeJobs.length}</p></Card>
        <Card><CheckCircle2 className="size-5 text-emerald-300" /><p className="mt-3 text-xs text-slate-400">Completed jobs</p><p className="mt-2 text-3xl font-bold">{intelligence.completedJobs.length}</p></Card>
        <Card><PoundSterling className="size-5 text-emerald-300" /><p className="mt-3 text-xs text-slate-400">Revenue received</p><p className="mt-2 break-words text-2xl font-bold">{money.format(intelligence.revenue)}</p></Card>
        <Card><CirclePoundSterling className="size-5 text-violet-300" /><p className="mt-3 text-xs text-slate-400">Average project</p><p className="mt-2 break-words text-2xl font-bold">{money.format(intelligence.averageProjectValue)}</p></Card>
        <Card><ReceiptText className="size-5 text-amber-300" /><p className="mt-3 text-xs text-slate-400">Payment history</p><p className="mt-2 text-base font-bold">{intelligence.paymentHistory}</p></Card>
        <Card><Repeat2 className="size-5 text-fuchsia-300" /><p className="mt-3 text-xs text-slate-400">Repeat work</p><p className={`mt-2 text-xl font-bold ${intelligence.repeatWork ? "text-emerald-300" : "text-slate-300"}`}>{intelligence.repeatWork ? "Established" : "Developing"}</p></Card>
        <Card><Sparkles className="size-5 text-cyan-300" /><p className="mt-3 text-xs text-slate-400">Referral opportunities</p><p className="mt-2 text-3xl font-bold">{intelligence.referralOpportunities.length}</p></Card>
        <Card><CalendarClock className="size-5 text-indigo-300" /><p className="mt-3 text-xs text-slate-400">Upcoming projects</p><p className="mt-2 text-3xl font-bold">{intelligence.upcomingProjects.length}</p></Card>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Card><Percent className="size-5 text-cyan-300" /><p className="mt-3 text-sm text-slate-400">Quote conversion</p><p className="mt-2 text-2xl font-bold">{intelligence.conversionRate.toFixed(1)}%</p></Card>
        <Card><Clock3 className="size-5 text-amber-300" /><p className="mt-3 text-sm text-slate-400">Average payment days</p><p className="mt-2 text-2xl font-bold">{intelligence.averagePaymentDays === null ? "No history" : intelligence.averagePaymentDays.toFixed(1)}</p></Card>
        <Card><ReceiptText className="size-5 text-rose-300" /><p className="mt-3 text-sm text-slate-400">Outstanding balance</p><p className="mt-2 text-2xl font-bold">{money.format(intelligence.outstandingBalance)}</p></Card>
      </div>
    </section>

    <section className="space-y-4">
      <div className="flex items-end justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">Opportunity planning</p><h2 className="mt-1 text-2xl font-bold">Upcoming projects</h2></div><Link href={`/leads?action=create&builderId=${encodeURIComponent(builder.id)}&source=Builder`} className="text-sm font-semibold text-cyan-300">Add opportunity</Link></div>
      {intelligence.upcomingProjects.length === 0 ? <Card><p className="text-sm text-slate-400">No upcoming builder projects are recorded yet.</p></Card> : <div className="grid gap-4 md:grid-cols-2">{intelligence.upcomingProjects.map((lead) => <Link key={lead.id} href={`/leads?lead=${encodeURIComponent(lead.id)}`}><Card className="h-full transition hover:border-cyan-400/40"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-fuchsia-300">{normaliseLeadStage(lead.stage)}</p><h3 className="mt-2 font-bold">{lead.workRequired || lead.name}</h3><p className="mt-2 text-sm text-slate-400">{lead.siteAddress || "Address not recorded"}</p></div><strong className="shrink-0 text-emerald-300">{money.format(lead.estimatedValue)}</strong></div><p className="mt-3 text-xs text-slate-500">Next: {lead.nextAction || "Make contact"}{lead.followUpDate ? ` · ${new Date(`${lead.followUpDate}T12:00:00`).toLocaleDateString("en-GB")}` : ""}</p></Card></Link>)}</div>}
    </section>

    <section className="space-y-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">Live delivery</p><h2 className="mt-1 text-2xl font-bold">Active jobs ({intelligence.activeJobs.length})</h2></div>{intelligence.activeJobs.length === 0 ? <Card><p className="text-sm text-slate-400">No active builder jobs.</p></Card> : <div className="grid gap-4 md:grid-cols-2">{intelligence.activeJobs.map((job) => <Link key={job.id} href={`/jobs/${job.id}`}><Card className="h-full"><div className="flex items-start justify-between gap-3"><div><h3 className="font-bold">{job.title}</h3><p className="mt-1 text-sm text-slate-400">{job.siteAddress}</p></div><StatusBadge status={job.status} /></div><p className="mt-4 font-semibold">{money.format(job.value)}</p></Card></Link>)}</div>}</section>

    <section className="grid gap-6 xl:grid-cols-2">
      <Card><div className="flex items-center gap-2"><FileText className="size-5 text-violet-300" /><h2 className="font-bold">Quote history ({linkedQuotes.length})</h2></div><div className="mt-4 space-y-2">{linkedQuotes.slice(0, 6).map((quote) => <Link key={quote.id} href={`/quotes/${quote.id}`} className="flex min-h-12 items-center justify-between gap-3 rounded-xl border border-slate-800 px-3 text-sm"><span className="min-w-0 truncate">{quote.number} · {quote.title}</span><StatusBadge status={quote.status} /></Link>)}{linkedQuotes.length === 0 ? <p className="text-sm text-slate-400">No linked quotes.</p> : null}</div></Card>
      <Card><div className="flex items-center gap-2"><ReceiptText className="size-5 text-amber-300" /><h2 className="font-bold">Invoice history ({linkedInvoices.length})</h2></div><div className="mt-4 space-y-2">{linkedInvoices.slice(0, 6).map((invoice) => <Link key={invoice.id} href={`/invoices?invoice=${encodeURIComponent(invoice.id)}`} className="flex min-h-12 items-center justify-between gap-3 rounded-xl border border-slate-800 px-3 text-sm"><span className="min-w-0 truncate">{invoice.number} · {invoice.title}</span><StatusBadge status={invoice.status} /></Link>)}{linkedInvoices.length === 0 ? <p className="text-sm text-slate-400">No linked invoices.</p> : null}</div></Card>
    </section>

    {intelligence.completedJobs.length > 0 ? <details className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4"><summary className="min-h-11 cursor-pointer font-semibold">Completed job history ({intelligence.completedJobs.length})</summary><div className="mt-4 grid gap-3 md:grid-cols-2">{intelligence.completedJobs.map((job) => <Link key={job.id} href={`/jobs/${job.id}`} className="rounded-xl border border-slate-800 p-3"><p className="font-semibold">{job.title}</p><p className="mt-1 text-sm text-slate-500">{job.siteAddress}</p></Link>)}</div></details> : null}
  </main>;
}
