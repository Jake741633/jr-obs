"use client";

import Link from "next/link";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Camera,
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
import { ConnectedQuoteAssistant } from "../../../components/ai/ConnectedQuoteAssistant";
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
import { savedIdentityIndex } from "../../../lib/assistantIdentity";
import { editQuoteDraftLine, materialQuoteDraftLine, reviewQuoteDraftLines, type QuoteLineReviewField } from "../../../lib/quoteDraftLines";
import { jobPackQuoteDraftAddition, labourQuoteDraftAddition, type QuoteDraftAddition } from "../../../lib/quoteDraftAdditions";
import { useEstimateSave } from "../../../lib/useEstimateSave";
import type {
  Builder,
  BusinessOverhead,
  BusinessTermsTemplate,
  Customer,
  Invoice,
  Job,
  JobDocument,
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
const reviewFieldLabels: Record<QuoteLineReviewField, string> = { identity: "line identity", description: "description", quantity: "quantity", unitCost: "buying cost", unitPrice: "selling price", labourHours: "labour time", amount: "amounts or combined totals" };

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
  const jobDocuments = useLocalStorageCollection<JobDocument>("jr-os-job-documents");
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
  const [sourceMode, setSourceMode] = useState<"Typed notes" | "Photos & video" | "Voice transcript">("Typed notes");
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
  const [selectedMaterialId, setSelectedMaterialId] = useState("");
  const [selectedLabourId, setSelectedLabourId] = useState("");
  const [selectedJobPackId, setSelectedJobPackId] = useState("");
  const [reviewOnly, setReviewOnly] = useState(false);
  const [reviewIds, setReviewIds] = useState<string[]>([]);
  const lastLineAddition = useRef<object | null>(null);
  const draftReview = reviewQuoteDraftLines(draft?.items ?? []);
  const materialChoices = [...savedIdentityIndex(materials.items).unique.values()].filter(item => typeof item.name === "string" && item.name.trim()).sort((a, b) => a.name.localeCompare(b.name, "en-GB"));
  const labourChoices = savedIdentityIndex(labourRates.items).selectable.filter(item => item.active === true && typeof item.name === "string" && item.name.trim()).sort((a, b) => a.name.localeCompare(b.name, "en-GB"));
  const packChoices = savedIdentityIndex(jobPacks.items).selectable.filter(item => typeof item.name === "string" && item.name.trim()).sort((a, b) => a.name.localeCompare(b.name, "en-GB"));
  const packPreview = useMemo(() => {
    const selectedPack = savedIdentityIndex(jobPacks.items).unique.get(selectedJobPackId);
    if (!selectedPack) return { addition: null, error: "Choose a current uniquely identified job pack." };
    try {
      let next = 0;
      return { addition: jobPackQuoteDraftAddition(selectedPack, materials.items, () => `preview-${++next}`), error: "" };
    } catch (error) { return { addition: null, error: error instanceof Error ? error.message : "Review this job pack before adding it." }; }
  }, [selectedJobPackId, jobPacks.items, materials.items]);

  const labourSettings = labourSettingsStore.items[0] ?? defaultLabourSettings;
  const quoteSettings = quoteSettingsStore.items[0] ?? defaultQuotePricingSettings;
  const vatSettings = vatStore.items[0] ?? defaultVatSettings;
  const evidenceJob = savedIdentityIndex(jobs.items).unique.get(jobId);
  const ready = [
    documents, customers, builders, jobs, invoices, materials, jobPacks, labourRates, overheads,
    labourSettingsStore, quoteSettingsStore, termsStore, paymentTermsStore, vatStore,
  ].every((store) => store.isReady);
  const [hasLoaded, setHasLoaded] = useState(false);
  if (ready && !hasLoaded) setHasLoaded(true);
  const saveContext = useMemo(() => ({ draft, customerId, builderId, jobId, siteAddress, validUntil, termsTemplateId, paymentTermsTemplateId,
    customers: customers.items, builders: builders.items, jobs: jobs.items, documents: documents.items,
    terms: termsStore.items, paymentTerms: paymentTermsStore.items, overheads: overheads.items, labourSettings, vatSettings }),
  [draft, customerId, builderId, jobId, siteAddress, validUntil, termsTemplateId, paymentTermsTemplateId, customers.items, builders.items, jobs.items, documents.items, termsStore.items, paymentTermsStore.items, overheads.items, labourSettings, vatSettings]);
  const estimateSave = useEstimateSave<PricingDocument>(ready, saveContext);
  const sourceContext = useMemo(() => ({ notes, jobType, ready, saveContext, materials: materials.items, jobPacks: jobPacks.items, labourRates: labourRates.items, invoices: invoices.items, quoteSettings }),
    [notes, jobType, ready, saveContext, materials.items, jobPacks.items, labourRates.items, invoices.items, quoteSettings]);
  const latestSource = useRef({ active: false, context: sourceContext, selectedMaterialId, selectedLabourId, selectedJobPackId });
  useLayoutEffect(() => {
    latestSource.current = { active: true, context: sourceContext, selectedMaterialId, selectedLabourId, selectedJobPackId };
    return () => { latestSource.current.active = false; };
  });
  const currentSource = () => ready && latestSource.current.active && latestSource.current.context === sourceContext;

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

  function generateDraft(sourceNotes: string): boolean {
    if (!currentSource()) return false;
    if (!sourceNotes.trim()) {
      setMessage("Add typed job notes or paste a voice transcript first.");
      return false;
    }
    if (!estimateSave.begin("doc")) return false;
    const generated = buildAiQuoteDraft({
      notes: sourceNotes,
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
    setDraft({ ...generated, profitability: reviewQuoteDraftLines(generated.items).complete ? generated.profitability : null });
    setReviewOnly(false); setReviewIds([]); setSelectedMaterialId(""); setSelectedLabourId(""); setSelectedJobPackId("");
    setJobType(generated.jobType);
    setValidUntil((current) => current || addDays(30));
    const defaultTerms = termsStore.items.find((template) => template.active && template.name.toLowerCase().includes(generated.jobType.toLowerCase()))
      ?? termsStore.items.find((template) => template.active);
    const defaultPayment = paymentTermsStore.items.find((template) => template.active && template.isDefault)
      ?? paymentTermsStore.items.find((template) => template.active);
    setTermsTemplateId((current) => current || defaultTerms?.id || "");
    setPaymentTermsTemplateId((current) => current || defaultPayment?.id || "");
    setMessage(`Draft prepared as ${generated.jobType}. Review every quantity, allowance and exclusion before saving.`);
    return true;
  }

  function updateItems(nextItems: PricingLineItem[], editedCostId?: string, addition?: QuoteDraftAddition) {
    if (!currentSource() || !draft || !estimateSave.canSave()) return false;
    const costBasisByLineId = { ...draft.costBasisByLineId, ...addition?.costBasisByLineId };
    if (editedCostId) costBasisByLineId[editedCostId] = nextItems.find(item => item.id === editedCostId)?.unitCost === undefined ? "Not recorded" : "Entered for this estimate";
    setDraft({
      ...draft,
      items: nextItems,
      notes: addition?.customerNotes ? [draft.notes, addition.customerNotes].filter(Boolean).join("\n\n") : draft.notes,
      scopeItems: addition?.scopeItem ? [...draft.scopeItems, addition.scopeItem] : draft.scopeItems,
      costBasisByLineId,
      profitability: reviewQuoteDraftLines(nextItems).complete ? calculateQuoteProfitability(nextItems, draft.pricingSettings, overheads.items, labourSettings) : null,
    });
    return true;
  }

  function appendAddition(addition: QuoteDraftAddition) {
    if (!currentSource() || !draft || !estimateSave.canSave() || lastLineAddition.current === sourceContext) return false;
    const nextItems = [...draft.items, ...addition.lines];
    if (!addition.lines.length || savedIdentityIndex(nextItems).unusableCount) throw new Error("Quote line identities are missing or duplicated. Regenerate the draft before adding lines.");
    if (!updateItems(nextItems, undefined, addition)) return false;
    lastLineAddition.current = sourceContext;
    if (reviewOnly) setReviewIds(current => [...current, ...addition.lines.map(line => line.id)]);
    return true;
  }

  function updateLine(id: string, patch: Partial<PricingLineItem>) {
    if (!draft || !savedIdentityIndex(draft.items).unique.has(id)) return;
    updateItems(draft.items.map((item) => item.id === id ? editQuoteDraftLine(item, patch) : item), "unitCost" in patch ? id : undefined);
  }

  function addMaterial(id?: string) {
    if (!currentSource() || !draft || !estimateSave.canSave() || lastLineAddition.current === sourceContext
      || (id !== undefined && id !== latestSource.current.selectedMaterialId)) return;
    const material = id ? savedIdentityIndex(materials.items).unique.get(id) : null;
    if (id !== undefined && !material) { setMessage("The saved material is missing or duplicated. Choose a current material again."); return; }
    try {
      const nextId = makeId("ai-line");
      if (draft.items.some(item => item.id === nextId)) throw new Error("A line identity was repeated. Try adding the material again.");
      const added = materialQuoteDraftLine(material ?? null, nextId);
      if (!appendAddition({ lines: [added.line], costBasisByLineId: { [nextId]: added.costBasis } })) return;
      setSelectedMaterialId("");
      setMessage("Material line added to this draft. Check its description, quantity and buying/selling allowances before saving.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "This material could not be added. Your draft is unchanged."); }
  }

  function addLabour(id?: string) {
    if (!currentSource() || !draft || !estimateSave.canSave() || lastLineAddition.current === sourceContext
      || (id !== undefined && id !== latestSource.current.selectedLabourId)) return;
    const rate = id ? savedIdentityIndex(labourRates.items).unique.get(id) : null;
    if (id !== undefined && !rate) { setMessage("Choose a current uniquely identified active labour rate."); return; }
    try {
      if (!appendAddition(labourQuoteDraftAddition(rate ?? null, makeId("ai-line")))) return;
      setSelectedLabourId(""); setMessage("Labour line added. Review its quantity, cost, selling price and time allowance before saving.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Labour could not be added. Your draft is unchanged."); }
  }

  function addJobPack(id: string) {
    if (!currentSource() || !draft || !estimateSave.canSave() || lastLineAddition.current === sourceContext || id !== latestSource.current.selectedJobPackId) return;
    const pack = savedIdentityIndex(jobPacks.items).unique.get(id);
    if (!pack) { setMessage("Choose a current uniquely identified job pack."); return; }
    try {
      if (!appendAddition(jobPackQuoteDraftAddition(pack, materials.items, () => makeId("ai-line")))) return;
      setSelectedJobPackId(""); setMessage("Job pack lines and public scope notes added. Check for overlapping allowances and complete missing buying costs before saving.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "The job pack could not be added. Your draft is unchanged."); }
  }

  function saveDraft() {
    if (!estimateSave.canSave()) return;
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
    if (!reviewQuoteDraftLines(draft.items).complete) {
      setMessage("Review every description, quantity, buying cost, selling price and labour time before saving. Enter zero only when intentional.");
      return;
    }
    if ((customerId && !savedIdentityIndex(customers.items).unique.has(customerId))
      || (builderId && !savedIdentityIndex(builders.items).unique.has(builderId))
      || (jobId && !savedIdentityIndex(jobs.items).unique.has(jobId))) {
      setMessage("A selected customer, builder or job is missing or duplicated. Select the record again before saving.");
      return;
    }
    const termsTemplate = termsStore.items.find((template) => template.id === termsTemplateId && template.active);
    const paymentTemplate = paymentTermsStore.items.find((template) => template.id === paymentTermsTemplateId && template.active);
    try {
      const document = estimateSave.save(id => {
        const now = new Date().toISOString();
        const profitability = calculateQuoteProfitability(draft.items, draft.pricingSettings, overheads.items, labourSettings);
        return {
          id,
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
      }, documents.items, item => documents.createItem(item));
      setDraft(null);
      setMessage(`${document.number} saved on this device as a draft. Check sync status before switching devices, then review the saved quote before sending.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "The quote could not be saved. Your draft is still here."); }
  }

  if (!ready && !hasLoaded) return <Card>Preparing AI Quote Builder…</Card>;

  return (
    <>
    {!ready ? <Card>Preparing AI Quote Builder…</Card> : null}
    <main hidden={!ready} inert={!ready} className="space-y-6">
      <PageHeader
        eyebrow="AI Command Centre"
        title="AI Quote Builder"
        description="Turn job notes, site photos or a short video into a reviewed quote with labour and materials from your saved packs and rates."
        action={<Link href="/ai" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 text-sm font-semibold hover:bg-slate-800"><ArrowLeft className="size-4" />Command Centre</Link>}
      />

      <AiToolNav />

      {message ? <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 px-4 py-3 text-sm text-cyan-200">{message}</div> : null}
      {estimateSave.saved ? <Card><p className="mb-3 text-sm text-emerald-200">{estimateSave.saved.number} is saved. Use Quotes for changes, or generate a priced draft again to start another quote.</p>{estimateSave.saved.recovered ? <p className="mb-3 text-sm text-amber-200">Recovered the previously saved version. Any later draft edits were not saved; open the saved quote to review it.</p> : null}<Link href={`/quotes/${encodeURIComponent(estimateSave.saved.id)}`} className="inline-flex min-h-12 items-center rounded-xl bg-cyan-400 px-4 font-semibold text-slate-950">Open saved quote · {estimateSave.saved.number}</Link></Card> : null}

      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-6">
          <Card className="flex flex-col">
            <div className="order-0 grid grid-cols-3 gap-2 rounded-xl bg-slate-950 p-2">
              {(["Typed notes", "Photos & video", "Voice transcript"] as const).map((mode) => (
                <button key={mode} type="button" aria-pressed={sourceMode === mode} onClick={() => setSourceMode(mode)} className={`flex min-h-16 flex-col items-center justify-center gap-2 rounded-lg px-2 py-3 text-sm font-semibold ${sourceMode === mode ? "bg-cyan-400 text-slate-950" : "text-slate-400 hover:bg-slate-800"}`}>
                  {mode === "Voice transcript" ? <Mic2 className="size-7" /> : mode === "Photos & video" ? <Camera className="size-7" /> : <FilePenLine className="size-7" />}{mode}
                </button>
              ))}
            </div>
            <div className={`mt-5 ${sourceMode === "Photos & video" ? "order-2" : "order-1"}`}>
              <TextareaField
                label={sourceMode === "Voice transcript" ? "Voice transcript" : "Job notes"}
                className={sourceMode === "Photos & video" ? "min-h-36" : "min-h-60"}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder={sourceMode === "Voice transcript"
                  ? "Paste the transcript from your voice note here. Include quantities, access, customer requests, testing and exclusions where known."
                  : "Example: Replace consumer unit with RCBO board and SPD. Existing board under stairs. Allow for testing, labels and certification. Customer wants work on a Friday."}
              />
              {sourceMode === "Voice transcript" ? <p className="mt-2 text-xs text-slate-500">Use your phone&apos;s dictation or transcription, then paste the words here. Connected AI can review the pasted text; audio files are not uploaded by this form.</p> : null}
            </div>
            <div className={sourceMode === "Photos & video" ? "order-1" : "order-2"}><ConnectedQuoteAssistant
              notes={notes}
              contextKey={JSON.stringify([jobId, customerId, builderId, siteAddress])}
              jobEvidence={evidenceJob ? { jobId: evidenceJob.id, title: evidenceJob.title, documents: jobDocuments.items, ready: jobDocuments.isReady } : undefined}
              ready={ready && (!jobId || jobs.items.filter(item => item.id === jobId).length === 1)}
              onApply={(sourceNotes, reviewedNotes) => {
                if (!currentSource() || sourceNotes !== notes || !estimateSave.enabled) return;
                setNotes(current => current === sourceNotes ? reviewedNotes : current);
                setDraft(null);
                setMessage("Reviewed AI scope added to the notes. Create a priced draft and check each line before saving.");
              }}
              onBuildDraft={(sourceNotes, reviewedNotes) => {
                if (!currentSource() || sourceNotes !== notes) return;
                if (generateDraft(reviewedNotes)) setNotes(reviewedNotes);
              }}
            /></div>
            <div className="order-3 mt-5 grid gap-4 sm:grid-cols-2">
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
            <Button className="order-4 mt-5 w-full" disabled={!estimateSave.enabled} onClick={() => generateDraft(notes)}><Sparkles className="mr-2 size-4" />Create priced draft from notes</Button>
          </Card>

          {draft ? (
            <Card>
              <div className="flex items-center gap-3"><CheckCircle2 className="size-6 text-emerald-300" /><div><h2 className="text-xl font-bold">Detected scope</h2><p className="text-sm text-slate-500">Local estimate · {draft.jobType} · {draft.pricing.evidenceCount} matching saved record{draft.pricing.evidenceCount === 1 ? "" : "s"}</p></div></div>
              <p className="mt-3 text-sm text-slate-400">The priced draft uses saved records and defaults; no API credit is required. Check each allowance against the site.</p>
              <InputField className="mt-5" disabled={Boolean(estimateSave.saved)} label="Quote title" value={draft.title} onChange={(event) => { if (estimateSave.canSave()) setDraft({ ...draft, title: event.target.value }); }} />
              <TextareaField className="mt-4" disabled={!estimateSave.enabled || Boolean(estimateSave.saved)} label="Quote notes & exclusions" value={draft.notes} onChange={event => { if (currentSource() && estimateSave.canSave()) setDraft({ ...draft, notes: event.target.value }); }} />
              <section aria-label="Included work" className="mt-4 space-y-2">
                <h3 className="font-semibold">Included work</h3>
                {draft.scopeItems.length ? draft.scopeItems.map((item, index) => <p key={`${item}-${index}`} className="rounded-lg bg-slate-950 px-3 py-2 text-sm text-slate-300">{item}</p>) : <p className="text-sm text-slate-500">No separate scope items were detected. Add more detail before sending.</p>}
              </section>
              {draft.questionsToConfirm.length ? <section aria-label="Questions to confirm" className="mt-5 space-y-2">
                <h3 className="font-semibold text-amber-200">Questions to confirm</h3>
                <ul className="list-disc space-y-2 pl-5 text-sm text-slate-300">{draft.questionsToConfirm.map((question, index) => <li key={`${index}-${question}`}>{question}</li>)}</ul>
              </section> : null}
              {draft.exclusions.length ? <section aria-label="Exclusions" className="mt-5 space-y-2">
                <h3 className="font-semibold">Exclusions stated in the notes</h3>
                <ul className="list-disc space-y-2 pl-5 text-sm text-slate-300">{draft.exclusions.map((exclusion, index) => <li key={`${index}-${exclusion}`}>{exclusion}</li>)}</ul>
              </section> : null}
              {draft.packMatches.length ? <section aria-label="Saved pack matches" className="mt-5 space-y-3">
                <h3 className="font-semibold">Saved pack matches</h3>
                {draft.packMatches.map(pack => <div key={pack.id} className="rounded-xl bg-slate-950 p-3"><p className="text-sm font-semibold">{pack.name}</p><p className="mt-1 text-sm text-slate-400">{pack.reason}</p></div>)}
              </section> : null}
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
                <p className="mt-4 text-sm text-amber-200">Every addition appends separate lines. Check for overlapping labour, materials and other charges already in this draft.</p>
                <details className="mt-5 rounded-xl border border-slate-700 p-3">
                  <summary className="min-h-12 cursor-pointer py-3 font-semibold">Add labour to this draft</summary>
                  <p className="my-3 text-sm text-slate-400">Saved prices are per billing unit. Hourly labour starts at one hour; enter the time allowance for every other billing unit.</p>
                  <fieldset disabled={!estimateSave.enabled || !estimateSave.hasDraft || Boolean(estimateSave.saved)} className="space-y-3">
                    <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Saved labour rate</span>
                      <select value={selectedLabourId} onChange={event => setSelectedLabourId(event.target.value)} className="min-h-12 min-w-0 max-w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-base">
                        <option value="">Choose an active saved labour rate</option>
                        {labourChoices.map(rate => <option key={rate.id} value={rate.id}>{rate.name} · {typeof rate.unit === "string" ? rate.unit : "Review unit"}</option>)}
                      </select>
                    </label>
                    <div className="flex flex-wrap gap-3"><Button className="min-h-12" disabled={!selectedLabourId} onClick={() => addLabour(selectedLabourId)}>Add saved labour</Button><Button className="min-h-12" variant="secondary" onClick={() => addLabour()}>Add blank labour allowance</Button></div>
                  </fieldset>
                </details>
                <details className="mt-4 rounded-xl border border-slate-700 p-3">
                  <summary className="min-h-12 cursor-pointer py-3 font-semibold">Add a reviewed job pack</summary>
                  <fieldset disabled={!estimateSave.enabled || !estimateSave.hasDraft || Boolean(estimateSave.saved)} className="mt-3 space-y-3">
                    <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Saved job pack</span>
                      <select value={selectedJobPackId} onChange={event => setSelectedJobPackId(event.target.value)} className="min-h-12 min-w-0 max-w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-base">
                        <option value="">Choose a saved job pack to review</option>
                        {packChoices.map(pack => <option key={pack.id} value={pack.id}>{pack.name}</option>)}
                      </select>
                    </label>
                    {selectedJobPackId ? packPreview.addition ? <section aria-label="Selected job pack preview" className="space-y-3 rounded-xl bg-slate-950 p-3 text-sm">
                      <p className="font-semibold">Review all {packPreview.addition.lines.length} lines before adding</p>
                      <ul className="space-y-3">{packPreview.addition.lines.map(line => <li key={line.id} className="break-words"><p className="font-medium">{line.category} · {line.description}</p><p>{line.quantity} × {money.format(line.unitPrice)} selling · {line.unitCost === undefined ? "Buying cost needs review" : `${money.format(line.unitCost)} buying each`}</p>{line.category === "Labour" ? <p>Time allowance: {line.labourHours} hours</p> : null}</li>)}</ul>
                      <p className="whitespace-pre-wrap break-words">{packPreview.addition.customerNotes}</p>
                      <p className="text-amber-200">These public scope notes will be added to Quote notes & exclusions. Internal pricing notes are not copied. Line allowances exclude quote-level contingency, travel, parking and VAT; check for overlap.</p>
                    </section> : <p role="alert" className="text-sm text-amber-200">{packPreview.error}</p> : null}
                    <Button className="min-h-12" disabled={!selectedJobPackId || !packPreview.addition} onClick={() => addJobPack(selectedJobPackId)}>Add reviewed job pack</Button>
                  </fieldset>
                </details>
                <details className="mt-5 rounded-xl border border-slate-700 p-3">
                  <summary className="min-h-12 cursor-pointer py-3 font-semibold">Add a material to this draft</summary>
                  <p className="my-3 text-sm text-slate-400">Use a saved material or add a blank allowance without leaving the quote. Each addition is a separate line.</p>
                  <fieldset disabled={!estimateSave.enabled || !estimateSave.hasDraft || Boolean(estimateSave.saved)} className="space-y-3">
                    <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Saved material</span>
                      <select value={selectedMaterialId} onChange={event => setSelectedMaterialId(event.target.value)} className="min-h-12 min-w-0 max-w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-base">
                        <option value="">Choose a saved material</option>
                        {materialChoices.map(material => <option key={material.id} value={material.id}>{material.name}{typeof material.stockCode === "string" && material.stockCode ? ` · ${material.stockCode}` : ""}</option>)}
                      </select>
                    </label>
                    <div className="flex flex-wrap gap-3"><Button className="min-h-12" disabled={!selectedMaterialId} onClick={() => addMaterial(selectedMaterialId)}>Add saved material</Button><Button className="min-h-12" variant="secondary" onClick={() => addMaterial()}>Add blank material allowance</Button></div>
                  </fieldset>
                </details>
                <section aria-label="Pricing review" className="mt-5 space-y-3 rounded-xl border border-cyan-500/20 p-3">
                  <p role="status" className="font-semibold">{draftReview.needsReviewCount} {draftReview.needsReviewCount === 1 ? "line needs" : "lines need"} review</p>
                  <p className="text-sm text-slate-400">Calculations and saving always include all {draft.items.length} lines, including any hidden by this review list.</p>
                  {!draftReview.costs.totalsValid ? <p className="text-sm text-amber-200">Combined amounts exceed the supported limit. Review the quantities and allowances before saving.</p> : null}
                  <label className="flex min-h-12 items-center gap-3 text-sm"><input type="checkbox" aria-label="Show lines needing review" checked={reviewOnly} onChange={event => { setReviewOnly(event.target.checked); setReviewIds(event.target.checked ? draftReview.lines.filter(line => line.fields.length).map(line => line.id) : []); }} />Show lines needing review</label>
                  {reviewOnly ? <><p className="text-xs text-slate-400">Lines stay visible while you edit. Refresh this list when you are ready to hide completed lines.</p><Button className="min-h-12" variant="secondary" onClick={() => setReviewIds(draftReview.lines.filter(line => line.fields.length).map(line => line.id))}>Refresh review list</Button></> : null}
                </section>
                <div className="mt-5 space-y-3">
                  {(["Labour", "Materials", "Other"] as const).map(group => {
                    const allLines = draft.items.map((item, index) => ({ item, index })).filter(({ item }) => group === "Other" ? item.category !== "Labour" && item.category !== "Materials" : item.category === group);
                    const lines = allLines.filter(({ item }) => !reviewOnly || reviewIds.includes(item.id));
                    if (group === "Other" && !allLines.length) return null;
                    return <section key={group} aria-label={`${group} pricing lines`} className="space-y-3">
                    <h3 className="text-lg font-bold">{group} <span className="text-sm font-normal text-slate-400">· {allLines.length} line{allLines.length === 1 ? "" : "s"}{reviewOnly ? ` · ${lines.length} shown` : ""}</span></h3>
                    {!allLines.length ? <p className="rounded-xl border border-amber-500/20 p-3 text-sm text-amber-100">{group === "Labour" ? <>No priced labour line was created. Check the scope and <Link href="/labour-costs" className="inline-flex min-h-12 items-center font-semibold underline">saved labour rates</Link>.</> : <>No matching material lines were found. Review the scope, <Link href="/starter-library" className="inline-flex min-h-12 items-center font-semibold underline">browse job packs</Link> or add a material allowance above.</>}</p> : !lines.length ? <p className="text-sm text-slate-400">No {group.toLowerCase()} lines in the current review list. Show all lines to edit them.</p> : null}
                    {lines.map(({ item, index }) => {
                      const lineReview = draftReview.lines[index];
                      const fallbackDescription = item.category === "Labour" ? "New labour allowance" : item.category === "Materials" ? "New material allowance" : "New pricing allowance";
                      return <article key={`${item.id}-${index}`} aria-label={`Pricing line ${index + 1}`} className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
                        <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">{item.category}</p><p className="mt-1 font-medium">{item.description || fallbackDescription}</p></div><button type="button" disabled={!lineReview.editable || !estimateSave.enabled || Boolean(estimateSave.saved)} onClick={() => { if (lineReview.editable) updateItems(draft.items.filter(line => line.id !== item.id)); }} className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-lg text-slate-400 hover:bg-red-500/10 hover:text-red-300 disabled:opacity-40" aria-label={`Remove ${item.description || fallbackDescription.toLowerCase()}`}><Trash2 className="size-5" /></button></div>
                        {lineReview.fields.length ? <p className="mt-3 text-sm text-amber-200">Needs review: {lineReview.fields.map(field => reviewFieldLabels[field]).join(", ")}.{!lineReview.editable ? " Regenerate the draft to resolve the line identity before editing." : ""}</p> : null}
                        <fieldset disabled={!lineReview.editable || !estimateSave.enabled || Boolean(estimateSave.saved)} className="mt-3 space-y-3">
                          <InputField label="Description" value={item.description ?? ""} maxLength={500} onChange={event => updateLine(item.id, { description: event.target.value })} />
                          <div className="grid gap-3 sm:grid-cols-3">
                            <InputField label="Quantity" type="number" min="0" step="any" value={Number.isFinite(item.quantity) ? item.quantity : ""} onChange={event => updateLine(item.id, { quantity: Number(event.target.value || 0) })} />
                            <InputField label="Unit cost (£)" type="number" min="0" step="any" value={Number.isFinite(item.unitCost) ? item.unitCost : ""} placeholder="Not recorded" onChange={event => updateLine(item.id, { unitCost: event.target.value.trim() === "" ? undefined : Number(event.target.value) })} />
                            <InputField label="Unit price (£)" type="number" min="0" step="any" value={Number.isFinite(item.unitPrice) ? item.unitPrice : ""} onChange={event => updateLine(item.id, { unitPrice: event.target.value.trim() === "" ? NaN : Number(event.target.value) })} />
                          </div>
                          {item.category === "Labour" && item.labourMode !== "Hours" ? <InputField label="Time allowance (hours)" type="number" min="0" step="any" value={Number.isFinite(item.labourHours) ? item.labourHours : ""} onChange={event => updateLine(item.id, { labourHours: event.target.value.trim() === "" ? undefined : Number(event.target.value) })} /> : null}
                        </fieldset>
                        {item.category === "Labour" ? <p className="mt-3 text-xs text-slate-400">{item.labourMode === "Hours" ? "Hourly time follows Quantity. Re-enter Quantity if its time allowance needs correcting." : "Billing quantity and time allowance are separate. Check the hours used for overheads."}</p> : null}
                        <p className="mt-3 text-sm font-semibold">Line selling amount: {lineReview.sellingAmount === undefined ? "Needs review" : money.format(lineReview.sellingAmount)}</p>
                        <p className="mt-1 text-sm text-slate-400">Buying allowance: {lineReview.buyingAmount === undefined ? "Needs review" : money.format(lineReview.buyingAmount)}</p>
                        <p className="mt-3 text-sm text-slate-400">Cost basis: {draft.costBasisByLineId[item.id] ?? "Saved labour rate"}. Check this allowance for the job.</p>
                      </article>;
                    })}</section>;
                  })}
                </div>
                <p className="mt-4 text-xs text-slate-400">Line amounts exclude contingency, travel, parking and VAT. The complete quote calculation applies those settings.</p>
              </Card>

              <Card>
                <h2 className="text-xl font-bold">Pre-send profitability</h2>
                {draftReview.complete && draft.profitability ? <>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl bg-slate-950 p-4"><p className="text-sm text-slate-500">Cost price</p><p className="mt-1 text-xl font-bold">{money.format(draft.profitability.costPrice)}</p></div>
                  <div className="rounded-xl bg-slate-950 p-4"><p className="text-sm text-slate-500">Selling price</p><p className="mt-1 text-xl font-bold">{money.format(draft.profitability.sellingPrice)}</p></div>
                  <div className="rounded-xl bg-slate-950 p-4"><p className="text-sm text-slate-500">Expected profit</p><p className={`mt-1 text-xl font-bold ${draft.profitability.expectedProfit >= 0 ? "text-emerald-300" : "text-red-300"}`}>{money.format(draft.profitability.expectedProfit)}</p></div>
                  <div className="rounded-xl bg-slate-950 p-4"><p className="text-sm text-slate-500">Net margin</p><p className={`mt-1 text-xl font-bold ${draft.profitability.netMargin >= labourSettings.targetNetMargin ? "text-emerald-300" : "text-amber-300"}`}>{draft.profitability.netMargin.toFixed(1)}%</p></div>
                </div>
                <p className="mt-4 text-sm text-slate-500">Includes {money.format(draft.profitability.overheadCost)} allocated business overhead and {draft.pricingSettings.contingencyPercent.toFixed(1)}% contingency.</p>
                </> : <p className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-100">Costs need review before profit can be estimated or this quote saved. Check descriptions, quantities, buying costs, selling prices and labour time. Enter £0 only when intentional.</p>}
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
                <Button className="mt-5 min-h-12 w-full" disabled={!draftReview.complete || !estimateSave.enabled || !estimateSave.hasDraft || Boolean(estimateSave.saved)} onClick={saveDraft}><Save className="mr-2 size-4" />Save draft to Quotes</Button>
                <Link href="/quotes" className="mt-3 flex min-h-11 items-center justify-center rounded-xl border border-slate-700 text-sm font-semibold text-slate-200 hover:bg-slate-800">Open Quote Engine 2.0</Link>
              </Card>
            </>
          )}
        </div>
      </section>
    </main>
    </>
  );
}
