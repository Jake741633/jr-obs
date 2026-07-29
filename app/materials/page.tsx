"use client";

import { FormEvent, useMemo, useState } from "react";
import { ExternalLink, History, Package, Pencil, Plus, RefreshCw, Search, Star, Trash2 } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { InputField, TextareaField } from "../../components/ui/FormField";
import { PageHeader } from "../../components/ui/PageHeader";
import { EntityEmptyState } from "../../components/crm/EntityEmptyState";
import { makeId, useLocalStorageCollection } from "../../lib/storage";
import type { Material, MaterialCategory, MaterialPriceSource, MaterialUnit } from "../../lib/models";

const categories: MaterialCategory[] = ["Cable", "Protection", "Accessories", "Lighting", "Containment", "EV", "Testing", "Fire alarm", "Emergency lighting", "Other"];
const units: MaterialUnit[] = ["Each", "Metre", "Drum", "Box", "Pack"];
const money = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const blank = { name: "", category: "Accessories" as MaterialCategory, manufacturer: "", supplier: "", supplierUrl: "", stockCode: "", unit: "Each" as MaterialUnit, tradeCost: "", sellPrice: "", favourite: false, notes: "" };

function ageInDays(date?: string) {
  if (!date) return Number.POSITIVE_INFINITY;
  return Math.floor((Date.now() - new Date(date).getTime()) / 86_400_000);
}

