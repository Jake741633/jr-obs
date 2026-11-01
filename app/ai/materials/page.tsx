"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowLeft, Check, PackageCheck, PackageSearch, Plus, Sparkles } from "lucide-react";
import { AiToolNav } from "../../../components/ai/AiToolNav";
import { WhyRecommendation } from "../../../components/ai/WhyRecommendation";
import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { InputField, TextareaField } from "../../../components/ui/FormField";
import { PageHeader } from "../../../components/ui/PageHeader";
import { suggestMaterials, type AiMaterialSuggestion } from "../../../lib/aiCommandCentre";
import { makeId, useLocalStorageCollection } from "../../../lib/storage";
import { nextPurchaseListNumber } from "../../../lib/workflow";
import type {
  Job,
  JobPack,
  Invoice,
  Material,
  PricingDocument,
  PurchaseItemStatus,
  PurchaseList,
  QuotePricingSettings,
  QuoteTemplateType,
} from "../../../lib/models";
import { defaultQuotePricingSettings } from "../../../lib/quoteEngine";
import { reviewEstimateCosts } from "../../../lib/estimateCostReview";
import { savedIdentityIndex } from "../../../lib/assistantIdentity";
import { useEstimateSave } from "../../../lib/useEstimateSave";
import { purchaseListReviewHref } from "../../../lib/purchaseListLink";

const money = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const jobTypes: Array<"" | QuoteTemplateType> = ["", "Domestic", "Commercial", "Rewire", "EICR", "Consumer Unit", "Fault Finding"];

