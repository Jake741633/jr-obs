"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { BriefcaseBusiness, CalendarDays, Eye, MapPin, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { InputField, TextareaField } from "../../components/ui/FormField";
import { PageHeader } from "../../components/ui/PageHeader";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { EntityEmptyState } from "../../components/crm/EntityEmptyState";
import { useBuildersCollection, useCustomersCollection, useJobsCollection, useJobTimelineCollection } from "../../lib/cloud/coreBusinessCollections";
import { collectionCloudMutationRoute } from "../../lib/cloud/fieldMutationPolicy-core.mjs";
import { canDeleteRecords, canEditFinance } from "../../lib/cloud/permissions";
import { useCloudIdentity } from "../../lib/cloud/useCloudIdentity";
import { canonicalJobStatuses, initialJobTimelineEntry, normaliseJobStatus, transitionJobStatus } from "../../lib/jobManagement-core.mjs";
import { makeId } from "../../lib/storage";
import type { CanonicalJobStatus, Job } from "../../lib/models";

const blank = { title: "", customerId: "", builderId: "", siteAddress: "", status: "Enquiry" as CanonicalJobStatus, startDate: "", value: "", notes: "" };
const jobEditHandoffMessage = "Job creation and commercial editing are managed by the office. Deletion requires an owner or administrator. Assigned jobs remain available to view, and status changes use the secure field job route.";
const jobDeleteHandoffMessage = "Only an owner or administrator can delete a job.";

