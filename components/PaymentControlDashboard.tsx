"use client";

import Link from "next/link";
import { AlertTriangle, ArrowRight, Banknote, CalendarClock, CircleDollarSign, WalletCards } from "lucide-react";
import { Card } from "./ui/Card";
import { useLocalStorageCollection } from "../lib/storage";
import type { BusinessExpense, Invoice, Job, PlannerEntry, PricingDocument } from "../lib/models";
import type { DepositRequirement, PaymentRecord, ScheduledCashFlow } from "../lib/payments";
import { allocatedPaid, calculatedInvoiceState, depositAmount, forecastWindow } from "../lib/payments";

export function PaymentControlDashboard() {
  const payments = useLocalStorageCollection<PaymentRecord>("jr-os-payments");
  const deposits = useLocalStorageCollection<DepositRequirement>("jr-os-deposit-requirements");
  const schedules = useLocalStorageCollection<ScheduledCashFlow>("jr-os-scheduled-cash-flow");
  const invoices = useLocalStorageCollection<Invoice>("jr-os-invoices");
  const documents = useLocalStorageCollection<PricingDocument>("jr-os-pricing-documents");
  const jobs = useLocalStorageCollection<Job>("jr-os-jobs");
  const planner = useLocalStorageCollection<PlannerEntry>("jr-os-planner");
  const expenses = useLocalStorageCollection<BusinessExpense>("jr-os-expenses");
  const ready = [payments, deposits, schedules, invoices, documents, jobs, planner, expenses].every((store) => store.isReady);
  if (!ready) return null;

  const today = new Date().toISOString().slice(0, 10);
  const overdue = invoices.items.filter((invoice) => calculatedInvoiceState(invoice, payments.items) === "Overdue");
  const partPaid = invoices.items.filter((invoice) => calculatedInvoiceState(invoice, payments.items) === "Part paid");
  const unallocated = payments.items.filter((payment) => !payment.invoiceId || payment.reconciliationStatus === "Needs review");
  const sevenDay = forecastWindow(7, invoices.items, payments.items, schedules.items, expenses.items);
  const missingDeposits = documents.items.filter((document) => document.status === "Accepted").filter((document) => {
    const requirement = deposits.items.find((item) => item.pricingDocumentId === document.id);
    if (!requirement) return false;
    const job = jobs.items.find((item) => item.id === document.jobId);
    const firstVisit = planner.items.filter((item) => item.jobId === document.jobId && item.status !== "Cancelled").sort((a, b) => a.date.localeCompare(b.date))[0];
    const workDate = firstVisit?.date || job?.startDate;
    if (!workDate || workDate < today) return false;
    const depositInvoices = invoices.items.filter((invoice) => invoice.quoteId === document.id && invoice.title.toLowerCase().includes("deposit"));
    const received = depositInvoices.reduce((sum, invoice) => sum + allocatedPaid(invoice.id, payments.items), 0);
    return received < depositAmount(document, requirement);
  });

  const warnings = [
    { label: "Overdue invoices", value: overdue.length, icon: AlertTriangle },
    { label: "Deposits needed before work", value: missingDeposits.length, icon: CalendarClock },
    { label: "Part-paid invoices", value: partPaid.length, icon: WalletCards },
    { label: "Payments needing review", value: unallocated.length, icon: Banknote },
  ];

  return <section className="space-y-4">
    <div className="flex items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">Cash control</p><h2 className="mt-1 text-2xl font-bold">Payments and cash-flow warnings</h2></div><Link href="/payments" className="inline-flex items-center gap-2 text-sm font-semibold text-cyan-300">Open payments <ArrowRight className="size-4" /></Link></div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">{warnings.map(({ label, value, icon: Icon }) => <Card key={label}><Icon className="size-5 text-amber-300" /><p className="mt-3 text-sm text-slate-400">{label}</p><p className="mt-2 text-3xl font-bold">{value}</p></Card>)}<Card><CircleDollarSign className={`size-5 ${sevenDay.net < 0 ? "text-rose-300" : "text-emerald-300"}`} /><p className="mt-3 text-sm text-slate-400">7-day forecast</p><p className={`mt-2 text-3xl font-bold ${sevenDay.net < 0 ? "text-rose-300" : "text-emerald-300"}`}>{new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(sevenDay.net)}</p><p className="mt-1 text-xs text-slate-500">{sevenDay.net < 0 ? "Expected cash shortfall" : "Positive expected movement"}</p></Card></div>
  </section>;
}
