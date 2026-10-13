"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Calculator, FileText, Plus, Search } from "lucide-react";
import { usePricingDocumentsCollection } from "../../lib/cloud/coreBusinessCollections";
import type { PricingDocument } from "../../lib/models";
import { Card } from "../../components/ui/Card";

const money = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });

function documentTotal(document: PricingDocument) {
  const subtotal = document.profitability?.sellingPrice
    ?? document.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  return subtotal + (document.vatEnabled ? subtotal * document.vatRate / 100 : 0);
}

export default function EstimatesPage() {
  const documents = usePricingDocumentsCollection();
  const [search, setSearch] = useState("");
  const estimates = useMemo(() => {
    const query = search.trim().toLowerCase();
    return documents.items
      .filter((document) => document.type === "Estimate")
      .filter((document) => !query || `${document.number} ${document.title} ${document.status} ${document.siteAddress}`.toLowerCase().includes(query))
      .toSorted((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [documents.items, search]);

  return <div className="space-y-6">
    <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">Pricing documents</p>
        <h1 className="mt-1 text-3xl font-bold">Estimates</h1>
        <p className="mt-2 text-sm text-slate-400">Estimate records use the same pricing, revision, print and conversion workflow as quotes.</p>
      </div>
      <Link href="/quotes?documentType=Estimate" className="inline-flex min-h-11 items-center justify-center rounded-xl bg-cyan-400 px-4 font-semibold text-slate-950 hover:bg-cyan-300">
        <Plus className="mr-2 size-4" />Open pricing workspace
      </Link>
    </div>

    <Card>
      <label className="relative block">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search estimates" className="min-h-11 w-full rounded-xl border border-slate-700 bg-slate-950 pl-10 pr-3 text-white outline-none focus:border-cyan-400" />
      </label>
    </Card>

    {!documents.isReady ? <Card>Loading estimates…</Card> : estimates.length ? <div className="grid gap-4 lg:grid-cols-2">
      {estimates.map((estimate) => <Card key={estimate.id} className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">{estimate.number}</p>
            <h2 className="mt-1 text-xl font-bold">{estimate.title}</h2>
            <p className="mt-1 text-sm text-slate-500">{estimate.siteAddress || "No site address"}</p>
          </div>
          <span className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300">{estimate.status}</span>
        </div>
        <div className="flex items-center justify-between border-t border-slate-800 pt-4">
          <div><p className="text-xs text-slate-500">Estimate total</p><p className="font-bold">{money.format(documentTotal(estimate))}</p></div>
          <Link href={`/quotes/${estimate.id}`} className="inline-flex min-h-10 items-center rounded-lg border border-slate-700 px-3 text-sm font-semibold text-cyan-300 hover:border-cyan-400">
            <FileText className="mr-2 size-4" />View estimate
          </Link>
        </div>
      </Card>)}
    </div> : <Card className="text-center">
      <Calculator className="mx-auto size-8 text-slate-500" />
      <h2 className="mt-3 text-xl font-bold">No estimates found</h2>
      <p className="mt-2 text-sm text-slate-400">Create an Estimate from the shared pricing workspace.</p>
      <Link href="/quotes?documentType=Estimate" className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-cyan-400 px-4 font-semibold text-slate-950 hover:bg-cyan-300">Create estimate</Link>
    </Card>}
  </div>;
}
