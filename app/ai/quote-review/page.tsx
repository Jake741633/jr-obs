"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, CheckCircle2, FileSearch, Gauge, PoundSterling, ShieldCheck } from "lucide-react";
import { Card } from "../../../components/ui/Card";
import { PageHeader } from "../../../components/ui/PageHeader";
import { useLocalStorageCollection } from "../../../lib/storage";
import type { PricingDocument, PricingLineItem } from "../../../lib/models";

const money = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });

type ReviewFinding = {
  level: "Action" | "Check" | "Good";
  title: string;
  detail: string;
};

function lineRevenue(item: PricingLineItem) {
  return item.quantity * item.unitPrice;
}

function lineCost(item: PricingLineItem) {
  return item.quantity * (item.unitCost || 0);
}

function includesAny(value: string, terms: string[]) {
  const normalised = value.toLowerCase();
  return terms.some((term) => normalised.includes(term));
}

export default function QuoteReviewPage() {
  const documents = useLocalStorageCollection<PricingDocument>("jr-os-pricing-documents");
  const quotes = documents.items.filter((item) => item.type === "Quote");
  const [selectedId, setSelectedId] = useState("");
  const selected = quotes.find((item) => item.id === selectedId) || quotes[0];

  const review = useMemo(() => {
    if (!selected) return null;

    const subtotal = selected.items.reduce((sum, item) => sum + lineRevenue(item), 0);
    const knownCost = selected.items.reduce((sum, item) => sum + lineCost(item), 0);
    const grossProfit = subtotal - knownCost;
    const margin = subtotal > 0 ? (grossProfit / subtotal) * 100 : 0;
    const labour = selected.items.filter((item) => item.category === "Labour");
    const materials = selected.items.filter((item) => item.category === "Materials");
    const other = selected.items.filter((item) => item.category === "Other");
    const findings: ReviewFinding[] = [];

    if (!selected.items.length) findings.push({ level: "Action", title: "No line items", detail: "Add labour, materials and any other charges before sending this quote." });
    if (!labour.length) findings.push({ level: "Action", title: "Labour is missing", detail: "Add a clear labour allowance so the price covers your time and any additional electrician required." });
    else findings.push({ level: "Good", title: "Labour included", detail: `${labour.length} labour line${labour.length === 1 ? " is" : "s are"} included.` });

    if (!materials.length) findings.push({ level: "Check", title: "No materials listed", detail: "Confirm this is genuinely labour-only or add the expected materials and sundries." });
    if (materials.some((item) => !item.unitCost)) findings.push({ level: "Check", title: "Material costs are incomplete", detail: "Some material lines have no unit cost, so profit and margin may be overstated." });

    if (knownCost === 0 && selected.items.length) findings.push({ level: "Check", title: "No costs recorded", detail: "Enter unit costs where possible to make the margin review meaningful." });
    else if (margin < 20) findings.push({ level: "Action", title: "Low gross margin", detail: `The known gross margin is ${margin.toFixed(1)}%. Review labour recovery, material markup and risk allowance.` });
    else if (margin < 30) findings.push({ level: "Check", title: "Margin needs a final check", detail: `The known gross margin is ${margin.toFixed(1)}%. Confirm it covers overheads, callbacks and unforeseen time.` });
    else findings.push({ level: "Good", title: "Healthy known margin", detail: `The recorded costs produce a ${margin.toFixed(1)}% gross margin before overheads and tax.` });

    if (!selected.validUntil) findings.push({ level: "Check", title: "No expiry date", detail: "Add a valid-until date to protect against supplier price changes and delayed decisions." });
    if (!selected.terms.trim()) findings.push({ level: "Action", title: "Terms are missing", detail: "Add payment terms, exclusions, variation rules and how long the quote remains valid." });
    else {
      if (!includesAny(selected.terms, ["variation", "additional work", "extra work"])) findings.push({ level: "Check", title: "Variation wording not detected", detail: "State that changes or extra work require approval and may be charged separately." });
      if (!includesAny(selected.terms, ["making good", "decoration", "decorating", "building work"])) findings.push({ level: "Check", title: "Making-good exclusion not detected", detail: "Clarify whether chasing, plastering, decorating and other building work are included or excluded." });
      if (!includesAny(selected.terms, ["payment", "deposit", "due", "invoice"])) findings.push({ level: "Check", title: "Payment wording not detected", detail: "Include deposit requirements, stage payments or when the final invoice is due." });
    }

    const testingText = `${selected.title} ${selected.notes} ${selected.terms} ${selected.items.map((item) => item.description).join(" ")}`;
    if (!includesAny(testingText, ["test", "testing", "certificate", "certification", "eic", "minor works", "eicr"])) findings.push({ level: "Check", title: "Testing or certification not mentioned", detail: "Confirm the required inspection, testing and certificate are allowed for and described." });

    if (!selected.notes.trim()) findings.push({ level: "Check", title: "No scope notes", detail: "Add assumptions, access requirements, customer-supplied items and key exclusions." });
    if (other.length) findings.push({ level: "Good", title: "Other charges separated", detail: `${other.length} additional charge line${other.length === 1 ? " is" : "s are"} clearly separated.` });

    const actions = findings.filter((item) => item.level === "Action").length;
    const checks = findings.filter((item) => item.level === "Check").length;
    const score = Math.max(0, Math.min(100, 100 - actions * 18 - checks * 7));
    return { subtotal, knownCost, grossProfit, margin, findings, actions, checks, score };
  }, [selected]);

  if (!documents.isReady) return <Card>Preparing quote review…</Card>;

  return <main className="space-y-6">
    <PageHeader
      eyebrow="JR AI"
      title="Quote review"
      description="Check pricing, margin, scope and commercial protections before a quote is sent. All findings still require your judgement."
      action={<Link href="/ai" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 text-sm font-semibold hover:bg-slate-800"><ArrowLeft className="size-4" />AI Office</Link>}
    />

    {!quotes.length ? <Card><FileSearch className="size-7 text-cyan-300" /><h2 className="mt-3 text-xl font-semibold">No quotes available</h2><p className="mt-2 text-sm text-slate-400">Create a quote first, then return here for a commercial review.</p><Link href="/quotes" className="mt-4 inline-block text-sm font-semibold text-cyan-300">Open quotes</Link></Card> : <>
      <Card>
        <label className="space-y-2 text-sm"><span className="font-semibold">Quote to review</span><select className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3" value={selected?.id || ""} onChange={(event) => setSelectedId(event.target.value)}>{quotes.map((quote) => <option key={quote.id} value={quote.id}>{quote.number} · {quote.title || "Untitled quote"} · {quote.status}</option>)}</select></label>
      </Card>

      {selected && review && <>
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <Card><Gauge className="size-5 text-cyan-300" /><p className="mt-3 text-sm text-slate-400">Review score</p><p className="mt-2 text-3xl font-bold">{review.score}/100</p></Card>
          <Card><PoundSterling className="size-5 text-cyan-300" /><p className="mt-3 text-sm text-slate-400">Quote subtotal</p><p className="mt-2 text-2xl font-bold">{money.format(review.subtotal)}</p></Card>
          <Card><ShieldCheck className="size-5 text-cyan-300" /><p className="mt-3 text-sm text-slate-400">Known costs</p><p className="mt-2 text-2xl font-bold">{money.format(review.knownCost)}</p></Card>
          <Card><CheckCircle2 className="size-5 text-emerald-300" /><p className="mt-3 text-sm text-slate-400">Known gross profit</p><p className="mt-2 text-2xl font-bold">{money.format(review.grossProfit)}</p></Card>
          <Card><AlertTriangle className="size-5 text-amber-300" /><p className="mt-3 text-sm text-slate-400">Known margin</p><p className="mt-2 text-2xl font-bold">{review.margin.toFixed(1)}%</p></Card>
        </section>

        <Card>
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-bold">Review findings</h2><p className="text-sm text-slate-400">{review.actions} actions and {review.checks} checks detected.</p></div><Link href={`/quotes/${selected.id}`} className="text-sm font-semibold text-cyan-300">Open quote</Link></div>
          <div className="mt-5 space-y-3">{review.findings.map((finding, index) => <div key={`${finding.title}-${index}`} className="rounded-xl border border-slate-800 bg-slate-950/60 p-4"><div className="flex items-start gap-3">{finding.level === "Good" ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-300" /> : <AlertTriangle className={`mt-0.5 size-5 shrink-0 ${finding.level === "Action" ? "text-red-300" : "text-amber-300"}`} />}<div><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${finding.level === "Good" ? "bg-emerald-500/10 text-emerald-300" : finding.level === "Action" ? "bg-red-500/10 text-red-300" : "bg-amber-500/10 text-amber-300"}`}>{finding.level}</span><h3 className="font-semibold">{finding.title}</h3></div><p className="mt-1 text-sm text-slate-400">{finding.detail}</p></div></div></div>)}</div>
        </Card>
      </>}
    </>}
  </main>;
}
