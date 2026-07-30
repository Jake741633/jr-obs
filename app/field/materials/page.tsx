"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { Barcode, Boxes, ClipboardPlus, PackageMinus, QrCode, ShoppingCart, TriangleAlert } from "lucide-react";
import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { InputField, TextareaField } from "../../../components/ui/FormField";
import { PageHeader } from "../../../components/ui/PageHeader";
import { applyStockUsage, buildLowStockPurchaseList, lowStockItems, matchesScanCode } from "../../../lib/mobileStock";
import { makeId, useLocalStorageCollection } from "../../../lib/storage";
import type { Job, Material, PurchaseList, StockItem, StockLocation, StockMovement } from "../../../lib/models";

const blankUsage = { stockItemId: "", quantity: "1", jobId: "", note: "" };

export default function MobileMaterialsPage() {
  const jobs = useLocalStorageCollection<Job>("jr-os-jobs");
  const materials = useLocalStorageCollection<Material>("jr-os-materials");
  const stock = useLocalStorageCollection<StockItem>("jr-os-stock-items");
  const locations = useLocalStorageCollection<StockLocation>("jr-os-stock-locations");
  const movements = useLocalStorageCollection<StockMovement>("jr-os-stock-movements");
  const purchases = useLocalStorageCollection<PurchaseList>("jr-os-purchase-lists");
  const [usage, setUsage] = useState(blankUsage);
  const [scanCode, setScanCode] = useState("");
  const [message, setMessage] = useState("");

  const materialMap = useMemo(() => new Map(materials.items.map((item) => [item.id, item])), [materials.items]);
  const locationMap = useMemo(() => new Map(locations.items.map((item) => [item.id, item.name])), [locations.items]);
  const lowStock = useMemo(() => lowStockItems(stock.items), [stock.items]);
  const selectedItem = stock.items.find((item) => item.id === usage.stockItemId);

  function useMaterial(event: FormEvent) {
    event.preventDefault();
    const quantity = Number(usage.quantity || 0);
    const now = new Date().toISOString();
    const result = applyStockUsage({
      stockItems: stock.items,
      usage: { stockItemId: usage.stockItemId, quantity, jobId: usage.jobId || undefined, note: usage.note },
      movementId: makeId("movement"),
      now,
    });
    if (!result) {
      setMessage("Choose a stock item and enter a quantity greater than zero.");
      return;
    }
    stock.setItems(result.stockItems);
    movements.setItems((current) => [result.movement, ...current]);
    setUsage({ ...blankUsage, jobId: usage.jobId });
    setMessage(result.shortage > 0
      ? `${result.updatedItem.description} deducted. Stock reached zero with a shortage of ${result.shortage}.`
      : `${result.updatedItem.description} deducted. ${result.updatedItem.quantity} ${result.updatedItem.unit.toLowerCase()} remain.`);
  }

  function findByScanCode() {
    const match = stock.items.find((item) => matchesScanCode(item, item.materialId ? materialMap.get(item.materialId) : undefined, scanCode));
    if (!match) {
      setMessage("No stock item matched that barcode, QR value, stock code or JR OS record ID.");
      return;
    }
    setUsage((current) => ({ ...current, stockItemId: match.id }));
    setMessage(`${match.description} selected from scan code.`);
  }

  function createPurchaseRequest() {
    const now = new Date().toISOString();
    const id = makeId("purchase");
    const list = buildLowStockPurchaseList({
      stockItems: stock.items,
      materials: materials.items,
      existingLists: purchases.items,
      purchaseListId: id,
      number: `PR-${String(purchases.items.length + 1).padStart(4, "0")}`,
      now,
      jobId: usage.jobId || undefined,
    });
    if (!list) {
      setMessage("No new low-stock lines need a purchase request. Existing open requests were left unchanged.");
      return;
    }
    purchases.setItems((current) => [list, ...current]);
    setMessage(`${list.number} created with ${list.items.length} replenishment line${list.items.length === 1 ? "" : "s"}.`);
  }

  const ready = [jobs, materials, stock, locations, movements, purchases].every((store) => store.isReady);
  if (!ready) return <Card>Loading mobile materials workflow…</Card>;

  return <main className="space-y-6">
    <PageHeader eyebrow="Mobile workspace" title="Materials & Stock" description="Deduct materials on site, identify stock by scan code and raise low-stock purchase requests from your phone." />

    <div className="grid gap-4 sm:grid-cols-3">
      <Card><Boxes className="size-5 text-cyan-300" /><p className="mt-3 text-sm text-slate-400">Stock lines</p><p className="mt-2 text-3xl font-bold">{stock.items.length}</p></Card>
      <Card><TriangleAlert className="size-5 text-amber-300" /><p className="mt-3 text-sm text-slate-400">Low stock</p><p className="mt-2 text-3xl font-bold">{lowStock.length}</p></Card>
      <Card><ShoppingCart className="size-5 text-emerald-300" /><p className="mt-3 text-sm text-slate-400">Open purchase lists</p><p className="mt-2 text-3xl font-bold">{purchases.items.filter((list) => list.items.some((item) => item.status !== "Delivered")).length}</p></Card>
    </div>

    {message ? <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 px-4 py-3 text-sm text-cyan-200">{message}</div> : null}

    <Card className="space-y-4">
      <div className="flex items-start gap-3"><div className="grid size-10 place-items-center rounded-xl bg-slate-800"><QrCode className="size-5 text-cyan-300" /></div><div><h2 className="text-lg font-bold">Barcode / QR foundation</h2><p className="text-sm text-slate-400">Enter a supplier stock code, JR OS stock ID or material ID. This input is ready to receive camera-scanner output later.</p></div></div>
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]"><InputField label="Scan code" placeholder="Scan or enter code" value={scanCode} onChange={(event) => setScanCode(event.target.value)} /><div className="flex items-end"><Button type="button" onClick={findByScanCode}><Barcode className="mr-2 size-4" />Find item</Button></div></div>
    </Card>

    <Card>
      <form onSubmit={useMaterial} className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Stock item</span><select required value={usage.stockItemId} onChange={(event) => setUsage({ ...usage, stockItemId: event.target.value })} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3"><option value="">Choose material</option>{stock.items.map((item) => <option key={item.id} value={item.id}>{item.description} · {locationMap.get(item.locationId) || "Unknown location"} · {item.quantity} {item.unit.toLowerCase()}</option>)}</select></label>
        <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Linked job</span><select value={usage.jobId} onChange={(event) => setUsage({ ...usage, jobId: event.target.value })} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3"><option value="">No job selected</option>{jobs.items.filter((job) => job.status !== "Complete").map((job) => <option key={job.id} value={job.id}>{job.title}</option>)}</select></label>
        <InputField label="Quantity used" type="number" min="0.01" step="0.01" value={usage.quantity} onChange={(event) => setUsage({ ...usage, quantity: event.target.value })} />
        <div className="rounded-xl border border-slate-800 bg-slate-950/50 px-4 py-3 text-sm"><p className="text-slate-400">Available</p><p className="mt-1 font-semibold text-white">{selectedItem ? `${selectedItem.quantity} ${selectedItem.unit.toLowerCase()}` : "Choose an item"}</p></div>
        <div className="md:col-span-2"><TextareaField label="Usage note" placeholder="Where it was fitted, circuit or room…" value={usage.note} onChange={(event) => setUsage({ ...usage, note: event.target.value })} /></div>
        <div className="md:col-span-2 flex justify-end"><Button type="submit"><PackageMinus className="mr-2 size-4" />Deduct stock</Button></div>
      </form>
    </Card>

    <Card className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold">Low-stock purchase request</h2><p className="text-sm text-slate-400">Create one purchase list for items at or below their minimum level. Open, undelivered material requests are not duplicated.</p></div><Button type="button" onClick={createPurchaseRequest}><ClipboardPlus className="mr-2 size-4" />Create request</Button></div>
      {lowStock.length === 0 ? <p className="text-sm text-slate-500">All tracked stock is above its minimum level.</p> : <div className="grid gap-2">{lowStock.map((item) => <div key={item.id} className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/50 px-4 py-3"><div><p className="font-medium">{item.description}</p><p className="text-xs text-slate-500">{locationMap.get(item.locationId) || "Unknown location"}</p></div><p className="text-sm font-semibold text-amber-300">{item.quantity} / min {item.minimumQuantity}</p></div>)}</div>}
    </Card>

    <div className="grid gap-3 sm:grid-cols-3"><Link href="/materials" className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-3 text-center text-sm font-semibold hover:border-cyan-400/40">Materials Library</Link><Link href="/stock" className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-3 text-center text-sm font-semibold hover:border-cyan-400/40">Stock Control</Link><Link href="/purchases" className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-3 text-center text-sm font-semibold hover:border-cyan-400/40">Purchase Lists</Link></div>
  </main>;
}
