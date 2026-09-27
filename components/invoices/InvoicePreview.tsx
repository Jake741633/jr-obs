import { defaultBusinessProfile, defaultDocumentBranding, defaultVatSettings } from "../../lib/businessSettings";
import type { Builder, BusinessProfile, Customer, DocumentBrandingSettings, PricingLineItem, VatSettings } from "../../lib/models";
import { BusinessDocumentFooter, BusinessDocumentHeader } from "../documents/BusinessDocumentHeader";

const money = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });

interface InvoicePreviewProps {
  number: string;
  title: string;
  customer?: Customer;
  builder?: Builder;
  issueDate: string;
  dueDate: string;
  items: PricingLineItem[];
  notes: string;
  paymentTermsText?: string;
  paymentDetails: string;
  vatEnabled: boolean;
  vatRate: number;
  businessProfile?: BusinessProfile;
  vatSettings?: VatSettings;
  branding?: DocumentBrandingSettings;
}

function displayDate(value: string) {
  return value ? new Date(`${value}T12:00:00`).toLocaleDateString("en-GB") : "To be confirmed";
}

export function InvoicePreview({
  number,
  title,
  customer,
  builder,
  issueDate,
  dueDate,
  items,
  notes,
  paymentTermsText,
  paymentDetails,
  vatEnabled,
  vatRate,
  businessProfile = defaultBusinessProfile,
  vatSettings = defaultVatSettings,
  branding = defaultDocumentBranding,
}: InvoicePreviewProps) {
  const recipient = customer?.name || builder?.companyName || "Customer name";
  const address = customer?.address || builder?.address || "Customer address";
  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const vat = vatEnabled ? subtotal * vatRate / 100 : 0;

  return <div className="overflow-hidden rounded-2xl border border-slate-300 bg-white text-slate-900 shadow-2xl print:rounded-none print:border-0 print:shadow-none">
    <BusinessDocumentHeader documentLabel={branding.invoiceHeading} number={number} profile={businessProfile} vat={vatSettings} branding={branding} />
    <div className="grid gap-6 px-6 py-6 sm:grid-cols-2 sm:px-9">
      <div><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Invoice to</p><p className="mt-2 font-bold">{recipient}</p><p className="whitespace-pre-line text-sm text-slate-600">{address}</p></div>
      <div className="sm:text-right"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Issue date</p><p className="mt-1 font-semibold">{displayDate(issueDate)}</p><p className="mt-4 text-xs font-bold uppercase tracking-wider text-slate-500">Payment due</p><p className="mt-1 font-semibold">{displayDate(dueDate)}</p></div>
    </div>
    <div className="px-6 sm:px-9"><h2 className="text-xl font-bold">{title || "Invoice title"}</h2>{notes ? <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-600">{notes}</p> : null}</div>
    <div className="px-6 py-7 sm:px-9">
      <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-left text-sm"><thead><tr className="border-b-2" style={{ borderColor: branding.primaryColour }}><th className="py-3 pr-3">Description</th><th className="py-3 pr-3 text-right">Qty</th><th className="py-3 pr-3 text-right">Unit price</th><th className="py-3 text-right">Total</th></tr></thead><tbody>{items.map((item) => <tr key={item.id} className="border-b border-slate-200"><td className="py-3 pr-3 font-medium">{item.description}</td><td className="py-3 pr-3 text-right">{item.quantity}</td><td className="py-3 pr-3 text-right">{money.format(item.unitPrice)}</td><td className="py-3 text-right font-semibold">{money.format(item.quantity * item.unitPrice)}</td></tr>)}</tbody></table></div>
      {!items.length ? <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">Add invoice lines to see the final layout.</p> : null}
      <div className="ml-auto mt-5 max-w-sm border-t-2 border-slate-900 pt-3">
        <div className="flex justify-between py-1 text-sm"><span>Subtotal</span><strong>{money.format(subtotal)}</strong></div>
        {vatEnabled ? <div className="flex justify-between py-1 text-sm"><span>VAT ({vatRate}%)</span><strong>{money.format(vat)}</strong></div> : null}
        <div className="mt-2 flex justify-between border-t border-slate-300 pt-3 text-lg"><span>Total</span><strong>{money.format(subtotal + vat)}</strong></div>
      </div>
    </div>
    <div className="grid gap-5 bg-slate-50 px-6 py-6 text-xs leading-5 text-slate-600 sm:grid-cols-2 sm:px-9">
      <div><p className="font-bold uppercase tracking-wider text-slate-800">Payment terms</p><p className="mt-1 whitespace-pre-line">{paymentTermsText || "Payment due on completion"}</p></div>
      <div><p className="font-bold uppercase tracking-wider text-slate-800">Bank details</p><p className="mt-1 whitespace-pre-line">{paymentDetails || "Payment details will appear here."}</p></div>
    </div>
    <BusinessDocumentFooter text={branding.footerText} accentColour={branding.accentColour} />
  </div>;
}
