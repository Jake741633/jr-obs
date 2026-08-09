"use client";

import { FormEvent, useMemo, useState } from "react";
import { Boxes, Plus, RefreshCw, Trash2, TriangleAlert, Warehouse } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { InputField, TextareaField } from "../../components/ui/FormField";
import { PageHeader } from "../../components/ui/PageHeader";
import { useStockItemsCollection, useStockLocationsCollection, useStockMovementsCollection } from "../../lib/cloud/coreBusinessCollections";
import { useCloudIdentity } from "../../lib/cloud/useCloudIdentity";
import { makeId, useCloudLocalCollection } from "../../lib/storage";
import type { FleetVehicle, Job, Material, MaterialUnit, StockItem, StockLocationType, StockMovementType } from "../../lib/models";

const money = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const locationTypes: StockLocationType[] = ["Van", "Store", "Site", "Other"];
const movementTypes: StockMovementType[] = ["Received", "Used", "Adjusted", "Returned"];
const units: MaterialUnit[] = ["Each", "Metre", "Drum", "Box", "Pack"];
const blankLocation = { name: "", type: "Van" as StockLocationType, vehicleId: "", notes: "" };
const blankItem = { materialId: "", description: "", locationId: "", quantity: "0", minimumQuantity: "0", unitCost: "0", unit: "Each" as MaterialUnit, stockCode: "", supplier: "", notes: "" };
const blankMovement = { stockItemId: "", type: "Used" as StockMovementType, quantity: "1", jobId: "", note: "" };

