"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AlertTriangle, BriefcaseBusiness, Clock3, FileWarning, ReceiptText, ShoppingCart, TrendingUp, WalletCards } from "lucide-react";
import { Card } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";
import { isAcceptedVariationStatus, variationFinancials } from "../../lib/jobManagement-core.mjs";
import { useLocalStorageCollection } from "../../lib/storage";
import type { Invoice, Job, JobVariation, PricingDocument, PurchaseList, SiteDiaryEntry } from "../../lib/models";

const money = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });

function documentNet(document: PricingDocument | Invoice) {
  return document.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
}

function documentTotal(document: PricingDocument | Invoice) {
  const net = documentNet(document);
  return net + (document.vatEnabled ? net * document.vatRate / 100 : 0);
}

function diaryHours(entry: SiteDiaryEntry) {
  if (!entry.startedAt || !entry.finishedAt) return 0;
  const start = new Date(`${entry.workDate}T${entry.startedAt}`).getTime();
  const finish = new Date(`${entry.workDate}T${entry.finishedAt}`).getTime();
  return Math.max(0, (finish - start) / 3_600_000 - entry.breakMinutes / 60);
}

export default function JobFinancePage() {
  const jobs = useLocalStorageCollection<Job>("jr-os-jobs");
  const pricing = useLocalStorageCollection<PricingDocument>("jr-os-pricing-documents");
  const invoices = useLocalStorageCollection<Invoice>("jr-os-invoices");
  const variations = useLocalStorageCollection<JobVariation>("jr-os-job-variations");
  const purchases = useLocalStorageCollection<PurchaseList>("jr-os-purchase-lists");
  const diaries = useLocalStorageCollection<SiteDiaryEntry>("jr-os-site-diaries");
  const [selectedJobId, setSelectedJobId] = useState("");

  const rows = useMemo(() => jobs.items.map((job) => {
    const jobQuotes = pricing.items.filter((item) => item.jobId === job.id);
    const acceptedQuote = jobQuotes.find((item) => item.status === "Accepted") || jobQuotes[0];
    const contractValue = acceptedQuote ? documentTotal(acceptedQuote) : (job.originalContractValue ?? job.value);
    const jobVariations = variations.items.filter((item) => item.jobId === job.id);
    const approvedVariations = jobVariations.filter((item) => isAcceptedVariationStatus(item.status));
    const variationRevenue = approvedVariations.reduce((sum, item) => sum + variationFinancials(item).sellingPrice, 0);
    const variationCost = approvedVariations.reduce((sum, item) => sum + variationFinancials(item).costPrice, 0);
    const jobPurchases = purchases.items.filter((item) => item.jobId === job.id);
    const materialSpend = jobPurchases.flatMap((item) => item.items).filter((item) => item.status === "Ordered" || item.status === "Delivered").reduce((sum, item) => sum + item.quantity * item.unitCost, 0);
    const quotedInternalCost = acceptedQuote?.items.reduce((sum, item) => sum + item.quantity * (item.unitCost ?? item.unitPrice), 0) ?? 0;
    const jobDiaries = diaries.items.filter((item) => item.jobId === job.id);
    const loggedHours = jobDiaries.reduce((sum, item) => sum + diaryHours(item), 0);
    const jobInvoices = invoices.items.filter((item) => item.jobId === job.id && item.status !== "Cancelled");
    const invoiced = jobInvoices.reduce((sum, item) => sum + documentTotal(item), 0);
    const paid = jobInvoices.reduce((sum, item) => sum + item.amountPaid, 0);
    const forecastRevenue = contractValue + variationRevenue;
    const knownCost = Math.max(quotedInternalCost, materialSpend) + variationCost;
    const forecastProfit = forecastRevenue - knownCost;
    const margin = forecastRevenue > 0 ? forecastProfit / forecastRevenue * 100 : 0;
    const outstanding = Math.max(0, invoiced - paid);
    const uninvoiced = Math.max(0, forecastRevenue - invoiced);
    return { job, contractValue, variationRevenue, forecastRevenue, knownCost, forecastProfit, margin, invoiced, paid, outstanding, uninvoiced, loggedHours, openVariations: jobVariations.filter((item) => item.status === "Draft" || item.status === "Sent" || item.status === "Awaiting approval").length };
  }), [diaries.items, invoices.items, jobs.items, pricing.items, purchases.items, variations.items]);

  const visibleRows = selectedJobId ? rows.filter((row) => row.job.id === selectedJobId) : rows;
  const totals = visibleRows.reduce((sum, row) => ({
    revenue: sum.revenue + row.forecastRevenue,
    profit: sum.profit + row.forecastProfit,
    invoiced: sum.invoiced + row.invoiced,
    paid: sum.paid + row.paid,
    outstanding: sum.outstanding + row.outstanding,
    uninvoiced: sum.uninvoiced + row.uninvoiced,
  }), { revenue: 0, profit: 0, invoiced: 0, paid: 0, outstanding: 0, uninvoiced: 0 });

  const ready = jobs.isReady && pricing.isReady && invoices.isReady && variations.isReady && purchases.isReady && diaries.isReady;
  if (!ready) return <Card>Loading job finances…</Card>;

  return <div className="space-y-6">
    <PageHeader eyebrow="Financial control" title="Job Finance" description="See contract value, approved variations, known costs, profit, invoicing and cash collection for every job." />

    <select value={selectedJobId} onChange={(event) => setSelectedJobId(event.target.value)} className="min-h-11 w-full rounded-xl border border-slate-800 bg-slate-900 px-4 text-sm md:max-w-md"><option value="">All jobs</option>{jobs.items.map((job) => <option key={job.id} value={job.id}>{job.title}</option>)}</select>

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Card><WalletCards className="size-5 text-cyan-300" /><p className="mt-3 text-sm text-slate-400">Forecast revenue</p><p className="mt-2 text-3xl font-bold">{money.format(totals.revenue)}</p></Card>
      <Card><TrendingUp className="size-5 text-emerald-300" /><p className="mt-3 text-sm text-slate-400">Forecast profit</p><p className="mt-2 text-3xl font-bold">{money.format(totals.profit)}</p></Card>
      <Card><ReceiptText className="size-5 text-violet-300" /><p className="mt-3 text-sm text-slate-400">Invoiced</p><p className="mt-2 text-3xl font-bold">{money.format(totals.invoiced)}</p></Card>
      <Card><AlertTriangle className="size-5 text-amber-300" /><p className="mt-3 text-sm text-slate-400">Still to invoice</p><p className="mt-2 text-3xl font-bold">{money.format(totals.uninvoiced)}</p></Card>
    </section>

    {visibleRows.length === 0 ? <Card><p className="text-sm text-slate-400">No jobs available for this selection.</p></Card> : <div className="space-y-4">{visibleRows.map((row) => <Card key={row.job.id} className={row.margin < 20 && row.forecastRevenue > 0 ? "border-amber-500/30" : undefined}>
      <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">{row.job.status}</p><h2 className="mt-1 text-2xl font-bold">{row.job.title}</h2><p className="mt-1 text-sm text-slate-500">{row.job.siteAddress}</p></div><Link href={`/jobs/${row.job.id}`} className="inline-flex min-h-10 items-center rounded-xl border border-slate-700 px-3 text-sm font-semibold hover:bg-slate-800"><BriefcaseBusiness className="mr-2 size-4" />Open job</Link></div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl bg-slate-950 p-3"><p className="text-xs text-slate-500">Contract + extras</p><p className="mt-1 font-bold">{money.format(row.forecastRevenue)}</p><p className="text-xs text-slate-500">Extras {money.format(row.variationRevenue)}</p></div>
        <div className="rounded-xl bg-slate-950 p-3"><p className="text-xs text-slate-500">Known cost</p><p className="mt-1 font-bold">{money.format(row.knownCost)}</p><p className="text-xs text-slate-500">Based on quote costs and committed purchasing</p></div>
        <div className="rounded-xl bg-slate-950 p-3"><p className="text-xs text-slate-500">Forecast profit</p><p className="mt-1 font-bold">{money.format(row.forecastProfit)}</p><p className={`text-xs ${row.margin < 20 ? "text-amber-300" : "text-emerald-300"}`}>{row.margin.toFixed(1)}% margin</p></div>
        <div className="rounded-xl bg-slate-950 p-3"><p className="text-xs text-slate-500">Cash position</p><p className="mt-1 font-bold">{money.format(row.paid)} paid</p><p className="text-xs text-slate-500">{money.format(row.outstanding)} outstanding</p></div>
      </div>
      <div className="mt-4 flex flex-wrap gap-4 border-t border-slate-800 pt-4 text-sm text-slate-400"><span className="flex items-center gap-2"><Clock3 className="size-4 text-cyan-400" />{row.loggedHours.toFixed(1)}h logged</span><span className="flex items-center gap-2"><FileWarning className="size-4 text-amber-300" />{row.openVariations} open variations</span><span className="flex items-center gap-2"><ShoppingCart className="size-4 text-violet-300" />{money.format(row.uninvoiced)} not yet invoiced</span></div>
    </Card>)}</div>}
  </div>;
}
