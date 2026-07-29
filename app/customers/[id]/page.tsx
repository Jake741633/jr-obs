"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, BriefcaseBusiness, Mail, MapPin, Phone } from "lucide-react";
import { Card } from "../../../components/ui/Card";
import { StatusBadge } from "../../../components/ui/StatusBadge";
import { useLocalStorageCollection } from "../../../lib/storage";
import type { Customer, Job } from "../../../lib/models";

export default function CustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const customers = useLocalStorageCollection<Customer>("jr-os-customers");
  const jobs = useLocalStorageCollection<Job>("jr-os-jobs");
  const customer = customers.items.find((item) => item.id === params.id);
  const linkedJobs = jobs.items.filter((job) => job.customerId === params.id);

  if (!customers.isReady || !jobs.isReady) {
    return <Card>Loading customer…</Card>;
  }

  if (!customer) {
    return <div className="space-y-6"><Link href="/customers" className="inline-flex items-center gap-2 text-sm text-cyan-300 hover:text-cyan-200"><ArrowLeft className="size-4" />Back to customers</Link><Card><h1 className="text-xl font-bold">Customer not found</h1><p className="mt-2 text-sm text-slate-400">This customer may have been deleted or the link is no longer valid.</p></Card></div>;
  }

  return <div className="space-y-6">
    <Link href="/customers" className="inline-flex items-center gap-2 text-sm text-cyan-300 hover:text-cyan-200"><ArrowLeft className="size-4" />Back to customers</Link>
    <Card className="border-cyan-400/30">
      <p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">Customer profile</p>
      <h1 className="mt-2 text-3xl font-bold">{customer.name}</h1>
      <div className="mt-6 grid gap-4 text-sm text-slate-300 md:grid-cols-2">
        <p className="flex items-center gap-2"><Phone className="size-4 text-cyan-400" />{customer.phone || "Not provided"}</p>
        <p className="flex items-center gap-2"><Mail className="size-4 text-cyan-400" />{customer.email || "Not provided"}</p>
        <p className="flex items-start gap-2 md:col-span-2"><MapPin className="mt-0.5 size-4 shrink-0 text-cyan-400" />{customer.address || "Not provided"}</p>
        <p className="md:col-span-2"><span className="font-semibold text-slate-200">Notes:</span> {customer.notes || "No notes"}</p>
      </div>
    </Card>
    <section className="space-y-4">
      <div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">Linked activity</p><h2 className="mt-1 text-2xl font-bold">Jobs ({linkedJobs.length})</h2></div>
      {linkedJobs.length === 0 ? <Card><p className="text-sm text-slate-400">No jobs are linked to this customer yet.</p></Card> : <div className="grid gap-4 md:grid-cols-2">{linkedJobs.map((job) => <Link key={job.id} href={`/jobs/${job.id}`}><Card className="h-full transition hover:border-cyan-400/40"><div className="flex items-start justify-between gap-3"><div><p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-cyan-400"><BriefcaseBusiness className="size-4" />Job</p><h3 className="mt-2 text-lg font-bold">{job.title}</h3><p className="mt-1 text-sm text-slate-400">{job.siteAddress}</p></div><StatusBadge status={job.status} /></div></Card></Link>)}</div>}
    </section>
  </div>;
}
