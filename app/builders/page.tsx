"use client";

import { FormEvent, useMemo, useState } from "react";
import { Building2, Mail, Phone, Search, Trash2, UserPlus } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { InputField, TextareaField } from "../../components/ui/FormField";
import { PageHeader } from "../../components/ui/PageHeader";
import { EntityEmptyState } from "../../components/crm/EntityEmptyState";
import { makeId, useLocalStorageCollection } from "../../lib/storage";
import type { Builder } from "../../lib/models";

const blank = { companyName: "", contactName: "", email: "", phone: "", address: "", notes: "" };
export default function BuildersPage() {
  const { items, setItems, remove, isReady } = useLocalStorageCollection<Builder>("jr-os-builders"); const [form, setForm] = useState(blank); const [showForm, setShowForm] = useState(false); const [search, setSearch] = useState("");
  const filtered = useMemo(() => items.filter((item) => `${item.companyName} ${item.contactName} ${item.email}`.toLowerCase().includes(search.toLowerCase())), [items, search]);
  function submit(event: FormEvent) { event.preventDefault(); const now = new Date().toISOString(); setItems((current) => [{ id: makeId("bld"), ...form, createdAt: now, updatedAt: now }, ...current]); setForm(blank); setShowForm(false); }
  return <div className="space-y-6"><PageHeader eyebrow="CRM" title="Builders" description="Manage builder and contractor relationships separately from domestic customers." action={<Button onClick={() => setShowForm((v) => !v)}><UserPlus className="mr-2 size-4" />{showForm ? "Close form" : "Add builder"}</Button>} />
    {showForm ? <Card><form onSubmit={submit} className="grid gap-4 md:grid-cols-2"><InputField required label="Company name" value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} /><InputField label="Contact name" value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} /><InputField label="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /><InputField label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /><InputField label="Business address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /><div className="md:col-span-2"><TextareaField label="Relationship notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div><div className="md:col-span-2 flex justify-end"><Button type="submit">Save builder</Button></div></form></Card> : null}
    <div className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search builders" className="min-h-11 w-full rounded-xl border border-slate-800 bg-slate-900 pl-10 pr-4 text-sm outline-none focus:border-cyan-400" /></div>
    {!isReady ? <Card>Loading builders…</Card> : filtered.length === 0 ? <EntityEmptyState icon={<Building2 className="size-6" />} title={items.length ? "No matching builders" : "No builders yet"} description={items.length ? "Try a different search." : "Add builders and contractors so their jobs and future opportunities can be tracked separately."} /> : <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{filtered.map((builder) => <Card key={builder.id} className="relative"><button onClick={() => remove((item) => item.id === builder.id)} aria-label={`Delete ${builder.companyName}`} className="absolute right-4 top-4 rounded-lg p-2 text-slate-600 hover:bg-red-500/10 hover:text-red-300"><Trash2 className="size-4" /></button><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">Builder</p><h2 className="mt-1 pr-10 text-lg font-bold">{builder.companyName}</h2>{builder.contactName ? <p className="text-sm text-slate-500">{builder.contactName}</p> : null}<div className="mt-4 space-y-2 text-sm text-slate-400">{builder.phone ? <p className="flex gap-2"><Phone className="size-4 text-cyan-400" />{builder.phone}</p> : null}{builder.email ? <p className="flex gap-2"><Mail className="size-4 text-cyan-400" />{builder.email}</p> : null}</div>{builder.notes ? <p className="mt-4 border-t border-slate-800 pt-4 text-sm leading-6 text-slate-500">{builder.notes}</p> : null}</Card>)}</section>}
  </div>;
}
