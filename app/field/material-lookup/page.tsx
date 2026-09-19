"use client";

import { FormEvent, useState } from "react";
import { ExternalLink, Search } from "lucide-react";
import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { PageHeader } from "../../../components/ui/PageHeader";
import { readSupabaseSession } from "../../../lib/supabase/client";

const suppliers = ["CEF", "Screwfix", "TLC Direct"] as const;
type SupplierName = typeof suppliers[number];
type LookupResult = {
  supplier: SupplierName;
  stockCode: string;
  name?: string;
  manufacturer?: string;
  productUrl?: string;
  searchUrl: string;
  exactMatch: boolean;
  message: string;
};

export default function FieldMaterialLookupPage() {
  const [supplier, setSupplier] = useState<SupplierName>("CEF");
  const [stockCode, setStockCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<LookupResult | null>(null);

  async function lookup(event: FormEvent) {
    event.preventDefault();
    const code = stockCode.trim();
    if (!code) {
      setMessage("Enter a supplier stock code.");
      setResult(null);
      return;
    }
    setBusy(true);
    setMessage("");
    setResult(null);
    try {
      const session = readSupabaseSession();
      if (!session || session.is_password_recovery) throw new Error("Sign in before using supplier lookups.");
      const response = await fetch("/api/materials/lookup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ supplier, stockCode: code }),
      });
      const payload = await response.json() as LookupResult & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Supplier lookup failed.");
      setResult(payload);
      setMessage(payload.message);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Supplier lookup failed.");
    } finally {
      setBusy(false);
    }
  }

  return <main className="space-y-6 pb-24 sm:pb-0">
    <PageHeader eyebrow="Mobile workspace" title="Supplier material lookup" description="Look up CEF, Screwfix or TLC Direct stock codes from site without changing the office materials catalogue." />

    <Card className="space-y-4 border-cyan-400/30">
      <div className="flex items-start gap-3"><Search className="mt-0.5 size-5 text-cyan-300" /><div><h2 className="font-semibold">Find supplier product</h2><p className="mt-1 text-sm text-slate-400">Search by supplier stock or product code. Results are read-only in the field workspace.</p></div></div>
      <form onSubmit={lookup} className="grid gap-3 md:grid-cols-[200px_1fr_auto]">
        <select value={supplier} onChange={(event) => setSupplier(event.target.value as SupplierName)} className="min-h-12 rounded-xl border border-slate-700 bg-slate-950 px-3 text-base">{suppliers.map((item) => <option key={item}>{item}</option>)}</select>
        <input value={stockCode} onChange={(event) => setStockCode(event.target.value)} placeholder="Enter stock code or product code" className="min-h-12 rounded-xl border border-slate-700 bg-slate-950 px-3 text-base outline-none focus:border-cyan-400" />
        <Button type="submit" disabled={busy}>{busy ? "Searching…" : "Find product"}</Button>
      </form>
      {message ? <p className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-300">{message}</p> : null}
    </Card>

    {result ? <Card className="space-y-4">
      <div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">{result.supplier} · {result.stockCode}</p><h2 className="mt-1 text-xl font-bold">{result.name || "Supplier product"}</h2>{result.manufacturer ? <p className="mt-1 text-sm text-slate-400">{result.manufacturer}</p> : null}</div>
      <div className="rounded-xl border border-slate-800 bg-slate-950/50 px-4 py-3 text-sm"><p className="text-slate-400">Match</p><p className="mt-1 font-semibold text-white">{result.exactMatch ? "Exact supplier result" : "Supplier search result"}</p></div>
      <a href={result.productUrl || result.searchUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-700 px-4 text-sm font-semibold hover:border-cyan-400/50"><ExternalLink className="mr-2 size-4" />Open supplier result</a>
    </Card> : null}

    <Card><p className="text-sm text-slate-400">Field supplier lookup never creates or edits the canonical materials catalogue. Office users can maintain catalogue records and pricing from the Materials Library.</p></Card>
  </main>;
}
