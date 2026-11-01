"use client";

import { useEffect, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import { paymentTermsText } from "../../lib/businessSettings";
import type { PricingDocument } from "../../lib/models";

const money = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });

interface PortalQuoteSummaryProps {
  document: PricingDocument;
  grossTotal: number | null;
  customerName?: string;
  depositText?: string;
}

export function PortalQuoteSummary({ document: quote, grossTotal, customerName, depositText }: PortalQuoteSummaryProps) {
  const [printing, setPrinting] = useState(false);
  const hasTotal = typeof grossTotal === "number" && Number.isFinite(grossTotal) && grossTotal >= 0;

  useEffect(() => {
    if (!printing) return;
    const finish = () => setPrinting(false);
    window.addEventListener("afterprint", finish);
    // Some phone browsers return from print before the system dialog closes.
    window.addEventListener("pointerdown", finish);
    window.addEventListener("keydown", finish);
    return () => {
      window.removeEventListener("afterprint", finish);
      window.removeEventListener("pointerdown", finish);
      window.removeEventListener("keydown", finish);
    };
  }, [printing]);

  const details = [
    ["Prepared for", customerName],
    ["Site address", quote.siteAddress],
    ["Valid until", quote.validUntil],
    ["Scope of work", quote.notes],
    ["Exclusions", quote.exclusions],
    ["Deposit required", hasTotal ? depositText : undefined],
    ["Payment terms", quote.paymentTerms && paymentTermsText(quote.paymentTerms)],
    ["Terms and conditions", quote.terms],
  ];
  const summary = <article className="space-y-4 break-words">
    <header>
      <p className="text-sm font-semibold">{quote.type} {quote.number}</p>
      <h3 className="text-lg font-bold">{quote.title}</h3>
    </header>
    <p>{hasTotal
      ? <><strong className="text-xl">{money.format(grossTotal)}</strong>{quote.vatEnabled ? " including VAT" : " total"}</>
      : "The office needs to confirm the total before you can accept this document."}</p>
    <dl className="space-y-3 text-sm">{details.map(([label, value]) => value ? <div key={label}>
      <dt className="font-semibold">{label}</dt>
      <dd className="whitespace-pre-line">{value}</dd>
    </div> : null)}</dl>
  </article>;

  function printQuote() {
    flushSync(() => setPrinting(true));
    try { window.print(); }
    catch (error) { setPrinting(false); throw error; }
  }

  return <div className="space-y-3">
    {summary}
    {hasTotal && <button type="button" onClick={printQuote} className="min-h-11 rounded-xl border border-slate-700 px-4 text-sm font-semibold">
      Print / save {quote.type.toLowerCase()} PDF
    </button>}
    {printing && hasTotal && createPortal(<div data-portal-quote-print>{summary}</div>, window.document.body)}
  </div>;
}
