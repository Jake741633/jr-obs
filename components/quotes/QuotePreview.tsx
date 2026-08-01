"use client";

import { defaultBusinessProfile, defaultDocumentBranding, defaultVatSettings, paymentTermsText } from "../../lib/businessSettings";
import {
  defaultQuotePresentationSettings,
  presentationOverrideFor,
  quotePresentationOverridesStorageKey,
  visibleQuoteItems,
  type QuotePresentationOverrideRecord,
  type QuotePresentationSettings,
} from "../../lib/quotePresentation";
import { useQuotePresentationDefaults } from "../../lib/useQuotePresentationDefaults";
import { useCloudLocalCollection } from "../../lib/storage";
import type { Builder, BusinessProfile, Customer, DocumentBrandingSettings, PricingLineItem, QuotePaymentTerms, VatSettings } from "../../lib/models";
import { BusinessDocumentFooter, BusinessDocumentHeader } from "../documents/BusinessDocumentHeader";

const money = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const sectionOrder: PricingLineItem["category"][] = ["Labour", "Materials", "Travel", "Parking", "Plant Hire", "Contingency", "Other"];

interface QuotePreviewProps {
  number: string;
  documentType: "Quote" | "Estimate";
  title: string;
  customer?: Customer;
  builder?: Builder;
  siteAddress?: string;
  validUntil: string;
  items: PricingLineItem[];
  notes: string;
  terms: string;
  paymentTerms?: QuotePaymentTerms;
  vatEnabled: boolean;
  vatRate: number;
  subtotal: number;
  businessProfile?: BusinessProfile;
  vatSettings?: VatSettings;
  branding?: DocumentBrandingSettings;
  presentation?: QuotePresentationSettings;
}

export function QuotePreview({ number, documentType, title, customer, builder, siteAddress, validUntil, items, notes, terms, paymentTerms, vatEnabled, vatRate, subtotal, businessProfile = defaultBusinessProfile, vatSettings = defaultVatSettings, branding = defaultDocumentBranding, presentation }: QuotePreviewProps) {
  const defaults = useQuotePresentationDefaults();
  const overrides = useCloudLocalCollection<QuotePresentationOverrideRecord>(quotePresentationOverridesStorageKey);
  const savedOverride = presentationOverrideFor(overrides.items, number);
  const effectivePresentation = presentation ?? savedOverride ?? defaults.settings ?? defaultQuotePresentationSettings;
  const recipient = customer?.name || builder?.companyName || "Customer name";
  const address = customer?.address || builder?.address || "Customer address";
  const vat = vatEnabled ? subtotal * vatRate / 100 : 0;
  const visibleItems = visibleQuoteItems(items, effectivePresentation);
  const grouped = sectionOrder
    .map((section) => ({ section, items: visibleItems.filter((item) => item.category === section) }))
    .filter((group) => group.items.length);
  const fixedPrice = effectivePresentation.mode === "Fixed price";

  return <div className="overflow-hidden rounded-2xl border border-slate-300 bg-white text-slate-900 shadow-2xl print:rounded-none print:border-0 print:shadow-none">
    <BusinessDocumentHeader documentLabel={documentType === "Quote" ? branding.quoteHeading : "Estimate"} number={number} profile={businessProfile} vat={vatSettings} branding={branding} />
    <div className="grid gap-6 px-6 py-6 sm:grid-cols-2 sm:px-9">
      <div><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Prepared for</p><p className="mt-2 font-bold">{recipient}</p><p className="whitespace-pre-line text-sm text-slate-600">{address}</p></div>
      <div className="sm:text-right"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Valid until</p><p className="mt-2 font-semibold">{validUntil ? new Date(`${validUntil}T00:00:00`).toLocaleDateString("en-GB") : "To be confirmed"}</p>{siteAddress ? <><p className="mt-4 text-xs font-bold uppercase tracking-wider text-slate-500">Site address</p><p className="mt-1 whitespace-pre-line text-sm text-slate-600">{siteAddress}</p></> : null}</div>
    </div>
    <div className="px-6 sm:px-9"><h2 className="text-xl font-bold">{title || "Quote title"}</h2>{notes ? <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-600">{notes}</p> : null}</div>
    <div className="space-y-5 px-6 py-7 sm:px-9">
      {fixedPrice ? <section className="rounded-xl border border-slate-200 bg-slate-50 p-5">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Fixed price for the described works</p>
        <div className="mt-3 flex items-end justify-between gap-4"><span className="text-sm text-slate-600">Complete scope as described above</span><strong className="text-2xl">{money.format(subtotal + vat)}</strong></div>
        {vatEnabled && effectivePresentation.showVatLine ? <p className="mt-2 text-right text-xs text-slate-500">Includes {money.format(vat)} VAT at {vatRate}%</p> : null}
      </section> : grouped.length ? grouped.map((group) => <section key={group.section}>
        <h3 className="border-b-2 pb-2 text-sm font-bold uppercase tracking-wider" style={{ borderColor: branding.primaryColour, color: branding.primaryColour }}>{group.section}</h3>
        <div className="divide-y divide-slate-200">{group.items.map((item) => <div key={item.id} className="grid grid-cols-[1fr_auto] gap-4 py-3 text-sm"><div><p className="font-medium">{item.description}</p>{effectivePresentation.showQuantities || effectivePresentation.showUnitPrices ? <p className="mt-0.5 text-xs text-slate-500">{effectivePresentation.showQuantities ? `${item.quantity}` : ""}{effectivePresentation.showQuantities && effectivePresentation.showUnitPrices ? " × " : ""}{effectivePresentation.showUnitPrices ? money.format(item.unitPrice) : ""}</p> : null}</div><p className="font-semibold">{money.format(item.quantity * item.unitPrice)}</p></div>)}</div>
      </section>) : <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">The customer-facing breakdown is hidden. The fixed total remains visible below.</p>}
      {!fixedPrice ? <div className="ml-auto max-w-sm border-t-2 border-slate-900 pt-3">
        {effectivePresentation.showSubtotal ? <div className="flex justify-between py-1 text-sm"><span>Subtotal</span><strong>{money.format(subtotal)}</strong></div> : null}
        {vatEnabled && effectivePresentation.showVatLine ? <div className="flex justify-between py-1 text-sm"><span>VAT ({vatRate}%)</span><strong>{money.format(vat)}</strong></div> : null}
        <div className="mt-2 flex justify-between border-t border-slate-300 pt-3 text-lg"><span>Total</span><strong>{money.format(subtotal + vat)}</strong></div>
      </div> : null}
    </div>
    <div className="grid gap-5 bg-slate-50 px-6 py-6 text-xs leading-5 text-slate-600 sm:grid-cols-2 sm:px-9">
      <div><p className="font-bold uppercase tracking-wider text-slate-800">Payment terms</p><p className="mt-1 whitespace-pre-line">{paymentTermsText(paymentTerms)}</p></div>
      <div><p className="font-bold uppercase tracking-wider text-slate-800">Terms & conditions</p><p className="mt-1 whitespace-pre-line">{terms || "No terms selected."}</p></div>
    </div>
    <BusinessDocumentFooter text={branding.footerText} accentColour={branding.accentColour} />
  </div>;
}
