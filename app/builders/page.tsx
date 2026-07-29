"use client";

import { FormEvent, useMemo, useState } from "react";
import { Building2, Eye, Mail, Pencil, Phone, Search, Trash2, UserPlus } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { InputField, TextareaField } from "../../components/ui/FormField";
import { PageHeader } from "../../components/ui/PageHeader";
import { EntityEmptyState } from "../../components/crm/EntityEmptyState";
import { makeId, useLocalStorageCollection } from "../../lib/storage";
import type { Builder } from "../../lib/models";

const blank = { companyName: "", contactName: "", email: "", phone: "", address: "", notes: "" };

export default function BuildersPage() {
  const { items, setItems, remove, isReady } = useLocalStorageCollection<Builder>("jr-os-builders");
  const [form, setForm] = useState(blank);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const filtered = useMemo(() => items.filter((item) => `${item.companyName} ${item.contactName} ${item.email} ${item.phone}`.toLowerCase().includes(search.toLowerCase())), [items, search]);
  const viewing = items.find((item) => item.id === viewingId);

  function resetForm() { setForm(blank); setEditingId(null); setShowForm(false); setError(""); }
  function startEdit(builder: Builder) { setForm({ companyName: builder.companyName, contactName: builder.contactName, email: builder.email, phone: builder.phone, address: builder.address, notes: builder.notes }); setEditingId(builder.id); setViewingId(null); setShowForm(true); }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!form.companyName.trim()) { setError("Company name is required."); return; }
    if (!form.email.trim() && !form.phone.trim()) { setError("Add at least a phone number or email address."); return; }
    const now = new Date().toISOString();
    setItems((current) => editingId
      ? current.map((item) => item.id === editingId ? { ...item, ...form, companyName: form.companyName.trim(), updatedAt: now } : item)
      : [{ id: makeId("bld"), ...form, companyName: form.companyName.trim(), createdAt: now, updatedAt: now }, ...current]);
    resetForm();
  }
  function deleteBuilder(builder: Builder) { if (window.confirm(`Delete ${builder.companyName}? This cannot be undone.`)) remove((item) => item.id === builder.id); }

  return <div className="space-y-6">
    <PageHeader eyebrow="CRM" title="Builders" description="Manage builder and contractor relationships separately from domestic customers." action={<Button onClick={() => showForm ? resetForm() : setShowForm(true)}><UserPlus className="mr-2 size-4" />{showForm ? "Close form" : "Add builder"}</Button>} />
    {showForm ? <Card><form onSubmit={submit} className="grid gap-4 md:grid-cols-2"><InputField required label="Company name" value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} /><InputField label="Contact name" value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} /><InputField label="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /><InputField label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /><InputField label="Business address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /><div className="md:col-span-2"><TextareaField label="Relationship notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>{error ? <p className="md:col-span-2 text-sm text-red-300">{error}</p> : null}<div className="md:col-span-2 flex justify-end"><Button type="submit">{editingId ? "Update builder" : "Save builder"}</Button></div></form></Card> : null}
    {viewing ? <Card className="border-cyan-400/30"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">Builder record</p><h2 className="mt-1 text-xl font-bold">{viewing.companyName}</h2><p className="text-sm text-slate-400">{viewing.contactName || "No named contact"}</p></div><Button variant="secondary" onClick={() => setViewingId(null)}>Close</Button></div><div className="mt-5 grid gap-3 text-sm text-slate-300 md:grid-cols-2"><p>Phone: {viewing.phone || "Not provided"}</p><p>Email: {viewing.email || "Not provided"}</p><p className="md:col-span-2">Address: {viewing.address || "Not provided"}</p><p className="md:col-span-2">Notes: {viewing.notes || "No notes"}</p></div></Card> : null}
    <div className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search builders" className="min-h-11 w-full rounded-xl border border-slate-800 bg-slate-900 pl-10 pr-4 text-sm outline-none focus:border-cyan-400" /></div>
    {!isReady ? <Card>Loading builders…</Card> : filtered.length === 0 ? <EntityEmptyState icon={<Building2 className="size-6" />} title={items.length ? "No matching builders" : "No builders yet"} description={items.length ? "Try a different search." : "Add builders and contractors so their jobs and future opportunities can be tracked separately."} /> : <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{filtered.map((builder) => <Card key={builder.id}><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">Builder</p><h2 className="mt-1 text-lg font-bold">{builder.companyName}</h2><p className="text-sm text-slate-500">{builder.contactName || "No named contact"}</p></div><div className="flex"><button onClick={() => setViewingId(builder.id)} aria-label={`View ${builder.companyName}`} className="rounded-lg p-2 text-slate-500 hover:bg-slate-800 hover:text-cyan-300"><Eye className="size-4" /></button><button onClick={() => startEdit(builder)} aria-label={`Edit ${builder.companyName}`} className="rounded-lg p-2 text-slate-500 hover:bg-slate-800 hover:text-cyan-300"><Pencil className="size-4" /></button><button onClick={() => deleteBuilder(builder)} aria-label={`Delete ${builder.companyName}`} className="rounded-lg p-2 text-slate-500 hover:bg-red-500/10 hover:text-red-300"><Trash2 className="size-4" /></button></div></div><div className="mt-4 space-y-2 text-sm text-slate-400">{builder.phone ? <p className="flex gap-2"><Phone className="size-4 text-cyan-400" />{builder.phone}</p> : null}{builder.email ? <p className="flex gap-2"><Mail className="size-4 text-cyan-400" />{builder.email}</p> : null}</div></Card>)}</section>}
  </div>;
}
