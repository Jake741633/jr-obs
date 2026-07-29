"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { Eye, FileText, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { InputField, TextareaField } from "../../components/ui/FormField";
import { PageHeader } from "../../components/ui/PageHeader";
import { EntityEmptyState } from "../../components/crm/EntityEmptyState";
import { makeId, useLocalStorageCollection } from "../../lib/storage";
import type { Builder, Customer, Job, PricingDocument, PricingDocumentStatus, PricingDocumentType, PricingLineItem } from "../../lib/models";

const money = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const defaultTerms = "This document is based on the described scope. Variations, unforeseen work and making good are excluded unless stated otherwise.";
const blankItem = { description: "", category: "Labour" as PricingLineItem["category"], quantity: "1", unitPrice: "" };
const blankForm = { type: "Quote" as PricingDocumentType, title: "", customerId: "", builderId: "", jobId: "", validUntil: "", vatEnabled: false, vatRate: "20", notes: "", terms: defaultTerms };
const statuses: PricingDocumentStatus[] = ["Draft", "Sent", "Accepted", "Declined", "Expired"];

export default function QuotesPage() {
  const documents = useLocalStorageCollection<PricingDocument>("jr-os-pricing-documents");
  const customers = useLocalStorageCollection<Customer>("jr-os-customers");
  const builders = useLocalStorageCollection<Builder>("jr-os-builders");
  const jobs = useLocalStorageCollection<Job>("jr-os-jobs");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [form, setForm] = useState(blankForm);
  const [items, setItems] = useState<PricingLineItem[]>([]);
  const [line, setLine] = useState(blankItem);

  const names = useMemo(() => new Map([
    ...customers.items.map((item) => [item.id, item.name] as const),
    ...builders.items.map((item) => [item.id, item.companyName] as const),
  ]), [customers.items, builders.items]);
  const filtered = useMemo(() => documents.items.filter((doc) => `${doc.number} ${doc.title} ${doc.status} ${names.get(doc.customerId ?? "")} ${names.get(doc.builderId ?? "")}`.toLowerCase().includes(search.toLowerCase())), [documents.items, names, search]);
  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const vat = form.vatEnabled ? subtotal * (Number(form.vatRate || 0) / 100) : 0;

  function reset() {
    setForm(blankForm);
    setItems([]);
    setLine(blankItem);
    setEditingId(null);
    setError("");
    setShowForm(false);
  }

  function startEdit(document: PricingDocument) {
    setForm({
      type: document.type,
      title: document.title,
      customerId: document.customerId ?? "",
      builderId: document.builderId ?? "",
      jobId: document.jobId ?? "",
      validUntil: document.validUntil,
      vatEnabled: document.vatEnabled,
      vatRate: String(document.vatRate),
      notes: document.notes,
      terms: document.terms,
    });
    setItems(document.items);
    setEditingId(document.id);
    setError("");
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function addLine() {
    const quantity = Number(line.quantity);
    const unitPrice = Number(line.unitPrice);
    if (!line.description.trim() || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitPrice) || unitPrice < 0) {
      setError("Add a description, positive quantity and valid unit price.");
      return;
    }
    setItems((current) => [...current, { id: makeId("line"), description: line.description.trim(), category: line.category, quantity, unitPrice }]);
    setLine(blankItem);
    setError("");
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!form.title.trim()) { setError("Document title is required."); return; }
    if (!form.customerId && !form.builderId) { setError("Select a customer or builder."); return; }
    if (items.length === 0) { setError("Add at least one labour, material or other line item."); return; }
    const now = new Date().toISOString();
    const existing = documents.items.find((item) => item.id === editingId);
    const nextNumber = existing?.number ?? `${form.type === "Quote" ? "Q" : "E"}-${String(documents.items.filter((item) => item.type === form.type).length + 1).padStart(4, "0")}`;
    const payload = {
      type: form.type,
      customerId: form.customerId || undefined,
      builderId: form.builderId || undefined,
      jobId: form.jobId || undefined,
      title: form.title.trim(),
      validUntil: form.validUntil,
      vatEnabled: form.vatEnabled,
      vatRate: Number(form.vatRate || 0),
      items,
      notes: form.notes,
      terms: form.terms,
      updatedAt: now,
    };
    documents.setItems((current) => editingId
      ? current.map((document) => document.id === editingId ? { ...document, ...payload } : document)
      : [{ id: makeId("doc"), number: nextNumber, status: "Draft", ...payload, createdAt: now }, ...current]);
    reset();
  }

  function updateStatus(id: string, status: PricingDocumentStatus) {
    documents.setItems((current) => current.map((document) => document.id === id ? { ...document, status, updatedAt: new Date().toISOString() } : document));
  }

  function deleteDocument(document: PricingDocument) {
    if (window.confirm(`Delete ${document.number} - ${document.title}? This cannot be undone.`)) {
      documents.remove((item) => item.id === document.id);
    }
  }

  function total(doc: PricingDocument) {
    const net = doc.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    return net + (doc.vatEnabled ? net * doc.vatRate / 100 : 0);
  }

  return <div className="space-y-6">
    <PageHeader eyebrow="Sales" title="Quotes & Estimates" description="Build clear, professional pricing documents linked to customers, builders and jobs." action={<Button onClick={() => showForm ? reset() : setShowForm(true)}><Plus className="mr-2 size-4" />{showForm ? "Close builder" : "New document"}</Button>} />

    {showForm ? <Card><form onSubmit={submit} className="space-y-6">
      <div className="flex items-center justify-between gap-4"><div><h2 className="text-lg font-bold">{editingId ? "Edit pricing document" : "Create pricing document"}</h2><p className="text-sm text-slate-500">{editingId ? "Update the scope, pricing or terms without changing the document number." : "Create a new quote or estimate draft."}</p></div>{editingId ? <Button type="button" variant="secondary" onClick={reset}>Cancel edit</Button> : null}</div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Document type</span><select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as PricingDocumentType })} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3"><option>Quote</option><option>Estimate</option></select></label>
        <InputField required label="Title / scope" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Customer</span><select value={form.customerId} onChange={(e) => setForm({ ...form, customerId: e.target.value, builderId: "" })} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3"><option value="">None</option>{customers.items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Builder</span><select value={form.builderId} onChange={(e) => setForm({ ...form, builderId: e.target.value, customerId: "" })} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3"><option value="">None</option>{builders.items.map((item) => <option key={item.id} value={item.id}>{item.companyName}</option>)}</select></label>
        <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Linked job</span><select value={form.jobId} onChange={(e) => setForm({ ...form, jobId: e.target.value })} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3"><option value="">No linked job</option>{jobs.items.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
        <InputField label="Valid until" type="date" value={form.validUntil} onChange={(e) => setForm({ ...form, validUntil: e.target.value })} />
        <label className="flex items-center gap-3 pt-8 text-sm text-slate-300"><input type="checkbox" checked={form.vatEnabled} onChange={(e) => setForm({ ...form, vatEnabled: e.target.checked })} /> Add VAT</label>
        {form.vatEnabled ? <InputField label="VAT rate (%)" type="number" min="0" value={form.vatRate} onChange={(e) => setForm({ ...form, vatRate: e.target.value })} /> : null}
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
        <h2 className="font-semibold">Pricing lines</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_150px_110px_150px_auto]">
          <InputField label="Description" value={line.description} onChange={(e) => setLine({ ...line, description: e.target.value })} />
          <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Category</span><select value={line.category} onChange={(e) => setLine({ ...line, category: e.target.value as PricingLineItem["category"] })} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3"><option>Labour</option><option>Materials</option><option>Other</option></select></label>
          <InputField label="Qty" type="number" min="0.01" step="0.01" value={line.quantity} onChange={(e) => setLine({ ...line, quantity: e.target.value })} />
          <InputField label="Unit price (£)" type="number" min="0" step="0.01" value={line.unitPrice} onChange={(e) => setLine({ ...line, unitPrice: e.target.value })} />
          <Button type="button" className="self-end" onClick={addLine}>Add</Button>
        </div>
        <div className="mt-4 space-y-2">{items.map((item) => <div key={item.id} className="flex items-center justify-between gap-4 rounded-xl bg-slate-900 px-4 py-3 text-sm"><div><span className="font-medium">{item.description}</span><span className="ml-2 text-slate-500">{item.category} · {item.quantity} × {money.format(item.unitPrice)}</span></div><div className="flex items-center gap-3"><strong>{money.format(item.quantity * item.unitPrice)}</strong><button type="button" onClick={() => setItems((current) => current.filter((lineItem) => lineItem.id !== item.id))} className="text-slate-500 hover:text-red-300"><Trash2 className="size-4" /></button></div></div>)}</div>
      </div>

      <div className="grid gap-4 md:grid-cols-2"><TextareaField label="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /><TextareaField label="Terms & conditions" value={form.terms} onChange={(e) => setForm({ ...form, terms: e.target.value })} /></div>
      <div className="flex flex-col gap-3 border-t border-slate-800 pt-5 md:flex-row md:items-end md:justify-between"><div>{error ? <p className="text-sm text-red-300">{error}</p> : null}</div><div className="text-right"><p className="text-sm text-slate-400">Subtotal {money.format(subtotal)}</p>{form.vatEnabled ? <p className="text-sm text-slate-400">VAT {money.format(vat)}</p> : null}<p className="text-xl font-bold">Total {money.format(subtotal + vat)}</p><Button type="submit" className="mt-3">{editingId ? "Update document" : "Save draft"}</Button></div></div>
    </form></Card> : null}

    <div className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search documents" className="min-h-11 w-full rounded-xl border border-slate-800 bg-slate-900 pl-10 pr-4 text-sm outline-none focus:border-cyan-400" /></div>
    {!documents.isReady ? <Card>Loading documents…</Card> : filtered.length === 0 ? <EntityEmptyState icon={<FileText className="size-6" />} title={documents.items.length ? "No matching documents" : "No quotes or estimates yet"} description={documents.items.length ? "Try a different search." : "Create your first pricing document and link it to a customer, builder or job."} /> : <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{filtered.map((doc) => <Card key={doc.id}><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">{doc.type} · {doc.number}</p><h2 className="mt-1 text-lg font-bold">{doc.title}</h2><p className="text-sm text-slate-500">{names.get(doc.customerId ?? "") || names.get(doc.builderId ?? "") || "Unassigned"}</p></div><div className="flex items-center"><Link href={`/quotes/${doc.id}`} aria-label={`View ${doc.number}`} className="rounded-lg p-2 text-slate-500 hover:bg-slate-800 hover:text-cyan-300"><Eye className="size-4" /></Link><button onClick={() => startEdit(doc)} aria-label={`Edit ${doc.number}`} className="rounded-lg p-2 text-slate-500 hover:bg-slate-800 hover:text-cyan-300"><Pencil className="size-4" /></button><button onClick={() => deleteDocument(doc)} aria-label={`Delete ${doc.number}`} className="rounded-lg p-2 text-slate-500 hover:bg-red-500/10 hover:text-red-300"><Trash2 className="size-4" /></button></div></div><div className="mt-5 grid gap-3 border-t border-slate-800 pt-4"><label className="grid gap-2 text-xs text-slate-500"><span>Document status</span><select value={doc.status} onChange={(e) => updateStatus(doc.id, e.target.value as PricingDocumentStatus)} className="min-h-10 rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-slate-200">{statuses.map((status) => <option key={status}>{status}</option>)}</select></label><div className="flex items-end justify-between"><div className="text-xs text-slate-500">{doc.items.length} line{doc.items.length === 1 ? "" : "s"}</div><strong className="text-lg">{money.format(total(doc))}</strong></div></div></Card>)}</section>}
  </div>;
}
