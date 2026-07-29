"use client";

import { FormEvent, useMemo, useState } from "react";
import { ExternalLink, Package, Pencil, Plus, Search, Star, Trash2 } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { InputField, TextareaField } from "../../components/ui/FormField";
import { PageHeader } from "../../components/ui/PageHeader";
import { EntityEmptyState } from "../../components/crm/EntityEmptyState";
import { makeId, useLocalStorageCollection } from "../../lib/storage";
import type { Material, MaterialCategory, MaterialUnit } from "../../lib/models";

const categories: MaterialCategory[] = ["Cable", "Protection", "Accessories", "Lighting", "Containment", "EV", "Testing", "Fire alarm", "Emergency lighting", "Other"];
const units: MaterialUnit[] = ["Each", "Metre", "Drum", "Box", "Pack"];
const money = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const blank = { name: "", category: "Accessories" as MaterialCategory, manufacturer: "", supplier: "", supplierUrl: "", stockCode: "", unit: "Each" as MaterialUnit, tradeCost: "", sellPrice: "", favourite: false, notes: "" };

export default function MaterialsPage() {
  const materials = useLocalStorageCollection<Material>("jr-os-materials");
  const [form, setForm] = useState(blank);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<"All" | MaterialCategory>("All");
  const [favouritesOnly, setFavouritesOnly] = useState(false);
  const [error, setError] = useState("");

  const filtered = useMemo(() => materials.items.filter((item) => {
    const matchesSearch = `${item.name} ${item.manufacturer} ${item.supplier} ${item.stockCode}`.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = category === "All" || item.category === category;
    const matchesFavourite = !favouritesOnly || item.favourite;
    return matchesSearch && matchesCategory && matchesFavourite;
  }), [materials.items, search, category, favouritesOnly]);

  function reset() {
    setForm(blank);
    setEditingId(null);
    setShowForm(false);
    setError("");
  }

  function startEdit(item: Material) {
    setForm({
      name: item.name,
      category: item.category,
      manufacturer: item.manufacturer,
      supplier: item.supplier,
      supplierUrl: item.supplierUrl,
      stockCode: item.stockCode,
      unit: item.unit,
      tradeCost: String(item.tradeCost),
      sellPrice: String(item.sellPrice),
      favourite: item.favourite,
      notes: item.notes,
    });
    setEditingId(item.id);
    setShowForm(true);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const tradeCost = Number(form.tradeCost || 0);
    const sellPrice = Number(form.sellPrice || 0);
    if (!form.name.trim()) { setError("Material name is required."); return; }
    if (!Number.isFinite(tradeCost) || tradeCost < 0 || !Number.isFinite(sellPrice) || sellPrice < 0) { setError("Trade cost and selling price must be valid positive amounts."); return; }
    if (form.supplierUrl && !/^https?:\/\//i.test(form.supplierUrl)) { setError("Supplier link must start with http:// or https://"); return; }
    const now = new Date().toISOString();
    const payload = { name: form.name.trim(), category: form.category, manufacturer: form.manufacturer.trim(), supplier: form.supplier.trim(), supplierUrl: form.supplierUrl.trim(), stockCode: form.stockCode.trim(), unit: form.unit, tradeCost, sellPrice, favourite: form.favourite, notes: form.notes.trim() };
    materials.setItems((current) => editingId
      ? current.map((item) => item.id === editingId ? { ...item, ...payload, updatedAt: now } : item)
      : [{ id: makeId("mat"), ...payload, createdAt: now, updatedAt: now }, ...current]);
    reset();
  }

  function remove(item: Material) {
    if (window.confirm(`Delete ${item.name}? This cannot be undone.`)) materials.remove((current) => current.id === item.id);
  }

  function toggleFavourite(item: Material) {
    materials.setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, favourite: !entry.favourite, updatedAt: new Date().toISOString() } : entry));
  }

  return <div className="space-y-6">
    <PageHeader eyebrow="Pricing" title="Materials Library" description="Store trade costs, selling prices, supplier links and favourite products for faster quoting." action={<Button onClick={() => showForm ? reset() : setShowForm(true)}><Plus className="mr-2 size-4" />{showForm ? "Close form" : "Add material"}</Button>} />

    {showForm ? <Card><form onSubmit={submit} className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <InputField required label="Material name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Category</span><select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as MaterialCategory })} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3">{categories.map((item) => <option key={item}>{item}</option>)}</select></label>
      <InputField label="Manufacturer" value={form.manufacturer} onChange={(e) => setForm({ ...form, manufacturer: e.target.value })} />
      <InputField label="Supplier" value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} />
      <InputField label="Supplier link" type="url" value={form.supplierUrl} onChange={(e) => setForm({ ...form, supplierUrl: e.target.value })} />
      <InputField label="Stock code" value={form.stockCode} onChange={(e) => setForm({ ...form, stockCode: e.target.value })} />
      <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Unit</span><select value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value as MaterialUnit })} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3">{units.map((item) => <option key={item}>{item}</option>)}</select></label>
      <InputField label="Trade cost (£)" type="number" min="0" step="0.01" value={form.tradeCost} onChange={(e) => setForm({ ...form, tradeCost: e.target.value })} />
      <InputField label="Selling price (£)" type="number" min="0" step="0.01" value={form.sellPrice} onChange={(e) => setForm({ ...form, sellPrice: e.target.value })} />
      <label className="flex items-center gap-3 pt-8 text-sm text-slate-300"><input type="checkbox" checked={form.favourite} onChange={(e) => setForm({ ...form, favourite: e.target.checked })} />Favourite material</label>
      <div className="md:col-span-2 xl:col-span-4"><TextareaField label="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
      {error ? <p className="text-sm text-red-300 md:col-span-2 xl:col-span-4">{error}</p> : null}
      <div className="flex justify-end md:col-span-2 xl:col-span-4"><Button type="submit">{editingId ? "Update material" : "Save material"}</Button></div>
    </form></Card> : null}

    <div className="grid gap-3 md:grid-cols-[1fr_220px_auto]">
      <div className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search materials, supplier or stock code" className="min-h-11 w-full rounded-xl border border-slate-800 bg-slate-900 pl-10 pr-4 text-sm outline-none focus:border-cyan-400" /></div>
      <select value={category} onChange={(e) => setCategory(e.target.value as "All" | MaterialCategory)} className="min-h-11 rounded-xl border border-slate-800 bg-slate-900 px-4 text-sm"><option>All</option>{categories.map((item) => <option key={item}>{item}</option>)}</select>
      <Button variant={favouritesOnly ? "primary" : "secondary"} onClick={() => setFavouritesOnly((value) => !value)}><Star className="mr-2 size-4" />Favourites</Button>
    </div>

    {!materials.isReady ? <Card>Loading materials…</Card> : filtered.length === 0 ? <EntityEmptyState icon={<Package className="size-6" />} title={materials.items.length ? "No matching materials" : "No materials yet"} description={materials.items.length ? "Change the search or filters." : "Add commonly used products so quotes can be built faster."} /> : <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{filtered.map((item) => {
      const markup = item.tradeCost > 0 ? ((item.sellPrice - item.tradeCost) / item.tradeCost) * 100 : 0;
      return <Card key={item.id}><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">{item.category} · {item.unit}</p><h2 className="mt-1 text-lg font-bold">{item.name}</h2><p className="text-sm text-slate-500">{item.manufacturer || item.supplier || "No manufacturer or supplier"}</p></div><div className="flex"><button onClick={() => toggleFavourite(item)} aria-label={`Favourite ${item.name}`} className={`rounded-lg p-2 ${item.favourite ? "text-amber-300" : "text-slate-500 hover:text-amber-300"}`}><Star className="size-4" fill={item.favourite ? "currentColor" : "none"} /></button><button onClick={() => startEdit(item)} aria-label={`Edit ${item.name}`} className="rounded-lg p-2 text-slate-500 hover:bg-slate-800 hover:text-cyan-300"><Pencil className="size-4" /></button><button onClick={() => remove(item)} aria-label={`Delete ${item.name}`} className="rounded-lg p-2 text-slate-500 hover:bg-red-500/10 hover:text-red-300"><Trash2 className="size-4" /></button></div></div>
      <div className="mt-5 grid grid-cols-2 gap-3 border-t border-slate-800 pt-4 text-sm"><div><p className="text-slate-500">Trade cost</p><p className="font-semibold">{money.format(item.tradeCost)}</p></div><div><p className="text-slate-500">Selling price</p><p className="font-semibold">{money.format(item.sellPrice)}</p></div><div><p className="text-slate-500">Markup</p><p className="font-semibold">{markup.toFixed(1)}%</p></div><div><p className="text-slate-500">Stock code</p><p className="font-semibold">{item.stockCode || "—"}</p></div></div>
      {item.supplierUrl ? <a href={item.supplierUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-2 text-sm text-cyan-400 hover:text-cyan-300"><ExternalLink className="size-4" />Open supplier product</a> : null}
    </Card>;})}</section>}
  </div>;
}
