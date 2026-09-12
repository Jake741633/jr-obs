"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CalendarDays, CheckCircle2, ChevronRight, CircleAlert, MapPin, Navigation, Phone, ShieldCheck } from "lucide-react";
import { Card } from "../../../components/ui/Card";
import { PageHeader } from "../../../components/ui/PageHeader";
import { StatusBadge } from "../../../components/ui/StatusBadge";
import {
  useCustomersCollection,
  useFieldElectricalTestingCollection,
  useJobDocumentsCollection,
  useJobsCollection,
  usePlannerCollection,
  usePurchaseListsCollection,
} from "../../../lib/cloud/coreBusinessCollections";
import { buildMobileJobReadiness, mobileJobPriority, mobileJobView } from "../../../lib/mobileJobControl-core.mjs";
import { isJobInactiveStatus } from "../../../lib/jobManagement-core.mjs";

const today = () => new Date().toISOString().slice(0, 10);

type JobView = "today" | "attention" | "upcoming" | "all";

const jobViews: Array<{ id: JobView; label: string; title: string; description: string; empty: string }> = [
  { id: "today", label: "Today", title: "Today & on site", description: "Jobs scheduled for today plus work already in an active site stage.", empty: "No jobs are scheduled for today or currently on site." },
  { id: "attention", label: "Attention", title: "Needs attention", description: "Active jobs that are unscheduled or have a visit date in the past.", empty: "No unscheduled or overdue active jobs need attention." },
  { id: "upcoming", label: "Upcoming", title: "Upcoming visits", description: "Future scheduled work, ordered by the next visit date.", empty: "No future visits are currently scheduled." },
  { id: "all", label: "All", title: "All active jobs", description: "Every active job available to this account, in working-day priority order.", empty: "No active jobs are available." },
];

