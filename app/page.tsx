"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, BriefcaseBusiness, CircleAlert, FileText, Percent, PoundSterling, TrendingUp, Users } from "lucide-react";
import { TodaysAssistant } from "../components/ai/TodaysAssistant";
import { ComplianceDashboard } from "../components/ComplianceDashboard";
import { FinanceDirectorInsights } from "../components/FinanceDirectorInsights";
import { PaymentControlDashboard } from "../components/PaymentControlDashboard";
import { PortalActivityDashboard } from "../components/PortalActivityDashboard";
import { ScheduleOverview } from "../components/ScheduleOverview";
import { Card } from "../components/ui/Card";
import { PageHeader } from "../components/ui/PageHeader";
import { StatusBadge } from "../components/ui/StatusBadge";
import { buildSmartRecommendations, buildTodayAssistant } from "../lib/aiCommandCentre";
import {
  useAiRemindersCollection,
  useCertificatesCollection,
  useCustomerProfilesCollection,
  useCustomersCollection,
  useInvoicesCollection,
  useJobsCollection,
  usePlannerCollection,
  usePricingDocumentsCollection,
  usePurchaseListsCollection,
} from "../lib/cloud/coreBusinessCollections";
import { materialOrderLists, operationalHealthScore, outstandingCertificateJobs } from "../lib/dashboardIntelligence";
import { makeId, useCloudLocalCollection } from "../lib/storage";
import { invoiceTotal, pricingDocumentTotal } from "../lib/workflow";
import type { AiReminderPriority, LabourCostSettings } from "../lib/models";

const money = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const defaultLabourSettings: LabourCostSettings = { id: "labour-cost-settings", workingDaysPerYear: 220, billableHoursPerDay: 7.5, targetNetMargin: 25, contingencyPercent: 10, createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString() };

