"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { BriefcaseBusiness, Eye, FileText, PackagePlus, Pencil, Plus, Save, Search, Star, Trash2 } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { InputField, TextareaField } from "../../components/ui/FormField";
import { PageHeader } from "../../components/ui/PageHeader";
import { EntityEmptyState } from "../../components/crm/EntityEmptyState";
import { makeId, useLocalStorageCollection } from "../../lib/storage";
import type { Builder, Customer, Job, JobPack, Material, PricingDocument, PricingDocumentStatus, PricingDocumentType, PricingLineItem } from "../../lib/models";

const money = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const defaultTerms = "This document is based on the described scope. Variations, unforeseen work and making good are excluded unless stated otherwise.";
const blankItem = { description: "", category: "Labour" as PricingLineItem["category"], quantity: "1", unitPrice: "", unitCost: "" };
const blankForm = { type: "Quote" as PricingDocumentType, title: "", customerId: "", builderId: "", jobId: "", validUntil: "", vatEnabled: false, vatRate: "20", notes: "", terms: defaultTerms };
const statuses: PricingDocumentStatus[] = ["Draft", "Sent", "Accepted", "Declined", "Expired"];

export default function QuotesPage() {
  const documents = useLocalStorageCollection<PricingDocument>("jr-os-pricing-documents");
  const customers = useLocalStorageCollection<Customer>("jr-os-customers");
  const builders = useLocalStorageCollection<Builder>("jr-os-builders");
  const jobs = useLocalStorageCollection<Job>("jr-os-jobs");
  const jobPacks = useLocalStorageCollection<JobPack>("jr-os-job-packs");
  const materials = useLocalStorageCollection<Material>("jr-os-materials");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedJobPackId, setSelectedJobPackId] = useState("");
  const [selectedMaterialId, setSelectedMaterialId] = useState("");
  const [materialSearch, setMaterialSearch] = useState("");
  const [materialQuantity, setMaterialQuantity] = useState("1");
  const [savePackName, setSavePackName] = useState("");
  const [savePackCategory, setSavePackCategory] = useState("Custom");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [pageMessage, setPageMessage] = useState("");
  const [form, setForm] = useState(blankForm);
  const [items, setItems] = useState<PricingLineItem[]>([]);
  const [line, setLine] = useState(blankItem);

  const names = useMemo(() => new Map([
    ...customers.items.map((item) => [item.id, item.name] as const),
    ...builders.items.map((item) => [item.id, item.companyName] as const),
  ]), [customers.items, builders.items]);

  const filtered = useMemo(() => documents.items.filter((doc) => `${doc.number} ${doc.title} ${doc.status} ${names.get(doc.customerId ?? "")} ${names.get(doc.builderId ?? "")}`.toLowerCase().includes(search.toLowerCase())), [documents.items, names, search]);

  const materialOptions = useMemo(() => {
    const query = materialSearch.trim().toLowerCase();
    return materials.items
      .filter((item) => !query || `${item.name} ${item.manufacturer} ${item.supplier} ${item.stockCode}`.toLowerCase().includes(query))
      .toSorted((a, b) => Number(b.favourite) - Number(a.favourite) || new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 30);
  }, [materialSearch, materials.items]);

  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const internalCost = items.reduce((sum, item) => sum + item.quantity * (item.unitCost ?? item.unitPrice), 0);
  const grossProfit = subtotal - internalCost;
  const grossMargin = subtotal > 0 ? (grossProfit / subtotal) * 100 : 0;
  const vat = form.vatEnabled ? subtotal * (Number(form.vatRate || 0) / 100) : 0;

  function reset() {
    setForm(blankForm);
    setItems([]);
    setLine(blankItem);
    setEditingId(null);
    setSelectedJobPackId("");
    setSelectedMaterialId("");
    setMaterialSearch("");
    setMaterialQuantity("1");
    setSavePackName("");
    setSavePackCategory("Custom");
    setError("");
    setSuccess("");
    setShowForm(false);
  }

  function startEdit(document: PricingDocument) {
    setForm({ type: document.type, title: document.title, customerId: document.customerId ?? "", builderId: document.builderId ?? "", jobId: document.jobId ?? "", validUntil: document.validUntil, vatEnabled: document.vatEnabled, vatRate: String(document.vatRate), notes: document.notes, terms: document.terms });
    setItems(document.items);
    setEditingId(document.id);
    setSavePackName(document.title);
    setError("");
    setSuccess("");
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function addLine() {
    const quantity = Number(line.quantity);
    const unitPrice = Number(line.unitPrice);
    const unitCost = line.unitCost === "" ? unitPrice : Number(line.unitCost);
    if (!line.description.trim() || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitPrice) || unitPrice < 0 || !Number.isFinite(unitCost) || unitCost < 0) {
      setError("Add a description, positive quantity and valid cost and selling prices.");
      return;
    }
    setItems((current) => [...current, { id: makeId("line"), description: line.description.trim(), category: line.category, quantity, unitPrice, unitCost }]);
    setLine(blankItem);
    setError("");
    setSuccess("");
  }

  function addMaterial() {
    const material = materials.items.find((item) => item.id === selectedMaterialId);
    const quantity = Number(materialQuantity);
    if (!material) { setError("Choose a material first."); return; }
    if (!Number.isFinite(quantity) || quantity <= 0) { setError("Enter a valid material quantity."); return; }
    const description = [material.name, material.manufacturer, material.stockCode ? `(${material.stockCode})` : ""].filter(Boolean).join(" ");
    setItems((current) => [...current, {
      id: makeId("line"),
      description,
      category: "Materials",
      quantity,
      unitPrice: material.sellPrice,
      unitCost: material.tradeCost,
      materialId: material.id,
      supplier: material.supplier,
      stockCode: material.stockCode,
    }]);
    setSelectedMaterialId("");
    setMaterialQuantity("1");
    setError("");
    setSuccess(`${material.name} added from the Materials Library.`);
  }

  function addJobPack() {
    const pack = jobPacks.items.find((item) => item.id === selectedJobPackId);
    if (!pack) { setError("Choose a job pack first."); return; }
    const imported: PricingLineItem[] = [];
    if (pack.labourHours > 0) imported.push({ id: makeId("line"), description: pack.labourDescription || `${pack.name} labour`, category: "Labour", quantity: pack.labourHours, unitPrice: pack.labourRate, unitCost: pack.labourRate });
    pack.materials.forEach((packMaterial) => {
      const source = packMaterial.materialId ? materials.items.find((item) => item.id === packMaterial.materialId) : undefined;
      imported.push({
        id: makeId("line"),
        description: source?.name || packMaterial.description,
        category: "Materials",
        quantity: packMaterial.quantity,
        unitPrice: source?.sellPrice ?? packMaterial.unitPrice,
        unitCost: source?.tradeCost ?? packMaterial.unitPrice,
        materialId: source?.id,
        supplier: source?.supplier,
        stockCode: source?.stockCode,
      });
    });
    setItems((current) => [...current, ...imported]);
    setForm((current) => ({
      ...current,
      title: current.title || pack.name,
      notes: [current.notes, pack.description, pack.testingRequirements ? `Testing: ${pack.testingRequirements}` : "", pack.certificatesRequired ? `Certificates: ${pack.certificatesRequired}` : "", pack.notes].filter(Boolean).join("\n\n"),
    }));
    setSavePackName((current) => current || pack.name);
    setSelectedJobPackId("");
    setError("");
    setSuccess(`${pack.name} added. Linked materials use the latest library price where available.`);
  }

  function saveAsJobPack() {
    const name = savePackName.trim() || form.title.trim();
    if (!name) { setError("Enter a name for the new job pack."); return; }
    if (items.length === 0) { setError("Add pricing lines before saving a job pack."); return; }
    const labourLines = items.filter((item) => item.category === "Labour");
    const materialLines = items.filter((item) => item.category === "Materials");
    const otherLines = items.filter((item) => item.category === "Other");
    const labourTotal = labourLines.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    const singleLabour = labourLines.length === 1 ? labourLines[0] : undefined;
    const now = new Date().toISOString();
    const pack: JobPack = {
      id: makeId("pack"), name, category: savePackCategory.trim() || "Custom", description: form.title.trim(),
      labourDescription: singleLabour?.description || labourLines.map((item) => item.description).filter(Boolean).join(" + ") || `${name} labour`,
      labourHours: singleLabour?.quantity ?? (labourTotal > 0 ? 1 : 0), labourRate: singleLabour?.unitPrice ?? labourTotal,
      materials: materialLines.map((item) => ({ id: makeId("pack-material"), materialId: item.materialId, description: item.description, quantity: item.quantity, unitPrice: item.unitPrice })),
      testingRequirements: "", certificatesRequired: "",
      notes: [form.notes, otherLines.length ? `Other allowances from original quote:\n${otherLines.map((item) => `- ${item.description}: ${item.quantity} × ${money.format(item.unitPrice)}`).join("\n")}` : ""].filter(Boolean).join("\n\n"),
      createdAt: now, updatedAt: now,
    };
    jobPacks.setItems((current) => [pack, ...current]);
    setError("");
    setSuccess(`${name} saved as a reusable job pack.`);
  }

  function convertToJob(document: PricingDocument) {
    if (document.jobId) { setPageMessage(`${document.number} is already linked to a job.`); return; }
    if (document.status !== "Accepted") { setPageMessage("Mark the quote as Accepted before creating a live job."); return; }
    const customer = customers.items.find((item) => item.id === document.customerId);
    const builder = builders.items.find((item) => item.id === document.builderId);
    const now = new Date().toISOString();
    const jobId = makeId("job");
    const jobValue = total(document);
    const scope = document.items.map((item) => `- ${item.description} (${item.quantity} × ${money.format(item.unitPrice)})`).join("\n");
    const job: Job = {
      id: jobId,
      title: document.title,
      customerId: document.customerId,
      builderId: document.builderId,
      siteAddress: customer?.address || builder?.address || "Address to be confirmed",
      status: "Scheduled",
      startDate: "",
      value: jobValue,
      notes: [`Created from ${document.type.toLowerCase()} ${document.number}.`, document.notes, `Agreed scope:\n${scope}`, `Terms:\n${document.terms}`].filter(Boolean).join("\n\n"),
      createdAt: now,
      updatedAt: now,
    };
    jobs.setItems((current) => [job, ...current]);
    documents.setItems((current) => current.map((item) => item.id === document.id ? { ...item, jobId, updatedAt: now } : item));
    setPageMessage(`${document.number} converted into a live scheduled job.`);
  }

  function updateLine(id: string, changes: Partial<PricingLineItem>) {
    setItems((current) => current.map((item) => item.id === id ? { ...item, ...changes } : item));
    setSuccess("");
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!form.title.trim()) { setError("Document title is required."); return; }
    if (!form.customerId && !form.builderId) { setError("Select a customer or builder."); return; }
    if (items.length === 0) { setError("Add at least one labour, material or other line item."); return; }
    const now = new Date().toISOString();
    const existing = documents.items.find((item) => item.id === editingId);
    const nextNumber = existing?.number ?? `${form.type === "Quote" ? "Q" : "E"}-${String(documents.items.filter((item) => item.type === form.type).length + 1).padStart(4, "0")}`;
    const payload = { type: form.type, customerId: form.customerId || undefined, builderId: form.builderId || undefined, jobId: form.jobId || undefined, title: form.title.trim(), validUntil: form.validUntil, vatEnabled: form.vatEnabled, vatRate: Number(form.vatRate || 0), items, notes: form.notes, terms: form.terms, updatedAt: now };
    documents.setItems((current) => editingId ? current.map((document) => document.id === editingId ? { ...document, ...payload } : document) : [{ id: makeId("doc"), number: nextNumber, status: "Draft", ...payload, createdAt: now }, ...current]);
    reset();
  }

  function updateStatus(id: string, status: PricingDocumentStatus) { documents.setItems((current) => current.map((document) => document.id === id ? { ...document, status, updatedAt: new Date().toISOString() } : document)); setPageMessage(""); }
  function deleteDocument(document: PricingDocument) { if (window.confirm(`Delete ${document.number} - ${document.title}? This cannot be undone.`)) documents.remove((item) => item.id === document.id); }
  function total(document: PricingDocument) { const net = document.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0); return net + (document.vatEnabled ? net * document.vatRate / 100 : 0); }

  return <div className="space-y-6">
    <PageHeader eyebrow="Sales" title="Quotes & Estimates" description="Build professional pricing documents with live material costs, margins and reusable job packs." action={<Button onClick={() => showForm ? reset() : setShowForm(true)}><Plus className="mr-2 size-4" />{showForm ? "Close builder" : "New document"}</Button>} />
    {pageMessage ? <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-300">{pageMessage}</div> : null}

    {showForm ? <Card><form onSubmit={submit} className="space-y-6">
      <div className="flex items-center justify-between gap-4"><div><h2 className="text-lg font-bold">{editingId ? "Edit pricing document" : "Create pricing document"}</h2><p className="text-sm text-slate-500">Use current library prices, then tailor every line to the actual job.</p></div>{editingId ? <Button type="button" variant="secondary" onClick={reset}>Cancel edit</Button> : null}</div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Document type</span><select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as PricingDocumentType })} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3"><option>Quote</option><option>Estimate</option></select></label>
        <InputField required label="Title / scope" value={form.title} onChange={(e) => { setForm({ ...form, title: e.target.value }); if (!savePackName) setSavePackName(e.target.value); }} />
        <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Customer</span><select value={form.customerId} onChange={(e) => setForm({ ...form, customerId: e.target.value, builderId: "" })} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3"><option value="">None</option>{customers.items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Builder</span><select value={form.builderId} onChange={(e) => setForm({ ...form, builderId: e.target.value, customerId: "" })} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3"><option value="">None</option>{builders.items.map((item) => <option key={item.id} value={item.id}>{item.companyName}</option>)}</select></label>
        <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Linked job</span><select value={form.jobId} onChange={(e) => setForm({ ...form, jobId: e.target.value })} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3"><option value="">No linked job</option>{jobs.items.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
        <InputField label="Valid until" type="date" value={form.validUntil} onChange={(e) => setForm({ ...form, validUntil: e.target.value })} />
        <label className="flex items-center gap-3 pt-8 text-sm text-slate-300"><input type="checkbox" checked={form.vatEnabled} onChange={(e) => setForm({ ...form, vatEnabled: e.target.checked })} /> Add VAT</label>
        {form.vatEnabled ? <InputField label="VAT rate (%)" type="number" min="0" value={form.vatRate} onChange={(e) => setForm({ ...form, vatRate: e.target.value })} /> : null}
      </div>

      <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-4">
        <h2 className="font-semibold">Start from a job pack</h2><p className="mt-1 text-sm text-slate-400">Linked materials automatically use the latest saved trade and selling prices.</p>
        <div className="mt-4 flex flex-col gap-3 md:flex-row"><select value={selectedJobPackId} onChange={(e) => setSelectedJobPackId(e.target.value)} className="min-h-11 flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3"><option value="">Choose a job pack</option>{jobPacks.items.map((pack) => <option key={pack.id} value={pack.id}>{pack.name} · {pack.category}</option>)}</select><Button type="button" onClick={addJobPack}>Add pack to quote</Button></div>
      </div>

      <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4">
        <div className="flex items-start gap-3"><PackagePlus className="mt-0.5 size-5 text-emerald-300" /><div><h2 className="font-semibold">Smart material selector</h2><p className="mt-1 text-sm text-slate-400">Search by product, supplier, manufacturer or stock code. Favourites and recently updated items appear first.</p></div></div>
        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1.4fr_110px_auto]"><InputField label="Search materials" value={materialSearch} onChange={(e) => setMaterialSearch(e.target.value)} /><label className="grid gap-2 text-sm font-medium text-slate-300"><span>Material</span><select value={selectedMaterialId} onChange={(e) => setSelectedMaterialId(e.target.value)} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3"><option value="">Choose material</option>{materialOptions.map((material) => <option key={material.id} value={material.id}>{material.favourite ? "★ " : ""}{material.name} · {material.supplier || "No supplier"} · {money.format(material.sellPrice)}</option>)}</select></label><InputField label="Qty" type="number" min="0.01" step="0.01" value={materialQuantity} onChange={(e) => setMaterialQuantity(e.target.value)} /><Button type="button" className="self-end" onClick={addMaterial}>Add material</Button></div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
        <h2 className="font-semibold">Pricing lines</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_130px_90px_130px_130px_auto]"><InputField label="Description" value={line.description} onChange={(e) => setLine({ ...line, description: e.target.value })} /><label className="grid gap-2 text-sm font-medium text-slate-300"><span>Category</span><select value={line.category} onChange={(e) => setLine({ ...line, category: e.target.value as PricingLineItem["category"] })} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3"><option>Labour</option><option>Materials</option><option>Other</option></select></label><InputField label="Qty" type="number" min="0.01" step="0.01" value={line.quantity} onChange={(e) => setLine({ ...line, quantity: e.target.value })} /><InputField label="Unit cost (£)" type="number" min="0" step="0.01" value={line.unitCost} onChange={(e) => setLine({ ...line, unitCost: e.target.value })} /><InputField label="Sell price (£)" type="number" min="0" step="0.01" value={line.unitPrice} onChange={(e) => setLine({ ...line, unitPrice: e.target.value })} /><Button type="button" className="self-end" onClick={addLine}>Add</Button></div>
        <div className="mt-4 space-y-3">{items.map((item) => <div key={item.id} className="grid gap-3 rounded-xl bg-slate-900 p-3 md:grid-cols-[1fr_120px_90px_120px_120px_auto] md:items-end"><InputField label="Description" value={item.description} onChange={(e) => updateLine(item.id, { description: e.target.value })} /><label className="grid gap-2 text-sm font-medium text-slate-300"><span>Category</span><select value={item.category} onChange={(e) => updateLine(item.id, { category: e.target.value as PricingLineItem["category"] })} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3"><option>Labour</option><option>Materials</option><option>Other</option></select></label><InputField label="Qty" type="number" min="0.01" step="0.01" value={String(item.quantity)} onChange={(e) => updateLine(item.id, { quantity: Number(e.target.value) })} /><InputField label="Unit cost (£)" type="number" min="0" step="0.01" value={String(item.unitCost ?? item.unitPrice)} onChange={(e) => updateLine(item.id, { unitCost: Number(e.target.value) })} /><InputField label="Sell price (£)" type="number" min="0" step="0.01" value={String(item.unitPrice)} onChange={(e) => updateLine(item.id, { unitPrice: Number(e.target.value) })} /><div className="flex items-center justify-between gap-3 md:block"><strong className="whitespace-nowrap">{money.format(item.quantity * item.unitPrice)}</strong><button type="button" onClick={() => setItems((current) => current.filter((lineItem) => lineItem.id !== item.id))} className="ml-3 rounded-lg p-2 text-slate-500 hover:bg-red-500/10 hover:text-red-300"><Trash2 className="size-4" /></button></div></div>)}</div>
      </div>

      <div className="grid gap-4 md:grid-cols-4"><Card><p className="text-sm text-slate-400">Trade / internal cost</p><p className="mt-2 text-2xl font-bold">{money.format(internalCost)}</p></Card><Card><p className="text-sm text-slate-400">Selling subtotal</p><p className="mt-2 text-2xl font-bold">{money.format(subtotal)}</p></Card><Card><p className="text-sm text-slate-400">Gross profit</p><p className={`mt-2 text-2xl font-bold ${grossProfit >= 0 ? "text-emerald-300" : "text-red-300"}`}>{money.format(grossProfit)}</p></Card><Card><p className="text-sm text-slate-400">Gross margin</p><p className={`mt-2 text-2xl font-bold ${grossMargin >= 20 ? "text-emerald-300" : grossMargin >= 10 ? "text-amber-300" : "text-red-300"}`}>{grossMargin.toFixed(1)}%</p></Card></div>

      <div className="grid gap-4 md:grid-cols-2"><TextareaField label="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /><TextareaField label="Terms & conditions" value={form.terms} onChange={(e) => setForm({ ...form, terms: e.target.value })} /></div>
      <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4"><h2 className="font-semibold">Save this version as a new job pack</h2><p className="mt-1 text-sm text-slate-400">Material links are retained so future quotes can use current library prices.</p><div className="mt-4 grid gap-3 md:grid-cols-[1fr_220px_auto]"><InputField label="New pack name" value={savePackName} onChange={(e) => setSavePackName(e.target.value)} /><InputField label="Category" value={savePackCategory} onChange={(e) => setSavePackCategory(e.target.value)} /><Button type="button" className="self-end" onClick={saveAsJobPack}><Save className="mr-2 size-4" />Save as job pack</Button></div></div>
      <div className="flex flex-col gap-3 border-t border-slate-800 pt-5 md:flex-row md:items-end md:justify-between"><div>{error ? <p className="text-sm text-red-300">{error}</p> : null}{success ? <p className="text-sm text-emerald-300">{success}</p> : null}</div><div className="text-right"><p className="text-sm text-slate-400">Subtotal {money.format(subtotal)}</p>{form.vatEnabled ? <p className="text-sm text-slate-400">VAT {money.format(vat)}</p> : null}<p className="text-xl font-bold">Total {money.format(subtotal + vat)}</p><Button type="submit" className="mt-3">{editingId ? "Update document" : "Save draft"}</Button></div></div>
    </form></Card> : null}

    <div className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search documents" className="min-h-11 w-full rounded-xl border border-slate-800 bg-slate-900 pl-10 pr-4 text-sm outline-none focus:border-cyan-400" /></div>
    {!documents.isReady ? <Card>Loading documents…</Card> : filtered.length === 0 ? <EntityEmptyState icon={<FileText className="size-6" />} title={documents.items.length ? "No matching documents" : "No quotes or estimates yet"} description={documents.items.length ? "Try a different search." : "Create your first pricing document and link it to a customer, builder or job."} /> : <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{filtered.map((doc) => <Card key={doc.id}><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">{doc.type} · {doc.number}</p><h2 className="mt-1 text-lg font-bold">{doc.title}</h2><p className="text-sm text-slate-500">{names.get(doc.customerId ?? "") || names.get(doc.builderId ?? "") || "Unassigned"}</p></div><div className="flex items-center"><Link href={`/quotes/${doc.id}`} aria-label={`View ${doc.number}`} className="rounded-lg p-2 text-slate-500 hover:bg-slate-800 hover:text-cyan-300"><Eye className="size-4" /></Link><button onClick={() => startEdit(doc)} aria-label={`Edit ${doc.number}`} className="rounded-lg p-2 text-slate-500 hover:bg-slate-800 hover:text-cyan-300"><Pencil className="size-4" /></button><button onClick={() => deleteDocument(doc)} aria-label={`Delete ${doc.number}`} className="rounded-lg p-2 text-slate-500 hover:bg-red-500/10 hover:text-red-300"><Trash2 className="size-4" /></button></div></div><div className="mt-5 grid gap-3 border-t border-slate-800 pt-4"><label className="grid gap-2 text-xs text-slate-500"><span>Document status</span><select value={doc.status} onChange={(e) => updateStatus(doc.id, e.target.value as PricingDocumentStatus)} className="min-h-10 rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-slate-200">{statuses.map((status) => <option key={status}>{status}</option>)}</select></label>{doc.jobId ? <Link href={`/jobs/${doc.jobId}`} className="flex min-h-10 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 text-sm font-semibold text-emerald-300 hover:bg-emerald-500/20"><BriefcaseBusiness className="mr-2 size-4" />View linked job</Link> : doc.status === "Accepted" ? <Button type="button" onClick={() => convertToJob(doc)}><BriefcaseBusiness className="mr-2 size-4" />Create live job</Button> : null}<div className="flex items-end justify-between"><div className="text-xs text-slate-500">{doc.items.length} line{doc.items.length === 1 ? "" : "s"}</div><strong className="text-lg">{money.format(total(doc))}</strong></div></div></Card>)}</section>}
  </div>;
}
