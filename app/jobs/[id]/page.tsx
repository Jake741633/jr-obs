"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Building2, CalendarDays, MapPin, User, WalletCards } from "lucide-react";
import { Card } from "../../../components/ui/Card";
import { StatusBadge } from "../../../components/ui/StatusBadge";
import { useLocalStorageCollection } from "../../../lib/storage";
import type { Builder, Customer, Job } from "../../../lib/models";

export default function JobDetailPage() {
  const params = useParams<{ id: string }>();
  const jobs = useLocalStorageCollection<Job>("jr-os-jobs");
  const customers = useLocalStorageCollection<Customer>("jr-os-customers");
  const builders = useLocalStorageCollection<Builder>("jr-os-builders");
  const job = jobs.items.find((item) => item.id === params.id);
  const customer = customers.items.find((item) => item.id === job?.customerId);
  const builder = builders.items.find((item) => item.id === job?.builderId);

  if (!jobs.isReady || !customers.isReady || !builders.isReady) return <Card>Loading job…</Card>;

  if (!job) {
    return <div className="space-y-6"><Link href="/jobs" className="inline-flex items-center gap-2 text-sm text-cyan-300 hover:text-cyan-200"><ArrowLeft className="size-4" />Back to jobs</Link><Card><h1 className="text-xl font-bold">Job not found</h1><p className="mt-2 text-sm text-slate-400">This job may have been deleted or the link is no longer valid.</p></Card></div>;
  }

  const formattedValue = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(job.value || 0);
  const formattedDate = job.startDate ? new Date(`${job.startDate}T12:00:00`).toLocaleDateString("en-GB") : "Not scheduled";

  return <div className="space-y-6">
    <Link href="/jobs" className="inline-flex items-center gap-2 text-sm text-cyan-300 hover:text-cyan-200"><ArrowLeft className="size-4" />Back to jobs</Link>
    <Card className="border-cyan-400/30">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">Job record</p><h1 className="mt-2 text-3xl font-bold">{job.title}</h1></div><StatusBadge status={job.status} /></div>
      <div className="mt-6 grid gap-4 text-sm text-slate-300 md:grid-cols-2">
        <p className="flex items-start gap-2"><MapPin className="mt-0.5 size-4 shrink-0 text-cyan-400" />{job.siteAddress}</p>
        <p className="flex items-center gap-2"><CalendarDays className="size-4 text-cyan-400" />{formattedDate}</p>
        <p className="flex items-center gap-2"><WalletCards className="size-4 text-cyan-400" />{formattedValue}</p>
        <p className="md:col-span-2"><span className="font-semibold text-slate-200">Notes:</span> {job.notes || "No notes"}</p>
      </div>
    </Card>
    <section className="space-y-4">
      <div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">Relationships</p><h2 className="mt-1 text-2xl font-bold">Linked CRM records</h2></div>
      <div className="grid gap-4 md:grid-cols-2">
        {customer ? <Link href={`/customers/${customer.id}`}><Card className="h-full transition hover:border-cyan-400/40"><p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-cyan-400"><User className="size-4" />Customer</p><h3 className="mt-2 text-lg font-bold">{customer.name}</h3><p className="mt-1 text-sm text-slate-400">{customer.phone || customer.email || "No contact details"}</p></Card></Link> : null}
        {builder ? <Link href={`/builders/${builder.id}`}><Card className="h-full transition hover:border-cyan-400/40"><p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-cyan-400"><Building2 className="size-4" />Builder</p><h3 className="mt-2 text-lg font-bold">{builder.companyName}</h3><p className="mt-1 text-sm text-slate-400">{builder.contactName || builder.phone || builder.email || "No contact details"}</p></Card></Link> : null}
        {!customer && !builder ? <Card><p className="text-sm text-slate-400">This is currently recorded as a direct job with no linked customer or builder.</p></Card> : null}
      </div>
    </section>
  </div>;
}
