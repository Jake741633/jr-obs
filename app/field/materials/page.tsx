"use client";

import Link from "next/link";
import { FormEvent, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Barcode, Boxes, ClipboardPlus, PackageMinus, QrCode, ShoppingCart, TriangleAlert } from "lucide-react";
import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { InputField, TextareaField } from "../../../components/ui/FormField";
import { PageHeader } from "../../../components/ui/PageHeader";
import { useJobMaterialUsageCollection, useJobsCollection, useMaterialsCollection, usePurchaseListsCollection, useStockItemsCollection, useStockLocationsCollection, useStockMovementsCollection } from "../../../lib/cloud/coreBusinessCollections";
import { useCloudIdentity } from "../../../lib/cloud/useCloudIdentity";
import { buildJobMaterialUsage, materialsTodaySummary, materialsUsedToday } from "../../../lib/jobMaterialsToday-core.mjs";
import { applyStockUsage, buildLowStockPurchaseList, lowStockItems, lowStockRequestSourceSignature, matchesScanCode } from "../../../lib/mobileStock";
import type { PurchaseList } from "../../../lib/models";
import { purchaseListReviewHref } from "../../../lib/purchaseListLink";
import { makeId } from "../../../lib/storage";

const blankUsage = { stockItemId: "", quantity: "1", jobId: "", note: "" };
const today = () => new Date().toISOString().slice(0, 10);
const currency = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
type RequestDraft = { list: PurchaseList; sourceSignature: string; jobSignature: string; jobTitle: string; units: Record<string, string> };

const cloudFieldMaterialLinks = [
  { label: "Supplier Material Lookup", href: "/field/material-lookup" },
] as const;

const officeMaterialLinks = [
  { label: "Materials Library", href: "/materials" },
  { label: "Stock Control", href: "/stock" },
  { label: "Purchase Lists", href: "/purchases" },
] as const;

