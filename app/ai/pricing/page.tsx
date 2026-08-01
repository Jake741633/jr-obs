"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, Calculator, CheckCircle2, Save, Sparkles, TriangleAlert } from "lucide-react";
import { AiConfidenceScore } from "../../../components/ai/AiConfidenceScore";
import { AiToolNav } from "../../../components/ai/AiToolNav";
import { WhyRecommendation } from "../../../components/ai/WhyRecommendation";
import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { TextareaField } from "../../../components/ui/FormField";
import { PageHeader } from "../../../components/ui/PageHeader";
import { recommendPricing, type AiPricingRecommendation } from "../../../lib/aiCommandCentre";
import { calculateQuoteProfitability, defaultQuotePricingSettings } from "../../../lib/quoteEngine";
import { makeId, useLocalStorageCollection } from "../../../lib/storage";
import type {
  BusinessOverhead,
  Invoice,
  Job,
  JobPack,
  LabourCostSettings,
  LabourRate,
  PricingDocument,
  PricingLineItem,
  QuotePricingSettings,
  QuoteRevision,
  QuoteTemplateType,
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

export default function AiPricingAssistantPage() {
  const documents = useLocalStorageCollection<PricingDocument>("jr-os-pricing-documents");
  const jobs = useLocalStorageCollection<Job>("jr-os-jobs");
  const invoices = useLocalStorageCollection<Invoice>("jr-os-invoices");
  const labourRates = useLocalStorageCollection<LabourRate>("jr-os-labour-rates");
  const overheads = useLocalStorageCollection<BusinessOverhead>("jr-os-business-overheads");
  const labourSettingsStore = useLocalStorageCollection<LabourCostSettings>("jr-os-labour-cost-settings", [defaultLabourSettings]);
  const quoteSettingsStore = useLocalStorageCollection<QuotePricingSettings>("jr-os-quote-engine-settings", [defaultQuotePricingSettings]);
  const jobPacks = useLocalStorageCollection<JobPack>("jr-os-job-packs");
  const [documentId, setDocumentId] = useState("");
  const [jobType, setJobType] = useState<"" | QuoteTemplateType>("");
  const [notes, setNotes] = useState("");
  const [recommendation, setRecommendation] = useState<AiPricingRecommendation | null>(null);
  const [message, setMessage] = useState("");
  const labourSettings = labourSettingsStore.items[0] ?? defaultLabourSettings;
  const quoteSettings = quoteSettingsStore.items[0] ?? defaultQuotePricingSettings;
  const ready = [documents, jobs, invoices, labourRates, overheads, labourSettingsStore, quoteSettingsStore, jobPacks].every((store) => store.isReady);
  const draftQuotes = documents.items.filter((document) => document.type === "Quote" && document.status === "Draft");
  const selectedDocument = draftQuotes.find((document) => document.id === documentId);

  function selectDocument(id: string) {
    const document = documents.items.find((item) => item.id === id);
    setDocumentId(id);
    if (!document) return;
    setNotes(`${document.title}\n${document.notes}`);
    setJobType(document.templateType ?? "");
    setRecommendation(null);
  }

  function generate() {
    const context = [notes, selectedDocument?.title, selectedDocument?.notes].filter(Boolean).join("\n");
    if (!context.trim() && !jobType) {
      setMessage("Choose a draft quote, select a job type or describe the work first.");
      return;
    }
    const result = recommendPricing({
      notes: context,
      jobType,
      labourRates: labourRates.items,
      overheads: overheads.items,
      labourSettings,
      quoteSettings: selectedDocument?.pricingSettings ?? quoteSettings,
      documents: documents.items,
      jobs: jobs.items,
      invoices: invoices.items,
      jobPacks: jobPacks.items,
    });
    setRecommendation(result);
    setJobType(result.jobType);
    setMessage("Pricing recommendation prepared from Labour & Costs, overheads, Quote Engine defaults and relevant saved records.");
  }

  function recommendedSettings() {
    if (!recommendation) return null;
    return {
      ...quoteSettings,
      ...(selectedDocument?.pricingSettings ?? {}),
      defaultLabourRateId: recommendation.labourRate?.id ?? quoteSettings.defaultLabourRateId,
      materialMarkupPercent: recommendation.materialMarkupPercent,
      contingencyPercent: recommendation.contingencyPercent,
    };
  }

  function saveDefaults() {
    const settings = recommendedSettings();
    if (!settings) return;
    quoteSettingsStore.setItems([settings]);
    setMessage("Recommended mark-up, contingency and default labour rate saved as the Quote Engine defaults.");
  }

  function applyToDraft() {
    if (!recommendation || !selectedDocument) {
      setMessage("Choose a draft quote and generate a recommendation first.");
      return;
    }
    const settings = recommendedSettings()!;
    let nextItems: PricingLineItem[] = selectedDocument.items.map((item) => item.category === "Materials"
      ? { ...item, unitPrice: (item.unitCost ?? item.unitPrice) * (1 + settings.materialMarkupPercent / 100) }
      : item);
    const labourLines = nextItems.filter((item) => item.category === "Labour");
    if (recommendation.labourRate && labourLines.length <= 1) {
      const replacement: PricingLineItem = {
        id: labourLines[0]?.id ?? makeId("line"),
        description: `${recommendation.labourRate.name} · ${recommendation.labourMode.toLowerCase()}`,
        category: "Labour",
        quantity: recommendation.labourQuantity,
        unitCost: recommendation.labourRate.costRate,
        unitPrice: recommendation.labourPrice / Math.max(0.01, recommendation.labourQuantity),
        labourRateId: recommendation.labourRate.id,
        labourMode: recommendation.labourMode,
        labourHours: recommendation.labourHours,
      };
      nextItems = labourLines.length
        ? nextItems.map((item) => item.id === labourLines[0].id ? replacement : item)
        : [replacement, ...nextItems];
    }
    const calculated = calculateQuoteProfitability(nextItems, settings, overheads.items, labourSettings);
    const now = new Date().toISOString();
    documents.setItems((current) => current.map((document) => {
      if (document.id !== selectedDocument.id) return document;
      const revision: QuoteRevision = {
        id: makeId("revision"),
        revisionNumber: (document.revisions?.length ?? 0) + 1,
        savedAt: now,
        title: document.title,
        siteAddress: document.siteAddress,
        validUntil: document.validUntil,
        vatEnabled: document.vatEnabled,
        vatRate: document.vatRate,
        items: document.items,
        pricingSettings: document.pricingSettings,
        profitability: document.profitability,
        attachments: document.attachments,
        notes: document.notes,
        exclusions: document.exclusions,
        internalNotes: document.internalNotes,
        fixedPriceWorkflow: document.fixedPriceWorkflow,
        terms: document.terms,
        termsTemplateId: document.termsTemplateId,
        paymentTerms: document.paymentTerms,
        templateType: document.templateType,
      };
      return {
        ...document,
        items: nextItems,
        pricingSettings: settings,
        profitability: {
          directCost: calculated.directCost,
          overheadCost: calculated.overheadCost,
          costPrice: calculated.costPrice,
          sellingPrice: calculated.sellingPrice,
          grossProfit: calculated.grossProfit,
          expectedProfit: calculated.expectedProfit,
          grossMargin: calculated.grossMargin,
          netMargin: calculated.netMargin,
          calculatedAt: now,
        },
        templateType: recommendation.jobType,
        revisions: [...(document.revisions ?? []), revision],
        updatedAt: now,
      };
    }));
    setMessage(`${selectedDocument.number} updated and its previous pricing saved in version history.`);
  }

  if (!ready) return <Card>Preparing AI Pricing Assistant…</Card>;

  return (
    <main className="space-y-6">
      <PageHeader
        eyebrow="AI Command Centre"
        title="AI Pricing Assistant"
        description="Recommend recoverable labour, material mark-up and contingency using the saved Labour & Costs Centre, business overheads and JR OS pricing history."
        action={<Link href="/ai" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 text-sm font-semibold hover:bg-slate-800"><ArrowLeft className="size-4" />Command Centre</Link>}
      />
      <AiToolNav />
      {message ? <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 px-4 py-3 text-sm text-cyan-200">{message}</div> : null}

      <section className="grid gap-6 xl:grid-cols-[0.75fr_1.25fr]">
        <Card className="h-fit">
          <div className="flex items-center gap-3"><Calculator className="size-6 text-emerald-300" /><div><h2 className="text-xl font-bold">Pricing context</h2><p className="text-sm text-slate-500">Analyse a saved draft or plan a new job.</p></div></div>
          <div className="mt-5 grid gap-4">
            <label className="grid gap-2 text-sm font-medium text-slate-300">
              <span>Draft quote (optional)</span>
              <select value={documentId} onChange={(event) => selectDocument(event.target.value)} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3">
                <option value="">Standalone recommendation</option>
                {draftQuotes.map((document) => <option key={document.id} value={document.id}>{document.number} · {document.title}</option>)}
              </select>
            </label>
            <label className="grid gap-2 text-sm font-medium text-slate-300">
              <span>Job type</span>
              <select value={jobType} onChange={(event) => setJobType(event.target.value as "" | QuoteTemplateType)} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3">
                {jobTypes.map((type) => <option key={type || "auto"} value={type}>{type || "Detect automatically"}</option>)}
              </select>
            </label>
            <TextareaField className="min-h-52" label="Scope and risk notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Describe work, likely duration, access, unknowns, travel, out-of-hours work and site risks." />
          </div>
          <Button className="mt-5 w-full" onClick={generate}><Sparkles className="mr-2 size-4" />Recommend pricing</Button>
          <Link href="/labour-costs" className="mt-3 flex min-h-11 items-center justify-center rounded-xl border border-slate-700 text-sm font-semibold hover:bg-slate-800">Edit Labour & Costs</Link>
        </Card>

        {!recommendation ? (
          <Card className="grid min-h-96 place-items-center border-dashed text-center"><div><Calculator className="mx-auto size-10 text-slate-700" /><h2 className="mt-4 text-xl font-bold">No pricing recommendation yet</h2><p className="mt-2 max-w-md text-sm text-slate-500">Choose a draft or describe the work to calculate labour recovery, overhead and target margin.</p></div></Card>
        ) : (
          <div className="space-y-6">
            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Card><p className="text-sm text-slate-400">Labour allowance</p><p className="mt-2 text-2xl font-bold">{recommendation.labourHours} hrs</p><p className="mt-1 text-xs text-slate-500">{recommendation.labourQuantity} {recommendation.labourMode.toLowerCase()}</p></Card>
              <Card><p className="text-sm text-slate-400">Labour selling price</p><p className="mt-2 text-2xl font-bold">{money.format(recommendation.labourPrice)}</p><p className="mt-1 text-xs text-slate-500">{recommendation.labourRate?.name || "No active rate"}</p></Card>
              <Card><p className="text-sm text-slate-400">Material mark-up</p><p className="mt-2 text-2xl font-bold">{recommendation.materialMarkupPercent.toFixed(1)}%</p><p className="mt-1 text-xs text-slate-500">saved Quote Engine default</p></Card>
              <Card><p className="text-sm text-slate-400">Contingency</p><p className="mt-2 text-2xl font-bold">{recommendation.contingencyPercent.toFixed(1)}%</p><p className="mt-1 text-xs text-slate-500">risk-adjusted starting point</p></Card>
            </section>

            <AiConfidenceScore confidence={recommendation.confidence} />

            <Card>
              <div className="flex items-center gap-3"><CheckCircle2 className="size-6 text-emerald-300" /><div><h2 className="text-xl font-bold">Cost recovery</h2><p className="text-sm text-slate-500">{recommendation.jobType} · target net margin {recommendation.targetNetMargin.toFixed(1)}%</p></div></div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl bg-slate-950 p-4"><p className="text-sm text-slate-500">Overhead per billable hour</p><p className="mt-1 text-xl font-bold">{money.format(recommendation.overheadHourlyCost)}</p></div>
                <div className="rounded-xl bg-slate-950 p-4"><p className="text-sm text-slate-500">Break-even hourly rate</p><p className="mt-1 text-xl font-bold">{money.format(recommendation.breakEvenHourlyRate)}</p></div>
                <div className="rounded-xl bg-slate-950 p-4"><p className="text-sm text-slate-500">Recommended hourly recovery</p><p className="mt-1 text-xl font-bold text-emerald-300">{money.format(recommendation.recommendedHourlyRate)}</p></div>
                <div className="rounded-xl bg-slate-950 p-4"><p className="text-sm text-slate-500">Expected labour margin</p><p className={`mt-1 text-xl font-bold ${recommendation.expectedLabourMargin >= recommendation.targetNetMargin ? "text-emerald-300" : "text-amber-300"}`}>{recommendation.expectedLabourMargin.toFixed(1)}%</p></div>
              </div>
              <div className="mt-5 space-y-2">{recommendation.reasons.map((reason) => <p key={reason} className="rounded-lg border border-slate-800 px-3 py-2 text-sm text-slate-400">{reason}</p>)}</div>
              {recommendation.learnedSellingPrice > 0 ? <p className="mt-4 text-xs text-slate-500">Successful matched work averaged {money.format(recommendation.learnedSellingPrice)} before VAT. Review differences in scope, access and quantities.</p> : null}
            </Card>

            <Card><WhyRecommendation evidence={recommendation.evidence} /></Card>

            <Card>
              <div className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-100"><TriangleAlert className="mt-0.5 size-5 shrink-0 text-amber-300" /><p>Review labour duration, access, productivity, subcontract costs and scope risk yourself. A recommendation is not a fixed promise to the customer.</p></div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Button variant="secondary" onClick={saveDefaults}><Save className="mr-2 size-4" />Save as business defaults</Button>
                <Button disabled={!selectedDocument} onClick={applyToDraft}><CheckCircle2 className="mr-2 size-4" />Apply to selected draft</Button>
              </div>
              {selectedDocument ? <Link href={`/quotes/${selectedDocument.id}`} className="mt-3 flex min-h-11 items-center justify-center rounded-xl border border-slate-700 text-sm font-semibold hover:bg-slate-800">Open {selectedDocument.number}</Link> : null}
            </Card>
          </div>
        )}
      </section>
    </main>
  );
}
