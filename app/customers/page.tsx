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
import type { Customer, Job } from "../../lib/models";

const blank = { name: "", email: "", phone: "", address: "", notes: "" };

export default function CustomersPage() {
  const { items, setItems, remove, isReady } = useCustomersCollection();
  const jobs = useCloudLocalCollection<Job>("jr-os-jobs");
  const [form, setForm] = useState(blank);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");

  const filtered = useMemo(
    () => items.filter((item) => `${item.name} ${item.email} ${item.phone} ${item.address}`.toLowerCase().includes(search.toLowerCase())),
    [items, search],
  );

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

  return <div className="space-y-6">
    <PageHeader eyebrow="CRM" title="Customers" description="Keep customer contact details, addresses and notes together for future jobs and quotes." action={<Button onClick={() => showForm ? resetForm() : setShowForm(true)}><UserPlus className="mr-2 size-4" />{showForm ? "Close form" : "Add customer"}</Button>} />
    {showForm ? <Card><form onSubmit={submit} className="grid gap-4 md:grid-cols-2"><InputField required label="Customer name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /><InputField label="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /><InputField label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /><InputField label="Address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /><div className="md:col-span-2"><TextareaField label="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>{error ? <p className="md:col-span-2 text-sm text-red-300">{error}</p> : null}<div className="md:col-span-2 flex justify-end"><Button type="submit">{editingId ? "Update customer" : "Save customer"}</Button></div></form></Card> : null}
    <div className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search customers" className="min-h-11 w-full rounded-xl border border-slate-800 bg-slate-900 pl-10 pr-4 text-sm outline-none focus:border-cyan-400" /></div>
    {!isReady ? <Card>Loading customers…</Card> : filtered.length === 0 ? <EntityEmptyState icon={<Users className="size-6" />} title={items.length ? "No matching customers" : "No customers yet"} description={items.length ? "Try a different search." : "Add your first customer to begin building the JR OS customer database."} /> : <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{filtered.map((customer) => {
      const linkedJobs = linkedJobCounts.get(customer.id) ?? 0;
      return <Card key={customer.id}><div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-bold">{customer.name}</h2><p className="mt-1 text-xs text-slate-500">{linkedJobs} linked job{linkedJobs === 1 ? "" : "s"}</p></div><div className="flex"><Link href={`/customers/${customer.id}`} aria-label={`View ${customer.name}`} className="rounded-lg p-2 text-slate-500 hover:bg-slate-800 hover:text-cyan-300"><Eye className="size-4" /></Link><button onClick={() => startEdit(customer)} aria-label={`Edit ${customer.name}`} className="rounded-lg p-2 text-slate-500 hover:bg-slate-800 hover:text-cyan-300"><Pencil className="size-4" /></button><button onClick={() => deleteCustomer(customer)} aria-label={`Delete ${customer.name}`} className="rounded-lg p-2 text-slate-500 hover:bg-red-500/10 hover:text-red-300"><Trash2 className="size-4" /></button></div></div><div className="mt-4 space-y-2 text-sm text-slate-400">{customer.phone ? <p className="flex gap-2"><Phone className="size-4 text-cyan-400" />{customer.phone}</p> : null}{customer.email ? <p className="flex gap-2"><Mail className="size-4 text-cyan-400" />{customer.email}</p> : null}{customer.address ? <p className="flex gap-2"><MapPin className="size-4 shrink-0 text-cyan-400" />{customer.address}</p> : null}</div></Card>;
    })}</section>}
  </div>;
}
