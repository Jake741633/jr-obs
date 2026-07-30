"use client";

import Link from "next/link";
import { AlertTriangle, ArrowRight, BrainCircuit, CalendarClock, TrendingUp } from "lucide-react";
import { Card } from "./ui/Card";
import { useLocalStorageCollection } from "../lib/storage";
import type { BusinessExpense, Invoice, Job, PlannerEntry, PricingDocument, SiteDiaryEntry, StockItem, StockMovement, TeamMember, TimesheetEntry, Customer, Builder } from "../lib/models";
import type { DepositRequirement, PaymentRecord, ScheduledCashFlow } from "../lib/payments";
import { buildJobProfitability, buildRecommendations, cashForecast, workloadForecast } from "../lib/financeDirector";

const money = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 });

export function FinanceDirectorInsights() {
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
  const stores = [jobs, pricing, invoices, expenses, diaries, timesheets, team, stockItems, stockMovements, payments, deposits, schedules, planner, customers, builders];
  if (!stores.every((store) => store.isReady)) return <Card>Loading Finance Director insights…</Card>;
  const profitability = buildJobProfitability({ jobs: jobs.items, pricing: pricing.items, invoices: invoices.items, expenses: expenses.items, diaries: diaries.items, timesheets: timesheets.items, team: team.items, stockItems: stockItems.items, stockMovements: stockMovements.items });
  const recommendations = buildRecommendations({ jobs: profitability, pricing: pricing.items, invoices: invoices.items, deposits: deposits.items, payments: payments.items, schedules: schedules.items, customers: customers.items, builders: builders.items });
  const cash = cashForecast(7, invoices.items, payments.items, schedules.items, expenses.items);
  const workload = workloadForecast(planner.items, team.items, jobs.items, 4);
  const lowMargin = profitability.filter((job) => job.actualTotalCost > 0 && job.actualMargin < 25);
  const diaryGaps = workload.filter((week) => week.status === "Underbooked");
  return <section className="space-y-4"><div className="flex items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">Finance Director</p><h2 className="mt-1 text-2xl font-bold">Profit, cash and diary intelligence</h2></div><Link href="/finance-director" className="inline-flex items-center gap-2 text-sm font-semibold text-cyan-300">Open dashboard <ArrowRight className="size-4" /></Link></div><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Card><TrendingUp className="size-5 text-emerald-300" /><p className="mt-3 text-sm text-slate-400">7-day cash position</p><p className={`mt-2 text-2xl font-black ${cash.net < 0 ? "text-rose-300" : "text-emerald-300"}`}>{money.format(cash.net)}</p><p className="text-xs text-slate-500">Forecast, not guaranteed cash</p></Card><Card><AlertTriangle className="size-5 text-amber-300" /><p className="mt-3 text-sm text-slate-400">Low-margin jobs</p><p className="mt-2 text-2xl font-black">{lowMargin.length}</p><p className="text-xs text-slate-500">Below 25% calculated margin</p></Card><Card><BrainCircuit className="size-5 text-cyan-300" /><p className="mt-3 text-sm text-slate-400">Recommendations</p><p className="mt-2 text-2xl font-black">{recommendations.length}</p><p className="text-xs text-slate-500">Rules-based from JR OS records</p></Card><Card><CalendarClock className="size-5 text-violet-300" /><p className="mt-3 text-sm text-slate-400">Diary gaps</p><p className="mt-2 text-2xl font-black">{diaryGaps.length}</p><p className="text-xs text-slate-500">Underbooked weeks in next month</p></Card></div>{recommendations[0] ? <Card className="border-cyan-500/20"><div className="flex items-start justify-between gap-4"><div><p className="text-sm font-semibold text-cyan-300">Top action</p><h3 className="mt-1 text-lg font-bold">{recommendations[0].title}</h3><p className="mt-1 text-sm text-slate-400">{recommendations[0].action}</p></div><span className="rounded-full bg-slate-800 px-3 py-1 text-xs">{recommendations[0].confidence}% confidence</span></div></Card> : null}</section>;
}