export default function MobileMaterialsPage() {
  const jobs = useJobsCollection();
  const materials = useMaterialsCollection();
  const stock = useStockItemsCollection();
  const locations = useStockLocationsCollection();
  const movements = useStockMovementsCollection();
  const purchases = usePurchaseListsCollection();
  const jobUsage = useJobMaterialUsageCollection();
  const identityState = useCloudIdentity();
  const [usage, setUsage] = useState(blankUsage);
  const [scanCode, setScanCode] = useState("");
  const [message, setMessage] = useState("");
  const [requestDraft, setRequestDraft] = useState<RequestDraft | null>(null);
  const requestRef = useRef<RequestDraft | null>(null);
  const [requestFailed, setRequestFailed] = useState(false);
  const [savedRequestId, setSavedRequestId] = useState("");

  const materialMap = useMemo(() => new Map(materials.items.map((item) => [item.id, item])), [materials.items]);
  const jobMap = useMemo(() => new Map(jobs.items.map((item) => [item.id, item.title])), [jobs.items]);
  const locationMap = useMemo(() => new Map(locations.items.map((item) => [item.id, item.name])), [locations.items]);
  const lowStock = useMemo(() => lowStockItems(stock.items), [stock.items]);
  const usedToday = useMemo(() => materialsUsedToday(jobUsage.items, today()), [jobUsage.items]);
  const todaySummary = useMemo(() => materialsTodaySummary(jobUsage.items, today()), [jobUsage.items]);
  const selectedItem = stock.items.find((item) => item.id === usage.stockItemId);
  const cloudFieldMode = identityState.mode !== "local" && identityState.identity?.role === "electrician";
  const ready = [jobs, materials, stock, locations, movements, purchases, jobUsage].every((store) => store.isReady) && identityState.isReady;
  const requestSources = useRef({ stockItems: stock.items, materials: materials.items, existingLists: purchases.items, jobs: jobs.items, ready, cloudFieldMode });
  useLayoutEffect(() => {
    requestSources.current = { stockItems: stock.items, materials: materials.items, existingLists: purchases.items, jobs: jobs.items, ready, cloudFieldMode };
  }, [stock.items, materials.items, purchases.items, jobs.items, ready, cloudFieldMode]);

  function useMaterial(event: FormEvent) {
    event.preventDefault();
    if (cloudFieldMode) {
      setMessage("Stock deductions are read-only for field cloud sessions until a dedicated secure materials mutation route is available.");
      return;
    }
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

    if (usage.jobId) {
      const material = result.updatedItem.materialId ? materialMap.get(result.updatedItem.materialId) : undefined;
      const ledgerEntry = buildJobMaterialUsage({
        stockItem: result.updatedItem,
        material,
        quantity,
        jobId: usage.jobId,
        note: usage.note,
        usageId: makeId("job-material"),
        now,
      });
      if (ledgerEntry) jobUsage.setItems((current) => [ledgerEntry, ...current]);
    }

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
    if (cloudFieldMode) {
      setMessage("Purchase requests are read-only for field cloud sessions until a dedicated secure materials mutation route is available.");
      return;
    }
    const current = requestSources.current;
    if (current.cloudFieldMode || !current.ready) {
      setMessage("Wait for authorized materials and purchase records to finish loading before reviewing a request.");
      return;
    }
    const previous = requestRef.current;
    const jobId = previous ? previous.list.jobId : usage.jobId || undefined;
    try {
      const matches = jobId ? current.jobs.filter((job) => job.id === jobId) : [];
      if (jobId && matches.length !== 1) throw new Error("The linked job is unavailable or ambiguous. Discard this review and choose a current job.");
      let sequence = current.existingLists.length + 1;
      while (current.existingLists.some((list) => list.number === `PR-${String(sequence).padStart(4, "0")}`)) sequence++;
      const list = buildLowStockPurchaseList({ ...current, purchaseListId: previous?.list.id || makeId("purchase"), number: `PR-${String(sequence).padStart(4, "0")}`, now: previous?.list.createdAt || new Date().toISOString(), jobId });
      if (!list) {
        requestRef.current = null; setRequestDraft(null); setRequestFailed(false);
        setMessage("No new low-stock lines need a purchase request. Existing open requests were left unchanged.");
        return;
      }
      const units = Object.fromEntries(current.stockItems.map((item) => [`${list.id}-${item.id}`, item.unit]));
      const draft = { list, sourceSignature: lowStockRequestSourceSignature(list, current.stockItems, current.materials), jobSignature: JSON.stringify(matches[0] || null), jobTitle: jobId ? matches[0]?.title || "Linked job title not recorded" : "No linked job", units };
      requestRef.current = draft; setRequestDraft(draft); setRequestFailed(false); setSavedRequestId("");
      setMessage("Review this unsaved replenishment request, then save it. No supplier order has been placed.");
    } catch (error) {
      setMessage(`Request review could not be prepared. ${error instanceof Error ? error.message : "Review the saved stock records."}`);
    }
  }

  function savePurchaseRequest(draft: RequestDraft) {
    if (requestRef.current !== draft) return;
    if (cloudFieldMode) {
      setMessage("Purchase requests are read-only for field cloud sessions until a dedicated secure materials mutation route is available.");
      return;
    }
    const current = requestSources.current;
    try {
      if (!current.ready || current.cloudFieldMode) throw new Error("Wait for authorized materials and purchase records to finish loading.");
      const existing = current.existingLists.filter((list) => list.id === draft.list.id);
      if (existing.length) {
        if (existing.length !== 1 || JSON.stringify(existing[0]) !== JSON.stringify(draft.list)) throw new Error("The request identity already belongs to a different or ambiguous saved record. Review purchase lists before retrying.");
      } else {
        const matches = draft.list.jobId ? current.jobs.filter((job) => job.id === draft.list.jobId) : [];
        if ((draft.list.jobId && matches.length !== 1) || JSON.stringify(matches[0] || null) !== draft.jobSignature) throw new Error("The linked job has changed or is unavailable. Review current stock before saving.");
        if (current.existingLists.some((list) => list.number === draft.list.number)) throw new Error("This request number is now in use. Review current stock before saving.");
        const candidate = buildLowStockPurchaseList({ ...current, purchaseListId: draft.list.id, number: draft.list.number, now: draft.list.createdAt, jobId: draft.list.jobId });
        if (!candidate || JSON.stringify(candidate.items) !== JSON.stringify(draft.list.items) || lowStockRequestSourceSignature(candidate, current.stockItems, current.materials) !== draft.sourceSignature) throw new Error("Stock, material details or open requests have changed. Review current stock before saving.");
        purchases.createItem(draft.list);
      }
    } catch (error) {
      setRequestFailed(true);
      setMessage(`Request save could not be confirmed. The unsaved review and its identities are retained; review and retry here. Leaving this page loses the unsaved request. ${error instanceof Error ? error.message : ""}`);
      return;
    }
    requestRef.current = null; setRequestDraft(null); setRequestFailed(false); setSavedRequestId(draft.list.id);
    setMessage(`${draft.list.number} saved on this device with ${draft.list.items.length} replenishment line${draft.list.items.length === 1 ? "" : "s"}. Check sync status before switching devices. No supplier order has been placed.`);
  }

  function discardPurchaseRequest() {
    requestRef.current = null; setRequestDraft(null); setRequestFailed(false);
    setMessage("Unsaved request discarded. Saved purchase lists were left unchanged.");
  }

  if (!ready) return <Card>Loading mobile materials workflow…</Card>;

  return <main className="space-y-6 pb-24 sm:pb-0">
    <PageHeader eyebrow="Mobile workspace" title="Materials & Stock" description="Review stock, scan material codes and inspect job usage from your phone. Cloud field sessions stay read-only until materials have a dedicated secured mutation route." />

    {cloudFieldMode ? <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 px-4 py-3 text-sm text-amber-100"><p className="font-semibold">Materials cloud writes are currently locked.</p><p className="mt-1 text-xs text-amber-100/70">Stock and material records can be reviewed and scanned here, but deductions and purchase requests are blocked rather than stored only in optimistic browser state.</p></div> : null}

    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Card><Boxes className="size-5 text-cyan-300" /><p className="mt-3 text-sm text-slate-400">Stock lines</p><p className="mt-2 text-3xl font-bold">{stock.items.length}</p></Card>
      <Card><TriangleAlert className="size-5 text-amber-300" /><p className="mt-3 text-sm text-slate-400">Low stock</p><p className="mt-2 text-3xl font-bold">{lowStock.length}</p></Card>
      <Card><PackageMinus className="size-5 text-emerald-300" /><p className="mt-3 text-sm text-slate-400">Used today</p><p className="mt-2 text-3xl font-bold">{todaySummary.lines}</p></Card>
      <Card><ShoppingCart className="size-5 text-emerald-300" /><p className="mt-3 text-sm text-slate-400">Open purchase lists</p><p className="mt-2 text-3xl font-bold">{purchases.items.filter((list) => list.items.some((item) => item.status !== "Delivered")).length}</p></Card>
    </div>

    {message ? <div role="status" className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 px-4 py-3 text-sm text-cyan-200">{message}</div> : null}
    {savedRequestId && !cloudFieldMode ? <Link href={purchaseListReviewHref(savedRequestId)} className="inline-flex min-h-12 items-center rounded-xl border border-cyan-400/30 px-4 py-3 text-sm font-semibold text-cyan-200">Review saved request</Link> : null}

    <Card className="space-y-4">
      <div className="flex items-start gap-3"><div className="grid size-10 place-items-center rounded-xl bg-slate-800"><QrCode className="size-5 text-cyan-300" /></div><div><h2 className="text-lg font-bold">Barcode / QR foundation</h2><p className="text-sm text-slate-400">Enter a supplier stock code, JR OS stock ID or material ID. This input is ready to receive camera-scanner output later.</p></div></div>
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]"><InputField label="Scan code" placeholder="Scan or enter code" value={scanCode} onChange={(event) => setScanCode(event.target.value)} /><div className="flex items-end"><Button type="button" onClick={findByScanCode}><Barcode className="mr-2 size-4" />Find item</Button></div></div>
    </Card>

    {!cloudFieldMode ? <Card>
      <form onSubmit={useMaterial} className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Stock item</span><select required value={usage.stockItemId} onChange={(event) => setUsage({ ...usage, stockItemId: event.target.value })} className="min-h-12 rounded-xl border border-slate-700 bg-slate-950 px-3 text-base"><option value="">Choose material</option>{stock.items.map((item) => <option key={item.id} value={item.id}>{item.description} · {locationMap.get(item.locationId) || "Unknown location"} · {item.quantity} {item.unit.toLowerCase()}</option>)}</select></label>
        <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Linked job</span><select value={usage.jobId} onChange={(event) => setUsage({ ...usage, jobId: event.target.value })} className="min-h-12 rounded-xl border border-slate-700 bg-slate-950 px-3 text-base"><option value="">No job selected</option>{jobs.items.filter((job) => job.status !== "Complete" && job.status !== "Paid" && job.status !== "Cancelled").map((job) => <option key={job.id} value={job.id}>{job.title}</option>)}</select></label>
        <InputField label="Quantity used" type="number" min="0.01" step="0.01" value={usage.quantity} onChange={(event) => setUsage({ ...usage, quantity: event.target.value })} />
        <div className="rounded-xl border border-slate-800 bg-slate-950/50 px-4 py-3 text-sm"><p className="text-slate-400">Available</p><p className="mt-1 font-semibold text-white">{selectedItem ? `${selectedItem.quantity} ${selectedItem.unit.toLowerCase()}` : "Choose an item"}</p></div>
        <div className="md:col-span-2"><TextareaField label="Usage note" placeholder="Where it was fitted, circuit or room…" value={usage.note} onChange={(event) => setUsage({ ...usage, note: event.target.value })} /></div>
        <div className="md:col-span-2"><Button className="w-full sm:w-auto" type="submit"><PackageMinus className="mr-2 size-4" />Deduct stock</Button></div>
      </form>
    </Card> : null}

    <Card className="space-y-4">
      <div><h2 className="text-lg font-bold">Materials used today</h2><p className="text-sm text-slate-400">{todaySummary.lines} line{todaySummary.lines === 1 ? "" : "s"} across {todaySummary.jobs} job{todaySummary.jobs === 1 ? "" : "s"} · estimated cost {currency.format(todaySummary.cost)}</p></div>
      {!usedToday.length ? <p className="text-sm text-slate-500">No job-linked materials have been recorded today.</p> : <div className="grid gap-2">{usedToday.map((record) => <div key={record.id} className="rounded-xl border border-slate-800 bg-slate-950/50 px-4 py-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="break-words font-medium">{record.description}</p><p className="mt-1 text-xs text-slate-500">{jobMap.get(record.jobId) || "Unknown job"}</p></div><p className="shrink-0 text-sm font-semibold text-emerald-300">{record.quantity} {record.unit.toLowerCase()}</p></div>{record.notes ? <p className="mt-2 text-sm text-slate-400">{record.notes}</p> : null}</div>)}</div>}
    </Card>

    <Card className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold">Low-stock purchase request</h2><p className="text-sm text-slate-400">{cloudFieldMode ? "Low-stock lines are visible here, but field cloud sessions cannot create purchase requests until the secure materials route is available." : "Review one purchase list for items at or below their minimum level. Open material requests and previous undelivered stock replenishment lines are not duplicated."}</p></div>{!cloudFieldMode && !requestDraft ? <Button className="min-h-12" type="button" disabled={!lowStock.length} onClick={createPurchaseRequest}><ClipboardPlus className="mr-2 size-4" />Review request</Button> : null}</div>
      {!cloudFieldMode && requestDraft ? <section aria-label="Unsaved replenishment request" className="space-y-3 rounded-xl border border-cyan-400/30 bg-cyan-400/5 p-4">
        <div><h3 className="font-bold">{requestDraft.list.number} · Unsaved request</h3><p className="mt-1 break-words text-sm text-slate-300">{requestDraft.jobTitle}</p><p className="mt-1 text-sm text-slate-400">Leaving this page loses this unsaved review. Save records the request; check sync status before switching devices. It does not place a supplier order.</p></div>
        <div className="grid gap-2">{requestDraft.list.items.map((item) => <div key={item.id} className="min-w-0 rounded-xl border border-slate-700 px-3 py-3"><p className="break-words font-medium">{item.description}</p><p className="mt-1 break-words text-sm text-slate-400">{item.supplier || "Supplier not recorded"} · {item.stockCode || "Stock code not recorded"}</p><p className="mt-1 text-sm">{item.quantity} {requestDraft.units[item.id].toLowerCase()} requested · {currency.format(item.unitCost)} per unit · Needed</p></div>)}</div>
        <div className="flex flex-wrap gap-2"><Button type="button" className="min-h-12" onClick={() => savePurchaseRequest(requestDraft)}>{requestFailed ? "Retry request save" : "Save request"}</Button><Button type="button" variant="secondary" className="min-h-12" onClick={createPurchaseRequest}>Review current stock</Button><Button type="button" variant="secondary" className="min-h-12" onClick={discardPurchaseRequest}>Discard request</Button></div>
      </section> : null}
      {lowStock.length === 0 ? <p className="text-sm text-slate-500">All tracked stock is above its minimum level.</p> : <div className="grid gap-2">{lowStock.map((item) => <div key={item.id} className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/50 px-4 py-3"><div><p className="font-medium">{item.description}</p><p className="text-xs text-slate-500">{locationMap.get(item.locationId) || "Unknown location"}</p></div><p className="text-sm font-semibold text-amber-300">{item.quantity} / min {item.minimumQuantity}</p></div>)}</div>}
    </Card>

    <div className={`grid gap-3 ${cloudFieldMode ? "" : "sm:grid-cols-3"}`}>
      {(cloudFieldMode ? cloudFieldMaterialLinks : officeMaterialLinks).map(({ label, href }) => <Link key={href} href={href} className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-3 text-center text-sm font-semibold hover:border-cyan-400/40">{label}</Link>)}
    </div>
  </main>;
}

