"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CheckCircle2, ExternalLink, PackageCheck, PackageOpen, Plus, ShoppingCart, Trash2, Truck } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";
import { usePurchaseListsCollection } from "../../lib/cloud/coreBusinessCollections";
import { makeId, useCloudLocalCollection } from "../../lib/storage";
import { createPurchaseListFromPricingDocument } from "../../lib/workflow";
import type { Job, Material, PricingDocument, PurchaseItemStatus, PurchaseList, PurchaseListItem } from "../../lib/models";

const money = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const statuses: PurchaseItemStatus[] = ["Needed", "Ordered", "Delivered"];

function groupBySupplier(items: PurchaseListItem[]) {
  const groups = new Map<string, PurchaseListItem[]>();
  items.forEach((item) => {
    const supplier = item.supplier || "Unassigned supplier";
    groups.set(supplier, [...(groups.get(supplier) ?? []), item]);
  });
  return Array.from(groups.entries());
}

export default function PurchasesPage() {
  const purchaseLists = usePurchaseListsCollection();
  const pricing = useCloudLocalCollection<PricingDocument>("jr-os-pricing-documents");
  const materials = useCloudLocalCollection<Material>("jr-os-materials");
  const jobs = useCloudLocalCollection<Job>("jr-os-jobs");
  const [selectedDocumentId, setSelectedDocumentId] = useState("");
  const [message, setMessage] = useState("");

  const sourceDocuments = useMemo(
    () => pricing.items
      .filter((document) => document.items.some((item) => item.category === "Materials"))
      .toSorted((a, b) => Number(b.status === "Accepted") - Number(a.status === "Accepted") || new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    [pricing.items],
  );

  const summary = useMemo(() => {
    const allItems = purchaseLists.items.flatMap((list) => list.items);
    const needed = allItems.filter((item) => item.status === "Needed");
    const ordered = allItems.filter((item) => item.status === "Ordered");
    const delivered = allItems.filter((item) => item.status === "Delivered");
    return {
      needed: needed.length,
      ordered: ordered.length,
      delivered: delivered.length,
      committed: [...ordered, ...delivered].reduce((sum, item) => sum + item.quantity * item.unitCost, 0),
    };
  }, [purchaseLists.items]);

  function createFromPricingDocument() {
    const document = pricing.items.find((item) => item.id === selectedDocumentId);
    if (!document) { setMessage("Choose a quote or estimate first."); return; }
    if (purchaseLists.items.some((list) => list.pricingDocumentId === document.id)) { setMessage("A purchase list already exists for this pricing document."); return; }

    const now = new Date().toISOString();
    const list = createPurchaseListFromPricingDocument({
      document,
      materials: materials.items,
      purchaseLists: purchaseLists.items,
      purchaseListId: makeId("purchase"),
      now,
      createId: makeId,
    });
    if (!list) { setMessage("This document has no material lines to order."); return; }
    purchaseLists.setItems((current) => [list, ...current]);
    setSelectedDocumentId("");
    setMessage(`${list.number} created with ${list.items.length} material line${list.items.length === 1 ? "" : "s"}.`);
  }

  function updateItem(listId: string, itemId: string, changes: Partial<PurchaseListItem>) {
    const now = new Date().toISOString();
    purchaseLists.setItems((current) => current.map((list) => list.id === listId ? {
      ...list,
      items: list.items.map((item) => item.id === itemId ? { ...item, ...changes } : item),
      updatedAt: now,
    } : list));
  }

  function deleteList(list: PurchaseList) {
    if (window.confirm(`Delete ${list.number} - ${list.title}?`)) purchaseLists.remove((item) => item.id === list.id);
  }

  const ready = purchaseLists.isReady && pricing.isReady && materials.isReady && jobs.isReady;
  if (!ready) return <Card>Loading purchase lists…</Card>;

  return <div className="space-y-6">
    <PageHeader eyebrow="Procurement" title="Purchase Lists" description="Turn quote materials into supplier-grouped order lists, then track what is needed, ordered and delivered." action={<Link href="/materials" className="inline-flex min-h-11 items-center rounded-xl border border-slate-700 bg-slate-900 px-4 text-sm font-semibold hover:bg-slate-800">Materials library</Link>} />

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Card><PackageOpen className="size-5 text-amber-300" /><p className="mt-3 text-sm text-slate-400">Items needed</p><p className="mt-2 text-3xl font-bold">{summary.needed}</p></Card>
      <Card><ShoppingCart className="size-5 text-cyan-300" /><p className="mt-3 text-sm text-slate-400">Items ordered</p><p className="mt-2 text-3xl font-bold">{summary.ordered}</p></Card>
      <Card><Truck className="size-5 text-emerald-300" /><p className="mt-3 text-sm text-slate-400">Items delivered</p><p className="mt-2 text-3xl font-bold">{summary.delivered}</p></Card>
      <Card><PackageCheck className="size-5 text-violet-300" /><p className="mt-3 text-sm text-slate-400">Committed spend</p><p className="mt-2 text-3xl font-bold">{money.format(summary.committed)}</p></Card>
    </section>

    <Card className="border-cyan-400/20">
      <div className="flex items-start gap-3"><Plus className="mt-1 size-5 text-cyan-300" /><div className="flex-1"><h2 className="font-semibold">Create from quote or estimate</h2><p className="mt-1 text-sm text-slate-400">Material lines are copied with their stored trade cost, supplier and stock code. Existing quotes are not changed.</p><div className="mt-4 flex flex-col gap-3 md:flex-row"><select value={selectedDocumentId} onChange={(event) => setSelectedDocumentId(event.target.value)} className="min-h-11 flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3"><option value="">Choose pricing document</option>{sourceDocuments.map((document) => <option key={document.id} value={document.id}>{document.number} · {document.title} · {document.status}</option>)}</select><Button onClick={createFromPricingDocument}>Create purchase list</Button></div>{message ? <p className="mt-3 text-sm text-cyan-200">{message}</p> : null}</div></div>
    </Card>

    {purchaseLists.items.length === 0 ? <Card><h2 className="font-semibold">No purchase lists yet</h2><p className="mt-2 text-sm text-slate-400">Create one from a quote or estimate containing material lines.</p></Card> : <div className="space-y-6">{purchaseLists.items.map((list) => {
      const job = jobs.items.find((item) => item.id === list.jobId);
      const grouped = groupBySupplier(list.items);
      const totalCost = list.items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0);
      const delivered = list.items.filter((item) => item.status === "Delivered").length;
      return <Card key={list.id}>
        <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">{list.number}</p><h2 className="mt-1 text-2xl font-bold">{list.title}</h2><p className="mt-1 text-sm text-slate-500">{job ? job.title : "No live job linked"} · {delivered}/{list.items.length} delivered</p></div><div className="flex items-center gap-3"><strong>{money.format(totalCost)}</strong><button onClick={() => deleteList(list)} aria-label={`Delete ${list.number}`} className="rounded-lg p-2 text-slate-500 hover:bg-red-500/10 hover:text-red-300"><Trash2 className="size-4" /></button></div></div>
        <p className="mt-4 rounded-xl bg-slate-950 p-3 text-sm text-slate-400">{list.notes}</p>
        <div className="mt-5 space-y-5">{grouped.map(([supplier, items]) => <section key={supplier}><div className="mb-2 flex items-center justify-between"><h3 className="font-semibold text-cyan-200">{supplier}</h3><span className="text-sm text-slate-500">{money.format(items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0))}</span></div><div className="space-y-2">{items.map((item) => <div key={item.id} className="grid gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3 lg:grid-cols-[1fr_120px_130px_150px_auto] lg:items-center"><div><p className="font-medium">{item.description}</p><p className="text-xs text-slate-500">{item.stockCode || "No stock code"}</p></div><label className="grid gap-1 text-xs text-slate-500">Quantity<input type="number" min="0.01" step="0.01" value={item.quantity} onChange={(event) => updateItem(list.id, item.id, { quantity: Number(event.target.value) || 0 })} className="min-h-10 rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-white" /></label><label className="grid gap-1 text-xs text-slate-500">Unit cost<input type="number" min="0" step="0.01" value={item.unitCost} onChange={(event) => updateItem(list.id, item.id, { unitCost: Number(event.target.value) || 0 })} className="min-h-10 rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-white" /></label><label className="grid gap-1 text-xs text-slate-500">Status<select value={item.status} onChange={(event) => updateItem(list.id, item.id, { status: event.target.value as PurchaseItemStatus })} className="min-h-10 rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-white">{statuses.map((status) => <option key={status}>{status}</option>)}</select></label><div className="flex items-center justify-between gap-3 lg:justify-end"><strong>{money.format(item.quantity * item.unitCost)}</strong>{item.supplierUrl ? <a href={item.supplierUrl} target="_blank" rel="noreferrer" aria-label={`Open supplier page for ${item.description}`} className="rounded-lg p-2 text-cyan-300 hover:bg-slate-800"><ExternalLink className="size-4" /></a> : item.status === "Delivered" ? <CheckCircle2 className="size-5 text-emerald-300" /> : null}</div></div>)}</div></section>)}</div>
      </Card>;
    })}</div>}
  </div>;
}
