"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, BriefcaseBusiness, CalendarDays, Download, ExternalLink, FileText, History, Paperclip, RotateCcw, TrendingUp, UserRound } from "lucide-react";
import { QuotePreview } from "../../../components/quotes/QuotePreview";
import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { StatusBadge } from "../../../components/ui/StatusBadge";
import { businessStorageKeys, defaultBusinessProfile, defaultDocumentBranding, defaultVatSettings } from "../../../lib/businessSettings";
import { useLocalStorageCollection } from "../../../lib/storage";
import type { Builder, BusinessProfile, Customer, DocumentBrandingSettings, Job, PricingDocument, VatSettings } from "../../../lib/models";

const money = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });

export default function PricingDocumentDetailPage() {
  const params = useParams<{ id: string }>();
  const documents = useLocalStorageCollection<PricingDocument>("jr-os-pricing-documents");
  const customers = useLocalStorageCollection<Customer>("jr-os-customers");
  const builders = useLocalStorageCollection<Builder>("jr-os-builders");
  const jobs = useLocalStorageCollection<Job>("jr-os-jobs");
  const profileStore = useLocalStorageCollection<BusinessProfile>(businessStorageKeys.profile, [defaultBusinessProfile]);
  const vatStore = useLocalStorageCollection<VatSettings>(businessStorageKeys.vat, [defaultVatSettings]);
  const brandingStore = useLocalStorageCollection<DocumentBrandingSettings>(businessStorageKeys.branding, [defaultDocumentBranding]);
  const [message, setMessage] = useState("");

  if (!documents.isReady || !customers.isReady || !builders.isReady || !jobs.isReady || !profileStore.isReady || !vatStore.isReady || !brandingStore.isReady) return <Card>Loading pricing document…</Card>;

  const document = documents.items.find((item) => item.id === params.id);
  if (!document) return <Card><p className="font-semibold">Pricing document not found.</p><Link href="/quotes" className="mt-3 inline-flex text-sm text-cyan-400 hover:text-cyan-300">Back to quotes and estimates</Link></Card>;

  const customer = customers.items.find((item) => item.id === document.customerId);
  const builder = builders.items.find((item) => item.id === document.builderId);
  const job = jobs.items.find((item) => item.id === document.jobId);
  const subtotal = document.profitability?.sellingPrice ?? document.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const vat = document.vatEnabled ? subtotal * document.vatRate / 100 : 0;
  const total = subtotal + vat;
  const profitability = document.profitability;
  const documentId = document.id;
  const revisions = document.revisions ?? [];
  const businessProfile = profileStore.items[0] ?? defaultBusinessProfile;
  const vatSettings = vatStore.items[0] ?? defaultVatSettings;
  const branding = brandingStore.items[0] ?? defaultDocumentBranding;

  function restoreRevision(revisionId: string) {
    const revision = revisions.find((item) => item.id === revisionId);
    if (!revision || !window.confirm(`Restore revision ${revision.revisionNumber}? The current version will remain in the history.`)) return;
    const now = new Date().toISOString();
    documents.setItems((current) => current.map((item) => item.id !== documentId ? item : {
      ...item,
      revisions: [...(item.revisions ?? []), {
        id: `revision_${Date.now()}`,
        revisionNumber: (item.revisions?.length ?? 0) + 1,
        savedAt: now,
        title: item.title,
        siteAddress: item.siteAddress,
        validUntil: item.validUntil,
        vatEnabled: item.vatEnabled,
        vatRate: item.vatRate,
        items: item.items,
        pricingSettings: item.pricingSettings,
        profitability: item.profitability,
        attachments: item.attachments,
        notes: item.notes,
        exclusions: item.exclusions,
        internalNotes: item.internalNotes,
        fixedPriceWorkflow: item.fixedPriceWorkflow,
        terms: item.terms,
        termsTemplateId: item.termsTemplateId,
        paymentTerms: item.paymentTerms,
        templateType: item.templateType,
      }],
      title: revision.title,
      siteAddress: revision.siteAddress,
      validUntil: revision.validUntil,
      vatEnabled: revision.vatEnabled,
      vatRate: revision.vatRate,
      items: revision.items,
      pricingSettings: revision.pricingSettings,
      profitability: revision.profitability,
      attachments: revision.attachments,
      notes: revision.notes,
      exclusions: revision.exclusions,
      internalNotes: revision.internalNotes,
      fixedPriceWorkflow: revision.fixedPriceWorkflow,
      terms: revision.terms,
      termsTemplateId: revision.termsTemplateId,
      paymentTerms: revision.paymentTerms,
      templateType: revision.templateType,
      updatedAt: now,
    }));
    setMessage(`Revision ${revision.revisionNumber} restored.`);
  }

  return <div className="space-y-6">
    <Link href="/quotes" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-cyan-300"><ArrowLeft className="size-4" />Back to quotes & estimates</Link>
    {message ? <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-300">{message}</div> : null}

    <Card className="border-cyan-400/30">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">{document.type} · {document.number}</p><h1 className="mt-2 text-3xl font-bold">{document.title}</h1><p className="mt-2 text-sm text-slate-500">Created {new Date(document.createdAt).toLocaleDateString("en-GB")}</p></div>
        <StatusBadge status={document.status} />
      </div>
    </Card>

    <section className="grid gap-4 lg:grid-cols-3">
      <Card><div className="flex items-center gap-2 text-cyan-400"><UserRound className="size-5" /><h2 className="font-semibold">Priced for</h2></div>{customer ? <div className="mt-4"><p className="font-bold">{customer.name}</p><p className="text-sm text-slate-400">{customer.email || customer.phone || "No contact details"}</p><Link href={`/customers/${customer.id}`} className="mt-3 inline-flex text-sm text-cyan-400 hover:text-cyan-300">Open customer</Link></div> : builder ? <div className="mt-4"><p className="font-bold">{builder.companyName}</p><p className="text-sm text-slate-400">{builder.contactName || builder.email || builder.phone || "No contact details"}</p><Link href={`/builders/${builder.id}`} className="mt-3 inline-flex text-sm text-cyan-400 hover:text-cyan-300">Open builder</Link></div> : <p className="mt-4 text-sm text-slate-500">No customer or builder linked.</p>}</Card>
      <Card><div className="flex items-center gap-2 text-cyan-400"><BriefcaseBusiness className="size-5" /><h2 className="font-semibold">Linked job</h2></div>{job ? <div className="mt-4"><p className="font-bold">{job.title}</p><p className="text-sm text-slate-400">{job.siteAddress}</p><Link href={`/jobs/${job.id}`} className="mt-3 inline-flex text-sm text-cyan-400 hover:text-cyan-300">Open job</Link></div> : <p className="mt-4 text-sm text-slate-500">No job linked.</p>}</Card>
      <Card><div className="flex items-center gap-2 text-cyan-400"><CalendarDays className="size-5" /><h2 className="font-semibold">Validity</h2></div><p className="mt-4 font-bold">{document.validUntil ? new Date(`${document.validUntil}T12:00:00`).toLocaleDateString("en-GB") : "No expiry date"}</p><p className="text-sm text-slate-500">Last updated {new Date(document.updatedAt).toLocaleDateString("en-GB")}</p></Card>
    </section>

    {profitability ? <section>
      <div className="mb-3 flex items-center gap-2"><TrendingUp className="size-5 text-emerald-300" /><h2 className="text-xl font-bold">Internal quote summary</h2></div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card><p className="text-sm text-slate-400">Cost price</p><p className="mt-2 text-2xl font-bold">{money.format(profitability.costPrice)}</p><p className="mt-2 text-xs text-slate-500">{money.format(profitability.overheadCost)} allocated overhead.</p></Card>
        <Card><p className="text-sm text-slate-400">Selling price</p><p className="mt-2 text-2xl font-bold">{money.format(profitability.sellingPrice)}</p><p className="mt-2 text-xs text-slate-500">Before VAT.</p></Card>
        <Card><p className="text-sm text-slate-400">Expected profit</p><p className={`mt-2 text-2xl font-bold ${profitability.expectedProfit >= 0 ? "text-emerald-300" : "text-red-300"}`}>{money.format(profitability.expectedProfit)}</p></Card>
        <Card><p className="text-sm text-slate-400">Gross / net margin</p><p className="mt-2 text-2xl font-bold"><span className="text-cyan-300">{profitability.grossMargin.toFixed(1)}%</span> / <span className={profitability.netMargin >= 0 ? "text-emerald-300" : "text-red-300"}>{profitability.netMargin.toFixed(1)}%</span></p></Card>
      </div>
    </section> : null}

    <Card>
      <div className="flex items-center gap-2 text-cyan-400"><FileText className="size-5" /><h2 className="font-semibold">Pricing breakdown</h2></div>
      <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead className="border-b border-slate-800 text-slate-500"><tr><th className="py-3 pr-4">Description</th><th className="py-3 pr-4">Category</th><th className="py-3 pr-4 text-right">Qty</th><th className="py-3 pr-4 text-right">Unit price</th><th className="py-3 text-right">Line total</th></tr></thead><tbody>{document.items.map((item) => <tr key={item.id} className="border-b border-slate-900"><td className="py-3 pr-4 font-medium">{item.description}</td><td className="py-3 pr-4 text-slate-400">{item.category}</td><td className="py-3 pr-4 text-right">{item.quantity}</td><td className="py-3 pr-4 text-right">{money.format(item.unitPrice)}</td><td className="py-3 text-right font-semibold">{money.format(item.quantity * item.unitPrice)}</td></tr>)}{document.pricingSettings?.travelPrice ? <tr className="border-b border-slate-900"><td className="py-3 pr-4 font-medium">Travel allowance</td><td className="py-3 pr-4 text-slate-400">Other</td><td className="py-3 pr-4 text-right">1</td><td className="py-3 pr-4 text-right">{money.format(document.pricingSettings.travelPrice)}</td><td className="py-3 text-right font-semibold">{money.format(document.pricingSettings.travelPrice)}</td></tr> : null}{document.pricingSettings?.parkingPrice ? <tr className="border-b border-slate-900"><td className="py-3 pr-4 font-medium">Parking allowance</td><td className="py-3 pr-4 text-slate-400">Other</td><td className="py-3 pr-4 text-right">1</td><td className="py-3 pr-4 text-right">{money.format(document.pricingSettings.parkingPrice)}</td><td className="py-3 text-right font-semibold">{money.format(document.pricingSettings.parkingPrice)}</td></tr> : null}{document.pricingSettings?.contingencyPercent ? <tr className="border-b border-slate-900"><td className="py-3 pr-4 font-medium">Works contingency allowance</td><td className="py-3 pr-4 text-slate-400">Other</td><td className="py-3 pr-4 text-right">{document.pricingSettings.contingencyPercent}%</td><td className="py-3 pr-4 text-right">—</td><td className="py-3 text-right font-semibold">{money.format(document.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0) * document.pricingSettings.contingencyPercent / 100)}</td></tr> : null}</tbody></table></div>
      <div className="ml-auto mt-5 max-w-sm space-y-2 border-t border-slate-800 pt-4 text-sm"><div className="flex justify-between text-slate-400"><span>Subtotal</span><span>{money.format(subtotal)}</span></div>{document.vatEnabled ? <div className="flex justify-between text-slate-400"><span>VAT ({document.vatRate}%)</span><span>{money.format(vat)}</span></div> : null}<div className="flex justify-between text-xl font-bold"><span>Total</span><span>{money.format(total)}</span></div></div>
    </Card>

    <section className="grid gap-4 lg:grid-cols-3"><Card><h2 className="font-semibold">Customer scope</h2><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-400">{document.notes || "No scope added."}</p></Card><Card><h2 className="font-semibold">Exclusions</h2><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-400">{document.exclusions || "No exclusions added."}</p></Card><Card><h2 className="font-semibold">Internal notes</h2><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-400">{document.internalNotes || "No internal notes added."}</p></Card></section>

    {document.attachments?.length ? <Card><div className="flex items-center gap-2 text-cyan-300"><Paperclip className="size-5" /><div><h2 className="font-semibold">Quote attachments</h2><p className="text-sm text-slate-500">These files and links follow the quote into its live job.</p></div></div><div className="mt-4 grid gap-2 md:grid-cols-2">{document.attachments.map((attachment) => <div key={attachment.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 p-3"><div className="min-w-0"><p className="truncate font-semibold">{attachment.name}</p><p className="mt-1 truncate text-xs text-slate-500">{attachment.fileName || attachment.externalUrl}</p></div><div className="flex shrink-0">{attachment.dataUrl ? <a href={attachment.dataUrl} download={attachment.fileName || attachment.name} aria-label={`Download ${attachment.name}`} className="rounded-lg p-2 text-slate-500 hover:bg-slate-800 hover:text-cyan-300"><Download className="size-4" /></a> : null}{attachment.externalUrl ? <a href={attachment.externalUrl} target="_blank" rel="noreferrer" aria-label={`Open ${attachment.name}`} className="rounded-lg p-2 text-slate-500 hover:bg-slate-800 hover:text-cyan-300"><ExternalLink className="size-4" /></a> : null}</div></div>)}</div></Card> : null}

    <section><div className="mb-3 flex items-center gap-2"><FileText className="size-5 text-cyan-300" /><div><h2 className="text-xl font-bold">Final document preview</h2><p className="text-sm text-slate-500">Customer-facing layout used for the quote PDF.</p></div></div><QuotePreview number={document.number} documentType={document.type} title={document.title} customer={customer} builder={builder} siteAddress={document.siteAddress} validUntil={document.validUntil} items={document.items} notes={document.notes} exclusions={document.exclusions} terms={document.terms} paymentTerms={document.paymentTerms} vatEnabled={document.vatEnabled} vatRate={document.vatRate} subtotal={subtotal} businessProfile={businessProfile} vatSettings={vatSettings} branding={branding} /></section>

    <Card>
      <div className="flex items-center gap-2 text-violet-300"><History className="size-5" /><div><h2 className="font-semibold">Version history</h2><p className="text-sm text-slate-500">Every saved edit keeps the previous customer-facing version.</p></div></div>
      {!document.revisions?.length ? <p className="mt-4 text-sm text-slate-500">No previous revisions yet. Editing and saving this quote will create the first revision.</p> : <div className="mt-4 space-y-3">{document.revisions.toReversed().map((revision) => <div key={revision.id} className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold">Revision {revision.revisionNumber} · {revision.title}</p><p className="mt-1 text-xs text-slate-500">Saved {new Date(revision.savedAt).toLocaleString("en-GB")} · {revision.items.length} sections/lines</p></div><Button type="button" variant="secondary" onClick={() => restoreRevision(revision.id)}><RotateCcw className="mr-2 size-4" />Restore</Button></div>)}</div>}
    </Card>
  </div>;
}
