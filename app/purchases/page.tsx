"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle2, ExternalLink, PackageCheck, ShoppingCart, Trash2, Truck } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";
import { usePurchaseListsCollection } from "../../lib/cloud/coreBusinessCollections";
import { useCloudIdentity } from "../../lib/cloud/useCloudIdentity";
import { makeId, useCloudLocalCollection } from "../../lib/storage";
import type { Job, Material, PricingDocument, PurchaseItemStatus, PurchaseList, PurchaseListItem } from "../../lib/models";
import { purchaseListFromLink } from "../../lib/purchaseListLink";
import { filterPurchaseInbox, purchaseInboxFilters, purchaseLinkedJob, purchaseSavedTotal, type PurchaseInboxFilter } from "../../lib/purchaseInbox";

const money = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const statuses: PurchaseItemStatus[] = ["Needed", "Ordered", "Delivered"];
type LineDraft = { expected: PurchaseListItem; jobId?: string; pricingDocumentId?: string; quantity: string; unitCost: string; status: PurchaseItemStatus };
const lineKey = (listId: string, itemId: string) => JSON.stringify([listId, itemId]);

export default function PurchasesPage() {
  const purchaseLists = usePurchaseListsCollection();
  const pricing = useCloudLocalCollection<PricingDocument>("jr-os-pricing-documents");
  const materials = useCloudLocalCollection<Material>("jr-os-materials");
  const jobs = useCloudLocalCollection<Job>("jr-os-jobs");
  const { identity } = useCloudIdentity();
  const priceRestricted = identity?.role === "electrician";
  const [selectedDocumentId, setSelectedDocumentId] = useState("");
  const [selectedJobId, setSelectedJobId] = useState("");
  const [message, setMessage] = useState("");
  const creationDraft = useRef<{ id: string; createdAt: string; lineIds: string[]; complete: boolean } | null>(null);
  const creationGeneration = useRef(0);
  const [creationVersion, setCreationVersion] = useState(0);
  const [creationFailed, setCreationFailed] = useState(false);
  const [lineDrafts, setLineDrafts] = useState<Record<string, LineDraft>>({});
  const draftRef = useRef<Record<string, LineDraft>>({});
  const deletedRecords = useRef(new WeakSet<PurchaseList>());
  const [focusedListId, setFocusedListId] = useState("");
  const [invalidListLink, setInvalidListLink] = useState(false);
  const [linkReady, setLinkReady] = useState(false);
  const [inboxJobId, setInboxJobId] = useState("");
  const [inboxFilter, setInboxFilter] = useState<PurchaseInboxFilter>("All");
  const [inboxQuery, setInboxQuery] = useState("");
  const [listLimit, setListLimit] = useState(8);
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const requested = purchaseListFromLink(window.location.search);
      setFocusedListId(requested?.listId || ""); setInvalidListLink(Boolean(requested && !requested.listId)); setLinkReady(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);
  const focused = Boolean(focusedListId || invalidListLink);
  const matches = purchaseLists.items.filter((list) => list.id === focusedListId);
  const focusUnavailable = invalidListLink || Boolean(focusedListId && matches.length !== 1);
  const visibleLists = useMemo(() => !linkReady || focusUnavailable ? [] : focusedListId ? purchaseLists.items.filter((list) => list.id === focusedListId) : filterPurchaseInbox(purchaseLists.items, jobs.items, { jobId: inboxJobId, filter: inboxFilter, query: inboxQuery, includeCosts: !priceRestricted }), [purchaseLists.items, jobs.items, focusedListId, focusUnavailable, linkReady, inboxJobId, inboxFilter, inboxQuery, priceRestricted]);
  const filterCounts = purchaseInboxFilters.map((filter) => filterPurchaseInbox(purchaseLists.items, jobs.items, { jobId: inboxJobId, filter, query: "", includeCosts: !priceRestricted }).length);
  const inboxJobUnavailable = Boolean(inboxJobId && jobs.items.filter((job) => job.id === inboxJobId).length !== 1);

  const sourceDocuments = useMemo(() => pricing.items.filter((document) => document.items.some((item) => item.category === "Materials")), [pricing.items]);
  const summary = useMemo(() => {
    const items = visibleLists.flatMap((list) => list.items);
    return {
      lists: visibleLists.length,
      needed: items.filter((item) => item.status === "Needed").length,
      ordered: items.filter((item) => item.status === "Ordered").length,
      received: items.filter((item) => item.status === "Delivered").length,
      committed: purchaseSavedTotal(items.filter((item) => item.status === "Ordered" || item.status === "Delivered")),
    };
  }, [visibleLists]);

  function materialMatch(description: string) {
    const normalised = description.trim().toLowerCase();
    return materials.items.find((material) => material.name.trim().toLowerCase() === normalised);
  }

  function resetInbox() {
    setInboxJobId(""); setInboxFilter("All"); setInboxQuery(""); setListLimit(8);
  }

  function changeCreationSelection(kind: "document" | "job", value: string) {
    creationGeneration.current++; setCreationVersion(creationGeneration.current);
    if (creationDraft.current?.complete) creationDraft.current = null;
    if (kind === "document") setSelectedDocumentId(value); else setSelectedJobId(value);
    setCreationFailed(false); setMessage("");
  }

  function createFromDocument() {
    if (creationVersion !== creationGeneration.current || creationDraft.current?.complete) return;
    if (priceRestricted || !ready) return setMessage("Wait for authorized purchase records to finish loading before creating a list.");
    const document = sourceDocuments.find((item) => item.id === selectedDocumentId);
    if (!document) return setMessage("Choose a quote or estimate with material lines.");
    const materialLines = document.items.filter((item) => item.category === "Materials");
    if (materialLines.some((line) => !line.description.trim() || !Number.isFinite(line.quantity) || line.quantity <= 0 || !Number.isFinite(line.unitCost ?? 0) || (line.unitCost ?? 0) < 0)) return setMessage("Review the source material descriptions, quantities and unit costs before creating this purchase list.");
    const jobId = selectedJobId || document.jobId;
    if (jobId && !jobs.items.some((job) => job.id === jobId)) return setMessage("The linked job is unavailable. Review the source or choose a current job before creating the list.");
    const draft = creationDraft.current || { id: makeId("purchase"), createdAt: new Date().toISOString(), lineIds: [], complete: false };
    creationDraft.current = draft;
    const now = draft.createdAt;
    const list: PurchaseList = {
      id: draft.id,
      number: `PO-${String(purchaseLists.items.length + 1).padStart(4, "0")}`,
      title: `${document.number} materials`,
      pricingDocumentId: document.id,
      jobId,
      items: materialLines.map((line, index) => {
        const material = materialMatch(line.description);
        const id = draft.lineIds[index] || makeId("purchase-item"); draft.lineIds[index] = id;
        return {
          id,
          materialId: material?.id,
          description: line.description,
          supplier: material?.supplier || "",
          stockCode: material?.stockCode || "",
          supplierUrl: material?.supplierUrl || undefined,
          quantity: line.quantity,
          unitCost: line.unitCost ?? 0,
          status: "Needed" as const,
        };
      }),
      notes: `Generated from ${document.type.toLowerCase()} ${document.number}.`,
      createdAt: now,
      updatedAt: now,
    };
    try {
      purchaseLists.createItem(list);
    } catch (error) {
      setCreationFailed(true);
      setMessage(`Purchase list save could not be confirmed. Your selections are retained; review and retry here. Leaving this page loses the unsaved retry. ${error instanceof Error ? error.message : ""}`);
      return;
    }
    draft.complete = true; setCreationFailed(false);
    setSelectedDocumentId("");
    setSelectedJobId("");
    setFocusedListId(list.id); setInvalidListLink(false);
    setMessage(`${list.number} saved on this device with ${list.items.length} material line${list.items.length === 1 ? "" : "s"}. Check sync status before switching devices. No supplier order has been placed.`);
  }

  function editLine(list: PurchaseList, item: PurchaseListItem, field: "quantity" | "unitCost" | "status", value: string) {
    if (priceRestricted && field === "unitCost") return;
    const key = lineKey(list.id, item.id);
    const draft = draftRef.current[key] || { expected: item, jobId: list.jobId, pricingDocumentId: list.pricingDocumentId, quantity: String(item.quantity), unitCost: String(item.unitCost ?? 0), status: item.status };
    draftRef.current = { ...draftRef.current, [key]: { ...draft, [field]: value } };
    setLineDrafts(draftRef.current); setMessage("");
  }

  function discardLine(listId: string, itemId: string) {
    const next = { ...draftRef.current }; delete next[lineKey(listId, itemId)];
    draftRef.current = next; setLineDrafts(next); setMessage("");
  }

  function saveLine(list: PurchaseList, item: PurchaseListItem, draft: LineDraft) {
    const key = lineKey(list.id, item.id);
    if (draftRef.current[key] !== draft) return;
    const quantity = Number(draft.quantity), unitCost = Number(draft.unitCost);
    if (!draft.quantity.trim() || !Number.isFinite(quantity) || quantity <= 0 || (!priceRestricted && (!draft.unitCost.trim() || !Number.isFinite(unitCost) || unitCost < 0)) || !statuses.includes(draft.status)) {
      setMessage("Review this line: quantity must be above zero, unit cost must be zero or above, and status must be Needed, Ordered or Delivered. Your draft is retained."); return;
    }
    try {
      if (!ready || purchaseLists.items.filter((record) => record.id === list.id).length !== 1) throw new Error("The purchase list is not ready or its identity is ambiguous. Review the saved record.");
      purchaseLists.updateItem(list.id, (current) => {
        const matches = current.items.filter((line) => line.id === item.id);
        if (current.jobId !== draft.jobId || current.pricingDocumentId !== draft.pricingDocumentId || matches.length !== 1 || JSON.stringify(matches[0]) !== JSON.stringify(draft.expected)) throw new Error("The saved line or its linked source has changed. Use saved values to review it before editing again.");
        const saved = matches[0];
        if (saved.quantity === quantity && (priceRestricted || (saved.unitCost ?? 0) === unitCost) && saved.status === draft.status) return current;
        return { ...current, items: current.items.map((line) => line.id === item.id ? { ...line, quantity, ...(!priceRestricted ? { unitCost } : {}), status: draft.status } : line), updatedAt: new Date().toISOString() };
      });
    } catch (error) {
      setMessage(`Line save could not be confirmed. Your draft is retained; review and retry here. Leaving this page loses unsaved line changes. ${error instanceof Error ? error.message : ""}`); return;
    }
    discardLine(list.id, item.id);
    setMessage(`${list.number} line saved on this device. Check sync status before switching devices. This records your status; no supplier order has been placed by JR OS.`);
  }

  function deleteList(list: PurchaseList) {
    if (priceRestricted || deletedRecords.current.has(list)) return;
    if (!ready || purchaseLists.items.filter((record) => record.id === list.id).length !== 1) { setMessage("Wait for one unambiguous purchase list to finish loading before deleting."); return; }
    if (Object.keys(draftRef.current).some((key) => JSON.parse(key)[0] === list.id)) { setMessage("Save or discard this list's unsaved line changes before deleting."); return; }
    if (!window.confirm(`Delete purchase list ${list.number} “${list.title}”?`)) return;
    try {
      purchaseLists.removeItem(list.id, (current) => {
        if (JSON.stringify(current) !== JSON.stringify(list)) throw new Error("This purchase list has changed. Review its current record before deleting.");
      });
    } catch (error) {
      setMessage(`Deletion could not be confirmed. Review the saved purchase list and retry. ${error instanceof Error ? error.message : ""}`); return;
    }
    deletedRecords.current.add(list);
    setMessage(`${list.number} deleted on this device. Check sync status before switching devices.`);
  }

  const ready = purchaseLists.isReady && pricing.isReady && materials.isReady && jobs.isReady;
  if (!ready || !linkReady) return <Card>Loading purchase lists…</Card>;

  return <div className="space-y-6">
    <PageHeader eyebrow="Procurement" title="Purchase Lists" description={priceRestricted ? "Track required materials, suppliers and order/receipt status without office cost or quote data." : "Turn quote and estimate material lines into supplier-ready purchase lists, then track ordering and receipt."} />
    {focused ? <section aria-label="Purchase list selection" className="space-y-3 rounded-xl border border-cyan-400/30 p-4"><p role="status" className="break-words text-sm text-cyan-100">{invalidListLink ? "This purchase-list link is invalid. Show all purchase lists to choose a saved record." : focusUnavailable ? "The selected purchase list is unavailable or its identity is ambiguous. Other lists have not been substituted." : `Showing ${visibleLists[0].number} · ${visibleLists[0].title}. Totals and lines below belong to this saved list and reflect its current status.`}</p><button onClick={() => { setFocusedListId(""); setInvalidListLink(false); resetInbox(); }} className="min-h-12 rounded-xl border border-slate-700 px-3 text-sm font-semibold">Show all purchase lists</button></section> : null}
    {message ? <div role="status" className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 px-4 py-3 text-sm text-cyan-200">{message}</div> : null}
    {Object.keys(lineDrafts).length ? <section aria-label="Unsaved purchase lines" className="space-y-2"><p role="status" className="text-sm text-amber-200">{Object.keys(lineDrafts).length} unsaved line{Object.keys(lineDrafts).length === 1 ? "" : "s"}. Save each line or use saved values to discard its draft. Keep this page open; leaving loses unsaved line changes.</p><button type="button" onClick={() => { draftRef.current = {}; setLineDrafts({}); setMessage(""); }} className="min-h-12 rounded-xl border border-slate-700 px-4 text-sm font-semibold">Discard all line drafts</button></section> : null}
    <section className={`grid gap-4 sm:grid-cols-2 ${priceRestricted ? "xl:grid-cols-3" : "xl:grid-cols-4"}`}>
      <Card><ShoppingCart className="size-5 text-cyan-300" /><p className="mt-3 text-sm text-slate-400">Purchase lists</p><p className="mt-2 text-3xl font-bold">{summary.lists}</p></Card>
      <Card><Truck className="size-5 text-amber-300" /><p className="mt-3 text-sm text-slate-400">Need ordering</p><p className="mt-2 text-3xl font-bold">{summary.needed}</p><p className="text-xs text-slate-500">{summary.ordered} already ordered</p></Card>
      <Card><PackageCheck className="size-5 text-emerald-300" /><p className="mt-3 text-sm text-slate-400">Received lines</p><p className="mt-2 text-3xl font-bold">{summary.received}</p></Card>
      {!priceRestricted ? <Card><p className="text-sm text-slate-400">Committed spend</p><p className="mt-2 text-3xl font-bold">{money.format(summary.committed.amount)}</p><p className="text-xs text-slate-500">{summary.committed.needsReview ? "Known amount · line values need review" : "Ordered and Delivered lines only"}</p></Card> : null}
    </section>

    {!focused ? <section aria-label="Find purchase lists" className="space-y-3"><div role="group" aria-label="Purchase list filters" className="grid grid-cols-2 gap-2 sm:grid-cols-5">{purchaseInboxFilters.map((filter, index) => <button key={filter} type="button" aria-pressed={inboxFilter === filter} onClick={() => { setInboxFilter(filter); setListLimit(8); }} className={`min-h-12 rounded-xl border px-3 text-sm font-semibold ${inboxFilter === filter ? "border-cyan-400/50 bg-cyan-400/10 text-cyan-200" : "border-slate-700 text-slate-300"}`}>{filter} <span className="text-xs opacity-70">{filterCounts[index]}</span></button>)}</div><div className="grid gap-3 sm:grid-cols-2"><label className="text-sm text-slate-400">Find a purchase list<input type="search" value={inboxQuery} onChange={(event) => { setInboxQuery(event.target.value); setListLimit(8); }} placeholder="Job, material, supplier or stock code" className="mt-1 min-h-12 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-base text-white" /></label><label className="text-sm text-slate-400">Purchase list job<select value={inboxJobId} onChange={(event) => { setInboxJobId(event.target.value); setListLimit(8); }} className="mt-1 min-h-12 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-base text-white"><option value="">All loaded jobs</option>{inboxJobUnavailable ? <option value={inboxJobId}>Selected job unavailable or ambiguous</option> : null}{jobs.items.filter((job, index) => jobs.items.findIndex((other) => other.id === job.id) === index && jobs.items.filter((other) => other.id === job.id).length === 1).map((job) => <option key={job.id} value={job.id}>{job.title} · {job.siteAddress || "Address not recorded"}</option>)}</select></label></div><p className="text-xs text-slate-400">Counts use the selected job before text search. Filters match whole saved lists; all their lines remain available. Delivered means every line is marked Delivered. Review includes uncertain lines, empty lists or unavailable job links.</p>{inboxJobUnavailable ? <p role="status" className="text-sm text-amber-200">The selected job is unavailable or its identity is ambiguous. Other jobs have not been substituted.</p> : null}{inboxQuery || inboxJobId || inboxFilter !== "All" ? <button type="button" onClick={resetInbox} className="min-h-12 rounded-xl border border-slate-700 px-4 text-sm font-semibold">Clear purchase filters</button> : null}</section> : null}

    {!priceRestricted ? <Card className="border-cyan-400/30"><h2 className="font-semibold">Create from quote or estimate</h2><div className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_auto]"><select aria-label="Pricing document" value={selectedDocumentId} onChange={(event) => changeCreationSelection("document", event.target.value)} className="min-h-12 rounded-xl border border-slate-700 bg-slate-950 px-3 text-base"><option value="">Choose pricing document</option>{sourceDocuments.map((document) => <option key={document.id} value={document.id}>{document.number} · {document.title}</option>)}</select><select aria-label="Purchase job" value={selectedJobId} onChange={(event) => changeCreationSelection("job", event.target.value)} className="min-h-12 rounded-xl border border-slate-700 bg-slate-950 px-3 text-base"><option value="">Use linked job / no job</option>{jobs.items.map((job) => <option key={job.id} value={job.id}>{job.title}</option>)}</select><Button disabled={!selectedDocumentId} onClick={createFromDocument}>{creationFailed ? "Retry purchase list" : "Create purchase list"}</Button></div></Card> : null}

    {visibleLists.length ? <p className="text-sm text-slate-400">{priceRestricted ? "Edit quantity or status" : "Edit quantity, cost or status"}, then Save line. Totals and delivery counts use saved values.</p> : null}
    {visibleLists.length === 0 ? <Card><p className="text-sm text-slate-400">{focused ? "No purchase list is available for this link." : purchaseLists.items.length ? "No purchase lists match these filters." : "No purchase lists yet."} {!focused && !purchaseLists.items.length ? priceRestricted ? "Office can create lists that will appear here for field ordering and receipt updates." : "Create one from the materials already priced in a quote or estimate." : ""}</p></Card> : <div aria-label="Purchase list records" className="space-y-5">{visibleLists.slice(0, focused ? 1 : listLimit).map((list) => {
      const total = purchaseSavedTotal(list.items); const totalCost = total.amount;
      const groupedSuppliers = [...new Set(list.items.map((item) => item.supplier || "Unassigned"))];
      return <Card key={list.id} className="overflow-hidden p-0"><div className="flex flex-col gap-3 border-b border-slate-800 p-5 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">{list.number}</p><h2 className="mt-1 text-xl font-bold">{list.title}</h2><p className="mt-1 text-sm text-slate-400">{purchaseLinkedJob(list, jobs.items)?.title || (list.jobId ? "Linked job unavailable or ambiguous" : "No linked job")} · {list.items.length} lines</p></div><div className="flex items-center gap-3">{!priceRestricted ? <strong>{money.format(totalCost)}</strong> : null}{!priceRestricted && total.needsReview ? <span className="text-xs text-amber-200">Known total · line values need review</span> : null}{!priceRestricted ? <button onClick={() => deleteList(list)} aria-label={`Delete ${list.number}`} className="min-h-12 min-w-12 rounded-lg p-3 text-slate-500 hover:bg-red-500/10 hover:text-red-300"><Trash2 className="size-4" /></button> : null}</div></div><div className="space-y-5 p-5">{groupedSuppliers.map((supplier) => { const supplierItems = list.items.filter((item) => (item.supplier || "Unassigned") === supplier); const supplierTotal = purchaseSavedTotal(supplierItems); const subtotal = supplierTotal.amount; return <section key={supplier} className="rounded-xl border border-slate-800"><div className="flex items-center justify-between border-b border-slate-800 bg-slate-950/60 px-4 py-3"><div><p className="font-semibold">{supplier}</p><p className="text-xs text-slate-500">{supplierItems.length} line{supplierItems.length === 1 ? "" : "s"}</p></div>{!priceRestricted ? <strong>{money.format(subtotal)}</strong> : null}{!priceRestricted && supplierTotal.needsReview ? <span className="text-xs text-amber-200">Known subtotal · line values need review</span> : null}</div><div className="divide-y divide-slate-800">{supplierItems.map((item) => {
        const draft = lineDrafts[lineKey(list.id, item.id)];
        return <div key={item.id} role="group" aria-label={`Edit ${item.description} in ${list.number}`} className={`grid gap-3 p-4 ${priceRestricted ? "lg:grid-cols-[1fr_120px_150px_auto]" : "lg:grid-cols-[1fr_120px_130px_150px_auto]"} lg:items-center`}>
          <div><p className="font-semibold">{item.description}</p><p className="text-xs text-slate-500">{item.stockCode || "No stock code"}</p></div>
          <label className="text-xs text-slate-500">Quantity<input value={draft?.quantity ?? (Number.isFinite(item.quantity) ? item.quantity : "")} onChange={(event) => editLine(list, item, "quantity", event.target.value)} type="number" min="0" step="any" inputMode="decimal" className="mt-1 min-h-12 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-base text-white" /></label>
          {!priceRestricted ? <label className="text-xs text-slate-500">Unit cost<input value={draft?.unitCost ?? (Number.isFinite(item.unitCost) ? item.unitCost : "")} onChange={(event) => editLine(list, item, "unitCost", event.target.value)} type="number" min="0" step="any" inputMode="decimal" className="mt-1 min-h-12 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-base text-white" /></label> : null}
          <label className="text-xs text-slate-500">Status<select value={draft?.status ?? item.status} onChange={(event) => editLine(list, item, "status", event.target.value)} className="mt-1 min-h-12 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-base text-white">{!statuses.includes(item.status) ? <option value={item.status}>{item.status || "Status not recorded"} · review</option> : null}{statuses.map((status) => <option key={status}>{status}</option>)}</select></label>
          <div className="flex items-center justify-end gap-2">{!priceRestricted ? <strong className="text-sm">{purchaseSavedTotal([item]).needsReview ? "Value needs review" : money.format(item.quantity * (item.unitCost ?? 0))}</strong> : null}{item.supplierUrl ? <a href={item.supplierUrl} target="_blank" rel="noreferrer" className="flex min-h-12 min-w-12 items-center justify-center rounded-lg text-cyan-300 hover:bg-cyan-400/10" aria-label={`Open supplier for ${item.description}`}><ExternalLink className="size-4" /></a> : null}{item.status === "Delivered" ? <CheckCircle2 className="size-5 text-emerald-300" /> : null}</div>
          {draft ? <div className="space-y-2 lg:col-span-full"><p className="text-sm text-amber-200">Unsaved changes · Saved quantity {Number.isFinite(item.quantity) && item.quantity > 0 ? item.quantity : "needs review"} · {item.status || "Status not recorded"}{!priceRestricted ? ` · Unit cost ${Number.isFinite(item.unitCost) && item.unitCost >= 0 ? money.format(item.unitCost) : "needs review"}` : ""}</p><div className="flex flex-wrap gap-2"><button type="button" onClick={() => saveLine(list, item, draft)} className="min-h-12 rounded-xl border border-cyan-400/40 px-4 text-sm font-semibold text-cyan-200">Save line</button><button type="button" onClick={() => discardLine(list.id, item.id)} className="min-h-12 rounded-xl border border-slate-700 px-4 text-sm font-semibold">Use saved values</button></div></div> : null}
        </div>;
      })}</div></section>; })}{list.notes ? <p className="text-sm text-slate-400">{list.notes}</p> : null}</div></Card>;
    })}</div>}

    {!focused && visibleLists.length > listLimit ? <button type="button" onClick={() => setListLimit((value) => value + 8)} className="min-h-12 w-full rounded-xl border border-slate-700 px-4 text-sm font-semibold">Show more purchase lists ({visibleLists.length - listLimit} remaining)</button> : null}
    <div className="flex justify-end"><Link href="/materials" className="text-sm font-semibold text-cyan-300 hover:text-cyan-200">Open materials library →</Link></div>
  </div>;
}