function mapsHref(address: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

function jobWorkspaceHref(jobId: string) {
  return `/jobs/${jobId}/workspace`;
}

export default function MobileJobControlPage() {
  const jobs = useJobsCollection();
  const customers = useCustomersCollection();
  const planner = usePlannerCollection();
  const purchaseLists = usePurchaseListsCollection();
  const testing = useFieldElectricalTestingCollection();
  const documents = useJobDocumentsCollection();
  const [selectedView, setSelectedView] = useState<JobView>("today");
  const todayDate = today();

  const customerById = useMemo(() => new Map(customers.items.map((customer) => [customer.id, customer])), [customers.items]);
  const work = useMemo(() => jobs.items
    .filter((job) => !isJobInactiveStatus(job.status))
    .toSorted((a, b) => mobileJobPriority(a, todayDate) - mobileJobPriority(b, todayDate) || (a.startDate || "9999").localeCompare(b.startDate || "9999")), [jobs.items, todayDate]);

  const ready = [jobs, customers, planner, purchaseLists, testing, documents].every((collection) => collection.isReady);
  if (!ready) return <Card>Loading mobile job control…</Card>;

  const summaries = work.map((job) => {
    const customer = customerById.get(job.customerId ?? "");
    const jobPurchaseLists = purchaseLists.items.filter((list) => list.jobId === job.id);
    const jobTesting = testing.items.filter((record) => record.jobId === job.id);
    const jobDocuments = documents.items.filter((record) => record.jobId === job.id);
    const hasSchedule = Boolean(job.startDate || planner.items.some((entry) => entry.jobId === job.id));
    const readiness = buildMobileJobReadiness({
      hasSchedule,
      hasContact: Boolean(customer?.phone || customer?.email),
      hasMaterials: jobPurchaseLists.length > 0,
      hasTesting: jobTesting.length > 0,
      jobHref: jobWorkspaceHref(job.id),
    });
    return { job, customer, readiness, jobPurchaseLists, jobTesting, jobDocuments };
  });

  const viewCounts: Record<JobView, number> = {
    today: summaries.filter(({ job }) => mobileJobView(job, todayDate) === "today").length,
    attention: summaries.filter(({ job }) => mobileJobView(job, todayDate) === "attention").length,
    upcoming: summaries.filter(({ job }) => mobileJobView(job, todayDate) === "upcoming").length,
    all: summaries.length,
  };
  const selectedViewOption = jobViews.find((view) => view.id === selectedView) ?? jobViews[0];
  const visibleSummaries = selectedView === "all" ? summaries : summaries.filter(({ job }) => mobileJobView(job, todayDate) === selectedView);
  const readyJobs = summaries.filter((summary) => summary.readiness.blockers.length === 0).length;

  return <div className="space-y-5 pb-24 sm:space-y-6 sm:pb-0">
    <PageHeader eyebrow="Mobile workspace" title="Job control" description="See what is ready, what is missing and the next action before travelling to site." />

    <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <Card><p className="text-xs text-slate-400">Active jobs</p><p className="mt-2 text-3xl font-bold">{summaries.length}</p></Card>
      <Card><p className="text-xs text-slate-400">Today + on site</p><p className="mt-2 text-3xl font-bold">{viewCounts.today}</p></Card>
      <Card className="col-span-2 sm:col-span-1"><p className="text-xs text-slate-400">Field ready</p><p className="mt-2 text-3xl font-bold text-emerald-300">{readyJobs}</p></Card>
    </section>

    {summaries.length ? <section aria-label="Choose active job view" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {jobViews.map((view) => <button
        key={view.id}
        type="button"
        aria-pressed={selectedView === view.id}
        onClick={() => setSelectedView(view.id)}
        className={`flex min-h-12 items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left text-sm font-semibold transition active:scale-[.99] ${selectedView === view.id ? "border-cyan-400/50 bg-cyan-400/10 text-cyan-100" : "border-slate-800 bg-slate-950/60 text-slate-300"}`}
      >
        <span>{view.label}</span>
        <span className={`rounded-full px-2 py-0.5 text-xs ${selectedView === view.id ? "bg-cyan-300 text-slate-950" : "bg-slate-800 text-slate-300"}`}>{viewCounts[view.id]}</span>
      </button>)}
    </section> : null}

    {!summaries.length ? <Card><h2 className="font-semibold">No active jobs</h2><p className="mt-2 text-sm text-slate-400">Create or schedule a job and it will appear here.</p></Card> : <section className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">Assigned work</p><h2 className="mt-1 text-2xl font-bold">{selectedViewOption.title}</h2><p className="mt-1 text-sm text-slate-500">{selectedViewOption.description}</p></div>
        <span className="shrink-0 rounded-full border border-slate-800 px-3 py-1 text-xs font-semibold text-slate-300">{visibleSummaries.length}</span>
      </div>
      {!visibleSummaries.length ? <Card><p className="text-sm text-slate-300">{selectedViewOption.empty}</p>{selectedView !== "all" ? <button type="button" onClick={() => setSelectedView("all")} className="mt-4 min-h-12 rounded-xl border border-slate-700 px-4 text-sm font-semibold">View all active jobs</button> : null}</Card> : visibleSummaries.map(({ job, customer, readiness, jobPurchaseLists, jobTesting, jobDocuments }) => <Card key={job.id} className={mobileJobView(job, todayDate) === "today" ? "border-cyan-400/40" : undefined}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">{customer?.name || "Direct job"}</p><h2 className="mt-1 break-words text-xl font-bold">{job.title}</h2><div className="mt-2"><StatusBadge status={job.status} /></div></div>
        <div className={`grid size-14 shrink-0 place-items-center rounded-full border text-sm font-bold ${readiness.blockers.length ? "border-amber-400/30 bg-amber-400/10 text-amber-200" : "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"}`}>{readiness.percentage}%</div>
      </div>

      <div className="mt-4 space-y-2 text-sm text-slate-400">
        <p className="flex items-start gap-2"><MapPin className="mt-0.5 size-4 shrink-0 text-cyan-400" /><span>{job.siteAddress}</span></p>
        <p className="flex items-center gap-2"><CalendarDays className="size-4 text-cyan-400" />{job.startDate ? new Date(`${job.startDate}T12:00:00`).toLocaleDateString("en-GB") : "Not yet scheduled"}</p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <a href={mapsHref(job.siteAddress)} target="_blank" rel="noreferrer" className="inline-flex min-h-12 items-center justify-center rounded-xl bg-cyan-400 px-3 text-sm font-semibold text-slate-950"><Navigation className="mr-2 size-4" />Navigate</a>
        {customer?.phone ? <a href={`tel:${customer.phone}`} className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-700 px-3 text-sm font-semibold"><Phone className="mr-2 size-4" />Call</a> : <Link href={jobWorkspaceHref(job.id)} className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-700 px-3 text-sm font-semibold">Job contact</Link>}
      </div>

      <div className="mt-5 rounded-xl border border-slate-800 bg-slate-950/50 p-3">
        <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2">{readiness.blockers.length ? <CircleAlert className="size-5 text-amber-300" /> : <CheckCircle2 className="size-5 text-emerald-300" />}<h3 className="font-semibold">Field readiness</h3></div><span className="text-xs text-slate-500">{readiness.readyCount}/{readiness.totalCount}</span></div>
        <div className="mt-3 space-y-2">{readiness.checks.map((check) => <Link key={check.id} href={check.href} className="flex min-h-12 items-center justify-between gap-3 rounded-lg border border-slate-800 px-3 text-sm hover:border-cyan-400/40"><span className="flex items-center gap-2">{check.ready ? <CheckCircle2 className="size-4 text-emerald-300" /> : <CircleAlert className="size-4 text-amber-300" />}{check.label}</span><ChevronRight className="size-4 text-slate-600" /></Link>)}</div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs text-slate-400">
        <div className="rounded-lg border border-slate-800 p-2"><p className="font-bold text-slate-100">{jobPurchaseLists.length}</p><p>Material lists</p></div>
        <div className="rounded-lg border border-slate-800 p-2"><p className="font-bold text-slate-100">{jobTesting.length}</p><p>Tests</p></div>
        <div className="rounded-lg border border-slate-800 p-2"><p className="font-bold text-slate-100">{jobDocuments.length}</p><p>Documents</p></div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2"><Link href={jobWorkspaceHref(job.id)} className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-700 px-4 text-sm font-semibold">Open job workspace</Link><Link href="/field" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-700 px-4 text-sm font-semibold"><ShieldCheck className="mr-2 size-4" />Site workspace</Link></div>
    </Card>)}
    </section>}

    <div className="fixed inset-x-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-30 sm:hidden"><Link href="/field" className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 shadow-2xl"><ShieldCheck className="mr-2 size-4" />Open today&apos;s site workspace</Link></div>
  </div>;
}