export default function StockPage() {
  const locations = useStockLocationsCollection();
  const stock = useStockItemsCollection();
  const movements = useStockMovementsCollection();
  const materials = useCloudLocalCollection<Material>("jr-os-materials");
  const vehicles = useCloudLocalCollection<FleetVehicle>("jr-os-fleet");
  const jobs = useCloudLocalCollection<Job>("jr-os-jobs");
  const { identity } = useCloudIdentity();
  const priceRestricted = identity?.role === "electrician";
  const [locationForm, setLocationForm] = useState(blankLocation);
  const [itemForm, setItemForm] = useState(blankItem);
  const [movementForm, setMovementForm] = useState(blankMovement);
  const [showLocation, setShowLocation] = useState(false);
  const [showItem, setShowItem] = useState(false);
  const [showMovement, setShowMovement] = useState(false);
  const [selectedLocationId, setSelectedLocationId] = useState("");
  const [message, setMessage] = useState("");

  const visibleStock = useMemo(() => stock.items.filter((item) => !selectedLocationId || item.locationId === selectedLocationId), [stock.items, selectedLocationId]);
  const lowStock = visibleStock.filter((item) => item.quantity <= item.minimumQuantity);
  const stockValue = visibleStock.reduce((sum, item) => sum + item.quantity * (item.unitCost ?? 0), 0);
  const totalUnits = visibleStock.reduce((sum, item) => sum + item.quantity, 0);

  function locationName(id: string) { return locations.items.find((item) => item.id === id)?.name || "Unknown location"; }
  function itemName(id: string) { return stock.items.find((item) => item.id === id)?.description || "Unknown item"; }

  function addLocation(event: FormEvent) {
    event.preventDefault();
    if (!locationForm.name.trim()) return setMessage("Enter a stock location name.");
    const now = new Date().toISOString();
    locations.setItems((current) => [{ id: makeId("stock-location"), name: locationForm.name.trim(), type: locationForm.type, vehicleId: locationForm.vehicleId || undefined, notes: locationForm.notes.trim(), createdAt: now, updatedAt: now }, ...current]);
    setLocationForm(blankLocation); setShowLocation(false); setMessage("Stock location added.");
  }

  function addItem(event: FormEvent) {
    event.preventDefault();
    if (!itemForm.locationId || !itemForm.description.trim()) return setMessage("Choose a location and enter the stock item.");
    const now = new Date().toISOString();
    stock.setItems((current) => [{ id: makeId("stock"), materialId: itemForm.materialId || undefined, description: itemForm.description.trim(), locationId: itemForm.locationId, quantity: Number(itemForm.quantity || 0), minimumQuantity: Number(itemForm.minimumQuantity || 0), unitCost: priceRestricted ? 0 : Number(itemForm.unitCost || 0), unit: itemForm.unit, stockCode: itemForm.stockCode.trim(), supplier: itemForm.supplier.trim(), notes: itemForm.notes.trim(), createdAt: now, updatedAt: now }, ...current]);
    setItemForm({ ...blankItem, locationId: selectedLocationId || itemForm.locationId }); setShowItem(false); setMessage("Stock item added.");
  }

  function addMovement(event: FormEvent) {
    event.preventDefault();
    const quantity = Number(movementForm.quantity || 0);
    if (!movementForm.stockItemId || quantity <= 0) return setMessage("Choose an item and enter a quantity.");
    const item = stock.items.find((entry) => entry.id === movementForm.stockItemId);
    if (!item) return;
    const increase = movementForm.type === "Received" || movementForm.type === "Returned";
    const nextQuantity = movementForm.type === "Adjusted" ? quantity : Math.max(0, item.quantity + (increase ? quantity : -quantity));
    const now = new Date().toISOString();
    stock.setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, quantity: nextQuantity, updatedAt: now } : entry));
    movements.setItems((current) => [{ id: makeId("movement"), stockItemId: item.id, type: movementForm.type, quantity, jobId: movementForm.jobId || undefined, note: movementForm.note.trim(), movedAt: now, createdAt: now }, ...current]);
    setMovementForm(blankMovement); setShowMovement(false); setMessage(`${item.description} updated to ${nextQuantity} ${item.unit.toLowerCase()}.`);
  }

  function chooseMaterial(materialId: string) {
    const material = materials.items.find((item) => item.id === materialId);
    setItemForm((current) => ({
      ...current,
      materialId,
      description: material?.name || current.description,
      unitCost: priceRestricted ? current.unitCost : material ? String(material.tradeCost ?? 0) : current.unitCost,
      unit: material?.unit || current.unit,
      stockCode: material?.stockCode || current.stockCode,
      supplier: material?.supplier || current.supplier,
    }));
  }

  const ready = locations.isReady && stock.isReady && movements.isReady && materials.isReady && vehicles.isReady && jobs.isReady;
  if (!ready) return <Card>Loading stock control…</Card>;

  return <div className="space-y-6">
    <PageHeader eyebrow="Procurement" title="Stock Control" description={priceRestricted ? "Track materials held in vans, stores and sites, minimum levels and movement history without office cost data." : "Track materials held in vans, stores and sites, with minimum levels, stock value and movement history."} />
    <div className="grid gap-3 md:grid-cols-[1fr_auto_auto_auto]">
      <select value={selectedLocationId} onChange={(event) => { setSelectedLocationId(event.target.value); setItemForm((current) => ({ ...current, locationId: event.target.value })); }} className="min-h-11 rounded-xl border border-slate-800 bg-slate-900 px-4 text-sm"><option value="">All stock locations</option>{locations.items.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select>
      <Button onClick={() => setShowLocation((value) => !value)}><Warehouse className="mr-2 size-4" />Location</Button>
      <Button variant="secondary" onClick={() => setShowItem((value) => !value)}><Plus className="mr-2 size-4" />Stock item</Button>
      <Button variant="secondary" onClick={() => setShowMovement((value) => !value)}><RefreshCw className="mr-2 size-4" />Movement</Button>
    </div>
    {message ? <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 px-4 py-3 text-sm text-cyan-200">{message}</div> : null}
    <section className={`grid gap-4 sm:grid-cols-2 ${priceRestricted ? "xl:grid-cols-3" : "xl:grid-cols-4"}`}>
      <Card><Warehouse className="size-5 text-cyan-300" /><p className="mt-3 text-sm text-slate-400">Locations</p><p className="mt-2 text-3xl font-bold">{locations.items.length}</p></Card>
      <Card><Boxes className="size-5 text-emerald-300" /><p className="mt-3 text-sm text-slate-400">Stock lines</p><p className="mt-2 text-3xl font-bold">{visibleStock.length}</p><p className="text-xs text-slate-500">{totalUnits.toFixed(1)} total units</p></Card>
      <Card><TriangleAlert className="size-5 text-amber-300" /><p className="mt-3 text-sm text-slate-400">Low stock</p><p className="mt-2 text-3xl font-bold">{lowStock.length}</p></Card>
      {!priceRestricted ? <Card><p className="text-sm text-slate-400">Stock value</p><p className="mt-2 text-3xl font-bold">{money.format(stockValue)}</p></Card> : null}
    </section>

    {showLocation ? <Card><form onSubmit={addLocation} className="grid gap-4 md:grid-cols-2"><InputField required label="Location name" placeholder="JR van, Unit store…" value={locationForm.name} onChange={(event) => setLocationForm({ ...locationForm, name: event.target.value })} /><label className="grid gap-2 text-sm font-medium text-slate-300"><span>Type</span><select value={locationForm.type} onChange={(event) => setLocationForm({ ...locationForm, type: event.target.value as StockLocationType })} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3">{locationTypes.map((type) => <option key={type}>{type}</option>)}</select></label><label className="grid gap-2 text-sm font-medium text-slate-300"><span>Linked vehicle</span><select value={locationForm.vehicleId} onChange={(event) => setLocationForm({ ...locationForm, vehicleId: event.target.value })} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3"><option value="">None</option>{vehicles.items.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.registration} · {vehicle.make} {vehicle.model}</option>)}</select></label><div className="md:col-span-2"><TextareaField label="Notes" value={locationForm.notes} onChange={(event) => setLocationForm({ ...locationForm, notes: event.target.value })} /></div><div className="md:col-span-2 flex justify-end"><Button type="submit">Save location</Button></div></form></Card> : null}

    {showItem ? <Card><form onSubmit={addItem} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"><label className="grid gap-2 text-sm font-medium text-slate-300"><span>Material catalogue</span><select value={itemForm.materialId} onChange={(event) => chooseMaterial(event.target.value)} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3"><option value="">Manual stock item</option>{materials.items.map((material) => <option key={material.id} value={material.id}>{material.name}</option>)}</select></label><InputField required label="Description" value={itemForm.description} onChange={(event) => setItemForm({ ...itemForm, description: event.target.value })} /><label className="grid gap-2 text-sm font-medium text-slate-300"><span>Location</span><select value={itemForm.locationId} onChange={(event) => setItemForm({ ...itemForm, locationId: event.target.value })} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3"><option value="">Choose location</option>{locations.items.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label><InputField label="Quantity" type="number" min="0" step="0.01" value={itemForm.quantity} onChange={(event) => setItemForm({ ...itemForm, quantity: event.target.value })} /><InputField label="Minimum quantity" type="number" min="0" step="0.01" value={itemForm.minimumQuantity} onChange={(event) => setItemForm({ ...itemForm, minimumQuantity: event.target.value })} />{!priceRestricted ? <InputField label="Unit cost (£)" type="number" min="0" step="0.01" value={itemForm.unitCost} onChange={(event) => setItemForm({ ...itemForm, unitCost: event.target.value })} /> : null}<label className="grid gap-2 text-sm font-medium text-slate-300"><span>Unit</span><select value={itemForm.unit} onChange={(event) => setItemForm({ ...itemForm, unit: event.target.value as MaterialUnit })} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3">{units.map((unit) => <option key={unit}>{unit}</option>)}</select></label><InputField label="Stock code" value={itemForm.stockCode} onChange={(event) => setItemForm({ ...itemForm, stockCode: event.target.value })} /><InputField label="Supplier" value={itemForm.supplier} onChange={(event) => setItemForm({ ...itemForm, supplier: event.target.value })} /><div className="xl:col-span-3"><TextareaField label="Notes" value={itemForm.notes} onChange={(event) => setItemForm({ ...itemForm, notes: event.target.value })} /></div><div className="xl:col-span-3 flex justify-end"><Button type="submit">Save stock item</Button></div></form></Card> : null}

    {showMovement ? <Card><form onSubmit={addMovement} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"><label className="grid gap-2 text-sm font-medium text-slate-300"><span>Stock item</span><select value={movementForm.stockItemId} onChange={(event) => setMovementForm({ ...movementForm, stockItemId: event.target.value })} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3"><option value="">Choose item</option>{stock.items.map((item) => <option key={item.id} value={item.id}>{item.description} · {locationName(item.locationId)}</option>)}</select></label><label className="grid gap-2 text-sm font-medium text-slate-300"><span>Movement</span><select value={movementForm.type} onChange={(event) => setMovementForm({ ...movementForm, type: event.target.value as StockMovementType })} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3">{movementTypes.map((type) => <option key={type}>{type}</option>)}</select></label><InputField label={movementForm.type === "Adjusted" ? "New stock quantity" : "Quantity"} type="number" min="0.01" step="0.01" value={movementForm.quantity} onChange={(event) => setMovementForm({ ...movementForm, quantity: event.target.value })} /><label className="grid gap-2 text-sm font-medium text-slate-300"><span>Linked job</span><select value={movementForm.jobId} onChange={(event) => setMovementForm({ ...movementForm, jobId: event.target.value })} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3"><option value="">No job</option>{jobs.items.map((job) => <option key={job.id} value={job.id}>{job.title}</option>)}</select></label><div className="md:col-span-2"><TextareaField label="Movement note" value={movementForm.note} onChange={(event) => setMovementForm({ ...movementForm, note: event.target.value })} /></div><div className="xl:col-span-3 flex justify-end"><Button type="submit">Update stock</Button></div></form></Card> : null}

    {lowStock.length ? <section className="space-y-3"><h2 className="text-xl font-bold">Reorder warnings</h2>{lowStock.map((item) => <Card key={item.id} className="border-amber-500/30"><div className="flex items-center justify-between gap-4"><div><p className="font-semibold">{item.description}</p><p className="text-sm text-slate-400">{locationName(item.locationId)} · {item.quantity} {item.unit.toLowerCase()} remaining · minimum {item.minimumQuantity}</p></div><TriangleAlert className="size-5 text-amber-300" /></div></Card>)}</section> : null}

    <section className="grid gap-6 xl:grid-cols-[1.4fr_1fr]"><div className="space-y-3"><h2 className="text-xl font-bold">Stock register</h2>{visibleStock.length === 0 ? <Card><p className="text-sm text-slate-400">No stock items recorded for this selection.</p></Card> : visibleStock.map((item) => <Card key={item.id}><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">{locationName(item.locationId)}</p><h3 className="mt-1 font-bold">{item.description}</h3><p className="text-sm text-slate-500">{item.stockCode || "No stock code"}{item.supplier ? ` · ${item.supplier}` : ""}</p></div>{!priceRestricted ? <button onClick={() => stock.remove((entry) => entry.id === item.id)} className="rounded-lg p-2 text-slate-500 hover:bg-red-500/10 hover:text-red-300" aria-label={`Delete ${item.description}`}><Trash2 className="size-4" /></button> : null}</div><div className={`mt-4 grid gap-3 ${priceRestricted ? "sm:grid-cols-2" : "sm:grid-cols-3"}`}><div><p className="text-xs text-slate-500">Available</p><p className="font-bold">{item.quantity} {item.unit.toLowerCase()}</p></div><div><p className="text-xs text-slate-500">Minimum</p><p className="font-bold">{item.minimumQuantity}</p></div>{!priceRestricted ? <div><p className="text-xs text-slate-500">Value</p><p className="font-bold">{money.format(item.quantity * (item.unitCost ?? 0))}</p></div> : null}</div></Card>)}</div><div className="space-y-3"><h2 className="text-xl font-bold">Recent movements</h2>{movements.items.length === 0 ? <Card><p className="text-sm text-slate-400">No stock movements recorded.</p></Card> : movements.items.slice(0, 12).map((movement) => <Card key={movement.id}><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">{movement.type}</p><p className="mt-1 font-semibold">{itemName(movement.stockItemId)}</p><p className="text-sm text-slate-400">{movement.quantity} units{movement.note ? ` · ${movement.note}` : ""}</p></Card>)}</div></section>
  </div>;
}
