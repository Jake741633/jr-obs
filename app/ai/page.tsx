"use client";

import Link from "next/link";
import { useMemo } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Brain,
  BriefcaseBusiness,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  Lightbulb,
  ReceiptText,
  Sparkles,
} from "lucide-react";
import { Card } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";
import { useLocalStorageCollection } from "../../lib/storage";
import type { ElectricalCertificate, Invoice, Job, PricingDocument, SiteSurvey } from "../../lib/models";

const gbp = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
});

function documentTotal(document: PricingDocument | Invoice) {
  const subtotal = document.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  return subtotal + (document.vatEnabled ? subtotal * (document.vatRate / 100) : 0);
}

type Priority = "High" | "Medium" | "Ready";

type AssistantAction = {
  id: string;
  priority: Priority;
  title: string;
  detail: string;
  href: string;
  actionLabel: string;
};

type AssistantMetric = {
  label: string;
  value: string;
  detail: string;
  icon: typeof BriefcaseBusiness;
};

export default function AiPage() {
  const jobs = useLocalStorageCollection<Job>("jr-os-jobs");
  const pricing = useLocalStorageCollection<PricingDocument>("jr-os-pricing-documents");
  const invoices = useLocalStorageCollection<Invoice>("jr-os-invoices");
  const surveys = useLocalStorageCollection<SiteSurvey>("jr-os-surveys");
  const certificates = useLocalStorageCollection<ElectricalCertificate>("jr-os-certificates");

  const ready = jobs.isReady && pricing.isReady && invoices.isReady && surveys.isReady && certificates.isReady;

  const assistant = useMemo(() => {
    const now = Date.now();
    const quotes = pricing.items.filter((item) => item.type === "Quote");
    const openQuotes = quotes.filter((item) => item.status === "Draft" || item.status === "Sent");
    const draftQuotes = quotes.filter((item) => item.status === "Draft");
    const sentQuotes = quotes.filter((item) => item.status === "Sent");
    const pipelineValue = openQuotes.reduce((sum, item) => sum + documentTotal(item), 0);

    const unpaidInvoices = invoices.items.filter((item) => item.status !== "Paid" && item.status !== "Cancelled");
    const overdueInvoices = unpaidInvoices.filter((item) => item.dueDate && new Date(`${item.dueDate}T23:59:59`).getTime() < now);
    const overdueValue = overdueInvoices.reduce((sum, item) => sum + Math.max(0, documentTotal(item) - item.amountPaid), 0);

    const activeJobs = jobs.items.filter((item) => item.status !== "Complete" && item.status !== "On hold");
    const unscheduledJobs = activeJobs.filter((item) => !item.startDate);
    const jobsWithoutValue = activeJobs.filter((item) => !item.value);

    const incompleteSurveys = surveys.items.filter((item) => item.status !== "Complete");
    const completeSurveysWithoutQuote = surveys.items.filter((survey) =>
      survey.status === "Complete" && !pricing.items.some((item) => item.jobId && item.jobId === survey.jobId),
    );

    const draftCertificates = certificates.items.filter((item) => item.status === "Draft" || item.status === "In progress");
    const completeCertificatesNotIssued = certificates.items.filter((item) => item.status === "Complete");

    const actions: AssistantAction[] = [];

    if (overdueInvoices.length) {
      actions.push({
        id: "overdue-invoices",
        priority: "High",
        title: `Chase ${overdueInvoices.length} overdue invoice${overdueInvoices.length === 1 ? "" : "s"}`,
        detail: `${gbp.format(overdueValue)} remains overdue. Review the oldest balances first and record any payment received.`,
        href: "/invoices",
        actionLabel: "Open invoices",
      });
    }

    if (sentQuotes.length) {
      actions.push({
        id: "sent-quotes",
        priority: sentQuotes.length >= 3 ? "High" : "Medium",
        title: `Follow up ${sentQuotes.length} sent quote${sentQuotes.length === 1 ? "" : "s"}`,
        detail: `${gbp.format(sentQuotes.reduce((sum, item) => sum + documentTotal(item), 0))} has been sent but not yet accepted or declined.`,
        href: "/quotes",
        actionLabel: "Review quotes",
      });
    }

    if (draftQuotes.length) {
      actions.push({
        id: "draft-quotes",
        priority: "Medium",
        title: `Finish ${draftQuotes.length} draft quote${draftQuotes.length === 1 ? "" : "s"}`,
        detail: "Complete pricing, terms and exclusions before sending them to customers or builders.",
        href: "/quotes",
        actionLabel: "Finish drafts",
      });
    }

    if (unscheduledJobs.length) {
      actions.push({
        id: "unscheduled-jobs",
        priority: "Medium",
        title: `Schedule ${unscheduledJobs.length} active job${unscheduledJobs.length === 1 ? "" : "s"}`,
        detail: "Adding realistic start dates improves workload visibility and reduces clashes with other work.",
        href: "/jobs",
        actionLabel: "Open jobs",
      });
    }

    if (completeSurveysWithoutQuote.length) {
      actions.push({
        id: "survey-to-quote",
        priority: "Medium",
        title: `Turn ${completeSurveysWithoutQuote.length} completed survey${completeSurveysWithoutQuote.length === 1 ? "" : "s"} into pricing`,
        detail: "The site information is ready to support a quote or estimate while the details are still fresh.",
        href: "/surveys",
        actionLabel: "Open surveys",
      });
    }

    if (draftCertificates.length) {
      actions.push({
        id: "certificate-drafts",
        priority: "Medium",
        title: `Review ${draftCertificates.length} certificate draft${draftCertificates.length === 1 ? "" : "s"}`,
        detail: "Check observations, inspector details and outcomes before completion or issue.",
        href: "/certificates",
        actionLabel: "Open certificates",
      });
    }

    if (completeCertificatesNotIssued.length) {
      actions.push({
        id: "issue-certificates",
        priority: "Ready",
        title: `${completeCertificatesNotIssued.length} completed certificate${completeCertificatesNotIssued.length === 1 ? " is" : "s are"} ready for issue`,
        detail: "Confirm the final record and mark it issued once the customer copy has been provided.",
        href: "/certificates",
        actionLabel: "Issue records",
      });
    }

    if (!actions.length) {
      actions.push({
        id: "clear",
        priority: "Ready",
        title: "No urgent actions detected",
        detail: "Current JR OS records do not show overdue invoices, unfinished quote follow-ups or incomplete technical records.",
        href: "/",
        actionLabel: "Command Centre",
      });
    }

    const metrics: AssistantMetric[] = [
      { label: "Live workload", value: String(activeJobs.length), detail: `${unscheduledJobs.length} need dates`, icon: BriefcaseBusiness },
      { label: "Quote pipeline", value: gbp.format(pipelineValue), detail: `${openQuotes.length} open`, icon: FileText },
      { label: "Overdue", value: gbp.format(overdueValue), detail: `${overdueInvoices.length} invoices`, icon: ReceiptText },
      { label: "Survey queue", value: String(incompleteSurveys.length), detail: `${completeSurveysWithoutQuote.length} ready to price`, icon: ClipboardCheck },
    ];

    const recordWarnings = jobsWithoutValue.length + unscheduledJobs.length + incompleteSurveys.length + draftCertificates.length;
    const readinessScore = Math.max(0, Math.min(100, 100 - recordWarnings * 5 - overdueInvoices.length * 10 - draftQuotes.length * 4));

    return { actions: actions.slice(0, 6), metrics, readinessScore };
  }, [certificates.items, invoices.items, jobs.items, pricing.items, surveys.items]);

  if (!ready) return <Card>Preparing JR AI assistant…</Card>;

  const scoreTone = assistant.readinessScore >= 80 ? "text-emerald-300" : assistant.readinessScore >= 60 ? "text-amber-300" : "text-red-300";

  return <div className="space-y-6">
    <PageHeader
      eyebrow="JR AI"
      title="Operations assistant"
      description="A fast, local-first assistant that turns your existing JR OS records into practical next actions without background polling or extra services."
      action={<Link href="/business" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 text-sm font-semibold text-slate-100 hover:bg-slate-800">Business health <ArrowRight className="size-4" /></Link>}
    />

    <section className="grid gap-4 lg:grid-cols-[1fr_3fr]">
      <Card className="border-cyan-400/30">
        <div className="flex items-center justify-between"><Brain className="size-9 text-cyan-300" /><Sparkles className="size-5 text-cyan-400" /></div>
        <p className="mt-5 text-sm text-slate-400">Operational readiness</p>
        <p className={`mt-2 text-5xl font-black ${scoreTone}`}>{assistant.readinessScore}</p>
        <p className="mt-1 text-sm text-slate-500">out of 100</p>
        <p className="mt-4 text-sm text-slate-400">This score reflects incomplete records, overdue debt and unfinished workflow steps. It is a workflow guide rather than financial advice.</p>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {assistant.metrics.map(({ label, value, detail, icon: Icon }) => <Card key={label}><Icon className="size-5 text-cyan-300" /><p className="mt-3 text-sm text-slate-400">{label}</p><p className="mt-2 text-2xl font-bold">{value}</p><p className="mt-1 text-xs text-slate-500">{detail}</p></Card>)}
      </div>
    </section>

    <section className="grid gap-6 xl:grid-cols-[1.35fr_1fr]">
      <Card>
        <div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 size-6 text-amber-300" /><div><h2 className="text-xl font-bold">Recommended next actions</h2><p className="text-sm text-slate-500">Prioritised from the records already saved in JR OS.</p></div></div>
        <div className="mt-5 space-y-3">
          {assistant.actions.map((item) => <Link key={item.id} href={item.href} className="block rounded-xl border border-slate-800 bg-slate-950/60 p-4 hover:border-slate-700">
            <div className="flex items-start justify-between gap-4"><div><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${item.priority === "High" ? "bg-red-500/10 text-red-300" : item.priority === "Medium" ? "bg-amber-500/10 text-amber-300" : "bg-emerald-500/10 text-emerald-300"}`}>{item.priority}</span><h3 className="font-semibold">{item.title}</h3></div><p className="mt-2 text-sm text-slate-400">{item.detail}</p><p className="mt-3 text-xs font-semibold text-cyan-300">{item.actionLabel}</p></div><ArrowRight className="mt-1 size-4 shrink-0 text-slate-500" /></div>
          </Link>)}
        </div>
      </Card>

      <Card>
        <div className="flex items-start gap-3"><Lightbulb className="mt-0.5 size-6 text-cyan-300" /><div><h2 className="text-xl font-bold">How JR AI works now</h2><p className="text-sm text-slate-500">Useful immediately, with cloud AI still optional later.</p></div></div>
        <div className="mt-5 space-y-3 text-sm">
          <div className="rounded-xl bg-slate-950 p-4"><CheckCircle2 className="size-5 text-emerald-300" /><p className="mt-2 font-semibold">Local and fast</p><p className="mt-1 text-slate-400">Calculations run only when your stored records change.</p></div>
          <div className="rounded-xl bg-slate-950 p-4"><CheckCircle2 className="size-5 text-emerald-300" /><p className="mt-2 font-semibold">No automatic technical decisions</p><p className="mt-1 text-slate-400">Survey and certificate suggestions still require your review and approval.</p></div>
          <div className="rounded-xl bg-slate-950 p-4"><CheckCircle2 className="size-5 text-emerald-300" /><p className="mt-2 font-semibold">Ready for future intelligence</p><p className="mt-1 text-slate-400">Cloud memory, voice interpretation and photo analysis can later build on this workflow.</p></div>
        </div>
      </Card>
    </section>
  </div>;
}
