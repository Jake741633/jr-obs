"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { ExternalLink, Search } from "lucide-react";
import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { PageHeader } from "../../../components/ui/PageHeader";
import { readSupabaseSession, readSupabaseSessionOwnershipEpoch } from "../../../lib/supabase/client";
import { sameSupabaseSessionOwnership } from "../../../lib/supabase/sessionOwnership-core.mjs";
import { supplierNames, supplierLookupResult, type SupplierName, type SupplierLookupResult } from "../../../lib/supplierLookup";

type LookupRequest = { controller: AbortController; timer?: ReturnType<typeof setTimeout> };

function stopRequest(request: LookupRequest | null) {
  if (!request) return;
  clearTimeout(request.timer);
  request.controller.abort();
}

export default function FieldMaterialLookupPage() {
  const [supplier, setSupplier] = useState<SupplierName>("CEF");
  const [stockCode, setStockCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<SupplierLookupResult | null>(null);
  const [formVersion, setFormVersion] = useState(0);
  const versionRef = useRef(0);
  const requestRef = useRef<LookupRequest | null>(null);
  const mountedRef = useRef(true);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; stopRequest(requestRef.current); requestRef.current = null; };
  }, []);

  function clearLookup(notice = "") {
    stopRequest(requestRef.current); requestRef.current = null;
    setFormVersion(++versionRef.current);
    setBusy(false); setResult(null); setMessage(notice);
  }

  async function lookup(event: FormEvent) {
    event.preventDefault();
    if (!mountedRef.current || formVersion !== versionRef.current || requestRef.current) return;
    const code = stockCode.trim();
    if (!code || code.length > 80 || !supplierNames.includes(supplier)) {
      setMessage("Enter a supplier stock code of 1–80 characters.");
      setResult(null);
      return;
    }
    const request: LookupRequest = { controller: new AbortController() };
    requestRef.current = request;
    setBusy(true);
    setMessage(`Looking up ${supplier} code ${code}…`);
    setResult(null);
    inputRef.current?.blur();
    try {
      const session = readSupabaseSession();
      if (!session || session.is_password_recovery) throw new Error("Sign in before using supplier lookups.");
      const epoch = readSupabaseSessionOwnershipEpoch();
      request.timer = setTimeout(() => {
        if (requestRef.current === request) clearLookup("The lookup took too long. Your supplier and code are kept; try again when connected.");
      }, 20_000);
      const response = await fetch("/api/materials/lookup", {
        method: "POST",
        signal: request.controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ supplier, stockCode: code }),
      });
      const payload: unknown = await response.json();
      if (requestRef.current !== request || request.controller.signal.aborted) return;
      if (!sameSupabaseSessionOwnership(readSupabaseSession(), readSupabaseSessionOwnershipEpoch(), session, epoch)) {
        setMessage("Your sign-in changed during this lookup. Check your account and search again.");
        return;
      }
      if (!response.ok) throw new Error(payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string" ? payload.error : "Supplier lookup failed. Try again.");
      const checked = supplierLookupResult(payload, supplier, code);
      setResult(checked);
      setMessage(checked.message);
    } catch (error) {
      if (requestRef.current === request && !request.controller.signal.aborted) setMessage(error instanceof Error ? error.message : "Supplier lookup failed. Try again.");
    } finally {
      clearTimeout(request.timer);
      if (requestRef.current === request) { requestRef.current = null; setBusy(false); }
    }
  }

  return <main className="space-y-6 pb-24 sm:pb-0">
    <PageHeader eyebrow="Mobile workspace" title="Supplier material lookup" description="Look up CEF, Screwfix or TLC Direct stock codes from site without changing the office materials catalogue." />

    <Card className="space-y-4 border-cyan-400/30">
      <div className="flex items-start gap-3"><Search className="mt-0.5 size-5 text-cyan-300" /><div><h2 className="font-semibold">Find supplier product</h2><p className="mt-1 text-sm text-slate-400">Search by supplier stock or product code. Results are read-only in the field workspace.</p></div></div>
      <form onSubmit={lookup} aria-busy={busy} className="grid items-end gap-3 md:grid-cols-[200px_1fr_auto]">
        <label className="min-w-0 space-y-2 text-sm font-semibold"><span>Supplier</span><select value={supplier} onChange={(event) => { clearLookup(); setSupplier(event.target.value as SupplierName); }} className="min-h-12 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-base">{supplierNames.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label className="min-w-0 space-y-2 text-sm font-semibold"><span>Stock or product code</span><input ref={inputRef} value={stockCode} onChange={(event) => { clearLookup(); setStockCode(event.target.value); }} maxLength={80} autoComplete="off" autoCapitalize="none" spellCheck={false} enterKeyHint="search" placeholder="Enter stock code or product code" className="min-h-12 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-base outline-none focus:border-cyan-400" /></label>
        <Button type="submit" disabled={busy} className="min-h-12">{busy ? "Searching…" : "Find product"}</Button>
      </form>
      <div className="flex flex-wrap gap-2">{busy ? <Button type="button" variant="secondary" className="min-h-12" onClick={() => clearLookup("Lookup cancelled. Your supplier and code are kept.")}>Cancel lookup</Button> : null}{stockCode || result ? <Button type="button" variant="secondary" className="min-h-12" onClick={() => { clearLookup(); setStockCode(""); }}>Clear lookup</Button> : null}</div>
      <p className="text-xs leading-5 text-slate-400">Needs an internet connection and a signed-in permitted account. Editing either field clears the previous result. No catalogue or stock records are changed.</p>
      {message ? <p role="status" className="break-words rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-300">{message}</p> : null}
    </Card>

    {result ? <Card className="min-w-0 space-y-4">
      <section aria-label="Supplier lookup result" className="space-y-4">
      <div><p className="break-words text-xs font-semibold uppercase tracking-wider text-cyan-400">{result.supplier} · {result.stockCode}</p><h2 className="mt-1 break-words text-xl font-bold">{result.name || "Supplier search"}</h2>{result.manufacturer ? <p className="mt-1 break-words text-sm text-slate-400">{result.manufacturer}</p> : null}</div>
      <div className="rounded-xl border border-slate-800 bg-slate-950/50 px-4 py-3 text-sm"><p className="text-slate-400">Match</p><p className="mt-1 font-semibold text-white">{result.exactMatch ? "Supplier code match" : "Not an exact code match — review supplier search"}</p><p className="mt-2 text-slate-400">Confirm the product, availability and your account price with the supplier. This lookup has not placed an order.</p></div>
      <a href={result.exactMatch && result.productUrl ? result.productUrl : result.searchUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-700 px-4 text-sm font-semibold hover:border-cyan-400/50"><ExternalLink className="mr-2 size-4" />{result.exactMatch && result.productUrl ? "Open supplier product" : "Open supplier search"}</a>
      </section>
    </Card> : null}

    <Card><p className="text-sm text-slate-400">Field supplier lookup never creates or edits the canonical materials catalogue. Office users can maintain catalogue records and pricing from the Materials Library.</p></Card>
  </main>;
}
