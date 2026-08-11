"use client";

import { FormEvent, useMemo, useState } from "react";
import { ExternalLink, History, Package, Pencil, Plus, RefreshCw, Search, Star, Trash2 } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { InputField, TextareaField } from "../../components/ui/FormField";
import { PageHeader } from "../../components/ui/PageHeader";
import { EntityEmptyState } from "../../components/crm/EntityEmptyState";
import { useMaterialsCollection } from "../../lib/cloud/coreBusinessCollections";
import { useCloudIdentity } from "../../lib/cloud/useCloudIdentity";
import { readSupabaseSession } from "../../lib/supabase/client";
import { makeId } from "../../lib/storage";
import type { Material, MaterialCategory, MaterialPriceHistory, MaterialPriceSource, MaterialUnit } from "../../lib/models";

const categories: MaterialCategory[] = ["Cable", "Protection", "Accessories", "Lighting", "Containment", "EV", "Testing", "Fire alarm", "Emergency lighting", "Other"];
const units: MaterialUnit[] = ["Each", "Metre", "Drum", "Box", "Pack"];
const suppliers = ["CEF", "Screwfix", "TLC Direct"] as const;
const money = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const pageLoadedAt = Date.now();
const blank = { name: "", category: "Accessories" as MaterialCategory, manufacturer: "", supplier: "", supplierUrl: "", stockCode: "", unit: "Each" as MaterialUnit, tradeCost: "", sellPrice: "", favourite: false, notes: "" };

type SupplierName = typeof suppliers[number];
type LookupResult = {
  supplier: SupplierName;
  stockCode: string;
  name?: string;
  manufacturer?: string;
  productUrl?: string;
  publicPrice?: number;
  searchUrl: string;
  exactMatch: boolean;
  message: string;
};

function ageInDays(date?: string) {
  if (!date) return Number.POSITIVE_INFINITY;
  return Math.floor((pageLoadedAt - new Date(date).getTime()) / 86_400_000);
}

