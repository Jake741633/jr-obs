"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  FilePenLine,
  Mic2,
  Save,
  Sparkles,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { AiConfidenceScore } from "../../../components/ai/AiConfidenceScore";
import { AiToolNav } from "../../../components/ai/AiToolNav";
import { WhyRecommendation } from "../../../components/ai/WhyRecommendation";
import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { InputField, TextareaField } from "../../../components/ui/FormField";
import { PageHeader } from "../../../components/ui/PageHeader";
import { buildAiQuoteDraft, type AiQuoteDraft } from "../../../lib/aiCommandCentre";
import {
  businessStorageKeys,
  defaultPaymentTermsTemplates,
  defaultVatSettings,
  paymentTermsFromTemplate,
} from "../../../lib/businessSettings";
import { calculateQuoteProfitability, defaultQuotePricingSettings } from "../../../lib/quoteEngine";
import { defaultBusinessTermsTemplates } from "../../../lib/quoteTemplates";
import { makeId, useLocalStorageCollection } from "../../../lib/storage";
import { nextPricingDocumentNumber } from "../../../lib/workflow";
import type {
  Builder,
  BusinessOverhead,
  BusinessTermsTemplate,
  Customer,
  Invoice,
  Job,
  JobPack,
  LabourCostSettings,
  LabourRate,
  Material,
  PaymentTermsTemplate,
  PricingDocument,
  PricingLineItem,
  QuotePricingSettings,
  QuoteTemplateType,
  VatSettings,
} from "../../../lib/models";

const money = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const jobTypes: Array<"" | QuoteTemplateType> = ["", "Domestic", "Commercial", "Rewire", "EICR", "Consumer Unit", "Fault Finding"];
const defaultLabourSettings: LabourCostSettings = {
  id: "labour-cost-settings",
  workingDaysPerYear: 220,
  billableHoursPerDay: 7.5,
  targetNetMargin: 25,
  contingencyPercent: 10,
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
};
const startingNotes = "";

