import type { JobStatus, PricingDocumentStatus } from "../../lib/models";

type SupportedStatus = JobStatus | PricingDocumentStatus;

const styles: Record<SupportedStatus, string> = {
  Lead: "bg-slate-800 text-slate-300",
  Quoted: "bg-violet-500/15 text-violet-300",
  Scheduled: "bg-blue-500/15 text-blue-300",
  "In progress": "bg-amber-500/15 text-amber-300",
  Complete: "bg-emerald-500/15 text-emerald-300",
  "On hold": "bg-rose-500/15 text-rose-300",
  Draft: "bg-slate-800 text-slate-300",
  Sent: "bg-blue-500/15 text-blue-300",
  Accepted: "bg-emerald-500/15 text-emerald-300",
  Declined: "bg-rose-500/15 text-rose-300",
  Expired: "bg-amber-500/15 text-amber-300",
};

export function StatusBadge({ status }: { status: SupportedStatus }) {
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${styles[status]}`}>{status}</span>;
}
