"use client";

import Link from "next/link";
import { useMemo } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BrainCircuit,
  CircleAlert,
  FileText,
  Percent,
  PoundSterling,
  ReceiptText,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { AiToolNav } from "../../../components/ai/AiToolNav";
import { SmartRecommendations } from "../../../components/ai/SmartRecommendations";
import { Card } from "../../../components/ui/Card";
import { PageHeader } from "../../../components/ui/PageHeader";
import { buildBusinessCoach } from "../../../lib/aiCommandCentre";
import { useLocalStorageCollection } from "../../../lib/storage";
import { pricingDocumentTotal } from "../../../lib/workflow";
import type {
  AiReminder,
  ElectricalCertificate,
  Invoice,
  Job,
  LabourCostSettings,
  PricingDocument,
} from "../../../lib/models";

const money = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 });
const defaultLabourSettings: LabourCostSettings = {
  id: "labour-cost-settings",
  workingDaysPerYear: 220,
  billableHoursPerDay: 7.5,
  targetNetMargin: 25,
  contingencyPercent: 10,
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
};

function trendLabel(value: number | null) {
  if (value === null) return "New activity";
  if (value === 0) return "No change";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

export default function AiBusinessCoachPage() {
  const documents = useLocalStorageCollection<PricingDocument>("jr-os-pricing-documents");
  const invoices = useLocalStorageCollection<Invoice>("jr-os-invoices");
  const jobs = useLocalStorageCollection<Job>("jr-os-jobs");
  const certificates = useLocalStorageCollection<ElectricalCertificate>("jr-os-certificates");
  const reminders = useLocalStorageCollection<AiReminder>("jr-os-ai-reminders");
  const labourSettingsStore = useLocalStorageCollection<LabourCostSettings>("jr-os-labour-cost-settings", [defaultLabourSettings]);
  const labourSettings = labourSettingsStore.items[0] ?? defaultLabourSettings;
  const ready = [documents, invoices, jobs, certificates, reminders, labourSettingsStore].every((store) => store.isReady);
  const coach = useMemo(
    () => buildBusinessCoach({
      documents: documents.items,
      invoices: invoices.items,
      jobs: jobs.items,
      certificates: certificates.items,
      reminders: reminders.items,
      labourSettings,
    }),
    [certificates.items, documents.items, invoices.items, jobs.items, labourSettings, reminders.items],
  );

  const context = useMemo(() => {
    const openQuotes = documents.items.filter((document) => document.type === "Quote" && ["Draft", "Sent"].includes(document.status));
    const acceptedQuotes = documents.items.filter((document) => document.type === "Quote" && document.status === "Accepted");
    const activeJobs = jobs.items.filter((job) => !["Complete", "On hold"].includes(job.status));
    const expectedPipelineProfit = documents.items
      .filter((document) => document.type === "Quote" && ["Sent", "Accepted"].includes(document.status))
      .reduce((sum, document) => sum + (document.profitability?.expectedProfit ?? 0), 0);
    const averageMonthlyRevenue = coach.months.reduce((sum, month) => sum + month.revenue, 0) / Math.max(1, coach.months.length);
    const strongestMonth = coach.months.reduce((best, month) => month.revenue > best.revenue ? month : best, coach.months[0]);
    return {
      openQuotes,
      acceptedQuotes,
      activeJobs,
      expectedPipelineProfit,
      averageMonthlyRevenue,
      strongestMonth,
      pipelineValue: openQuotes.reduce((sum, document) => sum + pricingDocumentTotal(document), 0),
    };
  }, [coach.months, documents.items, jobs.items]);

  if (!ready) return <Card>Preparing AI Business Coach…</Card>;

  const revenueUp = (coach.revenueTrendPercent ?? 0) >= 0;
  const profitUp = (coach.profitTrendPercent ?? 0) >= 0;

  return (
    <main className="space-y-6">
      <PageHeader
        eyebrow="AI Command Centre"
        title="AI Business Coach"
        description="Analyse quote conversion, expected margins, invoiced revenue, unpaid balances and month-to-month business trends from JR OS records."
        action={<Link href="/ai" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 text-sm font-semibold hover:bg-slate-800"><ArrowLeft className="size-4" />Command Centre</Link>}
      />
      <AiToolNav />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Card>
          <div className="flex items-start justify-between"><TrendingUp className="size-5 text-emerald-300" />{revenueUp ? <TrendingUp className="size-4 text-emerald-300" /> : <TrendingDown className="size-4 text-red-300" />}</div>
          <p className="mt-3 text-sm text-slate-400">Monthly revenue</p>
          <p className="mt-2 text-3xl font-bold">{money.format(coach.monthlyRevenue)}</p>
          <p className={`mt-2 text-xs font-semibold ${revenueUp ? "text-emerald-300" : "text-red-300"}`}>{trendLabel(coach.revenueTrendPercent)} from last month</p>
        </Card>
        <Card>
          <div className="flex items-start justify-between"><BrainCircuit className="size-5 text-cyan-300" />{profitUp ? <TrendingUp className="size-4 text-emerald-300" /> : <TrendingDown className="size-4 text-red-300" />}</div>
          <p className="mt-3 text-sm text-slate-400">Expected monthly profit</p>
          <p className={`mt-2 text-3xl font-bold ${coach.monthlyProfit >= 0 ? "text-emerald-300" : "text-red-300"}`}>{money.format(coach.monthlyProfit)}</p>
          <p className={`mt-2 text-xs font-semibold ${profitUp ? "text-emerald-300" : "text-red-300"}`}>{trendLabel(coach.profitTrendPercent)} from last month</p>
        </Card>
        <Card>
          <Percent className="size-5 text-violet-300" />
          <p className="mt-3 text-sm text-slate-400">Quote conversion</p>
          <p className="mt-2 text-3xl font-bold">{coach.quoteConversion.toFixed(1)}%</p>
          <p className="mt-2 text-xs text-slate-500">{context.acceptedQuotes.length} accepted quote{context.acceptedQuotes.length === 1 ? "" : "s"} recorded</p>
        </Card>
        <Card>
          <PoundSterling className="size-5 text-amber-300" />
          <p className="mt-3 text-sm text-slate-400">Average net margin</p>
          <p className={`mt-2 text-3xl font-bold ${coach.averageNetMargin >= labourSettings.targetNetMargin ? "text-emerald-300" : "text-amber-300"}`}>{coach.averageNetMargin.toFixed(1)}%</p>
          <p className="mt-2 text-xs text-slate-500">Target {labourSettings.targetNetMargin.toFixed(1)}%</p>
        </Card>
        <Card>
          <ReceiptText className="size-5 text-red-300" />
          <p className="mt-3 text-sm text-slate-400">Unpaid invoices</p>
          <p className="mt-2 text-3xl font-bold">{money.format(coach.unpaidInvoiceValue)}</p>
          <p className="mt-2 text-xs text-slate-500">{coach.unpaidInvoiceCount} unpaid · {coach.overdueInvoiceCount} overdue</p>
        </Card>
        <Card>
          <FileText className="size-5 text-blue-300" />
          <p className="mt-3 text-sm text-slate-400">Open quote pipeline</p>
          <p className="mt-2 text-3xl font-bold">{money.format(context.pipelineValue)}</p>
          <p className="mt-2 text-xs text-slate-500">{context.openQuotes.length} draft or sent quote{context.openQuotes.length === 1 ? "" : "s"}</p>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
        <Card>
          <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">Six-month trend</p><h2 className="mt-1 text-xl font-bold">Revenue and expected profit</h2></div><Link href="/business" className="inline-flex items-center gap-2 text-sm font-semibold text-cyan-300">Business health <ArrowRight className="size-4" /></Link></div>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[620px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wider text-slate-500"><tr><th className="border-b border-slate-800 px-3 py-3">Month</th><th className="border-b border-slate-800 px-3 py-3">Revenue</th><th className="border-b border-slate-800 px-3 py-3">Expected profit</th><th className="border-b border-slate-800 px-3 py-3">Invoices</th><th className="border-b border-slate-800 px-3 py-3">Quote conversion</th></tr></thead>
              <tbody>
                {coach.months.map((month) => {
                  const conversion = month.decidedQuotes ? (month.acceptedQuotes / month.decidedQuotes) * 100 : 0;
                  return <tr key={month.key} className="border-b border-slate-800/70 last:border-0"><td className="px-3 py-4 font-semibold">{month.label}</td><td className="px-3 py-4">{money.format(month.revenue)}</td><td className={`px-3 py-4 font-semibold ${month.expectedProfit >= 0 ? "text-emerald-300" : "text-red-300"}`}>{money.format(month.expectedProfit)}</td><td className="px-3 py-4 text-slate-400">{month.invoiceCount}</td><td className="px-3 py-4 text-slate-400">{month.decidedQuotes ? `${conversion.toFixed(0)}%` : "No decisions"}</td></tr>;
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-xs text-slate-500">Revenue is based on non-cancelled invoice lines excluding VAT. Expected profit uses linked Quote Engine profitability where available.</p>
        </Card>

        <Card>
          <div className="flex items-center gap-3"><CircleAlert className="size-5 text-amber-300" /><div><h2 className="text-xl font-bold">Coach&apos;s snapshot</h2><p className="text-sm text-slate-500">Useful context behind the recommendations.</p></div></div>
          <dl className="mt-5 space-y-3 text-sm">
            <div className="rounded-xl bg-slate-950 p-3"><dt className="text-slate-500">Six-month monthly average</dt><dd className="mt-1 font-semibold">{money.format(context.averageMonthlyRevenue)}</dd></div>
            <div className="rounded-xl bg-slate-950 p-3"><dt className="text-slate-500">Strongest recorded month</dt><dd className="mt-1 font-semibold">{context.strongestMonth.label} · {money.format(context.strongestMonth.revenue)}</dd></div>
            <div className="rounded-xl bg-slate-950 p-3"><dt className="text-slate-500">Expected pipeline profit</dt><dd className="mt-1 font-semibold text-emerald-300">{money.format(context.expectedPipelineProfit)}</dd></div>
            <div className="rounded-xl bg-slate-950 p-3"><dt className="text-slate-500">Active workload</dt><dd className="mt-1 font-semibold">{context.activeJobs.length} job{context.activeJobs.length === 1 ? "" : "s"}</dd></div>
          </dl>
        </Card>
      </section>

      <SmartRecommendations recommendations={coach.coaching} />

      <Card>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 className="font-bold">Keep the coach accurate</h2><p className="mt-1 text-sm text-slate-500">Update quote outcomes, line costs, invoice payments and job status promptly. Missing history produces a cautious result rather than invented figures.</p></div>
          <div className="flex flex-wrap gap-2"><Link href="/quotes" className="inline-flex min-h-11 items-center rounded-xl border border-slate-700 px-4 text-sm font-semibold hover:bg-slate-800">Update quotes</Link><Link href="/invoices" className="inline-flex min-h-11 items-center rounded-xl border border-slate-700 px-4 text-sm font-semibold hover:bg-slate-800">Update invoices</Link></div>
        </div>
      </Card>
    </main>
  );
}
