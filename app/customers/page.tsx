"use client";

import { FormEvent, useMemo, useState } from "react";
import { Mail, MapPin, Phone, Search, Trash2, UserPlus, Users } from "lucide-react";
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
  const [form, setForm] = useState(blank); const [showForm, setShowForm] = useState(false); const [search, setSearch] = useState("");
  const filtered = useMemo(() => items.filter((item) => `${item.name} ${item.email} ${item.phone} ${item.address}`.toLowerCase().includes(search.toLowerCase())), [items, search]);
  function submit(event: FormEvent) { event.preventDefault(); const now = new Date().toISOString(); setItems((current) => [{ id: makeId("cus"), ...form, createdAt: now, updatedAt: now }, ...current]); setForm(blank); setShowForm(false); }
  return <div className="space-y-6"><PageHeader eyebrow="CRM" title="Customers" description="Keep customer contact details, addresses and notes together for future jobs and quotes." action={<Button onClick={() => setShowForm((value) => !value)}><UserPlus className="mr-2 size-4" />{showForm ? "Close form" : "Add customer"}</Button>} />
    {showForm ? <Card><form onSubmit={submit} className="grid gap-4 md:grid-cols-2"><InputField required label="Customer name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /><InputField label="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /><InputField label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /><InputField label="Address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /><div className="md:col-span-2"><TextareaField label="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div><div className="md:col-span-2 flex justify-end"><Button type="submit">Save customer</Button></div></form></Card> : null}
    <div className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search customers" className="min-h-11 w-full rounded-xl border border-slate-800 bg-slate-900 pl-10 pr-4 text-sm outline-none focus:border-cyan-400" /></div>
    {!isReady ? <Card>Loading customers…</Card> : filtered.length === 0 ? <EntityEmptyState icon={<Users className="size-6" />} title={items.length ? "No matching customers" : "No customers yet"} description={items.length ? "Try a different search." : "Add your first customer to begin building the JR OS customer database."} /> : <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{filtered.map((customer) => <Card key={customer.id} className="relative"><button onClick={() => remove((item) => item.id === customer.id)} aria-label={`Delete ${customer.name}`} className="absolute right-4 top-4 rounded-lg p-2 text-slate-600 hover:bg-red-500/10 hover:text-red-300"><Trash2 className="size-4" /></button><h2 className="pr-10 text-lg font-bold">{customer.name}</h2><div className="mt-4 space-y-2 text-sm text-slate-400">{customer.phone ? <p className="flex gap-2"><Phone className="size-4 text-cyan-400" />{customer.phone}</p> : null}{customer.email ? <p className="flex gap-2"><Mail className="size-4 text-cyan-400" />{customer.email}</p> : null}{customer.address ? <p className="flex gap-2"><MapPin className="size-4 shrink-0 text-cyan-400" />{customer.address}</p> : null}</div>{customer.notes ? <p className="mt-4 border-t border-slate-800 pt-4 text-sm leading-6 text-slate-500">{customer.notes}</p> : null}</Card>)}</section>}
  </div>;
}