export default function MaterialsPage() {
  const materials = useMaterialsCollection();
  const { identity } = useCloudIdentity();
  const priceRestricted = identity?.role === "electrician";
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
  const [lookupSupplier, setLookupSupplier] = useState<SupplierName>("CEF");
  const [lookupCode, setLookupCode] = useState("");
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupMessage, setLookupMessage] = useState("");
  const [lookupResult, setLookupResult] = useState<LookupResult | null>(null);

  const filtered = useMemo(() => materials.items.filter((item) => {
    const matchesSearch = `${item.name} ${item.manufacturer} ${item.supplier} ${item.stockCode}`.toLowerCase().includes(search.toLowerCase());
    return matchesSearch && (category === "All" || item.category === category) && (!favouritesOnly || item.favourite);
  }), [materials.items, search, category, favouritesOnly]);

  const summary = useMemo(() => ({
    stale: materials.items.filter((item) => ageInDays(item.lastPriceCheckedAt) > 30).length,
    linked: materials.items.filter((item) => item.supplierUrl).length,
    favourites: materials.items.filter((item) => item.favourite).length,
  }), [materials.items]);

  function reset() {
    setForm(blank);
    setEditingId(null);
    setShowForm(false);
    setError("");
  }

  function startEdit(item: Material) {
    setForm({ name: item.name, category: item.category, manufacturer: item.manufacturer, supplier: item.supplier, supplierUrl: item.supplierUrl, stockCode: item.stockCode, unit: item.unit, tradeCost: String(item.tradeCost ?? 0), sellPrice: String(item.sellPrice ?? 0), favourite: item.favourite, notes: item.notes });
    setEditingId(item.id);
    setShowForm(true);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const tradeCost = priceRestricted ? 0 : Number(form.tradeCost || 0);
    const sellPrice = priceRestricted ? 0 : Number(form.sellPrice || 0);
    if (!form.name.trim()) { setError("Material name is required."); return; }
    if (!priceRestricted && (!Number.isFinite(tradeCost) || tradeCost < 0 || !Number.isFinite(sellPrice) || sellPrice < 0)) { setError("Trade cost and selling price must be valid positive amounts."); return; }
    if (form.supplierUrl && !/^https?:\/\//i.test(form.supplierUrl)) { setError("Supplier link must start with http:// or https://"); return; }

    const now = new Date().toISOString();
    const priceEntry: MaterialPriceHistory = { id: makeId("price"), tradeCost, sellPrice, source: "Manual", recordedAt: now };
    const payload = {
      name: form.name.trim(),
      category: form.category,
      manufacturer: form.manufacturer.trim(),
      supplier: form.supplier.trim(),
      supplierUrl: form.supplierUrl.trim(),
      stockCode: form.stockCode.trim(),
      unit: form.unit,
      tradeCost,
      sellPrice,
      favourite: form.favourite,
      notes: form.notes.trim(),
      lastPriceCheckedAt: now,
      priceSource: "Manual" as MaterialPriceSource,
    };

    materials.setItems((current) => {
      if (editingId) {
        return current.map((item): Material => item.id === editingId
          ? { ...item, ...payload, priceHistory: priceRestricted ? (item.priceHistory ?? []) : [...(item.priceHistory ?? []), priceEntry].slice(-12), updatedAt: now }
          : item);
      }
      const newMaterial: Material = { id: makeId("mat"), ...payload, priceHistory: priceRestricted ? [] : [priceEntry], createdAt: now, updatedAt: now };
      return [newMaterial, ...current];
    });
    reset();
  }

  async function lookupStockCode(event: FormEvent) {
    event.preventDefault();
    const stockCode = lookupCode.trim();
    if (!stockCode) { setLookupMessage("Enter a supplier stock code."); return; }
    setLookupBusy(true);
    setLookupMessage("");
    setLookupResult(null);
    try {
      const session = readSupabaseSession();
      if (!session || session.is_password_recovery) {
        throw new Error("Sign in before using supplier lookups.");
      }
      const response = await fetch("/api/materials/lookup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ supplier: lookupSupplier, stockCode }),
      });
      const result = await response.json() as LookupResult & { error?: string };
      if (!response.ok) throw new Error(result.error || "Supplier lookup failed.");
      setLookupResult(result);
      setLookupMessage(result.message);
    } catch (lookupError) {
      setLookupMessage(lookupError instanceof Error ? lookupError.message : "Supplier lookup failed.");
    } finally {
      setLookupBusy(false);
    }
  }

  function useLookupResult() {
    if (!lookupResult) return;
    const suggestedPrice = priceRestricted || lookupResult.publicPrice === undefined ? "" : String(lookupResult.publicPrice.toFixed(2));
    setForm({
      ...blank,
      name: lookupResult.name || `${lookupResult.supplier} item ${lookupResult.stockCode}`,
      manufacturer: lookupResult.manufacturer || "",
      supplier: lookupResult.supplier,
      supplierUrl: lookupResult.productUrl || lookupResult.searchUrl,
      stockCode: lookupResult.stockCode,
      tradeCost: suggestedPrice,
      sellPrice: suggestedPrice,
      notes: priceRestricted ? "Supplier product details imported for field use." : lookupResult.publicPrice === undefined ? "Confirm your trade price before saving." : "Public website price imported. Confirm your account-specific trade price before saving.",
    });
    setEditingId(null);
    setShowForm(true);
    setError("");
  }

  function remove(item: Material) {
    if (window.confirm(`Delete ${item.name}? This cannot be undone.`)) materials.remove((current) => current.id === item.id);
  }

  function toggleFavourite(item: Material) {
    materials.setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, favourite: !entry.favourite, updatedAt: new Date().toISOString() } : entry));
  }

  function openQuickUpdate(item: Material) {
    const tradeCost = item.tradeCost ?? 0;
    const sellPrice = item.sellPrice ?? 0;
    const markup = tradeCost > 0 ? ((sellPrice - tradeCost) / tradeCost) * 100 : 20;
    setQuickEditId(item.id);
    setQuickTradeCost(String(tradeCost));
    setQuickMarkup(markup.toFixed(1));
  }

  function saveQuickUpdate(item: Material) {
    const tradeCost = Number(quickTradeCost);
    const markup = Number(quickMarkup);
    if (!Number.isFinite(tradeCost) || tradeCost < 0 || !Number.isFinite(markup) || markup < 0) return;
    const sellPrice = Number((tradeCost * (1 + markup / 100)).toFixed(2));
    const now = new Date().toISOString();
    const source: MaterialPriceSource = item.supplierUrl ? "Supplier link" : "Manual";
    const priceEntry: MaterialPriceHistory = { id: makeId("price"), tradeCost, sellPrice, source, recordedAt: now };
    materials.setItems((current) => current.map((entry): Material => entry.id === item.id ? {
      ...entry, tradeCost, sellPrice, lastPriceCheckedAt: now, priceSource: source,
      priceHistory: [...(entry.priceHistory ?? []), priceEntry].slice(-12), updatedAt: now,
    } : entry));
    setQuickEditId(null);
  }

  return <div className="space-y-6">
    <PageHeader eyebrow={priceRestricted ? "Materials" : "Pricing"} title="Materials Library" description={priceRestricted ? "Browse supplier-linked materials and maintain field catalogue details without office pricing." : "Track supplier links, trade costs, selling prices and price-check dates for faster, safer quoting."} action={<Button onClick={() => showForm ? reset() : setShowForm(true)}><Plus className="mr-2 size-4" />{showForm ? "Close form" : "Add material"}</Button>} />

    <section className={`grid gap-4 sm:grid-cols-2 ${priceRestricted ? "" : "xl:grid-cols-3"}`}>
      <Card><p className="text-sm text-slate-400">Supplier-linked items</p><p className="mt-2 text-3xl font-bold">{summary.linked}</p></Card>
      {!priceRestricted ? <Card><p className="text-sm text-slate-400">Prices over 30 days old</p><p className={`mt-2 text-3xl font-bold ${summary.stale ? "text-amber-300" : "text-emerald-300"}`}>{summary.stale}</p></Card> : null}
      <Card><p className="text-sm text-slate-400">Favourite materials</p><p className="mt-2 text-3xl font-bold">{summary.favourites}</p></Card>
    </section>

    <Card className="border-cyan-400/30">
      <div className="flex items-start gap-3"><Search className="mt-0.5 size-5 text-cyan-300" /><div><h2 className="font-semibold">Find material by supplier stock code</h2><p className="mt-1 text-sm text-slate-400">Search CEF, Screwfix or TLC Direct. JR OS will import machine-readable product details when available and otherwise open the supplier result for confirmation.</p></div></div>
      <form onSubmit={lookupStockCode} className="mt-5 grid gap-3 md:grid-cols-[200px_1fr_auto]">
        <select value={lookupSupplier} onChange={(event) => setLookupSupplier(event.target.value as SupplierName)} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3">{suppliers.map((supplier) => <option key={supplier}>{supplier}</option>)}</select>
        <input value={lookupCode} onChange={(event) => setLookupCode(event.target.value)} placeholder="Enter stock code or product code" className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3 outline-none focus:border-cyan-400" />
        <Button type="submit" disabled={lookupBusy}>{lookupBusy ? "Searching…" : "Find product"}</Button>
      </form>
      {lookupMessage ? <p className="mt-4 rounded-xl bg-slate-950 p-3 text-sm text-slate-300">{lookupMessage}</p> : null}
      {lookupResult ? <div className="mt-4 flex flex-wrap gap-3"><Button onClick={useLookupResult}><Plus className="mr-2 size-4" />Add to materials</Button><a href={lookupResult.productUrl || lookupResult.searchUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 text-sm font-semibold"><ExternalLink className="size-4" />Open supplier result</a></div> : null}
    </Card>

    {showForm ? <Card><form onSubmit={submit} className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <InputField required label="Material name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Category</span><select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as MaterialCategory })} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3">{categories.map((item) => <option key={item}>{item}</option>)}</select></label>
      <InputField label="Manufacturer" value={form.manufacturer} onChange={(e) => setForm({ ...form, manufacturer: e.target.value })} />
      <InputField label="Supplier" value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} />
      <InputField label="Supplier link" type="url" value={form.supplierUrl} onChange={(e) => setForm({ ...form, supplierUrl: e.target.value })} />
      <InputField label="Stock code" value={form.stockCode} onChange={(e) => setForm({ ...form, stockCode: e.target.value })} />
      <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Unit</span><select value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value as MaterialUnit })} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3">{units.map((item) => <option key={item}>{item}</option>)}</select></label>
      {!priceRestricted ? <InputField label="Trade cost (£)" type="number" min="0" step="0.01" value={form.tradeCost} onChange={(e) => setForm({ ...form, tradeCost: e.target.value })} /> : null}
      {!priceRestricted ? <InputField label="Selling price (£)" type="number" min="0" step="0.01" value={form.sellPrice} onChange={(e) => setForm({ ...form, sellPrice: e.target.value })} /> : null}
      <label className="flex items-center gap-3 pt-8 text-sm text-slate-300"><input type="checkbox" checked={form.favourite} onChange={(e) => setForm({ ...form, favourite: e.target.checked })} />Favourite material</label>
      <div className="md:col-span-2 xl:col-span-4"><TextareaField label="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
      {error ? <p className="md:col-span-2 xl:col-span-4 text-sm text-rose-300">{error}</p> : null}
      <div className="md:col-span-2 xl:col-span-4 flex gap-3"><Button type="submit">{editingId ? "Save changes" : "Add material"}</Button><Button type="button" variant="secondary" onClick={reset}>Cancel</Button></div>
    </form></Card> : null}

    <Card><div className="grid gap-3 md:grid-cols-[1fr_220px_auto]">
      <InputField label="Search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Material, manufacturer, supplier or code" />
      <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Category</span><select value={category} onChange={(e) => setCategory(e.target.value as "All" | MaterialCategory)} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3"><option>All</option>{categories.map((item) => <option key={item}>{item}</option>)}</select></label>
      <label className="flex min-h-11 items-center gap-3 self-end rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-slate-300"><input type="checkbox" checked={favouritesOnly} onChange={(e) => setFavouritesOnly(e.target.checked)} />Favourites</label>
    </div></Card>

    <section className="grid gap-4 xl:grid-cols-2">
      {filtered.map((item) => <Card key={item.id} className="min-w-0"><div className="flex min-w-0 items-start justify-between gap-4"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="break-words font-semibold">{item.name}</p>{item.favourite ? <Star className="size-4 fill-amber-300 text-amber-300" /> : null}</div><p className="mt-1 break-words text-sm text-slate-400">{[item.manufacturer, item.supplier, item.stockCode].filter(Boolean).join(" · ") || "No supplier details"}</p></div><Package className="size-5 shrink-0 text-cyan-300" /></div>
        {!priceRestricted ? <div className="mt-4 grid gap-3 sm:grid-cols-3"><div><p className="text-xs uppercase tracking-wide text-slate-500">Trade cost</p><p className="mt-1 font-semibold">{money.format(item.tradeCost ?? 0)}</p></div><div><p className="text-xs uppercase tracking-wide text-slate-500">Sell price</p><p className="mt-1 font-semibold">{money.format(item.sellPrice ?? 0)}</p></div><div><p className="text-xs uppercase tracking-wide text-slate-500">Last checked</p><p className={`mt-1 font-semibold ${ageInDays(item.lastPriceCheckedAt) > 30 ? "text-amber-300" : ""}`}>{item.lastPriceCheckedAt ? new Date(item.lastPriceCheckedAt).toLocaleDateString("en-GB") : "Never"}</p></div></div> : null}
        <div className="mt-4 flex flex-wrap gap-2">{item.supplierUrl ? <a href={item.supplierUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-700 px-3 text-sm font-semibold"><ExternalLink className="size-4" />Supplier</a> : null}<Button variant="secondary" onClick={() => toggleFavourite(item)}><Star className="mr-2 size-4" />Favourite</Button>{!priceRestricted ? <Button variant="secondary" onClick={() => startEdit(item)}><Pencil className="mr-2 size-4" />Edit</Button> : null}{!priceRestricted ? <Button variant="secondary" onClick={() => openQuickUpdate(item)}><RefreshCw className="mr-2 size-4" />Update price</Button> : null}{!priceRestricted ? <Button variant="danger" onClick={() => remove(item)}><Trash2 className="mr-2 size-4" />Delete</Button> : null}</div>
        {!priceRestricted && quickEditId === item.id ? <div className="mt-4 grid gap-3 rounded-xl border border-slate-700 bg-slate-950 p-4 sm:grid-cols-2"><InputField label="Trade cost (£)" type="number" min="0" step="0.01" value={quickTradeCost} onChange={(e) => setQuickTradeCost(e.target.value)} /><InputField label="Markup (%)" type="number" min="0" step="0.1" value={quickMarkup} onChange={(e) => setQuickMarkup(e.target.value)} /><div className="sm:col-span-2 flex gap-2"><Button onClick={() => saveQuickUpdate(item)}>Save price</Button><Button variant="secondary" onClick={() => setQuickEditId(null)}>Cancel</Button></div></div> : null}
        {!priceRestricted && item.priceHistory?.length ? <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950 p-4"><div className="flex items-center gap-2 text-sm font-semibold"><History className="size-4 text-cyan-300" />Recent price history</div><div className="mt-3 space-y-2">{item.priceHistory.slice(-4).reverse().map((entry) => <div key={entry.id} className="flex flex-wrap justify-between gap-2 text-sm text-slate-400"><span>{new Date(entry.recordedAt).toLocaleDateString("en-GB")} · {entry.source}</span><span>{money.format(entry.tradeCost)} → {money.format(entry.sellPrice)}</span></div>)}</div></div> : null}
      </Card>)}
    </section>

    {!filtered.length ? <EntityEmptyState icon={<Package className="size-6" />} title="No materials found" description="Add supplier-linked materials or adjust your filters." /> : null}
  </div>;
}
