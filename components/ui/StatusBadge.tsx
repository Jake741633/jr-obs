import type { JobStatus } from "../../lib/models";

const styles: Record<JobStatus, string> = {
  Lead: "bg-slate-800 text-slate-300",
  Quoted: "bg-violet-500/15 text-violet-300",
  Scheduled: "bg-blue-500/15 text-blue-300",
  "In progress": "bg-amber-500/15 text-amber-300",
  Complete: "bg-emerald-500/15 text-emerald-300",
  "On hold": "bg-rose-500/15 text-rose-300",
};

export function StatusBadge({ status }: { status: JobStatus }) {
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${styles[status]}`}>{status}</span>;
}
