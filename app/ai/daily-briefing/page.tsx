"use client";

import Link from "next/link";
import { AlertTriangle, ArrowLeft, ArrowRight, BriefcaseBusiness, CalendarDays, ClipboardCheck, FileText, PackageCheck, ReceiptText, Star } from "lucide-react";
import { Card } from "../../../components/ui/Card";
import { PageHeader } from "../../../components/ui/PageHeader";
import { useLocalStorageCollection } from "../../../lib/storage";
import type { CustomerProfile, ElectricalCertificate, Invoice, Job, PlannerEntry, PricingDocument, PurchaseList, SiteSurvey } from "../../../lib/models";

const money = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 });
const today = new Date().toISOString().slice(0, 10);
const now = Date.now();

function documentTotal(document: PricingDocument | Invoice) {
  const subtotal = document.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  return subtotal + (document.vatEnabled ? subtotal * (document.vatRate / 100) : 0);
}

export default function DailyBriefingPage() {
  const jobs = useLocalStorageCollection<Job>("jr-os-jobs");
  const planner = useLocalStorageCollection<PlannerEntry>("jr-os-planner");
  const pricing = useLocalStorageCollection<PricingDocument>("jr-os-pricing-documents");
  const invoices = useLocalStorageCollection<Invoice>("jr-os-invoices");
  const surveys = useLocalStorageCollection<SiteSurvey>("jr-os-surveys");
  const purchases = useLocalStorageCollection<PurchaseList>("jr-os-purchase-lists");
  const certificates = useLocalStorageCollection<ElectricalCertificate>("jr-os-certificates");
  const profiles = useLocalStorageCollection<CustomerProfile>("jr-os-customer-profiles");

  const ready = jobs.isReady && planner.isReady && pricing.isReady && invoices.isReady && surveys.isReady && purchases.isReady && certificates.isReady && profiles.isReady;

  const todaysJobs = jobs.items.filter((job) => job.startDate === today && job.status !== "Complete" && job.status !== "On hold");
  const todaysPlanner = planner.items.filter((entry) => entry.date === today && entry.status !== "Cancelled");
  const surveysDue = surveys.items.filter((survey) => survey.status !== "Complete");
  const sentQuotes = pricing.items.filter((item) => item.type === "Quote" && item.status === "Sent");
  const overdueInvoices = invoices.items.filter((invoice) => invoice.status !== "Paid" && invoice.status !== "Cancelled" && invoice.dueDate && new Date(`${invoice.dueDate}T23:59:59`).getTime() < now);
  const overdueValue = overdueInvoices.reduce((sum, invoice) => sum + Math.max(0, documentTotal(invoice) - invoice.amountPaid), 0);
  const purchaseAttention = purchases.items.filter((list) => list.items.some((item) => item.status === "Needed" || item.status === "Ordered"));
  const certificatesToIssue = certificates.items.filter((certificate) => certificate.status === "Complete");
  const reviewsToRequest = profiles.items.filter((profile) => profile.reviewStatus === "Not requested");

  const attentionCount = overdueInvoices.length + sentQuotes.length + surveysDue.length + purchaseAttention.length + certificatesToIssue.length;

  if (!ready) return <Card>Preparing daily briefing…</Card>;

  const sections = [
    { title: "Today's jobs", detail: `${todaysJobs.length} job${todaysJobs.length === 1 ? "" : "s"} starting today`, href: "/jobs", icon: BriefcaseBusiness, items: todaysJobs.slice(0, 4).map((job) => `${job.title} · ${job.siteAddress || "No address"}`) },
    { title: "Today's planner", detail: `${todaysPlanner.length} confirmed or planned entr${todaysPlanner.length === 1 ? "y" : "ies"}`, href: "/planner", icon: CalendarDays, items: todaysPlanner.slice(0, 4).map((entry) => `${entry.startTime || "Time TBC"} · ${entry.title}`) },
    { title: "Quote follow-ups", detail: `${sentQuotes.length} sent quote${sentQuotes.length === 1 ? "" : "s"}`, href: "/quotes", icon: FileText, items: sentQuotes.slice(0, 4).map((quote) => `${quote.number} · ${quote.title || "Untitled"} · ${money.format(documentTotal(quote))}`) },
    { title: "Overdue invoices", detail: `${money.format(overdueValue)} overdue`, href: "/invoices", icon: ReceiptText, items: overdueInvoices.slice(0, 4).map((invoice) => `${invoice.number} · ${invoice.title} · ${money.format(Math.max(0, documentTotal(invoice) - invoice.amountPaid))}`) },
    { title: "Survey queue", detail: `${surveysDue.length} incomplete survey${surveysDue.length === 1 ? "" : "s"}`, href: "/surveys", icon: ClipboardCheck, items: surveysDue.slice(0, 4).map((survey) => `${survey.number} · ${survey.status}`) },
    { title: "Materials and orders", detail: `${purchaseAttention.length} purchase list${purchaseAttention.length === 1 ? "" : "s"} need attention`, href: "/purchases", icon: PackageCheck, items: purchaseAttention.slice(0, 4).map((list) => `${list.number} · ${list.title}`) },
    { title: "Certificates to issue", detail: `${certificatesToIssue.length} completed certificate${certificatesToIssue.length === 1 ? "" : "s"}`, href: "/certificates", icon: AlertTriangle, items: certificatesToIssue.slice(0, 4).map((certificate) => `${certificate.number} · ${certificate.type}`) },
    { title: "Reviews to request", detail: `${reviewsToRequest.length} customer${reviewsToRequest.length === 1 ? "" : "s"} not yet asked`, href: "/crm", icon: Star, items: reviewsToRequest.slice(0, 4).map((profile) => profile.followUpReason || "Customer review request") },
  ];

  return <main className="space-y-6">
    <PageHeader eyebrow="JR AI" title="Daily briefing" description="A practical start-of-day view built from the records already saved in JR OS." action={<Link href="/ai" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 text-sm font-semibold hover:bg-slate-800"><ArrowLeft className="size-4" />AI Office</Link>} />

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Card><BriefcaseBusiness className="size-5 text-cyan-300" /><p className="mt-3 text-sm text-slate-400">Jobs today</p><p className="mt-2 text-3xl font-bold">{todaysJobs.length}</p></Card>
      <Card><CalendarDays className="size-5 text-cyan-300" /><p className="mt-3 text-sm text-slate-400">Planner entries</p><p className="mt-2 text-3xl font-bold">{todaysPlanner.length}</p></Card>
      <Card><ReceiptText className="size-5 text-red-300" /><p className="mt-3 text-sm text-slate-400">Overdue money</p><p className="mt-2 text-3xl font-bold">{money.format(overdueValue)}</p></Card>
      <Card><AlertTriangle className="size-5 text-amber-300" /><p className="mt-3 text-sm text-slate-400">Attention items</p><p className="mt-2 text-3xl font-bold">{attentionCount}</p></Card>
    </section>

    <section className="grid gap-4 lg:grid-cols-2">
      {sections.map(({ title, detail, href, icon: Icon, items }) => <Card key={title}>
        <div className="flex items-start justify-between gap-4"><div className="flex items-start gap-3"><Icon className="mt-0.5 size-5 text-cyan-300" /><div><h2 className="font-bold">{title}</h2><p className="text-sm text-slate-500">{detail}</p></div></div><Link href={href} className="text-cyan-300"><ArrowRight className="size-4" /></Link></div>
        <div className="mt-4 space-y-2">{items.length ? items.map((item, index) => <p key={`${title}-${index}`} className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-300">{item}</p>) : <p className="rounded-xl border border-dashed border-slate-800 px-3 py-4 text-center text-sm text-slate-500">Nothing requiring attention.</p>}</div>
      </Card>)}
    </section>
  </main>;
}
