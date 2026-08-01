"use client";

import { FormEvent, useMemo, useState } from "react";
import { Calculator, Edit3, Plus, Power, Star, Trash2 } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { InputField, TextareaField } from "../../components/ui/FormField";
import { PageHeader } from "../../components/ui/PageHeader";
import {
  normalisePriceBookItem,
  priceBookCategories,
  priceBookUnitFinancials,
  type PriceBookItem,
  type PriceBookPricingMethod,
  type PriceBookSector,
} from "../../lib/priceBook-core.mjs";
import { makeId, useLocalStorageCollection } from "../../lib/storage";

const money = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const sectors: PriceBookSector[] = ["Domestic", "Commercial", "Industrial"];
const pricingMethods: PriceBookPricingMethod[] = ["Fixed", "Calculated"];

const blankForm = {
  name: "",
  description: "",
  category: "Power",
  sector: "Domestic" as PriceBookSector,
  unitLabel: "point",
  pricingMethod: "Fixed" as PriceBookPricingMethod,
  fixedSellingPrice: "0",
  labourHours: "0",
  labourCostRate: "0",
  labourSellRate: "0",
  materialCost: "0",
  materialMarkupPercent: "0",
  overheadAllowance: "0",
  contingencyPercent: "0",
  vatRate: "20",
  notes: "",
};