export default function JobsPage() {
  const identityState = useCloudIdentity();
  const directJobMutation = identityState.identity
    ? collectionCloudMutationRoute("jobs", identityState.identity.role).kind === "direct"
    : false;
  const jobEditRestricted = identityState.mode !== "local" && (
    !identityState.identity
    || !canEditFinance(identityState.identity.role)
    || !directJobMutation
  );
  const jobDeleteRestricted = identityState.mode !== "local" && (
    !identityState.identity
    || !canDeleteRecords(identityState.identity.role)
    || !directJobMutation
  );
  const jobs = useJobsCollection();
  const customers = useCustomersCollection();
  const builders = useBuildersCollection();
  const timeline = useJobTimelineCollection();
  const [form, setForm] = useState(blank);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"All" | CanonicalJobStatus>("All");
  const [error, setError] = useState("");
  const customerNames = useMemo(() => new Map(customers.items.map((item) => [item.id, item.name])), [customers.items]);
  const builderNames = useMemo(() => new Map(builders.items.map((item) => [item.id, item.companyName])), [builders.items]);
  const filtered = useMemo(() => jobs.items.filter((job) => (status === "All" || normaliseJobStatus(job.status) === status) && `${job.title} ${job.siteAddress} ${customerNames.get(job.customerId ?? "")} ${builderNames.get(job.builderId ?? "")}`.toLowerCase().includes(search.toLowerCase())), [jobs.items, status, search, customerNames, builderNames]);

  function resetForm() { setForm(blank); setEditingId(null); setShowForm(false); setError(""); }
  function blockJobEdit() {
    if (!jobEditRestricted) return false;
    setError(jobEditHandoffMessage);
    return true;
  }
  function blockJobDelete() {
    if (!jobDeleteRestricted) return false;
    setError(jobDeleteHandoffMessage);
    return true;
  }
  function startEdit(job: Job) {
    if (blockJobEdit()) return;
    setForm({ title: job.title, customerId: job.customerId ?? "", builderId: job.builderId ?? "", siteAddress: job.siteAddress, status: normaliseJobStatus(job.status), startDate: job.startDate, value: job.value ? String(job.value) : "", notes: job.notes });
    setEditingId(job.id);
    setShowForm(true);
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (blockJobEdit()) return;
    if (!form.title.trim()) { setError("Job title is required."); return; }
    if (!form.siteAddress.trim()) { setError("Site address is required."); return; }
    const parsedValue = Number(form.value || 0);
    if (Number.isNaN(parsedValue) || parsedValue < 0) { setError("Estimated value must be a valid positive amount."); return; }
    const now = new Date().toISOString();
    const payload = { title: form.title.trim(), customerId: form.customerId || undefined, builderId: form.builderId || undefined, siteAddress: form.siteAddress.trim(), status: form.status, startDate: form.startDate, value: parsedValue, notes: form.notes };
    if (editingId) {
      const existing = jobs.items.find((job) => job.id === editingId);
      if (!existing) { setError("This job is no longer available. Refresh and try again."); return; }
      const result = transitionJobStatus({ job: { ...existing, ...payload, status: existing.status }, nextStatus: form.status, now, timelineId: makeId("timeline"), completedBy: "JR OS Jobs" });
      jobs.setItems((current) => current.map((job) => job.id === editingId ? { ...result.job, ...payload, status: result.job.status, updatedAt: now } : job));
      if (result.timelineEntry) timeline.setItems((current) => [result.timelineEntry!, ...current]);
    } else {
      const job: Job = { id: makeId("job"), ...payload, createdAt: now, updatedAt: now };
      jobs.setItems((current) => [job, ...current]);
      timeline.setItems((current) => [initialJobTimelineEntry({ job, now, timelineId: makeId("timeline"), completedBy: "JR OS Jobs" }), ...current]);
    }
    resetForm();
  }
  function updateStatus(id: string, nextStatus: CanonicalJobStatus) {
    const job = jobs.items.find((item) => item.id === id);
    if (!job) return;
    const result = transitionJobStatus({ job, nextStatus, now: new Date().toISOString(), timelineId: makeId("timeline"), completedBy: "JR OS Jobs" });
    jobs.setItems((current) => current.map((item) => item.id === id ? result.job : item));
    if (result.timelineEntry) timeline.setItems((current) => [result.timelineEntry!, ...current]);
  }
  function deleteJob(job: Job) {
    if (blockJobDelete()) return;
    if (window.confirm(`Delete ${job.title}? This cannot be undone.`)) jobs.remove((item) => item.id === job.id);
  }
  const relatedName = (job: Job) => customerNames.get(job.customerId ?? "") || builderNames.get(job.builderId ?? "") || "Direct job";

  return <div className="space-y-5 pb-24 sm:space-y-6 sm:pb-0">
    <PageHeader eyebrow="Operations" title="Jobs" description="Track opportunities from first enquiry through scheduling, delivery and completion." action={jobEditRestricted ? undefined : <Button className="w-full sm:w-auto" onClick={() => showForm ? resetForm() : setShowForm(true)}><Plus className="mr-2 size-4" />{showForm ? "Close form" : "Create job"}</Button>} />
    {jobEditRestricted ? <Card><h2 className="font-semibold text-amber-200">Office-managed job records</h2><p className="mt-2 text-sm text-slate-400">{jobEditHandoffMessage}</p></Card> : null}
    {error && (jobEditRestricted || !showForm) ? <p role="alert" className="rounded-xl border border-red-400/20 bg-red-400/5 px-4 py-3 text-sm text-red-300">{error}</p> : null}
    {showForm && !jobEditRestricted ? <Card><form onSubmit={submit} className="grid gap-4 md:grid-cols-2"><InputField required label="Job title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /><InputField required label="Site address" value={form.siteAddress} onChange={(e) => setForm({ ...form, siteAddress: e.target.value })} /><label className="grid gap-2 text-sm font-medium text-slate-300"><span>Customer</span><select value={form.customerId} onChange={(e) => setForm({ ...form, customerId: e.target.value, builderId: "" })} className="min-h-12 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-base sm:text-sm"><option value="">No customer selected</option>{customers.items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="grid gap-2 text-sm font-medium text-slate-300"><span>Builder</span><select value={form.builderId} onChange={(e) => setForm({ ...form, builderId: e.target.value, customerId: "" })} className="min-h-12 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-base sm:text-sm"><option value="">No builder selected</option>{builders.items.map((item) => <option key={item.id} value={item.id}>{item.companyName}</option>)}</select></label><label className="grid gap-2 text-sm font-medium text-slate-300"><span>Status</span><select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as CanonicalJobStatus })} className="min-h-12 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-base sm:text-sm">{canonicalJobStatuses.map((item) => <option key={item}>{item}</option>)}</select></label><InputField label="Start date" type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /><InputField label="Estimated value (£)" type="number" min="0" step="0.01" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} /><div className="md:col-span-2"><TextareaField label="Job notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>{error ? <p className="md:col-span-2 text-sm text-red-300">{error}</p> : null}<div className="md:col-span-2"><Button className="w-full sm:w-auto sm:float-right" type="submit">{editingId ? "Update job" : "Save job"}</Button></div></form></Card> : null}
    <div className="grid gap-3 md:grid-cols-[1fr_auto]"><div className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search jobs" className="min-h-12 w-full rounded-xl border border-slate-800 bg-slate-900 pl-10 pr-4 text-base outline-none focus:border-cyan-400 sm:text-sm" /></div><select value={status} onChange={(e) => setStatus(e.target.value as "All" | CanonicalJobStatus)} className="min-h-12 w-full rounded-xl border border-slate-800 bg-slate-900 px-4 text-base sm:w-auto sm:text-sm"><option>All</option>{canonicalJobStatuses.map((item) => <option key={item}>{item}</option>)}</select></div>
    {!jobs.isReady ? <Card>Loading jobs…</Card> : filtered.length === 0 ? <EntityEmptyState icon={<BriefcaseBusiness className="size-6" />} title={jobs.items.length ? "No matching jobs" : "No jobs yet"} description={jobs.items.length ? "Change the search or status filter." : jobEditRestricted ? "No assigned jobs are currently available." : "Create the first job and connect it to a customer or builder."} /> : <section className="grid gap-4 xl:grid-cols-2">{filtered.map((job) => <Card key={job.id}><div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-start"><div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">{relatedName(job)}</p><h2 className="mt-1 break-words text-lg font-bold sm:text-xl">{job.title}</h2><div className="mt-2"><StatusBadge status={normaliseJobStatus(job.status)} /></div></div><div className={`grid ${jobEditRestricted ? "grid-cols-1" : jobDeleteRestricted ? "grid-cols-2" : "grid-cols-3"} gap-2`}><Link href={`/jobs/${job.id}`} aria-label={`View ${job.title}`} className="grid min-h-12 min-w-12 place-items-center rounded-xl border border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-cyan-300"><Eye className="size-4" /></Link>{!jobEditRestricted ? <button onClick={() => startEdit(job)} aria-label={`Edit ${job.title}`} className="grid min-h-12 min-w-12 place-items-center rounded-xl border border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-cyan-300"><Pencil className="size-4" /></button> : null}{!jobDeleteRestricted ? <button onClick={() => deleteJob(job)} aria-label={`Delete ${job.title}`} className="grid min-h-12 min-w-12 place-items-center rounded-xl border border-slate-800 text-slate-400 hover:bg-red-500/10 hover:text-red-300"><Trash2 className="size-4" /></button> : null}</div></div><div className="mt-4 grid gap-3 text-sm text-slate-400 sm:flex sm:flex-wrap sm:gap-4">{job.siteAddress ? <span className="flex min-w-0 items-start gap-2"><MapPin className="mt-0.5 size-4 shrink-0 text-cyan-400" /><span className="break-words">{job.siteAddress}</span></span> : null}{job.startDate ? <span className="flex items-center gap-2"><CalendarDays className="size-4 text-cyan-400" />{new Date(`${job.startDate}T12:00:00`).toLocaleDateString("en-GB")}</span> : null}{job.value ? <span className="font-semibold text-slate-200">{new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(job.value)}</span> : null}</div><div className="mt-5 grid gap-2 border-t border-slate-800 pt-4 sm:grid-cols-[auto_1fr] sm:items-center"><span className="text-xs text-slate-500">Quick status</span><select aria-label={`Update ${job.title} status`} value={normaliseJobStatus(job.status)} onChange={(e) => updateStatus(job.id, e.target.value as CanonicalJobStatus)} className="min-h-12 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-base sm:text-sm">{canonicalJobStatuses.map((item) => <option key={item}>{item}</option>)}</select></div></Card>)}</section>}
    {!jobEditRestricted ? <div className="fixed inset-x-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-30 sm:hidden"><Button className="w-full shadow-2xl" onClick={() => showForm ? resetForm() : setShowForm(true)}><Plus className="mr-2 size-4" />{showForm ? "Close job form" : "Create job"}</Button></div> : null}
  </div>;
}