export default function MaterialsPage() {
  const materials = useLocalStorageCollection<Material>("jr-os-materials");
  const [form, setForm] = useState(blank);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<"All" | MaterialCategory>("All");
  const [favouritesOnly, setFavouritesOnly] = useState(false);
  const [error, setError] = useState("");
  const [quickEditId, setQuickEditId] = useState<string | null>(null);
  const [quickTradeCost, setQuickTradeCost] = useState("");
  const [quickMarkup, setQuickMarkup] = useState("20");

  const filtered = useMemo(() => materials.items.filter((item) => {
    const matchesSearch = `${item.name} ${item.manufacturer} ${item.supplier} ${item.stockCode}`.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = category === "All" || item.category === category;
    const matchesFavourite = !favouritesOnly || item.favourite;
    return matchesSearch && matchesCategory && matchesFavourite;
  }), [materials.items, search, category, favouritesOnly]);

  const summary = useMemo(() => {
    const stale = materials.items.filter((item) => ageInDays(item.lastPriceCheckedAt) > 30).length;
    const linked = materials.items.filter((item) => item.supplierUrl).length;
    const favourites = materials.items.filter((item) => item.favourite).length;
    return { stale, linked, favourites };
  }, [materials.items]);

  function reset() {
    setForm(blank);
    setEditingId(null);
    setShowForm(false);
    setError("");
  }

  function startEdit(item: Material) {
    setForm({ name: item.name, category: item.category, manufacturer: item.manufacturer, supplier: item.supplier, supplierUrl: item.supplierUrl, stockCode: item.stockCode, unit: item.unit, tradeCost: String(item.tradeCost), sellPrice: String(item.sellPrice), favourite: item.favourite, notes: item.notes });
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
    const payload = { name: form.name.trim(), category: form.category, manufacturer: form.manufacturer.trim(), supplier: form.supplier.trim(), supplierUrl: form.supplierUrl.trim(), stockCode: form.stockCode.trim(), unit: form.unit, tradeCost, sellPrice, favourite: form.favourite, notes: form.notes.trim(), lastPriceCheckedAt: now, priceSource: "Manual" as MaterialPriceSource };
    materials.setItems((current) => editingId
      ? current.map((item) => item.id === editingId ? { ...item, ...payload, priceHistory: [...(item.priceHistory ?? []), { id: makeId("price"), tradeCost, sellPrice, source: "Manual", recordedAt: now }].slice(-12), updatedAt: now } : item)
      : [{ id: makeId("mat"), ...payload, priceHistory: [{ id: makeId("price"), tradeCost, sellPrice, source: "Manual", recordedAt: now }], createdAt: now, updatedAt: now }, ...current]);
    reset();
  }

  function remove(item: Material) {
    if (window.confirm(`Delete ${item.name}? This cannot be undone.`)) materials.remove((current) => current.id === item.id);
  }

  function toggleFavourite(item: Material) {
    materials.setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, favourite: !entry.favourite, updatedAt: new Date().toISOString() } : entry));
  }

  function openQuickUpdate(item: Material) {
    const markup = item.tradeCost > 0 ? ((item.sellPrice - item.tradeCost) / item.tradeCost) * 100 : 20;
    setQuickEditId(item.id);
    setQuickTradeCost(String(item.tradeCost));
    setQuickMarkup(markup.toFixed(1));
  }

  function saveQuickUpdate(item: Material) {
    const tradeCost = Number(quickTradeCost);
    const markup = Number(quickMarkup);
    if (!Number.isFinite(tradeCost) || tradeCost < 0 || !Number.isFinite(markup) || markup < 0) return;
    const sellPrice = Number((tradeCost * (1 + markup / 100)).toFixed(2));
    const now = new Date().toISOString();
    materials.setItems((current) => current.map((entry) => entry.id === item.id ? {
      ...entry,
      tradeCost,
      sellPrice,
      lastPriceCheckedAt: now,
      priceSource: entry.supplierUrl ? "Supplier link" : "Manual",
      priceHistory: [...(entry.priceHistory ?? []), { id: makeId("price"), tradeCost, sellPrice, source: entry.supplierUrl ? "Supplier link" : "Manual", recordedAt: now }].slice(-12),
      updatedAt: now,
    } : entry));
    setQuickEditId(null);
  }

  return <div className="space-y-6">
    <PageHeader eyebrow="Pricing" title="Materials Library" description="Track supplier links, trade costs, selling prices and price-check dates for faster, safer quoting." action={<Button onClick={() => showForm ? reset() : setShowForm(true)}><Plus className="mr-2 size-4" />{showForm ? "Close form" : "Add material"}</Button>} />

    <section className="grid gap-4 sm:grid-cols-3">
      <Card><p className="text-sm text-slate-400">Supplier-linked items</p><p className="mt-2 text-3xl font-bold">{summary.linked}</p></Card>
      <Card><p className="text-sm text-slate-400">Prices over 30 days old</p><p className={`mt-2 text-3xl font-bold ${summary.stale ? "text-amber-300" : "text-emerald-300"}`}>{summary.stale}</p></Card>
      <Card><p className="text-sm text-slate-400">Favourite materials</p><p className="mt-2 text-3xl font-bold">{summary.favourites}</p></Card>
    </section>

    <Card className="border-cyan-400/20"><div className="flex items-start gap-3"><RefreshCw className="mt-0.5 size-5 text-cyan-300" /><div><h2 className="font-semibold">Supplier price workflow</h2><p className="mt-1 text-sm text-slate-400">Open the saved supplier product link, check your account-specific trade price, then use Quick update. Automatic supplier pulling will be added through a secure server-side connector because CEF, Screwfix and TLC pages use different layouts and some prices depend on your logged-in account.</p></div></div></Card>

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
      const daysOld = ageInDays(item.lastPriceCheckedAt);
      const stale = daysOld > 30;
      const lastHistory = (item.priceHistory ?? []).slice(-3).reverse();
      return <Card key={item.id}><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">{item.category} · {item.unit}</p><h2 className="mt-1 text-lg font-bold">{item.name}</h2><p className="text-sm text-slate-500">{item.manufacturer || item.supplier || "No manufacturer or supplier"}</p></div><div className="flex"><button onClick={() => toggleFavourite(item)} aria-label={`Favourite ${item.name}`} className={`rounded-lg p-2 ${item.favourite ? "text-amber-300" : "text-slate-500 hover:text-amber-300"}`}><Star className="size-4" fill={item.favourite ? "currentColor" : "none"} /></button><button onClick={() => startEdit(item)} aria-label={`Edit ${item.name}`} className="rounded-lg p-2 text-slate-500 hover:bg-slate-800 hover:text-cyan-300"><Pencil className="size-4" /></button><button onClick={() => remove(item)} aria-label={`Delete ${item.name}`} className="rounded-lg p-2 text-slate-500 hover:bg-red-500/10 hover:text-red-300"><Trash2 className="size-4" /></button></div></div>
      <div className="mt-5 grid grid-cols-2 gap-3 border-t border-slate-800 pt-4 text-sm"><div><p className="text-slate-500">Trade cost</p><p className="font-semibold">{money.format(item.tradeCost)}</p></div><div><p className="text-slate-500">Selling price</p><p className="font-semibold">{money.format(item.sellPrice)}</p></div><div><p className="text-slate-500">Markup</p><p className="font-semibold">{markup.toFixed(1)}%</p></div><div><p className="text-slate-500">Stock code</p><p className="font-semibold">{item.stockCode || "—"}</p></div></div>
      <div className={`mt-4 rounded-xl border p-3 text-xs ${stale ? "border-amber-500/30 bg-amber-500/5 text-amber-200" : "border-emerald-500/30 bg-emerald-500/5 text-emerald-200"}`}>{item.lastPriceCheckedAt ? `Price checked ${daysOld} day${daysOld === 1 ? "" : "s"} ago` : "Price has not been checked yet"}</div>
      {quickEditId === item.id ? <div className="mt-4 grid gap-3 rounded-xl border border-cyan-400/30 bg-slate-950 p-4"><InputField label="New trade cost (£)" type="number" min="0" step="0.01" value={quickTradeCost} onChange={(e) => setQuickTradeCost(e.target.value)} /><InputField label="Markup (%)" type="number" min="0" step="0.1" value={quickMarkup} onChange={(e) => setQuickMarkup(e.target.value)} /><div className="flex gap-2"><Button onClick={() => saveQuickUpdate(item)}>Save price</Button><Button variant="secondary" onClick={() => setQuickEditId(null)}>Cancel</Button></div></div> : <div className="mt-4 flex flex-wrap gap-2"><Button variant="secondary" onClick={() => openQuickUpdate(item)}><RefreshCw className="mr-2 size-4" />Quick update</Button>{item.supplierUrl ? <a href={item.supplierUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 text-sm font-semibold text-slate-100 hover:bg-slate-800"><ExternalLink className="size-4" />Supplier</a> : null}</div>}
      {lastHistory.length ? <details className="mt-4"><summary className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-400"><History className="size-4" />Recent price history</summary><div className="mt-2 space-y-2">{lastHistory.map((entry) => <div key={entry.id} className="flex justify-between rounded-lg bg-slate-950 p-2 text-xs text-slate-400"><span>{new Date(entry.recordedAt).toLocaleDateString("en-GB")}</span><span>{money.format(entry.tradeCost)} → {money.format(entry.sellPrice)}</span></div>)}</div></details> : null}
    </Card>;})}</section>}
  </div>;
}