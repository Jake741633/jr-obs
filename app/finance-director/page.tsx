"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, BrainCircuit, BriefcaseBusiness, CalendarDays, CircleDollarSign, Gauge, LineChart, Users } from "lucide-react";
import { Card } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";
import { useLocalStorageCollection } from "../../lib/storage";
import type { Builder, BusinessExpense, Customer, Invoice, Job, PlannerEntry, PricingDocument, SiteDiaryEntry, StockItem, StockMovement, TeamMember, TimesheetEntry } from "../../lib/models";
import type { DepositRequirement, PaymentRecord, ScheduledCashFlow } from "../../lib/payments";
import { buildJobProfitability, buildRecommendations, cashForecast, confidenceScore, workloadForecast, type JobProfitability } from "../../lib/financeDirector";

const money = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const percent = (value: number) => `${value.toFixed(1)}%`;

type View = "Jobs" | "Customers" | "Builders" | "Categories" | "Monthly";

export default function FinanceDirectorPage() {
  const jobs = useLocalStorageCollection<Job>("jr-os-jobs");
  const pricing = useLocalStorageCollection<PricingDocument>("jr-os-pricing-documents");
  const invoices = useLocalStorageCollection<Invoice>("jr-os-invoices");
  const expenses = useLocalStorageCollection<BusinessExpense>("jr-os-expenses");
  const diaries = useLocalStorageCollection<SiteDiaryEntry>("jr-os-site-diaries");
  const timesheets = useLocalStorageCollection<TimesheetEntry>("jr-os-timesheets");
  const team = useLocalStorageCollection<TeamMember>("jr-os-team");
  const stockItems = useLocalStorageCollection<StockItem>("jr-os-stock-items");
  const stockMovements = useLocalStorageCollection<StockMovement>("jr-os-stock-movements");
  const payments = useLocalStorageCollection<PaymentRecord>("jr-os-payments");
  const deposits = useLocalStorageCollection<DepositRequirement>("jr-os-deposit-requirements");
  const schedules = useLocalStorageCollection<ScheduledCashFlow>("jr-os-scheduled-cash-flow");
  const planner = useLocalStorageCollection<PlannerEntry>("jr-os-planner");
  const customers = useLocalStorageCollection<Customer>("jr-os-customers");
  const builders = useLocalStorageCollection<Builder>("jr-os-builders");
  const [view, setView] = useState<View>("Jobs");
  const [selectedRecommendation, setSelectedRecommendation] = useState(0);

  const jobResults = useMemo(() => buildJobProfitability({ jobs: jobs.items, pricing: pricing.items, invoices: invoices.items, expenses: expenses.items, diaries: diaries.items, timesheets: timesheets.items, team: team.items, stockItems: stockItems.items, stockMovements: stockMovements.items }), [jobs.items, pricing.items, invoices.items, expenses.items, diaries.items, timesheets.items, team.items, stockItems.items, stockMovements.items]);
  const recommendations = useMemo(() => buildRecommendations({ jobs: jobResults, pricing: pricing.items, invoices: invoices.items, deposits: deposits.items, payments: payments.items, schedules: schedules.items, customers: customers.items, builders: builders.items }), [jobResults, pricing.items, invoices.items, deposits.items, payments.items, schedules.items, customers.items, builders.items]);
  const cash = useMemo(() => [7, 30, 90].map((days) => cashForecast(days, invoices.items, payments.items, schedules.items, expenses.items)), [invoices.items, payments.items, schedules.items, expenses.items]);
  const workload = useMemo(() => workloadForecast(planner.items, team.items, jobs.items), [planner.items, team.items, jobs.items]);
  const decided = pricing.items.filter((item) => ["Accepted", "Declined"].includes(item.status));
  const accepted = decided.filter((item) => item.status === "Accepted");
  const acceptedValue = accepted.reduce((sum, item) => sum + item.items.reduce((lineSum, line) => lineSum + line.quantity * line.unitPrice, 0) * (item.vatEnabled ? 1 + item.vatRate / 100 : 1), 0);
  const totalRevenue = jobResults.reduce((sum, job) => sum + job.revenue, 0);
  const totalProfit = jobResults.reduce((sum, job) => sum + job.actualGrossProfit, 0);
  const aggregateMargin = totalRevenue > 0 ? totalProfit / totalRevenue * 100 : 0;

  const grouped = useMemo(() => {
    const map = new Map<string, JobProfitability[]>();
    for (const job of jobResults) {
      let key = job.title;
      if (view === "Customers") key = customers.items.find((item) => item.id === job.customerId)?.name || "No customer";
      if (view === "Builders") key = builders.items.find((item) => item.id === job.builderId)?.companyName || "No builder";
      if (view === "Categories") key = job.category;
      if (view === "Monthly") key = jobs.items.find((item) => item.id === job.jobId)?.startDate?.slice(0, 7) || "Unscheduled";
      map.set(key, [...(map.get(key) || []), job]);
    }
    return [...map.entries()].map(([label, records]) => {
      const revenue = records.reduce((sum, item) => sum + item.revenue, 0);
      const profit = records.reduce((sum, item) => sum + item.actualGrossProfit, 0);
      return { label, records, revenue, profit, margin: revenue > 0 ? profit / revenue * 100 : 0, confidence: confidenceScore(records) };
    }).sort((a, b) => b.revenue - a.revenue);
  }, [view, jobResults, customers.items, builders.items, jobs.items]);

  const allReady = [jobs, pricing, invoices, expenses, diaries, timesheets, team, stockItems, stockMovements, payments, deposits, schedules, planner, customers, builders].every((store) => store.isReady);
  if (!allReady) return <Card>Loading Finance Director…</Card>;
  const selected = recommendations[selectedRecommendation];

  return <div className="space-y-6">
    <PageHeader eyebrow="Deterministic decision support" title="AI Finance Director" description="Profitability, cash and workload intelligence calculated from JR OS records. Inferred values are clearly labelled and are not verified accounting data." action={<Link href="/job-finance" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-700 px-4 text-sm font-semibold">Open job finance <ArrowRight className="size-4" /></Link>} />

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Card><CircleDollarSign className="size-5 text-emerald-300" /><p className="mt-3 text-sm text-slate-400">Calculated gross profit</p><p className="mt-2 text-3xl font-black">{money.format(totalProfit)}</p><p className="text-xs text-slate-500">{percent(aggregateMargin)} aggregate margin</p></Card>
      <Card><Gauge className="size-5 text-cyan-300" /><p className="mt-3 text-sm text-slate-400">Quote conversion</p><p className="mt-2 text-3xl font-black">{decided.length ? percent(accepted.length / decided.length * 100) : "0.0%"}</p><p className="text-xs text-slate-500">{accepted.length} accepted of {decided.length} decided</p></Card>
      <Card><BriefcaseBusiness className="size-5 text-violet-300" /><p className="mt-3 text-sm text-slate-400">Average accepted value</p><p className="mt-2 text-3xl font-black">{money.format(accepted.length ? acceptedValue / accepted.length : 0)}</p><p className="text-xs text-slate-500">Based on accepted quotes and estimates</p></Card>
      <Card><AlertTriangle className="size-5 text-amber-300" /><p className="mt-3 text-sm text-slate-400">Margin warnings</p><p className="mt-2 text-3xl font-black">{jobResults.filter((job) => job.actualTotalCost > 0 && job.actualMargin < 25).length}</p><p className="text-xs text-slate-500">Jobs below 25% target</p></Card>
    </section>

    <section className="grid gap-4 xl:grid-cols-3">{cash.map((item) => <Card key={item.days}><p className="text-sm text-slate-400">Next {item.days} days cash position</p><p className={`mt-2 text-3xl font-black ${item.net < 0 ? "text-rose-300" : "text-emerald-300"}`}>{money.format(item.net)}</p><div className="mt-3 flex justify-between text-xs text-slate-500"><span>In {money.format(item.cashIn)}</span><span>Out {money.format(item.cashOut)}</span></div><p className="mt-2 text-xs text-amber-200">Forecast only: due dates and schedules do not guarantee payment.</p></Card>)}</section>

    <section className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
      <Card><div className="flex items-center gap-3"><BrainCircuit className="size-5 text-cyan-300" /><div><h2 className="text-xl font-bold">Finance Director recommendations</h2><p className="text-sm text-slate-500">Rules-based recommendations, not an external AI service.</p></div></div><div className="mt-5 space-y-3">{recommendations.length ? recommendations.map((item, index) => <button key={item.id} onClick={() => setSelectedRecommendation(index)} className={`w-full rounded-xl border p-4 text-left ${index === selectedRecommendation ? "border-cyan-500/40 bg-cyan-500/5" : "border-slate-800"}`}><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{item.title}</p><p className="mt-1 text-sm text-slate-400">{item.action}</p></div><span className="rounded-full bg-slate-800 px-2 py-1 text-xs">{item.confidence}%</span></div></button>) : <p className="text-sm text-slate-400">No deterministic recommendations can be made from the current records.</p>}</div></Card>
      <Card><h2 className="text-xl font-bold">Why this recommendation?</h2>{selected ? <><p className="mt-3 text-sm text-slate-300">{selected.reason}</p><p className="mt-3 text-xs text-slate-500">Confidence uses record volume 30%, completeness 30%, recency 20%, and result consistency 20%.</p><div className="mt-4 space-y-2">{selected.evidence.map((evidence) => <Link key={`${evidence.id}-${evidence.label}`} href={evidence.href} className="block rounded-xl border border-slate-800 p-3"><div className="flex justify-between gap-3"><p className="font-medium">{evidence.label}</p><span className="text-xs text-cyan-300">{evidence.basis}</span></div><p className="mt-1 text-xs text-slate-500">{evidence.detail}</p></Link>)}</div></> : <p className="mt-3 text-sm text-slate-500">Select a recommendation to see its source records.</p>}</Card>
    </section>

    <Card><div className="flex flex-wrap items-center justify-between gap-4"><div><h2 className="text-xl font-bold">Profitability analysis</h2><p className="text-sm text-slate-500">Switch between job, customer, builder, category and monthly performance.</p></div><div className="flex flex-wrap gap-2">{(["Jobs", "Customers", "Builders", "Categories", "Monthly"] as View[]).map((item) => <button key={item} onClick={() => setView(item)} className={`rounded-xl px-3 py-2 text-sm ${view === item ? "bg-cyan-400 font-semibold text-slate-950" : "border border-slate-700"}`}>{item}</button>)}</div></div><div className="mt-5 overflow-x-auto"><table className="w-full min-w-[920px] text-left text-sm"><thead className="text-xs uppercase text-slate-500"><tr><th className="p-3">{view}</th><th className="p-3">Revenue</th><th className="p-3">Actual cost</th><th className="p-3">Gross profit</th><th className="p-3">Margin</th><th className="p-3">Labour variance</th><th className="p-3">Materials variance</th><th className="p-3">Confidence</th></tr></thead><tbody>{grouped.map((group) => { const actualCost = group.records.reduce((sum, item) => sum + item.actualTotalCost, 0); const labourVariance = group.records.reduce((sum, item) => sum + item.actualLabourCost - item.quotedLabourCost, 0); const materialsVariance = group.records.reduce((sum, item) => sum + item.actualMaterialCost - item.quotedMaterialCost, 0); return <tr key={group.label} className="border-t border-slate-800"><td className="p-3 font-medium">{group.label}<p className="text-xs text-slate-500">{group.records.length} record(s)</p></td><td className="p-3">{money.format(group.revenue)}</td><td className="p-3">{money.format(actualCost)}</td><td className={`p-3 font-semibold ${group.profit < 0 ? "text-rose-300" : "text-emerald-300"}`}>{money.format(group.profit)}</td><td className="p-3">{percent(group.margin)}</td><td className="p-3">{money.format(labourVariance)}</td><td className="p-3">{money.format(materialsVariance)}</td><td className="p-3">{group.confidence}%</td></tr>; })}</tbody></table></div></Card>

    <Card><div className="flex items-center gap-3"><CalendarDays className="size-5 text-violet-300" /><div><h2 className="text-xl font-bold">Workload and revenue forecast</h2><p className="text-sm text-slate-500">Capacity assumes 37.5 hours per active team member per week.</p></div></div><div className="mt-5 grid gap-3 lg:grid-cols-3">{workload.slice(0, 12).map((item) => <div key={item.period} className={`rounded-xl border p-4 ${item.status === "Overbooked" ? "border-rose-500/30" : item.status === "Underbooked" ? "border-amber-500/30" : "border-slate-800"}`}><div className="flex justify-between gap-3"><p className="font-semibold">Week of {item.period}</p><span className="text-xs">{item.status}</span></div><p className="mt-3 text-2xl font-bold">{item.demandHours.toFixed(1)}h / {item.capacityHours.toFixed(1)}h</p><p className="text-xs text-slate-500">{percent(item.utilisation)} utilisation · {money.format(item.expectedRevenue)} linked job value</p></div>)}</div></Card>

    <Card><h2 className="text-xl font-bold">Figure labels</h2><div className="mt-4 grid gap-3 md:grid-cols-3"><div className="rounded-xl border border-emerald-500/20 p-4"><p className="font-semibold text-emerald-300">Recorded</p><p className="mt-1 text-sm text-slate-400">Directly stored invoices, payments, expenses, timesheets and stock movements.</p></div><div className="rounded-xl border border-cyan-500/20 p-4"><p className="font-semibold text-cyan-300">Calculated</p><p className="mt-1 text-sm text-slate-400">Arithmetic derived from recorded JR OS values.</p></div><div className="rounded-xl border border-amber-500/20 p-4"><p className="font-semibold text-amber-300">Inferred</p><p className="mt-1 text-sm text-slate-400">Fallback estimates where actual cost or revenue records are incomplete. Not verified accounting data.</p></div></div></Card>
  </div>;
}
