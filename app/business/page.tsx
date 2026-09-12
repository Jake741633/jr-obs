"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  BrainCircuit,
  BriefcaseBusiness,
  CheckCircle2,
  CircleGauge,
  FileText,
  PoundSterling,
  ReceiptText,
  ShieldCheck,
  TrendingUp,
  Users,
} from "lucide-react";
import { BusinessManagementCentre } from "../../components/business/BusinessManagementCentre";
import { Card } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";
import { useLocalStorageCollection } from "../../lib/storage";
import type { Builder, Customer, Invoice, Job, PricingDocument } from "../../lib/models";

const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 });

function pricingTotal(document: PricingDocument | Invoice) {
  const subtotal = document.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  return subtotal + (document.vatEnabled ? subtotal * (document.vatRate / 100) : 0);
}

function netDocumentTotal(document: PricingDocument | Invoice) {
  return document.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
}

function clamp(value: number, minimum = 0, maximum = 100) {
  return Math.min(maximum, Math.max(minimum, Math.round(value)));
}

export default function BusinessPage() {
  const [view, setView] = useState<"Setup" | "Health">("Setup");
  const customers = useLocalStorageCollection<Customer>("jr-os-customers");
  const builders = useLocalStorageCollection<Builder>("jr-os-builders");
  const jobs = useLocalStorageCollection<Job>("jr-os-jobs");
  const pricing = useLocalStorageCollection<PricingDocument>("jr-os-pricing-documents");
  const invoices = useLocalStorageCollection<Invoice>("jr-os-invoices");

  const ready = customers.isReady && builders.isReady && jobs.isReady && pricing.isReady && invoices.isReady;

  const intelligence = useMemo(() => {
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const monthLabel = now.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
    const quotes = pricing.items.filter((item) => item.type === "Quote");
    const acceptedQuotes = quotes.filter((item) => item.status === "Accepted");
    const sentQuotes = quotes.filter((item) => ["Sent", "Accepted", "Declined", "Expired"].includes(item.status));
    const openQuotes = quotes.filter((item) => ["Draft", "Sent"].includes(item.status));
    const pipelineValue = openQuotes.reduce((sum, item) => sum + pricingTotal(item), 0);
    const acceptedValue = acceptedQuotes.reduce((sum, item) => sum + pricingTotal(item), 0);
    const quoteConversion = sentQuotes.length ? (acceptedQuotes.length / sentQuotes.length) * 100 : 0;

    const outstandingInvoices = invoices.items.filter((item) => !["Paid", "Cancelled"].includes(item.status));
    const outstandingValue = outstandingInvoices.reduce((sum, item) => sum + Math.max(0, pricingTotal(item) - item.amountPaid), 0);
    const overdueInvoices = outstandingInvoices.filter((item) => item.dueDate && new Date(`${item.dueDate}T23:59:59`).getTime() < now.getTime());
    const overdueValue = overdueInvoices.reduce((sum, item) => sum + Math.max(0, pricingTotal(item) - item.amountPaid), 0);
    const invoicedValue = invoices.items.reduce((sum, item) => sum + pricingTotal(item), 0);
    const collectedValue = invoices.items.reduce((sum, item) => sum + Math.min(pricingTotal(item), item.amountPaid), 0);
    const collectionRate = invoicedValue ? (collectedValue / invoicedValue) * 100 : 100;
    const monthlyInvoices = invoices.items.filter((item) => item.status !== "Cancelled" && item.issueDate.startsWith(monthKey));
    const monthlyRevenue = monthlyInvoices.reduce((sum, item) => sum + netDocumentTotal(item), 0);
    const quotesById = new Map(quotes.map((quote) => [quote.id, quote]));
    const monthlyProfit = monthlyInvoices.reduce((sum, invoice) => {
      const linkedQuote = invoice.quoteId ? quotesById.get(invoice.quoteId) : undefined;
      if (linkedQuote?.profitability) {
        const quoteSellingPrice = linkedQuote.profitability.sellingPrice;
        const invoiceShare = quoteSellingPrice > 0 ? netDocumentTotal(invoice) / quoteSellingPrice : 1;
        return sum + linkedQuote.profitability.expectedProfit * invoiceShare;
      }
      return sum + invoice.items.reduce((lineSum, item) => lineSum + item.quantity * (item.unitPrice - (item.unitCost ?? item.unitPrice)), 0);
    }, 0);

    const activeJobs = jobs.items.filter((item) => !["Complete", "On hold"].includes(item.status));
    const outstandingJobs = jobs.items.filter((item) => item.status !== "Complete");
    const scheduledJobs = jobs.items.filter((item) => item.status === "Scheduled");
    const inProgressJobs = jobs.items.filter((item) => item.status === "In progress");
    const unscheduledActiveJobs = activeJobs.filter((item) => !item.startDate);
    const jobsWithNoValue = activeJobs.filter((item) => !item.value);

    const customerJobCounts = new Map<string, number>();
    const builderJobCounts = new Map<string, number>();
    jobs.items.forEach((job) => {
      if (job.customerId) customerJobCounts.set(job.customerId, (customerJobCounts.get(job.customerId) ?? 0) + 1);
      if (job.builderId) builderJobCounts.set(job.builderId, (builderJobCounts.get(job.builderId) ?? 0) + 1);
    });
    const largestRelationship = Math.max(0, ...customerJobCounts.values(), ...builderJobCounts.values());
    const relationshipConcentration = jobs.items.length ? (largestRelationship / jobs.items.length) * 100 : 0;

    const missingCustomerContacts = customers.items.filter((item) => !item.email && !item.phone).length;
    const missingBuilderContacts = builders.items.filter((item) => !item.email && !item.phone).length;
    const dataIssues = missingCustomerContacts + missingBuilderContacts + unscheduledActiveJobs.length + jobsWithNoValue.length;

    const financeScore = clamp(100 - overdueInvoices.length * 12 - Math.min(35, overdueValue / 250));
    const salesScore = clamp((quoteConversion || (quotes.length ? 35 : 60)) - (openQuotes.length > 8 ? 10 : 0));
    const deliveryScore = clamp(100 - unscheduledActiveJobs.length * 10 - jobsWithNoValue.length * 6 - (inProgressJobs.length > 5 ? 10 : 0));
    const dataScore = clamp(100 - dataIssues * 7);
    const resilienceScore = clamp(100 - Math.max(0, relationshipConcentration - 35));
    const overallScore = clamp((financeScore + salesScore + deliveryScore + dataScore + resilienceScore) / 5);

    const recommendations: { priority: "High" | "Medium" | "Good"; title: string; detail: string; href: string }[] = [];
    if (overdueInvoices.length) recommendations.push({ priority: "High", title: `Chase ${overdueInvoices.length} overdue invoice${overdueInvoices.length === 1 ? "" : "s"}`, detail: `${gbp.format(overdueValue)} is currently overdue and should be followed up before taking on avoidable extra cost.`, href: "/invoices" });
    if (openQuotes.length >= 3) recommendations.push({ priority: "High", title: `Follow up ${openQuotes.length} open quotes`, detail: `${gbp.format(pipelineValue)} remains in the live quote pipeline. Prioritise recent high-value enquiries first.`, href: "/quotes" });
    if (unscheduledActiveJobs.length) recommendations.push({ priority: "Medium", title: `Schedule ${unscheduledActiveJobs.length} active job${unscheduledActiveJobs.length === 1 ? "" : "s"}`, detail: "Adding realistic start dates will improve workload planning and reduce clashes between PAYE work and JR Electrical jobs.", href: "/jobs" });
    if (jobsWithNoValue.length) recommendations.push({ priority: "Medium", title: `Add values to ${jobsWithNoValue.length} live job${jobsWithNoValue.length === 1 ? "" : "s"}`, detail: "Recorded job values make the pipeline and cash-flow view more reliable.", href: "/jobs" });
    if (relationshipConcentration > 45 && jobs.items.length >= 3) recommendations.push({ priority: "Medium", title: "Reduce customer concentration risk", detail: `${Math.round(relationshipConcentration)}% of recorded jobs come from one relationship. Keep building additional lead sources alongside that work.`, href: "/customers" });
    if (!recommendations.length) recommendations.push({ priority: "Good", title: "No urgent business warnings", detail: "Your current records do not show overdue debt, unscheduled live jobs or an overloaded quote pipeline.", href: "/" });

    return {
      quotes,
      openQuotes,
      pipelineValue,
      acceptedValue,
      quoteConversion,
      outstandingInvoices,
      outstandingValue,
      overdueInvoices,
      overdueValue,
      collectionRate,
      monthLabel,
      monthlyInvoices,
      monthlyRevenue,
      monthlyProfit,
      activeJobs,
      outstandingJobs,
      scheduledJobs,
      inProgressJobs,
      relationshipConcentration,
      overallScore,
      financeScore,
      salesScore,
      deliveryScore,
      dataScore,
      resilienceScore,
      recommendations,
    };
  }, [builders.items, customers.items, invoices.items, jobs.items, pricing.items]);

  if (!ready) return <Card>Loading business centre…</Card>;

  const healthTone = intelligence.overallScore >= 80 ? "text-emerald-300" : intelligence.overallScore >= 60 ? "text-amber-300" : "text-red-300";

  return <div className="space-y-6">
    <PageHeader eyebrow="Business administration" title="Business Setup & Company Management" description="Control company details, customer document settings and the live health of JR Electrical Services from one centre." action={<div className="flex flex-wrap gap-2"><Link href="/ai/business-coach" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-fuchsia-500/30 bg-fuchsia-500/10 px-4 text-sm font-semibold text-fuchsia-200 hover:bg-fuchsia-500/20"><BrainCircuit className="size-4" />AI Business Coach</Link><Link href="/" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 text-sm font-semibold text-slate-100 hover:bg-slate-800">Command Centre <ArrowRight className="size-4" /></Link></div>} />

    <div className="grid gap-2 rounded-2xl border border-slate-800 bg-slate-900/70 p-2 sm:grid-cols-2">
      {(["Setup", "Health"] as const).map((item) => <button key={item} type="button" onClick={() => setView(item)} className={`min-h-11 rounded-xl px-4 text-sm font-semibold transition ${view === item ? "bg-cyan-400 text-slate-950" : "text-slate-400 hover:bg-slate-800 hover:text-white"}`}>{item === "Setup" ? "Company management" : "Business health"}</button>)}
    </div>

    {view === "Setup" ? <BusinessManagementCentre /> : <>
    <section className="grid gap-4 lg:grid-cols-[0.8fr_2.2fr]">
      <Card className="border-cyan-400/30">
        <div className="flex items-center justify-between"><div><p className="text-sm text-slate-400">JR OS health score</p><p className={`mt-2 text-6xl font-black ${healthTone}`}>{intelligence.overallScore}</p><p className="mt-1 text-sm text-slate-500">out of 100</p></div><CircleGauge className={`size-12 ${healthTone}`} /></div>
        <p className="mt-5 text-sm text-slate-400">A practical operating score based on debt, quote conversion, scheduling, record quality and customer concentration. It is a guide, not an accounting statement.</p>
      </Card>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Card><PoundSterling className="size-5 text-cyan-300" /><p className="mt-3 text-sm text-slate-400">Monthly revenue</p><p className="mt-2 text-2xl font-bold">{gbp.format(intelligence.monthlyRevenue)}</p><p className="mt-1 text-xs text-slate-500">{intelligence.monthlyInvoices.length} invoice{intelligence.monthlyInvoices.length === 1 ? "" : "s"} in {intelligence.monthLabel}, excluding VAT</p></Card>
        <Card><TrendingUp className="size-5 text-emerald-300" /><p className="mt-3 text-sm text-slate-400">Monthly profit</p><p className={`mt-2 text-2xl font-bold ${intelligence.monthlyProfit >= 0 ? "text-emerald-300" : "text-red-300"}`}>{gbp.format(intelligence.monthlyProfit)}</p><p className="mt-1 text-xs text-slate-500">Expected profit from linked quote data and recorded line costs</p></Card>
        <Card><ReceiptText className="size-5 text-amber-300" /><p className="mt-3 text-sm text-slate-400">Unpaid invoices</p><p className="mt-2 text-2xl font-bold">{intelligence.outstandingInvoices.length}</p><p className="mt-1 text-xs text-slate-500">{gbp.format(intelligence.outstandingValue)} still to collect</p></Card>
        <Card><FileText className="size-5 text-violet-300" /><p className="mt-3 text-sm text-slate-400">Quote conversion</p><p className="mt-2 text-2xl font-bold">{Math.round(intelligence.quoteConversion)}%</p><p className="mt-1 text-xs text-slate-500">{intelligence.quotes.filter((quote) => quote.status === "Accepted").length} accepted quote{intelligence.quotes.filter((quote) => quote.status === "Accepted").length === 1 ? "" : "s"}</p></Card>
        <Card><BriefcaseBusiness className="size-5 text-blue-300" /><p className="mt-3 text-sm text-slate-400">Outstanding jobs</p><p className="mt-2 text-2xl font-bold">{intelligence.outstandingJobs.length}</p><p className="mt-1 text-xs text-slate-500">{intelligence.inProgressJobs.length} in progress · {intelligence.scheduledJobs.length} scheduled</p></Card>
        <Card><Banknote className="size-5 text-fuchsia-300" /><p className="mt-3 text-sm text-slate-400">Collection rate</p><p className="mt-2 text-2xl font-bold">{Math.round(intelligence.collectionRate)}%</p><p className="mt-1 text-xs text-slate-500">of all invoiced value recorded paid</p></Card>
      </div>
    </section>

    <section className="grid gap-4 md:grid-cols-5">
      {([
        ["Finance", intelligence.financeScore, PoundSterling],
        ["Sales", intelligence.salesScore, FileText],
        ["Delivery", intelligence.deliveryScore, BriefcaseBusiness],
        ["Data quality", intelligence.dataScore, ShieldCheck],
        ["Resilience", intelligence.resilienceScore, Users],
      ] as const).map(([label, score, Icon]) => <Card key={label}><div className="flex items-center justify-between"><Icon className="size-5 text-cyan-300" /><span className="text-lg font-bold">{score}</span></div><p className="mt-3 text-sm text-slate-400">{label}</p><div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-cyan-400" style={{ width: `${score}%` }} /></div></Card>)}
    </section>

    <section className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
      <Card>
        <div className="flex items-center gap-3"><AlertTriangle className="size-6 text-amber-300" /><div><h2 className="text-xl font-bold">Smart priorities</h2><p className="text-sm text-slate-500">The highest-value actions based on current records.</p></div></div>
        <div className="mt-5 space-y-3">{intelligence.recommendations.map((item) => <Link key={item.title} href={item.href} className="flex items-start justify-between gap-4 rounded-xl border border-slate-800 bg-slate-950/60 p-4 hover:border-slate-700"><div><div className="flex items-center gap-2"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${item.priority === "High" ? "bg-red-500/10 text-red-300" : item.priority === "Medium" ? "bg-amber-500/10 text-amber-300" : "bg-emerald-500/10 text-emerald-300"}`}>{item.priority}</span><h3 className="font-semibold">{item.title}</h3></div><p className="mt-2 text-sm text-slate-400">{item.detail}</p></div><ArrowRight className="mt-1 size-4 shrink-0 text-slate-500" /></Link>)}</div>
      </Card>

      <Card>
        <div className="flex items-center gap-3"><CheckCircle2 className="size-6 text-emerald-300" /><div><h2 className="text-xl font-bold">Operating snapshot</h2><p className="text-sm text-slate-500">A compact view of sales and workload.</p></div></div>
        <dl className="mt-5 space-y-3 text-sm">
          <div className="flex justify-between gap-4 rounded-xl bg-slate-950 p-3"><dt className="text-slate-400">Quote conversion</dt><dd className="font-semibold">{Math.round(intelligence.quoteConversion)}%</dd></div>
          <div className="flex justify-between gap-4 rounded-xl bg-slate-950 p-3"><dt className="text-slate-400">Accepted quote value</dt><dd className="font-semibold">{gbp.format(intelligence.acceptedValue)}</dd></div>
          <div className="flex justify-between gap-4 rounded-xl bg-slate-950 p-3"><dt className="text-slate-400">Scheduled jobs</dt><dd className="font-semibold">{intelligence.scheduledJobs.length}</dd></div>
          <div className="flex justify-between gap-4 rounded-xl bg-slate-950 p-3"><dt className="text-slate-400">Overdue balance</dt><dd className={intelligence.overdueValue ? "font-semibold text-red-300" : "font-semibold text-emerald-300"}>{gbp.format(intelligence.overdueValue)}</dd></div>
          <div className="flex justify-between gap-4 rounded-xl bg-slate-950 p-3"><dt className="text-slate-400">Largest relationship share</dt><dd className="font-semibold">{Math.round(intelligence.relationshipConcentration)}%</dd></div>
        </dl>
      </Card>
    </section>
    </>}
  </div>;
}
