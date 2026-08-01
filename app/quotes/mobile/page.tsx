"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { ArrowRight, BookOpen, FileText, Plus, Save, Search, Smartphone, Trash2 } from "lucide-react";
import { MobileActionDock, MobileDockAction } from "../../../components/mobile/MobileActionDock";
import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { InputField, TextareaField } from "../../../components/ui/FormField";
import { PageHeader } from "../../../components/ui/PageHeader";
import { usePricingDocumentsCollection } from "../../../lib/cloud/coreBusinessCollections";
import {
  priceBookSelectionFinancials,
  priceBookSelectionToQuoteLine,
  type PriceBookItem,
} from "../../../lib/priceBook-core.mjs";
import { makeId, useCloudLocalCollection } from "../../../lib/storage";
import { nextPricingDocumentNumber, pricingDocumentTotal } from "../../../lib/workflow";
import type { Builder, Customer, PricingDocument } from "../../../lib/models";

const money = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });

const blankDraft = {
  title: "",
  customerId: "",
  builderId: "",
  siteAddress: "",
  fixedPrice: "",
  notes: "",
};

export default function MobileQuotesPage() {
  const documents = usePricingDocumentsCollection();
  const customers = useCloudLocalCollection<Customer>("jr-os-customers");
  const builders = useCloudLocalCollection<Builder>("jr-os-builders");
  const priceBook = useCloudLocalCollection<PriceBookItem>("jr-os-price-book");
  const [showQuickDraft, setShowQuickDraft] = useState(false);
  const [draft, setDraft] = useState(blankDraft);
  const [priceBookItemId, setPriceBookItemId] = useState("");
  const [priceBookQuantity, setPriceBookQuantity] = useState("1");
  const [priceBookSelections, setPriceBookSelections] = useState<Array<{ itemId: string; quantity: number }>>([]);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const names = useMemo(() => new Map([
    ...customers.items.map((item) => [item.id, item.name] as const),
    ...builders.items.map((item) => [item.id, item.companyName] as const),
  ]), [builders.items, customers.items]);

  const activePriceBookItems = useMemo(() => priceBook.items
    .filter((item) => item.active)
    .toSorted((a, b) => Number(b.favourite) - Number(a.favourite) || a.name.localeCompare(b.name)), [priceBook.items]);

  const selectedPriceBookLines = useMemo(() => priceBookSelections.flatMap((selection) => {
    const item = priceBook.items.find((candidate) => candidate.id === selection.itemId);
    if (!item) return [];
    return [{ item, quantity: selection.quantity, financials: priceBookSelectionFinancials(item, selection.quantity) }];
  }), [priceBook.items, priceBookSelections]);

  const priceBookTotal = useMemo(() => selectedPriceBookLines.reduce((sum, line) => sum + line.financials.sellingPrice, 0), [selectedPriceBookLines]);

  const recent = useMemo(() => {
    const query = search.trim().toLowerCase();
    return documents.items
      .filter((item) => !query || `${item.number} ${item.title} ${item.status} ${names.get(item.customerId ?? "")} ${names.get(item.builderId ?? "")}`.toLowerCase().includes(query))
      .toSorted((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 20);
  }, [documents.items, names, search]);

  function selectCustomer(customerId: string) {
    const customer = customers.items.find((item) => item.id === customerId);
    setDraft((current) => ({ ...current, customerId, builderId: "", siteAddress: customer?.address ?? current.siteAddress }));
  }

  function selectBuilder(builderId: string) {
    const builder = builders.items.find((item) => item.id === builderId);
    setDraft((current) => ({ ...current, builderId, customerId: "", siteAddress: builder?.address ?? current.siteAddress }));
  }

  function addPriceBookSelection() {
    const quantity = Math.max(1, Math.floor(Number(priceBookQuantity) || 1));
    if (!priceBookItemId) {
      setError("Choose a price-book item first.");
      return;
    }
    setPriceBookSelections((current) => {
      const existing = current.find((selection) => selection.itemId === priceBookItemId);
      return existing
        ? current.map((selection) => selection.itemId === priceBookItemId ? { ...selection, quantity: selection.quantity + quantity } : selection)
        : [...current, { itemId: priceBookItemId, quantity }];
    });
    setPriceBookItemId("");
    setPriceBookQuantity("1");
    setError("");
  }

  function saveQuickDraft(event?: FormEvent) {
    event?.preventDefault();
    const fixedPrice = Number(draft.fixedPrice);
    const hasPriceBookLines = selectedPriceBookLines.length > 0;
    if (!draft.title.trim()) { setError("Enter a title or scope for the quote."); return; }
    if (!draft.customerId && !draft.builderId) { setError("Choose a customer or builder."); return; }
    if (!hasPriceBookLines && (!Number.isFinite(fixedPrice) || fixedPrice <= 0)) { setError("Enter a valid fixed price or add price-book items."); return; }

    const now = new Date().toISOString();
    const number = nextPricingDocumentNumber(documents.items, "Quote");
    const items = hasPriceBookLines
      ? selectedPriceBookLines.map(({ item, quantity }) => priceBookSelectionToQuoteLine(item, quantity, makeId("line")))
      : [{
          id: makeId("line"),
          description: draft.title.trim(),
          category: "Other",
          quantity: 1,
          unitCost: 0,
          unitPrice: fixedPrice,
        }];
    const document: PricingDocument = {
      id: makeId("doc"),
      number,
      type: "Quote",
      status: "Draft",
      customerId: draft.customerId || undefined,
      builderId: draft.builderId || undefined,
      title: draft.title.trim(),
      siteAddress: draft.siteAddress.trim() || undefined,
      validUntil: "",
      vatEnabled: false,
      vatRate: 20,
      items,
      notes: draft.notes.trim(),
      exclusions: "",
      internalNotes: hasPriceBookLines ? "Created from the Electrical Price Book. Internal costs remain in the price-book records." : "",
      fixedPriceWorkflow: { type: "Direct fixed price", initialVisitCompleted: false, faultFindingCompleted: false, recommendation: draft.title.trim() },
      terms: "This fixed-price draft is based on the described scope. Variations, unforeseen work and making good are excluded unless stated otherwise.",
      paymentTerms: { type: "Due on completion" },
      revisions: [],
      createdAt: now,
      updatedAt: now,
    };

    documents.setItems((current) => [document, ...current]);
    setDraft(blankDraft);
    setPriceBookSelections([]);
    setShowQuickDraft(false);
    setError("");
    setMessage(`${number} saved as a fixed-price draft.`);
  }

  return <div className={`space-y-6 ${showQuickDraft ? "pb-32 lg:pb-0" : ""}`}>
    <PageHeader
      eyebrow="Mobile sales"
      title="Quick Quotes"
      description="Create a fixed-price draft on site, then finish the detailed costing and customer presentation when ready."
      action={<Button onClick={() => { setShowQuickDraft((current) => !current); setError(""); }}><Plus className="mr-2 size-4" />{showQuickDraft ? "Close quick draft" : "New quick draft"}</Button>}
    />

    {message ? <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-300">{message}</div> : null}

    {showQuickDraft ? <Card><form onSubmit={saveQuickDraft} className="space-y-5">
      <div className="flex items-start gap-3"><Smartphone className="mt-0.5 size-5 text-cyan-300" /><div><h2 className="font-semibold">Fixed-price quick draft</h2><p className="mt-1 text-sm text-slate-400">Use a single fixed price or build the draft from saved electrical price-book items.</p></div></div>
      <InputField label="Title / scope" placeholder="Consumer unit replacement" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Customer</span><select value={draft.customerId} onChange={(event) => selectCustomer(event.target.value)} className="min-h-12 rounded-xl border border-slate-700 bg-slate-950 px-3"><option value="">None</option>{customers.items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Builder</span><select value={draft.builderId} onChange={(event) => selectBuilder(event.target.value)} className="min-h-12 rounded-xl border border-slate-700 bg-slate-950 px-3"><option value="">None</option>{builders.items.map((item) => <option key={item.id} value={item.id}>{item.companyName}</option>)}</select></label>
      </div>
      <InputField label="Site address" value={draft.siteAddress} onChange={(event) => setDraft({ ...draft, siteAddress: event.target.value })} />

      <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-4">
        <div className="flex items-start gap-3"><BookOpen className="mt-0.5 size-5 text-cyan-300" /><div><h3 className="font-semibold">Add from Electrical Price Book</h3><p className="mt-1 text-sm text-slate-400">Choose a saved point price and quantity. Internal cost and profit details stay hidden from the customer quote.</p></div></div>
        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_110px_auto]">
          <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Price-book item</span><select value={priceBookItemId} onChange={(event) => setPriceBookItemId(event.target.value)} className="min-h-12 rounded-xl border border-slate-700 bg-slate-950 px-3"><option value="">Choose item</option>{activePriceBookItems.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <InputField label="Quantity" type="number" min="1" step="1" value={priceBookQuantity} onChange={(event) => setPriceBookQuantity(event.target.value)} />
          <Button type="button" className="self-end" onClick={addPriceBookSelection}><Plus className="mr-2 size-4" />Add</Button>
        </div>
        {selectedPriceBookLines.length ? <div className="mt-4 space-y-2">{selectedPriceBookLines.map(({ item, quantity, financials }) => <div key={item.id} className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-950/70 p-3"><div className="min-w-0 flex-1"><p className="truncate font-medium">{quantity} × {item.name}</p><p className="mt-1 text-xs text-slate-500">{money.format(financials.sellingPrice)}</p></div><button type="button" aria-label={`Remove ${item.name}`} onClick={() => setPriceBookSelections((current) => current.filter((selection) => selection.itemId !== item.id))} className="flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-slate-700"><Trash2 className="size-4 text-red-300" /></button></div>)}</div> : null}
        <div className="mt-4 flex items-center justify-between border-t border-slate-800 pt-3"><span className="text-sm text-slate-400">Price-book total</span><span className="text-lg font-bold text-emerald-300">{money.format(priceBookTotal)}</span></div>
      </div>

      {!selectedPriceBookLines.length ? <InputField label="Customer fixed price (£)" inputMode="decimal" type="number" min="0.01" step="0.01" value={draft.fixedPrice} onChange={(event) => setDraft({ ...draft, fixedPrice: event.target.value })} /> : null}
      <TextareaField label="Scope notes" placeholder="Include what is covered, exclusions and anything still to confirm." value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} />
      {error ? <p className="text-sm text-red-300">{error}</p> : null}
      <div className="hidden justify-end gap-3 lg:flex"><Button type="button" variant="secondary" onClick={() => setShowQuickDraft(false)}>Cancel</Button><Button type="submit"><Save className="mr-2 size-4" />Save fixed-price draft</Button></div>
    </form></Card> : null}

    <Card>
      <div className="flex items-center justify-between gap-3"><div><h2 className="font-semibold">Recent quotes and estimates</h2><p className="mt-1 text-sm text-slate-400">Tap a record to continue in the full Quote Builder.</p></div><Link href="/quotes" className="hidden text-sm font-semibold text-cyan-300 sm:inline">Open full builder</Link></div>
      <label className="relative mt-4 block"><Search className="pointer-events-none absolute left-3 top-3.5 size-4 text-slate-500" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search quotes" className="min-h-12 w-full rounded-xl border border-slate-700 bg-slate-950 pl-10 pr-3 outline-none focus:border-cyan-400" /></label>
      <div className="mt-4 space-y-3">{recent.length ? recent.map((document) => <QuoteCard key={document.id} document={document} recipient={names.get(document.customerId ?? "") ?? names.get(document.builderId ?? "") ?? "No recipient"} />) : <p className="rounded-xl border border-dashed border-slate-800 p-5 text-sm text-slate-500">No matching pricing documents.</p>}</div>
    </Card>

    {showQuickDraft ? <MobileActionDock summary={<div><p className="truncate text-xs text-slate-400">Fixed-price draft</p><p className="truncate text-sm font-bold text-white">{selectedPriceBookLines.length ? money.format(priceBookTotal) : draft.fixedPrice ? money.format(Number(draft.fixedPrice) || 0) : "Price not set"}</p></div>}>
      <MobileDockAction icon={<Save className="size-5" />} label="Save" onClick={() => saveQuickDraft()} />
      <MobileDockAction icon={<FileText className="size-5" />} label="Full builder" onClick={() => window.location.assign("/quotes")} />
    </MobileActionDock> : null}
  </div>;
}

function QuoteCard({ document, recipient }: { document: PricingDocument; recipient: string }) {
  return <Link href="/quotes" className="flex min-h-20 items-center gap-3 rounded-xl border border-slate-800 bg-slate-950/70 p-4 transition active:scale-[0.99] active:bg-slate-900">
    <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-cyan-400/10 text-cyan-300"><FileText className="size-5" /></div>
    <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><p className="truncate font-semibold">{document.title}</p><span className="shrink-0 rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-slate-400">{document.status}</span></div><p className="mt-1 truncate text-xs text-slate-500">{document.number} · {recipient}</p><p className="mt-1 text-sm font-bold text-emerald-300">{money.format(pricingDocumentTotal(document))}</p></div>
    <ArrowRight className="size-5 shrink-0 text-slate-600" />
  </Link>;
}
