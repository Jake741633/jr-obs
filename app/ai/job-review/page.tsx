"use client";

import Link from "next/link";
import { useState } from "react";
import { AlertTriangle, ArrowLeft, BriefcaseBusiness, CalendarCheck2, CheckCircle2, ClipboardCheck, ShieldCheck } from "lucide-react";
import { Card } from "../../../components/ui/Card";
import { PageHeader } from "../../../components/ui/PageHeader";
import { canAccessPath } from "../../../lib/cloud/permissions";
import { useCloudIdentity } from "../../../lib/cloud/useCloudIdentity";
import { useLocalStorageCollection } from "../../../lib/storage";
import type { ElectricalCertificate, Job, JobDocument, PlannerEntry, PricingDocument, RamsDocument, SiteSurvey } from "../../../lib/models";

type FindingLevel = "Action" | "Check" | "Ready";

type Finding = {
  level: FindingLevel;
  title: string;
  detail: string;
  href?: string;
};

const today = new Date().toISOString().slice(0, 10);

export default function JobReviewPage() {
  const { identity, mode } = useCloudIdentity();
  const unrestricted = mode === "local" || (mode === "migration" && !identity);
  const ramsHref = unrestricted || canAccessPath(identity?.role, "/rams", identity?.email) ? "/rams" : undefined;
  const canOpenSiteManagement = unrestricted || canAccessPath(identity?.role, "/site-management", identity?.email);
  const jobs = useLocalStorageCollection<Job>("jr-os-jobs");
  const pricing = useLocalStorageCollection<PricingDocument>("jr-os-pricing-documents");
  const surveys = useLocalStorageCollection<SiteSurvey>("jr-os-surveys");
  const rams = useLocalStorageCollection<RamsDocument>("jr-os-rams");
  const planner = useLocalStorageCollection<PlannerEntry>("jr-os-planner");
  const certificates = useLocalStorageCollection<ElectricalCertificate>("jr-os-certificates");
  const documents = useLocalStorageCollection<JobDocument>("jr-os-job-documents");
  const [selectedId, setSelectedId] = useState("");

  const ready = jobs.isReady && pricing.isReady && surveys.isReady && rams.isReady && planner.isReady && certificates.isReady && documents.isReady;
  const reviewableJobs = jobs.items.filter((job) => job.status !== "Complete");
  const selected = reviewableJobs.find((job) => job.id === selectedId) || reviewableJobs[0];
  const findings: Finding[] = [];

  if (selected) {
    const linkedQuotes = pricing.items.filter((item) => item.jobId === selected.id && item.type === "Quote");
    const acceptedQuote = linkedQuotes.find((item) => item.status === "Accepted");
    const linkedSurvey = surveys.items.find((item) => item.jobId === selected.id);
    const linkedRams = rams.items.find((item) => item.jobId === selected.id && item.status !== "Superseded");
    const plannerEntries = planner.items.filter((item) => item.jobId === selected.id && item.status !== "Cancelled");
    const linkedCertificates = certificates.items.filter((item) => item.jobId === selected.id);
    const linkedDocuments = documents.items.filter((item) => item.jobId === selected.id);

    if (!selected.customerId && !selected.builderId) findings.push({ level: "Action", title: "No customer or builder linked", detail: "Link the job to the correct customer or builder before work is arranged.", href: `/jobs/${selected.id}` });
    else findings.push({ level: "Ready", title: "Client record linked", detail: "The job is connected to a customer or builder record." });

    if (!selected.siteAddress.trim()) findings.push({ level: "Action", title: "Site address missing", detail: "Add the full work address so scheduling, paperwork and certificates use the correct location.", href: `/jobs/${selected.id}` });
    else findings.push({ level: "Ready", title: "Site address recorded", detail: selected.siteAddress });

    if (!selected.startDate) findings.push({ level: "Action", title: "No start date", detail: "Add a realistic start date before committing labour or deliveries.", href: "/planner" });
    else if (selected.startDate < today && selected.status === "Scheduled") findings.push({ level: "Check", title: "Scheduled start date has passed", detail: "Confirm whether the job has started or update its date and status.", href: `/jobs/${selected.id}` });
    else findings.push({ level: "Ready", title: "Start date set", detail: new Date(`${selected.startDate}T12:00:00`).toLocaleDateString("en-GB") });

    if (!selected.targetCompletionDate) findings.push({ level: "Check", title: "No target completion date", detail: "A completion target helps manage customer expectations and resource clashes.", href: `/jobs/${selected.id}` });
    if (!selected.value) findings.push({ level: "Check", title: "Job value missing", detail: "Record the expected sales value so workload and finance reporting remain useful.", href: `/jobs/${selected.id}` });

    if (!acceptedQuote) findings.push({ level: selected.status === "Lead" || selected.status === "Quoted" ? "Check" : "Action", title: "No accepted quote linked", detail: linkedQuotes.length ? "A quote exists, but none is marked accepted." : "Create and link a quote before chargeable work begins.", href: "/quotes" });
    else findings.push({ level: "Ready", title: "Accepted quote linked", detail: `${acceptedQuote.number} · ${acceptedQuote.title}` });

    if (!linkedSurvey) findings.push({ level: "Check", title: "No survey record", detail: "For larger or uncertain work, create a survey to capture access, installation details, risks and labour assumptions.", href: "/surveys" });
    else if (linkedSurvey.status !== "Complete") findings.push({ level: "Check", title: "Survey is incomplete", detail: `${linkedSurvey.number} is currently ${linkedSurvey.status.toLowerCase()}.`, href: "/surveys" });
    else findings.push({ level: "Ready", title: "Survey complete", detail: `${linkedSurvey.number} is ready for use.` });

    if (!linkedRams) findings.push({ level: "Check", title: "No RAMS linked", detail: "Decide whether this job needs a risk assessment and method statement before attendance.", href: ramsHref });
    else if (linkedRams.status !== "Approved") findings.push({ level: "Check", title: "RAMS not approved", detail: `${linkedRams.number} is ${linkedRams.status.toLowerCase()}.`, href: ramsHref });
    else findings.push({ level: "Ready", title: "RAMS approved", detail: `${linkedRams.number} is approved.` });

    if (!plannerEntries.length && selected.startDate) findings.push({ level: "Check", title: "No planner booking", detail: "Add the job to the resource planner and assign the required team members.", href: "/planner" });
    else if (plannerEntries.length) findings.push({ level: "Ready", title: "Planner booking found", detail: `${plannerEntries.length} active planner entr${plannerEntries.length === 1 ? "y" : "ies"} linked.` });

    if (!selected.assignedTo?.length) findings.push({ level: "Check", title: "No team assigned", detail: "Assign the electrician, mate or subcontractor responsible for the work.", href: `/jobs/${selected.id}` });
    else findings.push({ level: "Ready", title: "Team assigned", detail: selected.assignedTo.join(", ") });

    if (!selected.notes.trim()) findings.push({ level: "Check", title: "No job notes", detail: "Add access details, agreed exclusions, customer requests and anything the engineer must know.", href: `/jobs/${selected.id}` });

    if (!linkedDocuments.length) findings.push({ level: "Check", title: "No job documents", detail: "Upload useful drawings, photos, instructions or handover information where applicable.", href: canOpenSiteManagement ? "/site-management" : `/jobs/${selected.id}` });
    else findings.push({ level: "Ready", title: "Documents available", detail: `${linkedDocuments.length} document${linkedDocuments.length === 1 ? "" : "s"} linked to the job.` });

    if (linkedCertificates.length) findings.push({ level: "Ready", title: "Certificate records linked", detail: `${linkedCertificates.length} certificate record${linkedCertificates.length === 1 ? "" : "s"} found.` });
    else findings.push({ level: "Check", title: "No certificate record yet", detail: "Confirm what certification will be required at completion and prepare the correct record.", href: "/certificates" });
  }

  const actions = findings.filter((item) => item.level === "Action").length;
  const checks = findings.filter((item) => item.level === "Check").length;
  const score = Math.max(0, Math.min(100, 100 - actions * 18 - checks * 7));

  if (!ready) return <Card>Preparing job review…</Card>;

  return <main className="space-y-6">
    <PageHeader eyebrow="JR AI" title="Job readiness review" description="Check whether a job has the commercial, scheduling, safety and site information needed before work starts." action={<Link href="/ai" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 text-sm font-semibold hover:bg-slate-800"><ArrowLeft className="size-4" />AI Office</Link>} />

    {!reviewableJobs.length ? <Card><BriefcaseBusiness className="size-7 text-cyan-300" /><h2 className="mt-3 text-xl font-semibold">No active jobs to review</h2><p className="mt-2 text-sm text-slate-400">Create a job or reopen an existing job to run the readiness check.</p><Link href="/jobs" className="mt-4 inline-block text-sm font-semibold text-cyan-300">Open jobs</Link></Card> : <>
      <Card><label className="space-y-2 text-sm"><span className="font-semibold">Job to review</span><select className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3" value={selected?.id || ""} onChange={(event) => setSelectedId(event.target.value)}>{reviewableJobs.map((job) => <option key={job.id} value={job.id}>{job.title || "Untitled job"} · {job.status}</option>)}</select></label></Card>

      {selected ? <>
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card><ShieldCheck className="size-5 text-cyan-300" /><p className="mt-3 text-sm text-slate-400">Readiness score</p><p className="mt-2 text-3xl font-bold">{score}/100</p></Card>
          <Card><AlertTriangle className="size-5 text-red-300" /><p className="mt-3 text-sm text-slate-400">Actions required</p><p className="mt-2 text-3xl font-bold">{actions}</p></Card>
          <Card><ClipboardCheck className="size-5 text-amber-300" /><p className="mt-3 text-sm text-slate-400">Checks advised</p><p className="mt-2 text-3xl font-bold">{checks}</p></Card>
          <Card><CalendarCheck2 className="size-5 text-emerald-300" /><p className="mt-3 text-sm text-slate-400">Current status</p><p className="mt-2 text-xl font-bold">{selected.status}</p></Card>
        </section>

        <Card>
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-bold">Readiness findings</h2><p className="text-sm text-slate-400">Review each point before committing labour, materials or a start date.</p></div><Link href={`/jobs/${selected.id}`} className="text-sm font-semibold text-cyan-300">Open job</Link></div>
          <div className="mt-5 space-y-3">{findings.map((finding, index) => {
            const content = <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4"><div className="flex items-start gap-3">{finding.level === "Ready" ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-300" /> : <AlertTriangle className={`mt-0.5 size-5 shrink-0 ${finding.level === "Action" ? "text-red-300" : "text-amber-300"}`} />}<div><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${finding.level === "Ready" ? "bg-emerald-500/10 text-emerald-300" : finding.level === "Action" ? "bg-red-500/10 text-red-300" : "bg-amber-500/10 text-amber-300"}`}>{finding.level}</span><h3 className="font-semibold">{finding.title}</h3></div><p className="mt-1 text-sm text-slate-400">{finding.detail}</p>{finding.href ? <p className="mt-2 text-xs font-semibold text-cyan-300">Open related record</p> : null}</div></div></div>;
            return finding.href ? <Link key={`${finding.title}-${index}`} href={finding.href}>{content}</Link> : <div key={`${finding.title}-${index}`}>{content}</div>;
          })}</div>
        </Card>
      </> : null}
    </>}
  </main>;
}