export default function AiMaterialsAssistantPage() {
  const materials = useLocalStorageCollection<Material>("jr-os-materials");
  const documents = useLocalStorageCollection<PricingDocument>("jr-os-pricing-documents");
  const jobs = useLocalStorageCollection<Job>("jr-os-jobs");
  const invoices = useLocalStorageCollection<Invoice>("jr-os-invoices");
  const jobPacks = useLocalStorageCollection<JobPack>("jr-os-job-packs");
  const purchaseLists = useLocalStorageCollection<PurchaseList>("jr-os-purchase-lists");
  const quoteSettingsStore = useLocalStorageCollection<QuotePricingSettings>("jr-os-quote-engine-settings", [defaultQuotePricingSettings]);
  const [jobType, setJobType] = useState<"" | QuoteTemplateType>("");
  const [jobId, setJobId] = useState("");
  const [notes, setNotes] = useState("");
  const [suggestions, setSuggestions] = useState<AiMaterialSuggestion[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const ready = [materials, documents, jobs, invoices, jobPacks, purchaseLists, quoteSettingsStore].every((store) => store.isReady);
  const quoteSettings = quoteSettingsStore.items[0] ?? defaultQuotePricingSettings;
  const saveContext = useMemo(() => ({ suggestions, selectedKeys, jobId, jobType, jobs: jobs.items, lists: purchaseLists.items }), [suggestions, selectedKeys, jobId, jobType, jobs.items, purchaseLists.items]);
  const estimateSave = useEstimateSave<PurchaseList>(ready, saveContext);

  function selectJob(id: string) {
    const job = jobs.items.find((item) => item.id === id);
    setJobId(id);
    if (job) setNotes((current) => current || `${job.title}\n${job.notes}`);
  }

  function generate() {
    const job = jobs.items.find((item) => item.id === jobId);
    const context = [notes, job?.title, job?.notes].filter(Boolean).join("\n");
    if (!context.trim() && !jobType) {
      setMessage("Choose a job type, link a job or describe the work first.");
      return;
    }
    if (!estimateSave.begin("purchase")) return;
    const result = suggestMaterials({
      notes: context,
      jobType,
      materials: materials.items,
      documents: documents.items,
      jobs: jobs.items,
      invoices: invoices.items,
      jobPacks: jobPacks.items,
      markupPercent: quoteSettings.materialMarkupPercent,
    });
    setSuggestions(result);
    setSelectedKeys(result.map((item) => item.key));
    setMessage(result.length
      ? `${result.length} suggestions found. Quantities are starting allowances and need checking against the design and site.`
      : "No matching saved materials were found. Add more detail or build the Materials Library first.");
  }

  function updateQuantity(key: string, quantity: number) {
    if (!estimateSave.canSave()) return;
    setSuggestions((current) => current.map((item) => item.key === key ? { ...item, quantity } : item));
  }

  function updateCost(key: string, value: string) {
    if (!estimateSave.canSave()) return;
    const unitCost = value.trim() === "" ? undefined : Number(value);
    setSuggestions((current) => current.map((item) => item.key === key ? { ...item, unitCost, costBasis: unitCost === undefined ? "Not recorded" : "Entered for this estimate" } : item));
  }

  function toggle(key: string) {
    if (!estimateSave.canSave()) return;
    setSelectedKeys((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  }

  function createPurchaseList() {
    if (!estimateSave.canSave()) return;
    const selected = suggestions.filter((suggestion) => selectedKeys.includes(suggestion.key));
    if (!selected.length) {
      setMessage("Select at least one suggested material with a quantity greater than zero.");
      return;
    }
    if (!reviewEstimateCosts(selected).complete) {
      setMessage("Review every selected quantity and buying cost before saving. Enter zero only for an intentionally free item.");
      return;
    }
    const job = savedIdentityIndex(jobs.items).unique.get(jobId);
    if (jobId && !job) { setMessage("The linked job is missing or duplicated. Select it again before saving."); return; }
    try {
      const list = estimateSave.save(id => {
        const now = new Date().toISOString();
        return {
          id,
          number: nextPurchaseListNumber(purchaseLists.items),
          title: job?.title || `${jobType || "Electrical"} materials`,
          pricingDocumentId: job?.sourceQuoteId,
          jobId: job?.id,
          items: selected.map((suggestion) => ({
            id: makeId("purchase-item"),
            materialId: suggestion.materialId,
            description: suggestion.description,
            supplier: suggestion.supplier,
            stockCode: suggestion.stockCode,
            supplierUrl: suggestion.supplierUrl,
            quantity: suggestion.quantity,
            unitCost: suggestion.unitCost!,
            status: "Needed" as PurchaseItemStatus,
          })),
          notes: "AI-assisted materials list. Confirm design quantities, stock, compatibility and live supplier pricing before placing orders.",
          createdAt: now,
          updatedAt: now,
        };
      }, purchaseLists.items, item => purchaseLists.createItem(item));
      setSuggestions([]); setSelectedKeys([]);
      setMessage(`${list.number} saved on this device with ${list.items.length} selected material line${list.items.length === 1 ? "" : "s"}. Check sync status before switching devices.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "The purchase list could not be saved. Your suggestions are still here."); }
  }

  if (!ready) return <Card>Preparing AI Materials Assistant…</Card>;

  const costReview = reviewEstimateCosts(suggestions.filter((suggestion) => selectedKeys.includes(suggestion.key)));

  return (
    <main className="space-y-6">
      <PageHeader
        eyebrow="AI Command Centre"
        title="AI Materials Assistant"
        description="Build a starting material list from the job type, similar JR OS jobs, reusable job packs and the live Materials Library."
        action={<Link href="/ai" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 text-sm font-semibold hover:bg-slate-800"><ArrowLeft className="size-4" />Command Centre</Link>}
      />
      <AiToolNav />
      {message ? <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 px-4 py-3 text-sm text-cyan-200">{message}</div> : null}
      {estimateSave.saved ? <Card><p className="mb-3 text-sm text-emerald-200">{estimateSave.saved.number} is saved. Review the saved list for changes, or generate suggestions again to start another list.</p>{estimateSave.saved.recovered ? <p className="mb-3 text-sm text-amber-200">Recovered the previously saved version. Any later draft edits were not saved; open the saved list to review it.</p> : null}<Link href={purchaseListReviewHref(estimateSave.saved.id)} className="inline-flex min-h-12 items-center rounded-xl bg-cyan-400 px-4 font-semibold text-slate-950">Open saved list · {estimateSave.saved.number}</Link></Card> : null}

      <section className="grid gap-6 xl:grid-cols-[0.75fr_1.25fr]">
        <Card className="h-fit">
          <div className="flex items-center gap-3"><PackageSearch className="size-6 text-amber-300" /><div><h2 className="text-xl font-bold">Describe the job</h2><p className="text-sm text-slate-500">More site detail produces a more relevant starting list.</p></div></div>
          <div className="mt-5 grid gap-4">
            <label className="grid gap-2 text-sm font-medium text-slate-300">
              <span>Job type</span>
              <select value={jobType} onChange={(event) => setJobType(event.target.value as "" | QuoteTemplateType)} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3">
                {jobTypes.map((type) => <option key={type || "auto"} value={type}>{type || "Detect automatically"}</option>)}
              </select>
            </label>
            <label className="grid gap-2 text-sm font-medium text-slate-300">
              <span>Linked job (optional)</span>
              <select value={jobId} onChange={(event) => selectJob(event.target.value)} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3">
                <option value="">No linked job</option>
                {jobs.items.map((job) => <option key={job.id} value={job.id}>{job.title}</option>)}
              </select>
            </label>
            <TextareaField className="min-h-52" label="Scope notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Include point quantities, cable routes, board type, accessories, containment, testing and known site conditions." />
          </div>
          <Button className="mt-5 w-full" disabled={!estimateSave.enabled} onClick={generate}><Sparkles className="mr-2 size-4" />Suggest materials</Button>
          <div className="mt-5 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-100">Suggestions never replace electrical design, manufacturer instructions, cable calculations, protective-device selection or a physical stock check.</div>
        </Card>

        <div className="space-y-6">
          <section className="grid gap-4 sm:grid-cols-3">
            <Card><PackageCheck className="size-5 text-cyan-300" /><p className="mt-3 text-sm text-slate-400">Suggested lines</p><p className="mt-2 text-2xl font-bold">{suggestions.length}</p></Card>
            <Card><Check className="size-5 text-emerald-300" /><p className="mt-3 text-sm text-slate-400">Selected</p><p className="mt-2 text-2xl font-bold">{selectedKeys.length}</p></Card>
            <Card><Plus className="size-5 text-amber-300" /><p className="mt-3 text-sm text-slate-400">{costReview.complete ? "Estimated buying cost" : "Known buying costs"}</p><p className="mt-2 text-2xl font-bold">{money.format(costReview.knownCost)}</p>{selectedKeys.length && !costReview.complete ? <p className="mt-2 text-sm text-amber-300">Costs need review. {costReview.missingCosts} missing; check quantities and amounts.</p> : null}</Card>
          </section>

          {!suggestions.length ? (
            <Card className="grid min-h-80 place-items-center border-dashed text-center"><div><PackageSearch className="mx-auto size-10 text-slate-700" /><h2 className="mt-4 text-xl font-bold">No suggestion set yet</h2><p className="mt-2 text-sm text-slate-500">Describe the job and run the assistant to compare it with JR OS history.</p></div></Card>
          ) : (
            <div className="space-y-3">
              {suggestions.map((suggestion) => {
                const selected = selectedKeys.includes(suggestion.key);
                return (
                  <Card key={suggestion.key} className={selected ? "border-cyan-400/30" : "opacity-60"}>
                    <div className="flex items-start gap-3">
                      <button type="button" disabled={Boolean(estimateSave.saved)} onClick={() => toggle(suggestion.key)} className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-md border ${selected ? "border-cyan-400 bg-cyan-400 text-slate-950" : "border-slate-700"}`} aria-label={`${selected ? "Remove" : "Select"} ${suggestion.description}`}>{selected ? <Check className="size-4" /> : null}</button>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-bold">{suggestion.description}</p><p className="mt-1 text-xs text-slate-500">{suggestion.supplier} · {suggestion.stockCode || "No stock code"}</p></div><span className={`rounded-full px-2 py-1 text-xs font-semibold ${suggestion.confidence === "High" ? "bg-emerald-500/10 text-emerald-300" : suggestion.confidence === "Medium" ? "bg-amber-500/10 text-amber-300" : "bg-slate-800 text-slate-400"}`}>{suggestion.confidence} · {suggestion.confidenceScore}%</span></div>
                        <p className="mt-3 text-sm text-slate-400">{suggestion.reason}</p>
                        <div className="mt-3 grid gap-3 sm:grid-cols-[140px_1fr_1fr]">
                          <InputField label="Quantity" disabled={Boolean(estimateSave.saved)} type="number" min="0" step="any" value={suggestion.quantity} onChange={(event) => updateQuantity(suggestion.key, Number(event.target.value || 0))} />
                          <InputField label="Buying cost each (£)" disabled={Boolean(estimateSave.saved)} type="number" min="0" step="any" value={suggestion.unitCost ?? ""} placeholder="Not recorded" onChange={(event) => updateCost(suggestion.key, event.target.value)} />
                          <div className="rounded-lg bg-slate-950 px-3 py-2"><p className="text-xs text-slate-500">Quote price</p><p className="font-semibold">{money.format(suggestion.unitPrice)}</p></div>
                        </div>
                        <p className="mt-2 text-sm text-slate-400">Cost basis: {suggestion.costBasis}. Check the current supplier price.</p>
                        <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-cyan-400">{suggestion.source} · {suggestion.evidenceCount} reference{suggestion.evidenceCount === 1 ? "" : "s"}</p>
                        <details className="mt-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                          <summary className="cursor-pointer text-sm font-semibold text-violet-300">Why this material?</summary>
                          <div className="mt-3"><WhyRecommendation evidence={suggestion.evidence} showHeading={false} /></div>
                        </details>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}

          {suggestions.length ? <Card><p className="mb-4 text-sm text-slate-400">Check buying costs and quantities for this job. Blank costs need an allowance; enter £0 only when intentional.</p><Button className="w-full" disabled={!costReview.complete || !estimateSave.enabled || !estimateSave.hasDraft || Boolean(estimateSave.saved)} onClick={createPurchaseList}><PackageCheck className="mr-2 size-4" />Save selected items to Purchase Lists</Button><Link href="/purchases" className="mt-3 flex min-h-11 items-center justify-center rounded-xl border border-slate-700 text-sm font-semibold hover:bg-slate-800">Open Purchase Lists</Link></Card> : null}
        </div>
      </section>
    </main>
  );
}