export default function PriceBookPage() {
  const priceBook = useLocalStorageCollection<PriceBookItem>("jr-os-price-book");
  const [form, setForm] = useState(blankForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [message, setMessage] = useState("");

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return priceBook.items
      .filter((item) => categoryFilter === "All" || item.category === categoryFilter)
      .filter((item) => !needle || [item.name, item.description, item.category, item.sector].join(" ").toLowerCase().includes(needle))
      .sort((a, b) => Number(b.favourite) - Number(a.favourite) || a.name.localeCompare(b.name));
  }, [categoryFilter, priceBook.items, query]);

  const summary = useMemo(() => {
    const active = priceBook.items.filter((item) => item.active);
    const favourites = active.filter((item) => item.favourite).length;
    const averageSellingPrice = active.length
      ? active.reduce((total, item) => total + priceBookUnitFinancials(item).sellingPrice, 0) / active.length
      : 0;
    return { active: active.length, favourites, averageSellingPrice };
  }, [priceBook.items]);

  function resetForm() {
    setForm(blankForm);
    setEditingId(null);
    setShowForm(false);
  }

  function saveItem(event: FormEvent) {
    event.preventDefault();
    if (!form.name.trim()) {
      setMessage("Enter a name for this electrical price-book item.");
      return;
    }

    const now = new Date().toISOString();
    const existing = editingId ? priceBook.items.find((item) => item.id === editingId) : undefined;
    const value = normalisePriceBookItem({
      ...existing,
      id: editingId ?? makeId("price-book"),
      name: form.name,
      description: form.description,
      category: form.category,
      sector: form.sector,
      unitLabel: form.unitLabel,
      pricingMethod: form.pricingMethod,
      fixedSellingPrice: Number(form.fixedSellingPrice),
      labourHours: Number(form.labourHours),
      labourCostRate: Number(form.labourCostRate),
      labourSellRate: Number(form.labourSellRate),
      materialCost: Number(form.materialCost),
      materialMarkupPercent: Number(form.materialMarkupPercent),
      overheadAllowance: Number(form.overheadAllowance),
      contingencyPercent: Number(form.contingencyPercent),
      vatRate: Number(form.vatRate),
      notes: form.notes,
      active: existing?.active ?? true,
      favourite: existing?.favourite ?? false,
      supplierItemIds: existing?.supplierItemIds ?? [],
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    });

    priceBook.setItems((current) => editingId
      ? current.map((item) => item.id === editingId ? value : item)
      : [value, ...current]);
    setMessage(editingId ? "Price-book item updated." : "Price-book item saved.");
    resetForm();
  }

  function editItem(item: PriceBookItem) {
    setForm({
      name: item.name,
      description: item.description,
      category: item.category,
      sector: item.sector,
      unitLabel: item.unitLabel,
      pricingMethod: item.pricingMethod,
      fixedSellingPrice: String(item.fixedSellingPrice),
      labourHours: String(item.labourHours),
      labourCostRate: String(item.labourCostRate),
      labourSellRate: String(item.labourSellRate),
      materialCost: String(item.materialCost),
      materialMarkupPercent: String(item.materialMarkupPercent),
      overheadAllowance: String(item.overheadAllowance),
      contingencyPercent: String(item.contingencyPercent),
      vatRate: String(item.vatRate),
      notes: item.notes,
    });
    setEditingId(item.id);
    setShowForm(true);
    setMessage("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function patchItem(id: string, patch: Partial<PriceBookItem>) {
    priceBook.setItems((current) => current.map((item) => item.id === id
      ? { ...item, ...patch, updatedAt: new Date().toISOString() }
      : item));
  }

  if (!priceBook.isReady) return <Card>Loading electrical price book…</Card>;

  return <div className="space-y-6 pb-28">
    <PageHeader
      eyebrow="Smart pricing"
      title="Electrical Price Book"
      description="Save fixed prices per socket, spotlight, circuit, test or custom electrical point while retaining labour, material and profit evidence internally."
    />

    <div className="grid gap-3 sm:grid-cols-3">
      <Card><Power className="size-5 text-cyan-300" /><p className="mt-3 text-sm text-slate-400">Active items</p><p className="mt-1 text-3xl font-bold">{summary.active}</p></Card>
      <Card><Star className="size-5 text-amber-300" /><p className="mt-3 text-sm text-slate-400">Favourites</p><p className="mt-1 text-3xl font-bold">{summary.favourites}</p></Card>
      <Card><Calculator className="size-5 text-emerald-300" /><p className="mt-3 text-sm text-slate-400">Average unit price</p><p className="mt-1 text-3xl font-bold">{money.format(summary.averageSellingPrice)}</p></Card>
    </div>

    <Button className="w-full sm:w-auto" onClick={() => { setShowForm((current) => !current); if (showForm) resetForm(); }}>
      <Plus className="mr-2 size-4" />{showForm ? "Close item form" : "Add price-book item"}
    </Button>

    {message ? <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 px-4 py-3 text-sm text-cyan-100">{message}</div> : null}

    {showForm ? <Card>
      <form onSubmit={saveItem} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <InputField required label="Item name" placeholder="Double socket point, LED spotlight…" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
        <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Category</span><select className="min-h-12 rounded-xl border border-slate-700 bg-slate-950 px-3 text-base sm:min-h-11 sm:text-sm" value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>{priceBookCategories.map((category) => <option key={category}>{category}</option>)}</select></label>
        <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Sector</span><select className="min-h-12 rounded-xl border border-slate-700 bg-slate-950 px-3 text-base sm:min-h-11 sm:text-sm" value={form.sector} onChange={(event) => setForm({ ...form, sector: event.target.value as PriceBookSector })}>{sectors.map((sector) => <option key={sector}>{sector}</option>)}</select></label>
        <InputField label="Unit label" placeholder="point, circuit, item…" value={form.unitLabel} onChange={(event) => setForm({ ...form, unitLabel: event.target.value })} />
        <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Pricing method</span><select className="min-h-12 rounded-xl border border-slate-700 bg-slate-950 px-3 text-base sm:min-h-11 sm:text-sm" value={form.pricingMethod} onChange={(event) => setForm({ ...form, pricingMethod: event.target.value as PriceBookPricingMethod })}>{pricingMethods.map((method) => <option key={method}>{method}</option>)}</select></label>
        {form.pricingMethod === "Fixed" ? <InputField label="Fixed selling price (£)" type="number" min="0" step="0.01" value={form.fixedSellingPrice} onChange={(event) => setForm({ ...form, fixedSellingPrice: event.target.value })} /> : <div />}
        <InputField label="Labour hours" type="number" min="0" step="0.25" value={form.labourHours} onChange={(event) => setForm({ ...form, labourHours: event.target.value })} />
        <InputField label="Labour cost rate (£/h)" type="number" min="0" step="0.01" value={form.labourCostRate} onChange={(event) => setForm({ ...form, labourCostRate: event.target.value })} />
        <InputField label="Labour selling rate (£/h)" type="number" min="0" step="0.01" value={form.labourSellRate} onChange={(event) => setForm({ ...form, labourSellRate: event.target.value })} />
        <InputField label="Material cost (£)" type="number" min="0" step="0.01" value={form.materialCost} onChange={(event) => setForm({ ...form, materialCost: event.target.value })} />
        <InputField label="Material markup (%)" type="number" min="0" max="100" step="0.1" value={form.materialMarkupPercent} onChange={(event) => setForm({ ...form, materialMarkupPercent: event.target.value })} />
        <InputField label="Overhead allowance (£)" type="number" min="0" step="0.01" value={form.overheadAllowance} onChange={(event) => setForm({ ...form, overheadAllowance: event.target.value })} />
        <InputField label="Contingency (%)" type="number" min="0" max="100" step="0.1" value={form.contingencyPercent} onChange={(event) => setForm({ ...form, contingencyPercent: event.target.value })} />
        <InputField label="VAT rate (%)" type="number" min="0" max="100" step="0.1" value={form.vatRate} onChange={(event) => setForm({ ...form, vatRate: event.target.value })} />
        <div className="md:col-span-2 xl:col-span-3"><TextareaField label="Customer description" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></div>
        <div className="md:col-span-2 xl:col-span-3"><TextareaField label="Internal notes" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></div>
        <div className="flex gap-3 md:col-span-2 xl:col-span-3"><Button type="submit" className="flex-1">{editingId ? "Update item" : "Save item"}</Button><Button type="button" variant="secondary" onClick={resetForm}>Cancel</Button></div>
      </form>
    </Card> : null}

    <Card>
      <div className="grid gap-3 sm:grid-cols-[1fr_220px]">
        <InputField label="Search price book" placeholder="Socket, spotlight, testing…" value={query} onChange={(event) => setQuery(event.target.value)} />
        <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Category</span><select className="min-h-12 rounded-xl border border-slate-700 bg-slate-950 px-3 text-base sm:min-h-11 sm:text-sm" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option>All</option>{priceBookCategories.map((category) => <option key={category}>{category}</option>)}</select></label>
      </div>
    </Card>

    <section className="grid gap-4 lg:grid-cols-2">
      {filtered.map((item) => {
        const financials = priceBookUnitFinancials(item);
        return <Card key={item.id} className={item.active ? "" : "opacity-60"}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0"><p className="font-semibold text-white">{item.name}</p><p className="mt-1 text-sm text-slate-400">{item.category} · {item.sector} · per {item.unitLabel}</p></div>
            <button type="button" aria-label={item.favourite ? "Remove favourite" : "Add favourite"} onClick={() => patchItem(item.id, { favourite: !item.favourite })} className="min-h-11 min-w-11 rounded-xl border border-slate-700 p-2"><Star className={`mx-auto size-5 ${item.favourite ? "fill-amber-300 text-amber-300" : "text-slate-500"}`} /></button>
          </div>
          {item.description ? <p className="mt-3 text-sm text-slate-300">{item.description}</p> : null}
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl bg-slate-950/70 p-3"><p className="text-slate-500">Selling price</p><p className="mt-1 text-lg font-bold text-cyan-200">{money.format(financials.sellingPrice)}</p></div>
            <div className="rounded-xl bg-slate-950/70 p-3"><p className="text-slate-500">Gross profit</p><p className="mt-1 text-lg font-bold text-emerald-300">{money.format(financials.grossProfit)}</p></div>
            <div className="rounded-xl bg-slate-950/70 p-3"><p className="text-slate-500">Internal cost</p><p className="mt-1 font-semibold">{money.format(financials.totalCost)}</p></div>
            <div className="rounded-xl bg-slate-950/70 p-3"><p className="text-slate-500">Margin</p><p className="mt-1 font-semibold">{financials.grossMargin.toFixed(1)}%</p></div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Button variant="secondary" onClick={() => editItem(item)}><Edit3 className="mr-2 size-4" />Edit</Button>
            <Button variant="secondary" onClick={() => patchItem(item.id, { active: !item.active })}>{item.active ? "Disable" : "Enable"}</Button>
            <Button variant="danger" className="col-span-2 sm:col-span-1" onClick={() => priceBook.remove((record) => record.id === item.id)}><Trash2 className="mr-2 size-4" />Delete</Button>
          </div>
        </Card>;
      })}
    </section>

    {!filtered.length ? <Card><p className="font-semibold">No matching price-book items</p><p className="mt-2 text-sm text-slate-400">Add your first fixed price for a socket, spotlight, consumer unit, test or any custom electrical point.</p></Card> : null}
  </div>;
}
