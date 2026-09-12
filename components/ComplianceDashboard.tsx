"use client";

import Link from "next/link";
import { AlertTriangle, FileCheck2, History, PenLine } from "lucide-react";
import { Card } from "./ui/Card";
import { useLocalStorageCollection } from "../lib/storage";
import type { Job } from "../lib/models";
import type { ComplianceCertificate } from "../lib/complianceCertificates";

export function ComplianceDashboard() {
  const certificates = useLocalStorageCollection<ComplianceCertificate>("jr-os-certificates");
  const jobs = useLocalStorageCollection<Job>("jr-os-jobs");
  if (!certificates.isReady || !jobs.isReady) return <Card>Loading compliance overview…</Card>;

  const awaitingIssue = certificates.items.filter((item) => item.status === "Ready for Review");
  const awaitingSignatures = certificates.items.filter((item) =>
    item.status !== "Archived" && item.status !== "Issued" && (!item.inspectorSignature?.signedAt || !item.customerSignature?.signedAt),
  );
  const completedMissingCertificates = jobs.items.filter((job) =>
    job.status === "Complete" && !certificates.items.some((certificate) => certificate.jobId === job.id && certificate.status !== "Archived"),
  );
  const issueHistory = certificates.items
    .filter((item) => item.status === "Issued" || item.issuedAt)
    .toSorted((a, b) => (b.issuedAt ?? b.updatedAt).localeCompare(a.issuedAt ?? a.updatedAt))
    .slice(0, 5);

  const widgets = [
    { label: "Awaiting issue", value: awaitingIssue.length, detail: "Ready for final review", icon: FileCheck2, tone: "text-amber-300" },
    { label: "Awaiting signatures", value: awaitingSignatures.length, detail: "Inspector or customer sign-off", icon: PenLine, tone: "text-violet-300" },
    { label: "Missing certificates", value: completedMissingCertificates.length, detail: "Completed jobs requiring attention", icon: AlertTriangle, tone: "text-rose-300" },
    { label: "Issued certificates", value: certificates.items.filter((item) => item.status === "Issued").length, detail: "Recorded issue history", icon: History, tone: "text-emerald-300" },
  ];

  return <section className="space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">Compliance workflow</p><h2 className="mt-1 text-2xl font-bold">Certificate centre</h2><p className="mt-1 text-sm text-slate-400">Live certificate actions calculated from jobs and compliance records.</p></div><Link href="/certificates" className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold hover:border-cyan-400/50">Open certificates</Link></div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{widgets.map(({ label, value, detail, icon: Icon, tone }) => <Card key={label}><div className="flex items-start justify-between"><div><p className="text-sm text-slate-400">{label}</p><p className={`mt-3 text-3xl font-black ${tone}`}>{value}</p></div><span className="rounded-xl bg-slate-800 p-2"><Icon className={`size-5 ${tone}`} /></span></div><p className="mt-3 text-xs text-slate-500">{detail}</p></Card>)}</div>
    <div className="grid gap-4 xl:grid-cols-2">
      <Card><h3 className="font-bold">Completed jobs missing certificates</h3><div className="mt-4 space-y-2">{completedMissingCertificates.slice(0, 5).map((job) => <Link key={job.id} href="/certificates" className="block rounded-xl border border-slate-800 px-3 py-2 text-sm hover:border-rose-400/40"><span className="font-medium">{job.title}</span><span className="ml-2 text-slate-500">{job.siteAddress}</span></Link>)}{completedMissingCertificates.length === 0 ? <p className="text-sm text-emerald-300">Every completed job has a linked certificate record.</p> : null}</div></Card>
      <Card><h3 className="font-bold">Certificate issue history</h3><div className="mt-4 space-y-2">{issueHistory.map((certificate) => <Link key={certificate.id} href="/certificates" className="flex items-center justify-between rounded-xl border border-slate-800 px-3 py-2 text-sm hover:border-cyan-400/40"><span>{certificate.number}</span><span className="text-slate-500">{new Date(certificate.issuedAt ?? certificate.updatedAt).toLocaleDateString("en-GB")}</span></Link>)}{issueHistory.length === 0 ? <p className="text-sm text-slate-500">No certificates have been issued yet.</p> : null}</div></Card>
    </div>
  </section>;
}
