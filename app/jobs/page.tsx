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
import { makeId, useLocalStorageCollection } from "../../lib/storage";
import type { Builder, Customer, Job, JobStatus } from "../../lib/models";

const statuses: JobStatus[] = ["Lead", "Quoted", "Scheduled", "In progress", "Complete", "On hold"];
const blank = { title: "", customerId: "", builderId: "", siteAddress: "", status: "Lead" as JobStatus, startDate: "", value: "", notes: "" };

export default function JobsPage() {
  const jobs = useLocalStorageCollection<Job>("jr-os-jobs");
  const customers = useLocalStorageCollection<Customer>("jr-os-customers");
  const builders = useLocalStorageCollection<Builder>("jr-os-builders");
  const [form, setForm] = useState(blank);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"All" | JobStatus>("All");
  const [error, setError] = useState("");
  const customerNames = useMemo(() => new Map(customers.items.map((item) => [item.id, item.name])), [customers.items]);
  const builderNames = useMemo(() => new Map(builders.items.map((item) => [item.id, item.companyName])), [builders.items]);
  const filtered = useMemo(() => jobs.items.filter((job) => (status === "All" || job.status === status) && `${job.title} ${job.siteAddress} ${customerNames.get(job.customerId ?? "")} ${builderNames.get(job.builderId ?? "")}`.toLowerCase().includes(search.toLowerCase())), [jobs.items, status, search, customerNames, builderNames]);

  function resetForm() { setForm(blank); setEditingId(null); setShowForm(false); setError(""); }
  function startEdit(job: Job) { setForm({ title: job.title, customerId: job.customerId ?? "", builderId: job.builderId ?? "", siteAddress: job.siteAddress, status: job.status, startDate: job.startDate, value: job.value ? String(job.value) : "", notes: job.notes }); setEditingId(job.id); setShowForm(true); }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!form.title.trim()) { setError("Job title is required."); return; }
    if (!form.siteAddress.trim()) { setError("Site address is required."); return; }
    const parsedValue = Number(form.value || 0);
    if (Number.isNaN(parsedValue) || parsedValue < 0) { setError("Estimated value must be a valid positive amount."); return; }
    const now = new Date().toISOString();
    const payload = { title: form.title.trim(), customerId: form.customerId || undefined, builderId: form.builderId || undefined, siteAddress: form.siteAddress.trim(), status: form.status, startDate: form.startDate, value: parsedValue, notes: form.notes };
    jobs.setItems((current) => editingId
      ? current.map((job) => job.id === editingId ? { ...job, ...payload, updatedAt: now } : job)
      : [{ id: makeId("job"), ...payload, createdAt: now, updatedAt: now }, ...current]);
    resetForm();
  }
  function updateStatus(id: string, nextStatus: JobStatus) { jobs.setItems((current) => current.map((job) => job.id === id ? { ...job, status: nextStatus, updatedAt: new Date().toISOString() } : job)); }
  function deleteJob(job: Job) { if (window.confirm(`Delete ${job.title}? This cannot be undone.`)) jobs.remove((item) => item.id === job.id); }
  const relatedName = (job: Job) => customerNames.get(job.customerId ?? "") || builderNames.get(job.builderId ?? "") || "Direct job";

  return <div className="space-y-6">
    <PageHeader eyebrow="Operations" title="Jobs" description="Track opportunities from first enquiry through scheduling, delivery and completion." action={<Button onClick={() => showForm ? resetForm() : setShowForm(true)}><Plus className="mr-2 size-4" />{showForm ? "Close form" : "Create job"}</Button>} />
    {showForm ? <Card><form onSubmit={submit} className="grid gap-4 md:grid-cols-2"><InputField required label="Job title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /><InputField required label="Site address" value={form.siteAddress} onChange={(e) => setForm({ ...form, siteAddress: e.target.value })} /><label className="grid gap-2 text-sm font-medium text-slate-300"><span>Customer</span><select value={form.customerId} onChange={(e) => setForm({ ...form, customerId: e.target.value, builderId: "" })} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3"><option value="">No customer selected</option>{customers.items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="grid gap-2 text-sm font-medium text-slate-300"><span>Builder</span><select value={form.builderId} onChange={(e) => setForm({ ...form, builderId: e.target.value, customerId: "" })} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3"><option value="">No builder selected</option>{builders.items.map((item) => <option key={item.id} value={item.id}>{item.companyName}</option>)}</select></label><label className="grid gap-2 text-sm font-medium text-slate-300"><span>Status</span><select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as JobStatus })} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3">{statuses.map((item) => <option key={item}>{item}</option>)}</select></label><InputField label="Start date" type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /><InputField label="Estimated value (£)" type="number" min="0" step="0.01" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} /><div className="md:col-span-2"><TextareaField label="Job notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>{error ? <p className="md:col-span-2 text-sm text-red-300">{error}</p> : null}<div className="md:col-span-2 flex justify-end"><Button type="submit">{editingId ? "Update job" : "Save job"}</Button></div></form></Card> : null}
    <div className="grid gap-3 md:grid-cols-[1fr_auto]"><div className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search jobs" className="min-h-11 w-full rounded-xl border border-slate-800 bg-slate-900 pl-10 pr-4 text-sm outline-none focus:border-cyan-400" /></div><select value={status} onChange={(e) => setStatus(e.target.value as "All" | JobStatus)} className="min-h-11 rounded-xl border border-slate-800 bg-slate-900 px-4 text-sm"><option>All</option>{statuses.map((item) => <option key={item}>{item}</option>)}</select></div>
    {!jobs.isReady ? <Card>Loading jobs…</Card> : filtered.length === 0 ? <EntityEmptyState icon={<BriefcaseBusiness className="size-6" />} title={jobs.items.length ? "No matching jobs" : "No jobs yet"} description={jobs.items.length ? "Change the search or status filter." : "Create the first job and connect it to a customer or builder."} /> : <section className="grid gap-4 xl:grid-cols-2">{filtered.map((job) => <Card key={job.id}><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">{relatedName(job)}</p><h2 className="mt-1 text-xl font-bold">{job.title}</h2><div className="mt-2"><StatusBadge status={job.status} /></div></div><div className="flex"><Link href={`/jobs/${job.id}`} aria-label={`View ${job.title}`} className="rounded-lg p-2 text-slate-500 hover:bg-slate-800 hover:text-cyan-300"><Eye className="size-4" /></Link><button onClick={() => startEdit(job)} aria-label={`Edit ${job.title}`} className="rounded-lg p-2 text-slate-500 hover:bg-slate-800 hover:text-cyan-300"><Pencil className="size-4" /></button><button onClick={() => deleteJob(job)} aria-label={`Delete ${job.title}`} className="rounded-lg p-2 text-slate-500 hover:bg-red-500/10 hover:text-red-300"><Trash2 className="size-4" /></button></div></div><div className="mt-4 flex flex-wrap gap-4 text-sm text-slate-400">{job.siteAddress ? <span className="flex items-center gap-2"><MapPin className="size-4 text-cyan-400" />{job.siteAddress}</span> : null}{job.startDate ? <span className="flex items-center gap-2"><CalendarDays className="size-4 text-cyan-400" />{new Date(`${job.startDate}T12:00:00`).toLocaleDateString("en-GB")}</span> : null}{job.value ? <span className="font-semibold text-slate-200">{new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(job.value)}</span> : null}</div><div className="mt-5 flex items-center gap-3 border-t border-slate-800 pt-4"><span className="text-xs text-slate-500">Update status</span><select value={job.status} onChange={(e) => updateStatus(job.id, e.target.value as JobStatus)} className="min-h-10 flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm">{statuses.map((item) => <option key={item}>{item}</option>)}</select></div></Card>)}</section>}
  </div>;
}
