"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { Eye, Mail, MapPin, Pencil, Phone, Search, Trash2, UserPlus, Users } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { InputField, TextareaField } from "../../components/ui/FormField";
import { PageHeader } from "../../components/ui/PageHeader";
import { EntityEmptyState } from "../../components/crm/EntityEmptyState";
import { useCustomersCollection } from "../../lib/cloud/coreBusinessCollections";
import { makeId, useCloudLocalCollection } from "../../lib/storage";
import { contactEmailHref, contactPhoneHref } from "../../lib/contactLinks";
import type { Customer, Job } from "../../lib/models";

const blank = { name: "", email: "", phone: "", address: "", notes: "" };

export default function CustomersPage() {
  const { items, setItems, remove, isReady } = useCustomersCollection();
  const jobs = useCloudLocalCollection<Job>("jr-os-jobs");
  const [form, setForm] = useState(blank);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(8);
  const [error, setError] = useState("");

  const filtered = useMemo(() => {
    const words = search.trim().toLocaleLowerCase("en-GB").split(/\s+/).filter(Boolean);
    return items.filter((item) => {
      const searchable = [item.name, item.email, item.phone, item.address, typeof item.phone === "string" ? item.phone.replace(/[\s().-]/g, "") : ""].filter((value) => typeof value === "string").join(" ").toLocaleLowerCase("en-GB");
      return words.every((word) => searchable.includes(word));
    });
  }, [items, search]);

  const linkedJobCounts = useMemo(() => {
    const counts = new Map<string, number>();
    jobs.items.forEach((job) => {
      if (job.customerId) counts.set(job.customerId, (counts.get(job.customerId) ?? 0) + 1);
    });
    return counts;
  }, [jobs.items]);

  function resetForm() {
    setForm(blank);
    setEditingId(null);
    setShowForm(false);
    setError("");
  }

  function startEdit(customer: Customer) {
    setForm({ name: customer.name, email: customer.email, phone: customer.phone, address: customer.address, notes: customer.notes });
    setEditingId(customer.id);
    setShowForm(true);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!form.name.trim()) { setError("Customer name is required."); return; }
    if (!form.email.trim() && !form.phone.trim()) { setError("Add at least a phone number or email address."); return; }
    const now = new Date().toISOString();
    setItems((current) => editingId
      ? current.map((item) => item.id === editingId ? { ...item, ...form, name: form.name.trim(), updatedAt: now } : item)
      : [{ id: makeId("cus"), ...form, name: form.name.trim(), createdAt: now, updatedAt: now }, ...current]);
    resetForm();
  }

  function deleteCustomer(customer: Customer) {
    const linkedJobs = linkedJobCounts.get(customer.id) ?? 0;
    if (linkedJobs > 0) {
      window.alert(`${customer.name} cannot be deleted because ${linkedJobs} job${linkedJobs === 1 ? " is" : "s are"} linked to this customer. Reassign or delete the linked job${linkedJobs === 1 ? "" : "s"} first.`);
      return;
    }
    if (window.confirm(`Delete ${customer.name}? This cannot be undone.`)) remove((item) => item.id === customer.id);
  }

  return <div className="space-y-5 pb-24 sm:space-y-6 sm:pb-0">
    <PageHeader eyebrow="CRM" title="Customers" description="Keep customer contact details, addresses and notes together for future jobs and quotes." action={<Button onClick={() => showForm ? resetForm() : setShowForm(true)}><UserPlus className="mr-2 size-4" />{showForm ? "Close form" : "Add customer"}</Button>} />
    {showForm ? <Card><form onSubmit={submit} className="grid gap-4 md:grid-cols-2"><InputField required label="Customer name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /><InputField label="Phone" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /><InputField label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /><InputField label="Address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /><div className="md:col-span-2"><TextareaField label="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>{error ? <p className="md:col-span-2 text-sm text-red-300">{error}</p> : null}<div className="md:col-span-2 flex justify-end"><Button type="submit">{editingId ? "Update customer" : "Save customer"}</Button></div></form></Card> : null}
    <section aria-label="Find customers" className="space-y-3">
      <label className="grid gap-2 text-sm font-semibold"><span>Find a customer</span><span className="relative"><Search aria-hidden="true" className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" /><input type="search" value={search} onChange={(e) => { setSearch(e.target.value); setLimit(8); }} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } }} autoComplete="off" enterKeyHint="search" placeholder="Name, phone, email or address" className="min-h-12 w-full rounded-xl border border-slate-800 bg-slate-900 pl-10 pr-4 text-base outline-none focus:border-cyan-400 sm:text-sm" /></span></label>
      <div className="flex flex-wrap items-center justify-between gap-2">{isReady ? <p role="status" className="text-sm text-slate-400">Showing {Math.min(limit, filtered.length)} of {filtered.length} matching customer records</p> : null}<button type="button" onClick={() => { setSearch(""); setLimit(8); }} className="min-h-12 rounded-xl border border-slate-700 px-4 text-sm font-semibold text-slate-300">Clear customer search</button></div>
    </section>
    {!isReady ? <Card>Loading customers…</Card> : filtered.length === 0 ? <EntityEmptyState icon={<Users className="size-6" />} title={items.length ? "No matching customers" : "No customers yet"} description={items.length ? "Try a different search." : "Add your first customer to begin building the JR OS customer database."} /> : <section aria-label="Customer records" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{filtered.slice(0, limit).map((customer) => {
      const linkedJobs = linkedJobCounts.get(customer.id) ?? 0;
      const phoneHref = contactPhoneHref(customer.phone), emailHref = contactEmailHref(customer.email);
      return <Card key={customer.id}>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-start">
          <div className="min-w-0"><h2 className="break-words text-lg font-bold">{customer.name}</h2><p className="mt-1 text-xs text-slate-500">{jobs.isReady ? `${linkedJobs} linked job record${linkedJobs === 1 ? "" : "s"}` : "Linked jobs loading…"}</p></div>
          <div className="grid grid-cols-3 gap-2"><Link href={`/customers/${encodeURIComponent(customer.id)}`} aria-label={`View ${customer.name}`} className="grid min-h-12 min-w-12 place-items-center rounded-xl border border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-cyan-300"><Eye className="size-4" /></Link><button onClick={() => startEdit(customer)} aria-label={`Edit ${customer.name}`} className="grid min-h-12 min-w-12 place-items-center rounded-xl border border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-cyan-300"><Pencil className="size-4" /></button><button onClick={() => deleteCustomer(customer)} aria-label={`Delete ${customer.name}`} className="grid min-h-12 min-w-12 place-items-center rounded-xl border border-slate-800 text-slate-400 hover:bg-red-500/10 hover:text-red-300"><Trash2 className="size-4" /></button></div>
        </div>
        <div className="mt-4 space-y-2 text-sm text-slate-400">
          {customer.phone ? phoneHref ? <a href={phoneHref} aria-label={`Call ${customer.name} on ${customer.phone}`} className="flex min-h-12 items-center gap-2 rounded-xl border border-slate-800 px-3 text-cyan-200"><Phone className="size-4 shrink-0" /><span className="break-words">{customer.phone}</span></a> : <p className="flex items-start gap-2"><Phone className="mt-0.5 size-4 shrink-0" /><span className="break-words">{customer.phone}<span className="block text-xs text-amber-200">Review phone format to call</span></span></p> : null}
          {customer.email ? emailHref ? <a href={emailHref} aria-label={`Email ${customer.name} at ${customer.email}`} className="flex min-h-12 items-center gap-2 rounded-xl border border-slate-800 px-3 text-cyan-200"><Mail className="size-4 shrink-0" /><span className="min-w-0 break-all">{customer.email}</span></a> : <p className="flex items-start gap-2"><Mail className="mt-0.5 size-4 shrink-0" /><span className="min-w-0 break-all">{customer.email}<span className="block text-xs text-amber-200">Review email format to compose</span></span></p> : null}
          {customer.address ? <p className="flex items-start gap-2"><MapPin className="mt-0.5 size-4 shrink-0 text-cyan-400" /><span className="break-words">{customer.address}</span></p> : null}
        </div>
      </Card>;
    })}</section>}
    {isReady && filtered.length > limit ? <button type="button" onClick={() => setLimit((value) => value + 8)} className="min-h-12 w-full rounded-xl border border-slate-700 px-4 text-sm font-semibold">Show more customers ({filtered.length - limit} remaining)</button> : null}
  </div>;
}
