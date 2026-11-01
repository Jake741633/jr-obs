import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { loadLocalTs } from "./helpers/load-local-ts.mjs";

const doc = { number: "Q-14", type: "Quote", title: "Kitchen supply", siteAddress: "Test site",
  validUntil: "2026-12-01", notes: "Supply and test", exclusions: "Making good excluded", terms: "Access arranged by customer",
  paymentTerms: { type: "Due on completion", description: "Pay by bank transfer" }, vatEnabled: true, vatRate: 20,
  internalNotes: "PRIVATE SUPPLIER DISCOUNT", items: [{ id: "m", category: "Materials", description: "Unpublished component", quantity: 1, unitCost: 79, unitPrice: 113 }] };
const ui = name => new URL("../components/quotes/" + name + ".tsx", import.meta.url);
const jsxDeps = { react: React, "react/jsx-runtime": jsx, "react-dom": {}, "next/image": () => null };
const render = (component, props) => renderToStaticMarkup(React.createElement(component, props));

test("customer portal quote contains the agreed scope, terms and payable total only", () => {
  const { PortalQuoteSummary } = loadLocalTs(ui("PortalQuoteSummary"), jsxDeps);
  const html = render(PortalQuoteSummary, { document: doc, grossTotal: 243.60 });
  for (const value of ["Q-14", "Kitchen supply", "Test site", "Supply and test", "Making good excluded",
    "Access arranged by customer", "Pay by bank transfer", "£243.60", "Print"]) assert.ok(html.includes(value), value);
  assert.doesNotMatch(html, /PRIVATE SUPPLIER|Unpublished component|£79|£113/);
  const unverified = render(PortalQuoteSummary, { document: doc, grossTotal: null });
  assert.doesNotMatch(unverified, /£0\.00|<button/);
  assert.match(render(PortalQuoteSummary, { document: doc, grossTotal: 0 }), /£0\.00/);
});

test("customer PDF ignores private switches in saved profiles and explicit presentations", () => {
  const privateProfile = { mode: "Itemised", showMaterials: true, showLineTotals: true, showCostPrices: true, showInternalNotes: true, showOverheads: true, showMarkup: true };
  const { QuotePreview } = loadLocalTs(ui("QuotePreview"), { ...jsxDeps,
    "../../lib/useQuotePresentationDefaults": { useQuotePresentationDefaults: () => ({ settings: {} }) },
    "../../lib/storage": { useCloudLocalCollection: () => ({ items: [{ documentNumber: "Q-14", profiles: { Customer: privateProfile } }] }) } });
  const props = { ...doc, documentType: doc.type, subtotal: 113, audience: "Customer" };
  for (const presentation of [undefined, privateProfile]) {
    const html = render(QuotePreview, { ...props, presentation });
    assert.match(html, /Unpublished component/);
    assert.doesNotMatch(html, /PRIVATE SUPPLIER|Internal cost|£79\.00/);
  }
  assert.match(render(QuotePreview, { ...props, audience: "Internal", presentation: privateProfile }), /PRIVATE SUPPLIER/);
});
