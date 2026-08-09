"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, ExternalLink, PackageCheck, ShoppingCart, Trash2, Truck } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";
import { usePurchaseListsCollection } from "../../lib/cloud/coreBusinessCollections";
import { useCloudIdentity } from "../../lib/cloud/useCloudIdentity";
import { makeId, useCloudLocalCollection } from "../../lib/storage";
import type { Job, Material, PricingDocument, PurchaseItemStatus, PurchaseList } from "../../lib/models";

const money = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const statuses: PurchaseItemStatus[] = ["Needed", "Ordered", "Received"];

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

  const sourceDocuments = useMemo(() => pricing.items.filter((document) => document.items.some((item) => item.kind === "Material")), [pricing.items]);
  const summary = useMemo(() => {
    const items = purchaseLists.items.flatMap((list) => list.items);
    return {
      lists: purchaseLists.items.length,
      needed: items.filter((item) => item.status === "Needed").length,
      ordered: items.filter((item) => item.status === "Ordered").length,
      received: items.filter((item) => item.status === "Received").length,
      committed: items.filter((item) => item.status !== "Needed").reduce((sum, item) => sum + item.quantity * (item.unitCost ?? 0), 0),
    };
  }, [purchaseLists.items]);

  function materialMatch(description: string) {
    const normalised = description.trim().toLowerCase();
    return materials.items.find((material) => material.name.trim().toLowerCase() === normalised);
  }

  function createFromDocument() {
    const document = sourceDocuments.find((item) => item.id === selectedDocumentId);
    if (!document) return setMessage("Choose a quote or estimate with material lines.");
    const materialLines = document.items.filter((item) => item.kind === "Material");
    const now = new Date().toISOString();
    const list: PurchaseList = {
      id: makeId("purchase"),
      number: `PO-${String(purchaseLists.items.length + 1).padStart(4, "0")}`,
      title: `${document.number} materials`,
      pricingDocumentId: document.id,
      jobId: selectedJobId || document.jobId,
      items: materialLines.map((line) => {
        const material = materialMatch(line.description);
        return {
          id: makeId("purchase-item"),
          materialId: material?.id,
          description: line.description,
          supplier: material?.supplier || "",
          stockCode: material?.stockCode || "",
          supplierUrl: material?.supplierUrl || undefined,
          quantity: line.quantity,
          unitCost: line.unitCost,
          status: "Needed" as const,
        };
      }),
      notes: `Generated from ${document.type.toLowerCase()} ${document.number}.`,
      createdAt: now,
      updatedAt: now,
    };
    purchaseLists.setItems((current) => [list, ...current]);
    setSelectedDocumentId("");
    setSelectedJobId("");
    setMessage(`${list.number} created with ${list.items.length} material line${list.items.length === 1 ? "" : "s"}.`);
  }

  function updateItem(listId: string, itemId: string, patch: Partial<PurchaseList["items"][number]>) {
    const now = new Date().toISOString();
    purchaseLists.setItems((current) => current.map((list) => list.id === listId ? { ...list, items: list.items.map((item) => item.id === itemId ? { ...item, ...patch } : item), updatedAt: now } : list));
  }

  const ready = purchaseLists.isReady && pricing.isReady && materials.isReady && jobs.isReady;
  if (!ready) return <Card>Loading purchase lists…</Card>;

  return <div className="space-y-6">
    <PageHeader eyebrow="Procurement" title="Purchase Lists" description={priceRestricted ? "Track required materials, suppliers and order/receipt status without office cost or quote data." : "Turn quote and estimate material lines into supplier-ready purchase lists, then track ordering and receipt."} />
    {message ? <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 px-4 py-3 text-sm text-cyan-200">{message}</div> : null}
    <section className={`grid gap-4 sm:grid-cols-2 ${priceRestricted ? "xl:grid-cols-3" : "xl:grid-cols-4"}`}>
      <Card><ShoppingCart className="size-5 text-cyan-300" /><p className="mt-3 text-sm text-slate-400">Purchase lists</p><p className="mt-2 text-3xl font-bold">{summary.lists}</p></Card>
      <Card><Truck className="size-5 text-amber-300" /><p className="mt-3 text-sm text-slate-400">Need ordering</p><p className="mt-2 text-3xl font-bold">{summary.needed}</p><p className="text-xs text-slate-500">{summary.ordered} already ordered</p></Card>
      <Card><PackageCheck className="size-5 text-emerald-300" /><p className="mt-3 text-sm text-slate-400">Received lines</p><p className="mt-2 text-3xl font-bold">{summary.received}</p></Card>
      {!priceRestricted ? <Card><p className="text-sm text-slate-400">Committed spend</p><p className="mt-2 text-3xl font-bold">{money.format(summary.committed)}</p></Card> : null}
    </section>

    {!priceRestricted ? <Card className="border-cyan-400/30"><h2 className="font-semibold">Create from quote or estimate</h2><div className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_auto]"><select value={selectedDocumentId} onChange={(event) => setSelectedDocumentId(event.target.value)} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm"><option value="">Choose pricing document</option>{sourceDocuments.map((document) => <option key={document.id} value={document.id}>{document.number} · {document.title}</option>)}</select><select value={selectedJobId} onChange={(event) => setSelectedJobId(event.target.value)} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm"><option value="">Use linked job / no job</option>{jobs.items.map((job) => <option key={job.id} value={job.id}>{job.title}</option>)}</select><Button onClick={createFromDocument}>Create purchase list</Button></div></Card> : null}

    {purchaseLists.items.length === 0 ? <Card><p className="text-sm text-slate-400">No purchase lists yet. {priceRestricted ? "Office can create lists that will appear here for field ordering and receipt updates." : "Create one from the materials already priced in a quote or estimate."}</p></Card> : <div className="space-y-5">{purchaseLists.items.map((list) => {
      const totalCost = list.items.reduce((sum, item) => sum + item.quantity * (item.unitCost ?? 0), 0);
      const groupedSuppliers = [...new Set(list.items.map((item) => item.supplier || "Unassigned"))];
      return <Card key={list.id} className="overflow-hidden p-0"><div className="flex flex-col gap-3 border-b border-slate-800 p-5 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">{list.number}</p><h2 className="mt-1 text-xl font-bold">{list.title}</h2><p className="mt-1 text-sm text-slate-400">{jobs.items.find((job) => job.id === list.jobId)?.title || "No linked job"} · {list.items.length} lines</p></div><div className="flex items-center gap-3">{!priceRestricted ? <strong>{money.format(totalCost)}</strong> : null}{!priceRestricted ? <button onClick={() => purchaseLists.remove((item) => item.id === list.id)} aria-label={`Delete ${list.number}`} className="rounded-lg p-2 text-slate-500 hover:bg-red-500/10 hover:text-red-300"><Trash2 className="size-4" /></button> : null}</div></div><div className="space-y-5 p-5">{groupedSuppliers.map((supplier) => { const supplierItems = list.items.filter((item) => (item.supplier || "Unassigned") === supplier); const subtotal = supplierItems.reduce((sum, item) => sum + item.quantity * (item.unitCost ?? 0), 0); return <section key={supplier} className="rounded-xl border border-slate-800"><div className="flex items-center justify-between border-b border-slate-800 bg-slate-950/60 px-4 py-3"><div><p className="font-semibold">{supplier}</p><p className="text-xs text-slate-500">{supplierItems.length} line{supplierItems.length === 1 ? "" : "s"}</p></div>{!priceRestricted ? <strong>{money.format(subtotal)}</strong> : null}</div><div className="divide-y divide-slate-800">{supplierItems.map((item) => <div key={item.id} className={`grid gap-3 p-4 ${priceRestricted ? "lg:grid-cols-[1fr_120px_150px_auto]" : "lg:grid-cols-[1fr_120px_130px_150px_auto]"} lg:items-center`}><div><p className="font-semibold">{item.description}</p><p className="text-xs text-slate-500">{item.stockCode || "No stock code"}</p></div><label className="text-xs text-slate-500">Quantity<input value={item.quantity} onChange={(event) => updateItem(list.id, item.id, { quantity: Number(event.target.value || 0) })} type="number" min="0" step="0.01" className="mt-1 min-h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-white" /></label>{!priceRestricted ? <label className="text-xs text-slate-500">Unit cost<input value={item.unitCost ?? 0} onChange={(event) => updateItem(list.id, item.id, { unitCost: Number(event.target.value || 0) })} type="number" min="0" step="0.01" className="mt-1 min-h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-white" /></label> : null}<label className="text-xs text-slate-500">Status<select value={item.status} onChange={(event) => updateItem(list.id, item.id, { status: event.target.value as PurchaseItemStatus })} className="mt-1 min-h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-white">{statuses.map((status) => <option key={status}>{status}</option>)}</select></label><div className="flex items-center justify-end gap-2">{!priceRestricted ? <strong className="text-sm">{money.format(item.quantity * (item.unitCost ?? 0))}</strong> : null}{item.supplierUrl ? <a href={item.supplierUrl} target="_blank" rel="noreferrer" className="rounded-lg p-2 text-cyan-300 hover:bg-cyan-400/10" aria-label={`Open supplier for ${item.description}`}><ExternalLink className="size-4" /></a> : null}{item.status === "Received" ? <CheckCircle2 className="size-5 text-emerald-300" /> : null}</div></div>)}</div></section>; })}{list.notes ? <p className="text-sm text-slate-400">{list.notes}</p> : null}</div></Card>;
    })}</div>}

    <div className="flex justify-end"><Link href="/materials" className="text-sm font-semibold text-cyan-300 hover:text-cyan-200">Open materials library →</Link></div>
  </div>;
}
