"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ArrowRight, BriefcaseBusiness, CircleAlert, FileText, Percent, PoundSterling, TrendingUp, Users } from "lucide-react";
import { ComplianceDashboard } from "../components/ComplianceDashboard";
import { ScheduleOverview } from "../components/ScheduleOverview";
import { Card } from "../components/ui/Card";
import { PageHeader } from "../components/ui/PageHeader";
import { StatusBadge } from "../components/ui/StatusBadge";
import { useLocalStorageCollection } from "../lib/storage";
import { invoiceTotal, pricingDocumentTotal } from "../lib/workflow";
import type { Customer, Invoice, Job, PricingDocument } from "../lib/models";

const money = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });

export default function Home() {
  const jobs = useLocalStorageCollection<Job>("jr-os-jobs");
  const customers = useLocalStorageCollection<Customer>("jr-os-customers");
  const quotes = useLocalStorageCollection<PricingDocument>("jr-os-pricing-documents");
  const invoices = useLocalStorageCollection<Invoice>("jr-os-invoices");
  const ready = jobs.isReady && customers.isReady && quotes.isReady && invoices.isReady;

  const dashboard = useMemo(() => {
    const activeJobs = jobs.items.filter((job) => !["Complete", "On hold"].includes(job.status));
    const openQuotes = quotes.items.filter((quote) => quote.type === "Quote" && ["Draft", "Sent"].includes(quote.status));
    const quotePipeline = openQuotes.reduce((sum, quote) => sum + pricingDocumentTotal(quote), 0);
    const outstandingInvoices = invoices.items.filter((invoice) => ["Sent", "Part paid", "Overdue"].includes(invoice.status));
    const outstanding = outstandingInvoices.reduce((sum, invoice) => sum + Math.max(0, invoiceTotal(invoice) - invoice.amountPaid), 0);
    const overdueCount = outstandingInvoices.filter((invoice) => invoice.status === "Overdue" || (invoice.dueDate && new Date(invoice.dueDate) < new Date())).length;
    const recentJobs = [...jobs.items].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5);
    const urgentInvoices = outstandingInvoices.sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 4);
    const quoteDocuments = quotes.items.filter((quote) => quote.type === "Quote");
    const decidedQuotes = quoteDocuments.filter((quote) => ["Accepted", "Declined"].includes(quote.status));
    const acceptedQuotes = decidedQuotes.filter((quote) => quote.status === "Accepted");
    const quoteConversionRate = decidedQuotes.length ? acceptedQuotes.length / decidedQuotes.length * 100 : 0;
    const jobsInProgress = jobs.items.filter((job) => job.status === "In progress");
    const scheduledJobs = jobs.items.filter((job) => job.status === "Scheduled");
    const activeProfitJobs = jobs.items.filter((job) => ["Scheduled", "In progress"].includes(job.status));
    const linkedQuoteProfit = new Map(quoteDocuments.map((quote) => [quote.id, quote.profitability?.expectedProfit ?? 0]));
    const jobExpectedProfit = activeProfitJobs.reduce((sum, job) => sum + (job.quoteSnapshot?.profitability?.expectedProfit ?? linkedQuoteProfit.get(job.sourceQuoteId ?? "") ?? 0), 0);
    const wonQuotesAwaitingJob = quoteDocuments.filter((quote) => quote.status === "Accepted" && !quote.jobId);
    const unconvertedExpectedProfit = wonQuotesAwaitingJob.reduce((sum, quote) => sum + (quote.profitability?.expectedProfit ?? 0), 0);
    const expectedProfit = jobExpectedProfit + unconvertedExpectedProfit;
    const expectedProfitRecords = activeProfitJobs.filter((job) => Boolean(job.quoteSnapshot?.profitability || linkedQuoteProfit.get(job.sourceQuoteId ?? ""))).length + wonQuotesAwaitingJob.filter((quote) => Boolean(quote.profitability)).length;
    return { activeJobs, openQuotes, quotePipeline, outstanding, overdueCount, recentJobs, urgentInvoices, quoteConversionRate, decidedQuotes, acceptedQuotes, jobsInProgress, scheduledJobs, outstandingInvoices, expectedProfit, expectedProfitRecords };
  }, [invoices.items, jobs.items, quotes.items]);

  if (!ready) return <Card>Loading command centre…</Card>;

  const metrics = [
    { label: "Active jobs", value: String(dashboard.activeJobs.length), detail: `${jobs.items.length} total jobs`, icon: BriefcaseBusiness },
    { label: "Open quotes", value: String(dashboard.openQuotes.length), detail: `${money.format(dashboard.quotePipeline)} pipeline`, icon: FileText },
    { label: "Outstanding", value: money.format(dashboard.outstanding), detail: `${dashboard.overdueCount} overdue`, icon: PoundSterling },
    { label: "Customers", value: String(customers.items.length), detail: "Live customer records", icon: Users },
  ];

  return <div className="space-y-6">
    <PageHeader eyebrow="Owner dashboard" title="Command Centre" description="A live view of JR Electrical Services, calculated from the records saved in JR OS." action={<Link href="/jobs" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-cyan-400 px-4 text-sm font-semibold text-slate-950">Open jobs <ArrowRight className="size-4" /></Link>} />
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{metrics.map(({ label, value, detail, icon: Icon }) => <Card key={label}><div className="flex items-start justify-between"><div><p className="text-sm text-slate-400">{label}</p><p className="mt-3 text-3xl font-black tracking-tight">{value}</p></div><span className="rounded-xl bg-slate-800 p-2 text-cyan-300"><Icon className="size-5" /></span></div><p className="mt-3 text-xs text-slate-500">{detail}</p></Card>)}</section>
    <ScheduleOverview />
    <section className="space-y-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">Workflow performance</p><h2 className="mt-1 text-2xl font-bold">Quote-to-payment dashboard</h2><p className="mt-1 text-sm text-slate-400">Live figures calculated from the linked quotes, jobs and invoices saved in JR OS.</p></div><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Card><div className="flex items-start justify-between"><div><p className="text-sm text-slate-400">Quote conversion rate</p><p className="mt-3 text-3xl font-black">{dashboard.quoteConversionRate.toFixed(1)}%</p></div><span className="rounded-xl bg-violet-500/10 p-2 text-violet-300"><Percent className="size-5" /></span></div><p className="mt-3 text-xs text-slate-500">{dashboard.acceptedQuotes.length} accepted from {dashboard.decidedQuotes.length} decided quote{dashboard.decidedQuotes.length === 1 ? "" : "s"}</p></Card><Card><div className="flex items-start justify-between"><div><p className="text-sm text-slate-400">Jobs in progress</p><p className="mt-3 text-3xl font-black">{dashboard.jobsInProgress.length}</p></div><span className="rounded-xl bg-amber-500/10 p-2 text-amber-300"><BriefcaseBusiness className="size-5" /></span></div><p className="mt-3 text-xs text-slate-500">{dashboard.scheduledJobs.length} more scheduled</p></Card><Card><div className="flex items-start justify-between"><div><p className="text-sm text-slate-400">Unpaid invoices</p><p className="mt-3 text-3xl font-black">{dashboard.outstandingInvoices.length}</p></div><span className="rounded-xl bg-rose-500/10 p-2 text-rose-300"><PoundSterling className="size-5" /></span></div><p className="mt-3 text-xs text-slate-500">{money.format(dashboard.outstanding)} still to collect</p></Card><Card><div className="flex items-start justify-between"><div><p className="text-sm text-slate-400">Expected profit</p><p className="mt-3 text-3xl font-black text-emerald-300">{money.format(dashboard.expectedProfit)}</p></div><span className="rounded-xl bg-emerald-500/10 p-2 text-emerald-300"><TrendingUp className="size-5" /></span></div><p className="mt-3 text-xs text-slate-500">From {dashboard.expectedProfitRecords} active won record{dashboard.expectedProfitRecords === 1 ? "" : "s"}</p></Card></div></section>
    <ComplianceDashboard />
    <section className="grid gap-6 xl:grid-cols-[1.35fr_1fr]"><Card><div className="flex items-center justify-between gap-3"><div><h2 className="text-lg font-bold">Recent jobs</h2><p className="text-sm text-slate-500">The latest jobs changed in JR OS.</p></div><Link href="/jobs" className="text-sm font-semibold text-cyan-300">View all</Link></div><div className="mt-5 space-y-3">{dashboard.recentJobs.length ? dashboard.recentJobs.map((job) => <Link key={job.id} href={`/jobs/${job.id}`} className="flex items-center justify-between gap-4 rounded-xl border border-slate-800 bg-slate-950/60 p-4 hover:border-slate-700"><div className="min-w-0"><p className="truncate font-medium">{job.title}</p><p className="mt-1 truncate text-sm text-slate-500">{job.siteAddress || "No site address"}</p></div><div className="shrink-0 text-right"><StatusBadge status={job.status} /><p className="mt-2 text-xs text-slate-500">{job.value > 0 ? money.format(job.value) : "Value not set"}</p></div></Link>) : <p className="rounded-xl border border-dashed border-slate-800 p-6 text-center text-sm text-slate-500">No jobs yet. Create a job to start building your live dashboard.</p>}</div></Card><Card><div className="flex items-center gap-3"><CircleAlert className="size-5 text-amber-300" /><div><h2 className="text-lg font-bold">Money requiring attention</h2><p className="text-sm text-slate-500">Unpaid and overdue invoices.</p></div></div><div className="mt-5 space-y-3">{dashboard.urgentInvoices.length ? dashboard.urgentInvoices.map((invoice) => { const remaining = Math.max(0, invoiceTotal(invoice) - invoice.amountPaid); return <Link key={invoice.id} href="/invoices" className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 px-4 py-3 hover:border-slate-700 hover:bg-slate-800"><div className="min-w-0"><p className="truncate text-sm font-medium">{invoice.number} · {invoice.title}</p><p className="mt-1 text-xs text-slate-500">Due {invoice.dueDate || "date not set"}</p></div><div className="shrink-0 text-right"><p className="font-semibold">{money.format(remaining)}</p><p className={`text-xs ${invoice.status === "Overdue" ? "text-red-300" : "text-slate-500"}`}>{invoice.status}</p></div></Link>; }) : <p className="rounded-xl border border-dashed border-slate-800 p-6 text-center text-sm text-slate-500">No outstanding invoices.</p>}</div></Card></section>
    <Card><h2 className="text-lg font-bold">Quick actions</h2><p className="mt-1 text-sm text-slate-500">Jump straight into common work without loading extra dashboard modules.</p><div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[["Open diary","/planner"],["Create job","/jobs"],["Prepare quote","/quotes"],["Open certificates","/certificates"]].map(([label,href]) => <Link key={href} href={href} className="flex items-center justify-between rounded-xl border border-slate-800 px-4 py-3 text-sm font-medium text-slate-300 hover:border-slate-700 hover:bg-slate-800">{label}<ArrowRight className="size-4" /></Link>)}</div></Card>
  </div>;
}
