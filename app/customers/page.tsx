"use client";

import { FormEvent, useMemo, useState } from "react";
import { Eye, Mail, MapPin, Pencil, Phone, Search, Trash2, UserPlus, Users } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { InputField, TextareaField } from "../../components/ui/FormField";
import { PageHeader } from "../../components/ui/PageHeader";
import { EntityEmptyState } from "../../components/crm/EntityEmptyState";
import { makeId, useLocalStorageCollection } from "../../lib/storage";
import type { Customer } from "../../lib/models";

const blank = { name: "", email: "", phone: "", address: "", notes: "" };

export default function CustomersPage() {
  const { items, setItems, remove, isReady } = useLocalStorageCollection<Customer>("jr-os-customers");
  const [form, setForm] = useState(blank);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const filtered = useMemo(() => items.filter((item) => `${item.name} ${item.email} ${item.phone} ${item.address}`.toLowerCase().includes(search.toLowerCase())), [items, search]);
  const viewing = items.find((item) => item.id === viewingId);

  function resetForm() { setForm(blank); setEditingId(null); setShowForm(false); setError(""); }
  function startEdit(customer: Customer) { setForm({ name: customer.name, email: customer.email, phone: customer.phone, address: customer.address, notes: customer.notes }); setEditingId(customer.id); setShowForm(true); setViewingId(null); }
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
  function deleteCustomer(customer: Customer) { if (window.confirm(`Delete ${customer.name}? This cannot be undone.`)) remove((item) => item.id === customer.id); }

  return <div className="space-y-6">
    <PageHeader eyebrow="CRM" title="Customers" description="Keep customer contact details, addresses and notes together for future jobs and quotes." action={<Button onClick={() => showForm ? resetForm() : setShowForm(true)}><UserPlus className="mr-2 size-4" />{showForm ? "Close form" : "Add customer"}</Button>} />
    {showForm ? <Card><form onSubmit={submit} className="grid gap-4 md:grid-cols-2"><InputField required label="Customer name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /><InputField label="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /><InputField label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /><InputField label="Address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /><div className="md:col-span-2"><TextareaField label="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>{error ? <p className="md:col-span-2 text-sm text-red-300">{error}</p> : null}<div className="md:col-span-2 flex justify-end"><Button type="submit">{editingId ? "Update customer" : "Save customer"}</Button></div></form></Card> : null}
    {viewing ? <Card className="border-cyan-400/30"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">Customer record</p><h2 className="mt-1 text-xl font-bold">{viewing.name}</h2></div><Button variant="secondary" onClick={() => setViewingId(null)}>Close</Button></div><div className="mt-5 grid gap-3 text-sm text-slate-300 md:grid-cols-2"><p>Phone: {viewing.phone || "Not provided"}</p><p>Email: {viewing.email || "Not provided"}</p><p className="md:col-span-2">Address: {viewing.address || "Not provided"}</p><p className="md:col-span-2">Notes: {viewing.notes || "No notes"}</p></div></Card> : null}
    <div className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search customers" className="min-h-11 w-full rounded-xl border border-slate-800 bg-slate-900 pl-10 pr-4 text-sm outline-none focus:border-cyan-400" /></div>
    {!isReady ? <Card>Loading customers…</Card> : filtered.length === 0 ? <EntityEmptyState icon={<Users className="size-6" />} title={items.length ? "No matching customers" : "No customers yet"} description={items.length ? "Try a different search." : "Add your first customer to begin building the JR OS customer database."} /> : <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{filtered.map((customer) => <Card key={customer.id}><div className="flex items-start justify-between gap-3"><h2 className="text-lg font-bold">{customer.name}</h2><div className="flex"><button onClick={() => setViewingId(customer.id)} aria-label={`View ${customer.name}`} className="rounded-lg p-2 text-slate-500 hover:bg-slate-800 hover:text-cyan-300"><Eye className="size-4" /></button><button onClick={() => startEdit(customer)} aria-label={`Edit ${customer.name}`} className="rounded-lg p-2 text-slate-500 hover:bg-slate-800 hover:text-cyan-300"><Pencil className="size-4" /></button><button onClick={() => deleteCustomer(customer)} aria-label={`Delete ${customer.name}`} className="rounded-lg p-2 text-slate-500 hover:bg-red-500/10 hover:text-red-300"><Trash2 className="size-4" /></button></div></div><div className="mt-4 space-y-2 text-sm text-slate-400">{customer.phone ? <p className="flex gap-2"><Phone className="size-4 text-cyan-400" />{customer.phone}</p> : null}{customer.email ? <p className="flex gap-2"><Mail className="size-4 text-cyan-400" />{customer.email}</p> : null}{customer.address ? <p className="flex gap-2"><MapPin className="size-4 shrink-0 text-cyan-400" />{customer.address}</p> : null}</div></Card>)}</section>}
  </div>;
}