export default function Home() {
  const jobs = useJobsCollection();
  const customers = useCustomersCollection();
  const quotes = usePricingDocumentsCollection();
  const invoices = useInvoicesCollection();
  const planner = usePlannerCollection();
  const profiles = useCustomerProfilesCollection();
  const reminders = useAiRemindersCollection();
  const certificates = useCertificatesCollection();
  const purchaseLists = usePurchaseListsCollection();
  const labourSettingsStore = useCloudLocalCollection<LabourCostSettings>("jr-os-labour-cost-settings", [defaultLabourSettings]);
  const [message, setMessage] = useState("");
  const ready = [jobs, customers, quotes, invoices, planner, profiles, reminders, certificates, purchaseLists, labourSettingsStore].every((store) => store.isReady);
  const labourSettings = labourSettingsStore.items[0] ?? defaultLabourSettings;

  const recommendations = useMemo(() => buildSmartRecommendations({ jobs: jobs.items, documents: quotes.items, invoices: invoices.items, certificates: certificates.items, reminders: reminders.items, labourSettings }), [certificates.items, invoices.items, jobs.items, labourSettings, quotes.items, reminders.items]);
  const today = useMemo(() => buildTodayAssistant({ jobs: jobs.items, planner: planner.items, documents: quotes.items, invoices: invoices.items, profiles: profiles.items, reminders: reminders.items, recommendations }), [invoices.items, jobs.items, planner.items, profiles.items, quotes.items, recommendations, reminders.items]);
  const operational = useMemo(() => {
    const pendingMaterialLists = materialOrderLists(purchaseLists.items);
    const certificateJobs = outstandingCertificateJobs(jobs.items, certificates.items);
    const health = operationalHealthScore({
      overdueInvoices: today.overdueInvoices.length,
      quoteFollowUps: today.quoteFollowUps.length,
      outstandingCertificates: certificateJobs.length,
      materialItemsNeeded: pendingMaterialLists.reduce((sum, list) => sum + list.items.filter((item) => item.status === "Needed").length, 0),
      urgentRecommendations: recommendations.filter((item) => item.severity === "Urgent" || item.severity === "Warning").length,
    });
    return { pendingMaterialLists, certificateJobs, health };
  }, [certificates.items, jobs.items, purchaseLists.items, recommendations, today.overdueInvoices.length, today.quoteFollowUps.length]);
  const todaySnapshot = useMemo(() => ({
    ...today,
    todaysSurveys: today.todaysPlanner.filter((entry) => entry.type === "Survey"),
    materialsToOrder: operational.pendingMaterialLists,
    certificatesOutstanding: operational.certificateJobs,
    businessHealthScore: operational.health.score,
    businessHealthLabel: operational.health.label,
  }), [operational, today]);

  const dashboard = useMemo(() => {
    const activeJobs = jobs.items.filter((job) => !["Complete", "On hold"].includes(job.status));
    const openQuotes = quotes.items.filter((quote) => quote.type === "Quote" && ["Draft", "Sent"].includes(quote.status));
    const quotePipeline = openQuotes.reduce((sum, quote) => sum + pricingDocumentTotal(quote), 0);
    const outstandingInvoices = invoices.items.filter((invoice) => ["Sent", "Part paid", "Overdue"].includes(invoice.status));
    const outstanding = outstandingInvoices.reduce((sum, invoice) => sum + Math.max(0, invoiceTotal(invoice) - invoice.amountPaid), 0);
    const overdueCount = outstandingInvoices.filter((invoice) => invoice.status === "Overdue" || (invoice.dueDate && new Date(invoice.dueDate) < new Date())).length;
    const recentJobs = [...jobs.items].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5);
    const urgentInvoices = outstandingInvoices.toSorted((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 4);
    const quoteDocuments = quotes.items.filter((quote) => quote.type === "Quote");
    const decidedQuotes = quoteDocuments.filter((quote) => ["Accepted", "Declined"].includes(quote.status));
    const acceptedQuotes = decidedQuotes.filter((quote) => quote.status === "Accepted");
    const quoteConversionRate = decidedQuotes.length ? acceptedQuotes.length / decidedQuotes.length * 100 : 0;
    const jobsInProgress = jobs.items.filter((job) => job.status === "In progress");
    const activeProfitJobs = jobs.items.filter((job) => ["Scheduled", "In progress"].includes(job.status));
    const linkedQuoteProfit = new Map(quoteDocuments.map((quote) => [quote.id, quote.profitability?.expectedProfit ?? 0]));
    const jobExpectedProfit = activeProfitJobs.reduce((sum, job) => sum + (job.quoteSnapshot?.profitability?.expectedProfit ?? linkedQuoteProfit.get(job.sourceQuoteId ?? "") ?? 0), 0);
    const wonQuotesAwaitingJob = quoteDocuments.filter((quote) => quote.status === "Accepted" && !quote.jobId);
    const expectedProfit = jobExpectedProfit + wonQuotesAwaitingJob.reduce((sum, quote) => sum + (quote.profitability?.expectedProfit ?? 0), 0);
    return { activeJobs, openQuotes, quotePipeline, outstanding, overdueCount, recentJobs, urgentInvoices, quoteConversionRate, jobsInProgress, outstandingInvoices, expectedProfit };
  }, [invoices.items, jobs.items, quotes.items]);

  function addReminder(input: { title: string; dueDate: string; dueTime: string; priority: AiReminderPriority; customerId?: string; notes: string }) {
    const now = new Date().toISOString();
    reminders.setItems((current) => [{ id: makeId("ai-reminder"), ...input, completed: false, createdAt: now, updatedAt: now }, ...current]);
    setMessage(`Reminder saved for ${new Date(`${input.dueDate}T12:00:00`).toLocaleDateString("en-GB")}.`);
  }

  function toggleReminder(id: string) {
    reminders.setItems((current) => current.map((reminder) => reminder.id === id ? { ...reminder, completed: !reminder.completed, updatedAt: new Date().toISOString() } : reminder));
    setMessage("Reminder updated.");
  }

  if (!ready) return <Card>Loading command centre…</Card>;
  const metrics = [
    { label: "Active jobs", value: String(dashboard.activeJobs.length), detail: `${jobs.items.length} total jobs`, icon: BriefcaseBusiness },
    { label: "Open quotes", value: String(dashboard.openQuotes.length), detail: `${money.format(dashboard.quotePipeline)} pipeline`, icon: FileText },
    { label: "Outstanding", value: money.format(dashboard.outstanding), detail: `${dashboard.overdueCount} overdue`, icon: PoundSterling },
    { label: "Customers", value: String(customers.items.length), detail: "Live customer records", icon: Users },
  ];
  return <main className="space-y-8">
    <PageHeader eyebrow="Owner dashboard" title="Command Centre" description="Run today’s work, sales, cash and compliance from one mobile-first view." action={<Link href="/ai" className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-cyan-400 px-4 text-sm font-semibold text-slate-950">Open JR AI <ArrowRight className="size-4" /></Link>} />
    {message ? <div role="status" className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 px-4 py-3 text-sm text-cyan-200">{message}</div> : null}
    <section className="grid grid-cols-2 gap-3 xl:grid-cols-4 xl:gap-4">{metrics.map(({ label, value, detail, icon: Icon }) => <Card key={label}><div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="text-xs text-slate-400 sm:text-sm">{label}</p><p className="mt-3 break-words text-2xl font-black tracking-tight sm:text-3xl">{value}</p></div><span className="rounded-xl bg-slate-800 p-2 text-cyan-300"><Icon className="size-5" /></span></div><p className="mt-3 text-xs text-slate-500">{detail}</p></Card>)}</section>
    <TodaysAssistant snapshot={todaySnapshot} customers={customers.items} onAddReminder={addReminder} onToggleReminder={toggleReminder} />
    <ScheduleOverview />
    <FinanceDirectorInsights />
    <PaymentControlDashboard />
    <PortalActivityDashboard />
    <section className="space-y-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">Workflow performance</p><h2 className="mt-1 text-2xl font-bold">Quote-to-payment dashboard</h2></div><div className="grid grid-cols-2 gap-3 xl:grid-cols-4 xl:gap-4"><Card><p className="text-xs text-slate-400 sm:text-sm">Quote conversion</p><p className="mt-3 text-2xl font-black sm:text-3xl">{dashboard.quoteConversionRate.toFixed(1)}%</p><Percent className="mt-3 size-5 text-violet-300" /></Card><Card><p className="text-xs text-slate-400 sm:text-sm">Jobs in progress</p><p className="mt-3 text-3xl font-black">{dashboard.jobsInProgress.length}</p><BriefcaseBusiness className="mt-3 size-5 text-amber-300" /></Card><Card><p className="text-xs text-slate-400 sm:text-sm">Unpaid invoices</p><p className="mt-3 text-3xl font-black">{dashboard.outstandingInvoices.length}</p><PoundSterling className="mt-3 size-5 text-rose-300" /></Card><Card><p className="text-xs text-slate-400 sm:text-sm">Expected profit</p><p className="mt-3 break-words text-2xl font-black text-emerald-300 sm:text-3xl">{money.format(dashboard.expectedProfit)}</p><TrendingUp className="mt-3 size-5 text-emerald-300" /></Card></div></section>
    <ComplianceDashboard />
    <section className="grid gap-6 xl:grid-cols-[1.35fr_1fr]"><Card><h2 className="text-lg font-bold">Recent jobs</h2><div className="mt-5 space-y-3">{dashboard.recentJobs.map((job) => <Link key={job.id} href={`/jobs/${job.id}`} className="flex min-h-14 items-center justify-between gap-3 rounded-xl border border-slate-800 p-3 sm:p-4"><div className="min-w-0"><p className="truncate font-medium">{job.title}</p><p className="truncate text-sm text-slate-500">{job.siteAddress}</p></div><StatusBadge status={job.status} /></Link>)}</div></Card><Card><div className="flex items-center gap-3"><CircleAlert className="size-5 text-amber-300" /><h2 className="text-lg font-bold">Money requiring attention</h2></div><div className="mt-5 space-y-3">{dashboard.urgentInvoices.map((invoice) => <Link key={invoice.id} href={`/invoices?invoice=${encodeURIComponent(invoice.id)}`} className="block min-h-14 rounded-xl border border-slate-800 p-3 sm:p-4"><p className="font-medium">{invoice.number} · {invoice.title}</p><p className="text-sm text-slate-500">Due {invoice.dueDate}</p></Link>)}</div></Card></section>
    <Card><h2 className="text-lg font-bold">Quick actions</h2><div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[["Follow up customers","/crm/follow-ups"],["Open payments","/payments"],["Prepare quote","/quotes"],["Open certificates","/certificates"]].map(([label, href]) => <Link key={href} href={href} className="flex min-h-12 items-center justify-between rounded-xl border border-slate-800 px-4 py-3 text-sm font-medium">{label}<ArrowRight className="size-4" /></Link>)}</div></Card>
  </main>;
}
