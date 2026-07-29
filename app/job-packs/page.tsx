"use client";

import { FormEvent, useMemo, useState } from "react";
import { BriefcaseBusiness, Plus, Search, Star, Trash2 } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { InputField, TextareaField } from "../../components/ui/FormField";
import { PageHeader } from "../../components/ui/PageHeader";
import { EntityEmptyState } from "../../components/crm/EntityEmptyState";
import { makeId, useLocalStorageCollection } from "../../lib/storage";
import type { JobPack, JobPackMaterial, Material } from "../../lib/models";

const money = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const categories = ["Consumer unit", "Rewire", "EICR", "Fault finding", "EV charger", "Commercial small works", "Lighting", "Emergency lighting", "Fire alarm", "Custom"];
const blankForm = { name: "", category: "Custom", description: "", labourDescription: "Electrician labour", labourHours: "8", labourRate: "50", testingRequirements: "", certificatesRequired: "", notes: "" };
const blankMaterial = { materialId: "", description: "", quantity: "1", unitPrice: "" };

export default function JobPacksPage() {
  const packs = useLocalStorageCollection<JobPack>("jr-os-job-packs");
  const materialsLibrary = useLocalStorageCollection<Material>("jr-os-materials");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [form, setForm] = useState(blankForm);
  const [materials, setMaterials] = useState<JobPackMaterial[]>([]);
  const [materialLine, setMaterialLine] = useState(blankMaterial);

  const filtered = useMemo(() => packs.items.filter((pack) => `${pack.name} ${pack.category} ${pack.description}`.toLowerCase().includes(search.toLowerCase())), [packs.items, search]);
  const labourTotal = Number(form.labourHours || 0) * Number(form.labourRate || 0);
  const materialsTotal = materials.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);

  function reset() {
    setForm(blankForm);
    setMaterials([]);
    setMaterialLine(blankMaterial);
    setEditingId(null);
    setShowForm(false);
    setError("");
  }

  function selectLibraryMaterial(materialId: string) {
    const selected = materialsLibrary.items.find((item) => item.id === materialId);
    setMaterialLine({ materialId, description: selected?.name ?? "", quantity: "1", unitPrice: selected ? String(selected.sellPrice) : "" });
  }

  function addMaterial() {
    const quantity = Number(materialLine.quantity);
    const unitPrice = Number(materialLine.unitPrice);
    if (!materialLine.description.trim() || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitPrice) || unitPrice < 0) {
      setError("Add a material description, positive quantity and valid selling price.");
      return;
    }
    setMaterials((current) => [...current, { id: makeId("jpm"), materialId: materialLine.materialId || undefined, description: materialLine.description.trim(), quantity, unitPrice }]);
    setMaterialLine(blankMaterial);
    setError("");
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const labourHours = Number(form.labourHours);
    const labourRate = Number(form.labourRate);
    if (!form.name.trim()) { setError("Job pack name is required."); return; }
    if (!Number.isFinite(labourHours) || labourHours < 0 || !Number.isFinite(labourRate) || labourRate < 0) { setError("Labour hours and rate must be valid positive amounts."); return; }
    const now = new Date().toISOString();
    const payload = { name: form.name.trim(), category: form.category, description: form.description, labourDescription: form.labourDescription.trim() || "Electrician labour", labourHours, labourRate, materials, testingRequirements: form.testingRequirements, certificatesRequired: form.certificatesRequired, notes: form.notes };
    packs.setItems((current) => editingId
      ? current.map((pack) => pack.id === editingId ? { ...pack, ...payload, updatedAt: now } : pack)
      : [{ id: makeId("pack"), ...payload, createdAt: now, updatedAt: now }, ...current]);
    reset();
  }

  function edit(pack: JobPack) {
    setForm({ name: pack.name, category: pack.category, description: pack.description, labourDescription: pack.labourDescription, labourHours: String(pack.labourHours), labourRate: String(pack.labourRate), testingRequirements: pack.testingRequirements, certificatesRequired: pack.certificatesRequired, notes: pack.notes });
    setMaterials(pack.materials);
    setEditingId(pack.id);
    setShowForm(true);
    setError("");
  }

  function remove(pack: JobPack) {
    if (window.confirm(`Delete ${pack.name}? This cannot be undone.`)) packs.remove((item) => item.id === pack.id);
  }

  return <div className="space-y-6">
    <PageHeader eyebrow="Templates" title="Job Packs" description="Create reusable labour, material, testing and certification templates for common electrical work." action={<Button onClick={() => showForm ? reset() : setShowForm(true)}><Plus className="mr-2 size-4" />{showForm ? "Close builder" : "New job pack"}</Button>} />

    {showForm ? <Card><form onSubmit={submit} className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <InputField required label="Job pack name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Category</span><select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3">{categories.map((category) => <option key={category}>{category}</option>)}</select></label>
        <InputField label="Labour hours" type="number" min="0" step="0.25" value={form.labourHours} onChange={(e) => setForm({ ...form, labourHours: e.target.value })} />
        <InputField label="Charge rate (£/hour)" type="number" min="0" step="0.01" value={form.labourRate} onChange={(e) => setForm({ ...form, labourRate: e.target.value })} />
      </div>
      <div className="grid gap-4 md:grid-cols-2"><TextareaField label="Scope description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /><TextareaField label="Labour description" value={form.labourDescription} onChange={(e) => setForm({ ...form, labourDescription: e.target.value })} /></div>

      <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
        <h2 className="font-semibold">Pack materials</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-[220px_1fr_110px_150px_auto]">
          <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Library material</span><select value={materialLine.materialId} onChange={(e) => selectLibraryMaterial(e.target.value)} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3"><option value="">Custom item</option>{materialsLibrary.items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <InputField label="Description" value={materialLine.description} onChange={(e) => setMaterialLine({ ...materialLine, description: e.target.value })} />
          <InputField label="Qty" type="number" min="0.01" step="0.01" value={materialLine.quantity} onChange={(e) => setMaterialLine({ ...materialLine, quantity: e.target.value })} />
          <InputField label="Sell price (£)" type="number" min="0" step="0.01" value={materialLine.unitPrice} onChange={(e) => setMaterialLine({ ...materialLine, unitPrice: e.target.value })} />
          <Button type="button" className="self-end" onClick={addMaterial}>Add</Button>
        </div>
        <div className="mt-4 space-y-2">{materials.map((item) => <div key={item.id} className="flex items-center justify-between gap-4 rounded-xl bg-slate-900 px-4 py-3 text-sm"><div><span className="font-medium">{item.description}</span><span className="ml-2 text-slate-500">{item.quantity} × {money.format(item.unitPrice)}</span></div><div className="flex items-center gap-3"><strong>{money.format(item.quantity * item.unitPrice)}</strong><button type="button" onClick={() => setMaterials((current) => current.filter((line) => line.id !== item.id))} className="text-slate-500 hover:text-red-300"><Trash2 className="size-4" /></button></div></div>)}</div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3"><TextareaField label="Testing requirements" value={form.testingRequirements} onChange={(e) => setForm({ ...form, testingRequirements: e.target.value })} /><TextareaField label="Certificates required" value={form.certificatesRequired} onChange={(e) => setForm({ ...form, certificatesRequired: e.target.value })} /><TextareaField label="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
      <div className="flex flex-col gap-3 border-t border-slate-800 pt-5 md:flex-row md:items-end md:justify-between"><div>{error ? <p className="text-sm text-red-300">{error}</p> : null}</div><div className="text-right"><p className="text-sm text-slate-400">Labour {money.format(labourTotal)}</p><p className="text-sm text-slate-400">Materials {money.format(materialsTotal)}</p><p className="text-xl font-bold">Pack total {money.format(labourTotal + materialsTotal)}</p><Button type="submit" className="mt-3">{editingId ? "Update job pack" : "Save job pack"}</Button></div></div>
    </form></Card> : null}

    <div className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search job packs" className="min-h-11 w-full rounded-xl border border-slate-800 bg-slate-900 pl-10 pr-4 text-sm outline-none focus:border-cyan-400" /></div>

    {!packs.isReady ? <Card>Loading job packs…</Card> : filtered.length === 0 ? <EntityEmptyState icon={<BriefcaseBusiness className="size-6" />} title={packs.items.length ? "No matching job packs" : "No job packs yet"} description={packs.items.length ? "Try a different search." : "Create reusable templates for rewires, consumer units, EICRs and other electrical work."} /> : <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{filtered.map((pack) => {
      const labour = pack.labourHours * pack.labourRate;
      const materialCost = pack.materials.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
      return <Card key={pack.id}><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">{pack.category}</p><h2 className="mt-1 text-lg font-bold">{pack.name}</h2></div><Star className="size-4 text-amber-300" /></div><p className="mt-3 text-sm leading-6 text-slate-400">{pack.description || "Reusable electrical job template."}</p><div className="mt-4 grid grid-cols-2 gap-3 text-sm"><div className="rounded-xl bg-slate-950 p-3"><p className="text-slate-500">Labour</p><p className="font-semibold">{pack.labourHours}h · {money.format(labour)}</p></div><div className="rounded-xl bg-slate-950 p-3"><p className="text-slate-500">Materials</p><p className="font-semibold">{pack.materials.length} lines · {money.format(materialCost)}</p></div></div><div className="mt-4 flex items-center justify-between border-t border-slate-800 pt-4"><strong>{money.format(labour + materialCost)}</strong><div className="flex gap-2"><Button variant="secondary" onClick={() => edit(pack)}>Edit</Button><Button variant="danger" onClick={() => remove(pack)}>Delete</Button></div></div></Card>;
    })}</section>}
  </div>;
}
