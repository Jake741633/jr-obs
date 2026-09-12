import { BadgePoundSterling, BriefcaseBusiness, CheckCircle2, Circle, FileCheck2, ReceiptText } from "lucide-react";
import { invoiceTotal } from "../../lib/workflow";
import type { Invoice, Job, PricingDocument } from "../../lib/models";
import { isJobClosedStatus } from "../../lib/jobManagement-core.mjs";

interface ProjectTimelineProps {
  job: Job;
  quote?: PricingDocument;
  invoices: Invoice[];
}

type StageState = "complete" | "current" | "upcoming";

const stageStyles: Record<StageState, string> = {
  complete: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
  current: "border-cyan-500/30 bg-cyan-500/10 text-cyan-200",
  upcoming: "border-slate-800 bg-slate-950/60 text-slate-500",
};

function dateLabel(value?: string) {
  return value ? new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";
}

export function ProjectTimeline({ job, quote, invoices }: ProjectTimelineProps) {
  const latestInvoice = [...invoices].toSorted((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const isPaid = Boolean(latestInvoice && (latestInvoice.status === "Paid" || latestInvoice.amountPaid >= invoiceTotal(latestInvoice)));
  const hasInvoice = Boolean(latestInvoice);

  const stages = [
    {
      label: "Quote",
      detail: quote ? `${quote.number} · ${quote.status}` : job.quoteSnapshot ? `${job.quoteSnapshot.quoteNumber} · Accepted` : "Linked quote unavailable",
      date: quote?.updatedAt ?? job.quoteSnapshot?.convertedAt,
      state: (quote?.status === "Accepted" || job.quoteSnapshot ? "complete" : "current") as StageState,
      icon: FileCheck2,
    },
    {
      label: "Job",
      detail: job.status,
      date: job.createdAt,
      state: (isJobClosedStatus(job.status) && job.status !== "Cancelled" ? "complete" : "current") as StageState,
      icon: BriefcaseBusiness,
    },
    {
      label: "Invoice",
      detail: latestInvoice ? `${latestInvoice.number} · ${latestInvoice.status}` : "Create when job is complete",
      date: latestInvoice?.createdAt,
      state: (hasInvoice ? (latestInvoice.status === "Paid" ? "complete" : "current") : "upcoming") as StageState,
      icon: ReceiptText,
    },
    {
      label: "Payment",
      detail: isPaid ? "Paid in full" : latestInvoice?.status === "Part paid" ? "Part paid" : hasInvoice ? "Awaiting payment" : "Not invoiced",
      date: isPaid ? latestInvoice?.updatedAt : undefined,
      state: (isPaid ? "complete" : hasInvoice ? "current" : "upcoming") as StageState,
      icon: BadgePoundSterling,
    },
  ];

  return <div className="grid gap-3 md:grid-cols-4">
    {stages.map(({ label, detail, date, state, icon: Icon }) => <div key={label} className={`relative rounded-2xl border p-4 ${stageStyles[state]}`}>
      <div className="flex items-start justify-between gap-3"><Icon className="size-5" />{state === "complete" ? <CheckCircle2 className="size-5" /> : <Circle className="size-5" />}</div>
      <p className="mt-4 text-xs font-semibold uppercase tracking-wider">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-100">{detail}</p>
      <p className="mt-2 text-xs opacity-70">{dateLabel(date) || (state === "upcoming" ? "Upcoming" : "In progress")}</p>
    </div>)}
  </div>;
}