function addDays(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export default function AiQuoteBuilderPage() {
  const documents = useLocalStorageCollection<PricingDocument>("jr-os-pricing-documents");
  const customers = useLocalStorageCollection<Customer>("jr-os-customers");
  const builders = useLocalStorageCollection<Builder>("jr-os-builders");
  const jobs = useLocalStorageCollection<Job>("jr-os-jobs");
  const invoices = useLocalStorageCollection<Invoice>("jr-os-invoices");
  const materials = useLocalStorageCollection<Material>("jr-os-materials");
  const jobPacks = useLocalStorageCollection<JobPack>("jr-os-job-packs");
  const labourRates = useLocalStorageCollection<LabourRate>("jr-os-labour-rates");
  const overheads = useLocalStorageCollection<BusinessOverhead>("jr-os-business-overheads");
  const labourSettingsStore = useLocalStorageCollection<LabourCostSettings>("jr-os-labour-cost-settings", [defaultLabourSettings]);
  const quoteSettingsStore = useLocalStorageCollection<QuotePricingSettings>("jr-os-quote-engine-settings", [defaultQuotePricingSettings]);
  const termsStore = useLocalStorageCollection<BusinessTermsTemplate>("jr-os-business-terms-templates", defaultBusinessTermsTemplates);
  const paymentTermsStore = useLocalStorageCollection<PaymentTermsTemplate>(businessStorageKeys.paymentTerms, defaultPaymentTermsTemplates);
  const vatStore = useLocalStorageCollection<VatSettings>(businessStorageKeys.vat, [defaultVatSettings]);
  const [sourceMode, setSourceMode] = useState<"Typed notes" | "Voice transcript">("Typed notes");
  const [notes, setNotes] = useState(startingNotes);
  const [jobType, setJobType] = useState<"" | QuoteTemplateType>("");
  const [customerId, setCustomerId] = useState("");
  const [builderId, setBuilderId] = useState("");
  const [jobId, setJobId] = useState("");
  const [siteAddress, setSiteAddress] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [termsTemplateId, setTermsTemplateId] = useState("");
  const [paymentTermsTemplateId, setPaymentTermsTemplateId] = useState("");
  const [draft, setDraft] = useState<AiQuoteDraft | null>(null);
  const [message, setMessage] = useState("");

  const labourSettings = labourSettingsStore.items[0] ?? defaultLabourSettings;
  const quoteSettings = quoteSettingsStore.items[0] ?? defaultQuotePricingSettings;
  const vatSettings = vatStore.items[0] ?? defaultVatSettings;
  const ready = [
    documents, customers, builders, jobs, invoices, materials, jobPacks, labourRates, overheads,
    labourSettingsStore, quoteSettingsStore, termsStore, paymentTermsStore, vatStore,
  ].every((store) => store.isReady);

  function selectCustomer(id: string) {
    const customer = customers.items.find((item) => item.id === id);
    setCustomerId(id);
    setBuilderId("");
    if (customer?.address) setSiteAddress(customer.address);
  }

  function selectBuilder(id: string) {
    const builder = builders.items.find((item) => item.id === id);
    setBuilderId(id);
    setCustomerId("");
    if (builder?.address) setSiteAddress(builder.address);
  }

  function selectJob(id: string) {
    const job = jobs.items.find((item) => item.id === id);
    setJobId(id);
    if (!job) return;
    setCustomerId(job.customerId ?? "");
    setBuilderId(job.builderId ?? "");
    setSiteAddress(job.siteAddress);
    setNotes((current) => current || `${job.title}\n${job.notes}`);
  }

  function generateDraft() {
    if (!notes.trim()) {
      setMessage("Add typed job notes or paste a voice transcript first.");
      return;
    }
    const generated = buildAiQuoteDraft({
      notes,
      jobType,
      materials: materials.items,
      documents: documents.items,
      jobs: jobs.items,
      invoices: invoices.items,
      jobPacks: jobPacks.items,
      labourRates: labourRates.items,
      overheads: overheads.items,
      labourSettings,
      quoteSettings,
      createId: makeId,
    });
    setDraft(generated);
    setJobType(generated.jobType);
    setValidUntil((current) => current || addDays(30));
    const defaultTerms = termsStore.items.find((template) => template.active && template.name.toLowerCase().includes(generated.jobType.toLowerCase()))
      ?? termsStore.items.find((template) => template.active);
    const defaultPayment = paymentTermsStore.items.find((template) => template.active && template.isDefault)
      ?? paymentTermsStore.items.find((template) => template.active);
    setTermsTemplateId((current) => current || defaultTerms?.id || "");
    setPaymentTermsTemplateId((current) => current || defaultPayment?.id || "");
    setMessage(`Draft prepared as ${generated.jobType}. Review every quantity, allowance and exclusion before saving.`);
  }

  function updateItems(nextItems: PricingLineItem[]) {
    if (!draft) return;
    setDraft({
      ...draft,
      items: nextItems,
      profitability: calculateQuoteProfitability(nextItems, draft.pricingSettings, overheads.items, labourSettings),
    });
  }

  function updateLine(id: string, patch: Partial<PricingLineItem>) {
    if (!draft) return;
    updateItems(draft.items.map((item) => item.id === id ? { ...item, ...patch } : item));
  }

  function saveDraft() {
    if (!draft) {
      setMessage("Generate the AI draft first.");
      return;
    }
    if (!customerId && !builderId) {
      setMessage("Choose a customer or builder before saving the quote.");
      return;
    }
    if (!draft.title.trim() || !draft.items.length) {
      setMessage("The quote needs a title and at least one priced line.");
      return;
    }
    const termsTemplate = termsStore.items.find((template) => template.id === termsTemplateId && template.active);
    const paymentTemplate = paymentTermsStore.items.find((template) => template.id === paymentTermsTemplateId && template.active);
    const now = new Date().toISOString();
    const profitability = calculateQuoteProfitability(draft.items, draft.pricingSettings, overheads.items, labourSettings);
    const document: PricingDocument = {
      id: makeId("doc"),
      number: nextPricingDocumentNumber(documents.items, "Quote"),
      type: "Quote",
      status: "Draft",
      customerId: customerId || undefined,
      builderId: builderId || undefined,
      jobId: jobId || undefined,
      title: draft.title.trim(),
      siteAddress: siteAddress.trim() || undefined,
      validUntil: validUntil || addDays(30),
      vatEnabled: vatSettings.registrationStatus === "VAT registered",
      vatRate: vatSettings.defaultRate,
      items: draft.items,
      pricingSettings: draft.pricingSettings,
      profitability: {
        directCost: profitability.directCost,
        overheadCost: profitability.overheadCost,
        costPrice: profitability.costPrice,
        sellingPrice: profitability.sellingPrice,
        grossProfit: profitability.grossProfit,
        expectedProfit: profitability.expectedProfit,
        grossMargin: profitability.grossMargin,
        netMargin: profitability.netMargin,
        calculatedAt: now,
      },
      attachments: [],
      notes: draft.notes,
      terms: termsTemplate?.content ?? "Scope, access, testing, certification, exclusions and variations must be confirmed before work starts.",
      termsTemplateId: termsTemplate?.id,
      paymentTerms: paymentTemplate ? paymentTermsFromTemplate(paymentTemplate) : { type: "Due on completion" },
      templateType: draft.jobType,
      revisions: [],
      createdAt: now,
      updatedAt: now,
    };
    documents.setItems((current) => [document, ...current]);
    setMessage(`${document.number} saved to Quotes as a draft. Open it in Quote Engine 2.0 for final review and preview.`);
  }

  if (!ready) return <Card>Preparing AI Quote Builder…</Card>;

  return (
    <main className="space-y-6">
      <PageHeader
        eyebrow="AI Command Centre"
        title="AI Quote Builder"
        description="Turn rough typed notes or a voice-note transcript into a reviewable Quote Engine 2.0 draft using saved labour rates, materials, overheads and business defaults."
        action={<Link href="/ai" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 text-sm font-semibold hover:bg-slate-800"><ArrowLeft className="size-4" />Command Centre</Link>}
      />

      <AiToolNav />

      {message ? <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 px-4 py-3 text-sm text-cyan-200">{message}</div> : null}

      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-6">
          <Card>
            <div className="grid gap-2 rounded-xl bg-slate-950 p-2 sm:grid-cols-2">
              {(["Typed notes", "Voice transcript"] as const).map((mode) => (
                <button key={mode} type="button" onClick={() => setSourceMode(mode)} className={`min-h-11 rounded-lg px-4 text-sm font-semibold ${sourceMode === mode ? "bg-cyan-400 text-slate-950" : "text-slate-400 hover:bg-slate-800"}`}>
                  {mode === "Voice transcript" ? <Mic2 className="mr-2 inline size-4" /> : <FilePenLine className="mr-2 inline size-4" />}{mode}
                </button>
              ))}
            </div>
            <div className="mt-5">
              <TextareaField
                label={sourceMode === "Voice transcript" ? "Voice transcript" : "Job notes"}
                className="min-h-60"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder={sourceMode === "Voice transcript"
                  ? "Paste the transcript from your voice note here. Include quantities, access, customer requests, testing and exclusions where known."
                  : "Example: Replace consumer unit with RCBO board and SPD. Existing board under stairs. Allow for testing, labels and certification. Customer wants work on a Friday."}
              />
              {sourceMode === "Voice transcript" ? <p className="mt-2 text-xs text-slate-500">Use your phone&apos;s dictation or transcription, then paste the words here. JR OS never sends audio in this local-first version.</p> : null}
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-medium text-slate-300">
                <span>Job type</span>
                <select value={jobType} onChange={(event) => setJobType(event.target.value as "" | QuoteTemplateType)} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3">
                  {jobTypes.map((type) => <option key={type || "auto"} value={type}>{type || "Detect automatically"}</option>)}
                </select>
              </label>
              <label className="grid gap-2 text-sm font-medium text-slate-300">
                <span>Existing job (optional)</span>
                <select value={jobId} onChange={(event) => selectJob(event.target.value)} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3">
                  <option value="">No linked job</option>
                  {jobs.items.map((job) => <option key={job.id} value={job.id}>{job.title}</option>)}
                </select>
              </label>
              <label className="grid gap-2 text-sm font-medium text-slate-300">
                <span>Customer</span>
                <select value={customerId} onChange={(event) => selectCustomer(event.target.value)} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3">
                  <option value="">No customer</option>
                  {customers.items.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
                </select>
              </label>
              <label className="grid gap-2 text-sm font-medium text-slate-300">
                <span>Builder</span>
                <select value={builderId} onChange={(event) => selectBuilder(event.target.value)} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3">
                  <option value="">No builder</option>
                  {builders.items.map((builder) => <option key={builder.id} value={builder.id}>{builder.companyName}</option>)}
                </select>
              </label>
              <InputField label="Site address" value={siteAddress} onChange={(event) => setSiteAddress(event.target.value)} />
              <InputField label="Valid until" type="date" value={validUntil} onChange={(event) => setValidUntil(event.target.value)} />
            </div>
            <Button className="mt-5 w-full" onClick={generateDraft}><Sparkles className="mr-2 size-4" />Create AI draft</Button>
          </Card>

          {draft ? (
            <Card>
              <div className="flex items-center gap-3"><CheckCircle2 className="size-6 text-emerald-300" /><div><h2 className="text-xl font-bold">Detected scope</h2><p className="text-sm text-slate-500">{draft.jobType} · {draft.pricing.evidenceCount} similar pricing record{draft.pricing.evidenceCount === 1 ? "" : "s"}</p></div></div>
              <InputField className="mt-5" label="Quote title" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
              <div className="mt-4 space-y-2">
                {draft.scopeItems.length ? draft.scopeItems.map((item, index) => <p key={`${item}-${index}`} className="rounded-lg bg-slate-950 px-3 py-2 text-sm text-slate-300">{item}</p>) : <p className="text-sm text-slate-500">No separate scope items were detected. Add more detail before sending.</p>}
              </div>
              <div className="mt-5"><AiConfidenceScore confidence={draft.pricing.confidence} compact /></div>
              <div className="mt-5 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-100"><TriangleAlert className="mb-2 size-5 text-amber-300" />This is a drafting aid. Verify design, quantities, access, regulations, testing, certification and exclusions yourself.</div>
            </Card>
          ) : null}
        </div>

        <div className="space-y-6">
          {!draft ? (
            <Card className="grid min-h-96 place-items-center border-dashed text-center">
              <div><Sparkles className="mx-auto size-10 text-slate-700" /><h2 className="mt-4 text-xl font-bold">Your draft will appear here</h2><p className="mt-2 max-w-md text-sm text-slate-500">JR OS will use job history, job packs, saved materials, Labour & Costs and Quote Engine defaults.</p></div>
            </Card>
          ) : (
            <>
              <Card>
                <div className="flex items-center justify-between gap-3"><div><h2 className="text-xl font-bold">Draft pricing lines</h2><p className="text-sm text-slate-500">Everything remains editable before it reaches Quotes.</p></div><span className="rounded-full bg-violet-500/10 px-3 py-1 text-xs font-semibold text-violet-300">{draft.items.length} lines</span></div>
                <div className="mt-5 space-y-3">
                  {draft.items.map((item) => (
                    <div key={item.id} className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
                      <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">{item.category}</p><p className="mt-1 font-medium">{item.description}</p></div><button type="button" onClick={() => updateItems(draft.items.filter((line) => line.id !== item.id))} className="rounded-lg p-2 text-slate-500 hover:bg-red-500/10 hover:text-red-300" aria-label={`Remove ${item.description}`}><Trash2 className="size-4" /></button></div>
                      <div className="mt-3 grid gap-3 sm:grid-cols-3">
                        <InputField label="Quantity" type="number" min="0.01" step="0.01" value={item.quantity} onChange={(event) => updateLine(item.id, { quantity: Number(event.target.value || 0) })} />
                        <InputField label="Unit cost (£)" type="number" min="0" step="0.01" value={item.unitCost ?? 0} onChange={(event) => updateLine(item.id, { unitCost: Number(event.target.value || 0) })} />
                        <InputField label="Unit price (£)" type="number" min="0" step="0.01" value={item.unitPrice} onChange={(event) => updateLine(item.id, { unitPrice: Number(event.target.value || 0) })} />
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              <Card>
                <h2 className="text-xl font-bold">Pre-send profitability</h2>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl bg-slate-950 p-4"><p className="text-sm text-slate-500">Cost price</p><p className="mt-1 text-xl font-bold">{money.format(draft.profitability.costPrice)}</p></div>
                  <div className="rounded-xl bg-slate-950 p-4"><p className="text-sm text-slate-500">Selling price</p><p className="mt-1 text-xl font-bold">{money.format(draft.profitability.sellingPrice)}</p></div>
                  <div className="rounded-xl bg-slate-950 p-4"><p className="text-sm text-slate-500">Expected profit</p><p className={`mt-1 text-xl font-bold ${draft.profitability.expectedProfit >= 0 ? "text-emerald-300" : "text-red-300"}`}>{money.format(draft.profitability.expectedProfit)}</p></div>
                  <div className="rounded-xl bg-slate-950 p-4"><p className="text-sm text-slate-500">Net margin</p><p className={`mt-1 text-xl font-bold ${draft.profitability.netMargin >= labourSettings.targetNetMargin ? "text-emerald-300" : "text-amber-300"}`}>{draft.profitability.netMargin.toFixed(1)}%</p></div>
                </div>
                <p className="mt-4 text-sm text-slate-500">Includes {money.format(draft.profitability.overheadCost)} allocated business overhead and {draft.pricingSettings.contingencyPercent.toFixed(1)}% contingency.</p>
                {draft.pricing.learnedSellingPrice > 0 ? <p className="mt-2 text-xs text-slate-500">Closest successful records averaged {money.format(draft.pricing.learnedSellingPrice)} before VAT. This is context, not a price cap.</p> : null}
              </Card>

              <Card><WhyRecommendation evidence={draft.pricing.evidence} /></Card>

              <Card>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="grid gap-2 text-sm font-medium text-slate-300">
                    <span>Terms & Conditions</span>
                    <select value={termsTemplateId} onChange={(event) => setTermsTemplateId(event.target.value)} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3">
                      <option value="">Standard safety wording</option>
                      {termsStore.items.filter((template) => template.active).map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
                    </select>
                  </label>
                  <label className="grid gap-2 text-sm font-medium text-slate-300">
                    <span>Payment terms</span>
                    <select value={paymentTermsTemplateId} onChange={(event) => setPaymentTermsTemplateId(event.target.value)} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3">
                      <option value="">Due on completion</option>
                      {paymentTermsStore.items.filter((template) => template.active).map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
                    </select>
                  </label>
                </div>
                <Button className="mt-5 w-full" onClick={saveDraft}><Save className="mr-2 size-4" />Save draft to Quotes</Button>
                <Link href="/quotes" className="mt-3 flex min-h-11 items-center justify-center rounded-xl border border-slate-700 text-sm font-semibold text-slate-200 hover:bg-slate-800">Open Quote Engine 2.0</Link>
              </Card>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
