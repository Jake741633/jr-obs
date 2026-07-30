"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, BriefcaseBusiness, Building2, Mail, MapPin, Percent, Phone, PoundSterling, ReceiptText, Repeat2, User } from "lucide-react";
import { Card } from "../../../components/ui/Card";
import { StatusBadge } from "../../../components/ui/StatusBadge";
import { buildBuilderInsight } from "../../../lib/aiLearning";
import { useLocalStorageCollection } from "../../../lib/storage";
import type { Builder, Invoice, Job, PricingDocument } from "../../../lib/models";

const money = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });

export default function BuilderDetailPage() {
  const params = useParams<{ id: string }>();
  const builders = useLocalStorageCollection<Builder>("jr-os-builders");
  const jobs = useLocalStorageCollection<Job>("jr-os-jobs");
  const documents = useLocalStorageCollection<PricingDocument>("jr-os-pricing-documents");
  const invoices = useLocalStorageCollection<Invoice>("jr-os-invoices");
  const builder = builders.items.find((item) => item.id === params.id);
  const linkedJobs = jobs.items.filter((job) => job.builderId === params.id);

  if (!builders.isReady || !jobs.isReady || !documents.isReady || !invoices.isReady) return <Card>Loading builder…</Card>;

  if (!builder) {
    return <div className="space-y-6"><Link href="/builders" className="inline-flex items-center gap-2 text-sm text-cyan-300 hover:text-cyan-200"><ArrowLeft className="size-4" />Back to builders</Link><Card><h1 className="text-xl font-bold">Builder not found</h1><p className="mt-2 text-sm text-slate-400">This builder may have been deleted or the link is no longer valid.</p></Card></div>;
  }

  const insight = buildBuilderInsight({
    builderId: builder.id,
    documents: documents.items,
    jobs: jobs.items,
    invoices: invoices.items,
  });

  return <div className="space-y-6">
    <Link href="/builders" className="inline-flex items-center gap-2 text-sm text-cyan-300 hover:text-cyan-200"><ArrowLeft className="size-4" />Back to builders</Link>
    <Card className="border-cyan-400/30">
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-cyan-400"><Building2 className="size-4" />Builder profile</p>
      <h1 className="mt-2 text-3xl font-bold">{builder.companyName}</h1>
      <div className="mt-6 grid gap-4 text-sm text-slate-300 md:grid-cols-2">
        <p className="flex items-center gap-2"><User className="size-4 text-cyan-400" />{builder.contactName || "No named contact"}</p>
        <p className="flex items-center gap-2"><Phone className="size-4 text-cyan-400" />{builder.phone || "Not provided"}</p>
        <p className="flex items-center gap-2"><Mail className="size-4 text-cyan-400" />{builder.email || "Not provided"}</p>
        <p className="flex items-start gap-2"><MapPin className="mt-0.5 size-4 shrink-0 text-cyan-400" />{builder.address || "Not provided"}</p>
        <p className="md:col-span-2"><span className="font-semibold text-slate-200">Relationship notes:</span> {builder.notes || "No notes"}</p>
      </div>
    </Card>
    <section className="space-y-4">
      <div><p className="text-xs font-semibold uppercase tracking-wider text-fuchsia-300">AI contractor insight</p><h2 className="mt-1 text-2xl font-bold">Commercial relationship</h2><p className="mt-1 text-sm text-slate-400">Calculated from linked quotes, jobs and invoices in JR OS.</p></div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card><PoundSterling className="size-5 text-emerald-300" /><p className="mt-3 text-sm text-slate-400">Average job value</p><p className="mt-2 text-2xl font-bold">{money.format(insight.averageJobValue)}</p><p className="mt-1 text-xs text-slate-500">{insight.jobCount} linked job{insight.jobCount === 1 ? "" : "s"} · {insight.completedJobs} completed</p></Card>
        <Card><Percent className="size-5 text-cyan-300" /><p className="mt-3 text-sm text-slate-400">Quote conversion</p><p className="mt-2 text-2xl font-bold">{insight.conversionRate.toFixed(1)}%</p><p className="mt-1 text-xs text-slate-500">{insight.acceptedQuotes} accepted from {insight.quoteCount} quote{insight.quoteCount === 1 ? "" : "s"} recorded</p></Card>
        <Card><Repeat2 className="size-5 text-violet-300" /><p className="mt-3 text-sm text-slate-400">Repeat business</p><p className={`mt-2 text-xl font-bold ${insight.repeatBusiness ? "text-emerald-300" : "text-slate-300"}`}>{insight.repeatBusiness ? "Repeat contractor" : "Building history"}</p><p className="mt-1 text-xs text-slate-500">{insight.lastActivityAt ? `Last activity ${new Date(insight.lastActivityAt).toLocaleDateString("en-GB")}` : "No linked activity yet"}</p></Card>
        <Card><ReceiptText className="size-5 text-amber-300" /><p className="mt-3 text-sm text-slate-400">Payment history</p><p className={`mt-2 text-lg font-bold ${insight.outstanding > 0 ? "text-amber-300" : "text-emerald-300"}`}>{insight.paymentHistory}</p><p className="mt-1 text-xs text-slate-500">{money.format(insight.totalInvoiced)} invoiced · {money.format(insight.outstanding)} outstanding</p></Card>
      </div>
    </section>
    <section className="space-y-4">
      <div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">Linked activity</p><h2 className="mt-1 text-2xl font-bold">Jobs ({linkedJobs.length})</h2></div>
      {linkedJobs.length === 0 ? <Card><p className="text-sm text-slate-400">No jobs are linked to this builder yet.</p></Card> : <div className="grid gap-4 md:grid-cols-2">{linkedJobs.map((job) => <Link key={job.id} href={`/jobs/${job.id}`}><Card className="h-full transition hover:border-cyan-400/40"><div className="flex items-start justify-between gap-3"><div><p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-cyan-400"><BriefcaseBusiness className="size-4" />Job</p><h3 className="mt-2 text-lg font-bold">{job.title}</h3><p className="mt-1 text-sm text-slate-400">{job.siteAddress}</p></div><StatusBadge status={job.status} /></div></Card></Link>)}</div>}
    </section>
  </div>;
}
