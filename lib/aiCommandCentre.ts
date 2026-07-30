import { annualOverheadCost, calculateQuoteProfitability } from "./quoteEngine";
import { invoiceTotal } from "./workflow";
import type {
  AiReminder,
  BusinessOverhead,
  CustomerProfile,
  ElectricalCertificate,
  Invoice,
  Job,
  JobPack,
  LabourCostSettings,
  LabourRate,
  Material,
  PlannerEntry,
  PricingDocument,
  PricingLineItem,
  QuoteLabourMode,
  QuotePricingSettings,
  QuoteTemplateType,
} from "./models";

export type AiRecommendationSeverity = "Urgent" | "Warning" | "Opportunity" | "Good";
export type AiRecommendationKind = "Margin" | "Certificate" | "Invoice" | "Quote" | "Workflow" | "Reminder";

export interface AiRecommendation {
  id: string;
  kind: AiRecommendationKind;
  severity: AiRecommendationSeverity;
  title: string;
  detail: string;
  href: string;
  recordId?: string;
}

export interface AiMaterialSuggestion {
  key: string;
  materialId?: string;
  description: string;
  quantity: number;
  unitCost: number;
  unitPrice: number;
  supplier: string;
  stockCode: string;
  supplierUrl?: string;
  source: "Previous JR OS jobs" | "Job pack" | "Materials library";
  confidence: "High" | "Medium" | "Low";
  evidenceCount: number;
  reason: string;
}

export interface AiPricingRecommendation {
  jobType: QuoteTemplateType;
  labourRate?: LabourRate;
  labourMode: QuoteLabourMode;
  labourQuantity: number;
  labourHours: number;
  labourCost: number;
  labourPrice: number;
  overheadHourlyCost: number;
  breakEvenHourlyRate: number;
  recommendedHourlyRate: number;
  materialMarkupPercent: number;
  contingencyPercent: number;
  targetNetMargin: number;
  expectedLabourMargin: number;
  evidenceCount: number;
  reasons: string[];
}

export interface AiQuoteDraft {
  jobType: QuoteTemplateType;
  title: string;
  scopeItems: string[];
  items: PricingLineItem[];
  pricingSettings: QuotePricingSettings;
  profitability: ReturnType<typeof calculateQuoteProfitability>;
  materials: AiMaterialSuggestion[];
  pricing: AiPricingRecommendation;
  notes: string;
}

export interface AiBusinessMonth {
  key: string;
  label: string;
  revenue: number;
  expectedProfit: number;
  invoiceCount: number;
  acceptedQuotes: number;
  decidedQuotes: number;
}

export interface AiBusinessCoachSnapshot {
  quoteConversion: number;
  averageNetMargin: number;
  monthlyRevenue: number;
  monthlyProfit: number;
  unpaidInvoiceCount: number;
  unpaidInvoiceValue: number;
  overdueInvoiceCount: number;
  revenueTrendPercent: number | null;
  profitTrendPercent: number | null;
  months: AiBusinessMonth[];
  coaching: AiRecommendation[];
}

const jobTypeKeywords: Array<[QuoteTemplateType, string[]]> = [
  ["Rewire", ["rewire", "re-wire", "full house wiring", "first fix", "second fix"]],
  ["EICR", ["eicr", "condition report", "landlord report", "periodic inspection"]],
  ["Consumer Unit", ["consumer unit", "fuse board", "fuseboard", "board change", "rcbo board"]],
  ["Fault Finding", ["fault finding", "fault", "tripping", "diagnostic", "loss of power", "not working"]],
  ["Commercial", ["commercial", "office", "shop", "warehouse", "church", "pub", "containment", "three phase"]],
  ["Domestic", ["domestic", "house", "flat", "socket", "light", "bathroom", "kitchen"]],
];

const stopWords = new Set([
  "and", "the", "for", "with", "from", "this", "that", "then", "into", "onto", "will", "need", "needs",
  "quote", "price", "customer", "job", "work", "works", "supply", "install", "replace", "move", "add", "new",
]);

const fallbackHours: Record<QuoteTemplateType, number> = {
  Domestic: 8,
  Commercial: 16,
  Rewire: 120,
  EICR: 4,
  "Consumer Unit": 8,
  "Fault Finding": 2,
};

const fallbackTitles: Record<QuoteTemplateType, string> = {
  Domestic: "Domestic electrical works",
  Commercial: "Commercial electrical works",
  Rewire: "Electrical rewire",
  EICR: "Electrical Installation Condition Report",
  "Consumer Unit": "Consumer unit replacement",
  "Fault Finding": "Electrical fault finding",
};

function dateKey(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function monthKey(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}`;
}

function normalise(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function tokens(value: string) {
  return new Set(normalise(value).split(/\s+/).filter((token) => token.length > 2 && !stopWords.has(token)));
}

function overlapScore(left: Set<string>, right: Set<string>) {
  if (!left.size || !right.size) return 0;
  let matches = 0;
  left.forEach((token) => {
    if (right.has(token)) matches += 1;
  });
  return matches / Math.max(1, Math.min(left.size, right.size));
}

function itemKey(materialId: string | undefined, description: string) {
  return materialId || normalise(description);
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function daysFrom(now: Date, value: string) {
  if (!value) return Number.POSITIVE_INFINITY;
  const target = new Date(`${value}T12:00:00`);
  const current = new Date(`${dateKey(now)}T12:00:00`);
  return Math.ceil((target.getTime() - current.getTime()) / 86_400_000);
}

function titleFromNotes(notes: string, jobType: QuoteTemplateType) {
  const firstLine = notes
    .split(/\n|[.;]/)
    .map((item) => item.replace(/^[-*•\d).\s]+/, "").trim())
    .find((item) => item.length >= 5 && item.length <= 90);
  if (!firstLine) return fallbackTitles[jobType];
  const cleaned = firstLine
    .replace(/^(please\s+)?(can you\s+)?(quote|price|estimate)\s+(for\s+)?/i, "")
    .trim();
  return cleaned ? `${cleaned.charAt(0).toUpperCase()}${cleaned.slice(1)}` : fallbackTitles[jobType];
}

export function inferJobType(notes: string, selected?: QuoteTemplateType | ""): QuoteTemplateType {
  if (selected) return selected;
  const source = normalise(notes);
  for (const [type, keywords] of jobTypeKeywords) {
    if (keywords.some((keyword) => source.includes(normalise(keyword)))) return type;
  }
  return "Domestic";
}

export function extractScopeItems(notes: string) {
  const pieces = notes
    .split(/\n|[.;](?=\s|$)/)
    .map((item) => item.replace(/^[-*•\d).\s]+/, "").replace(/\s+/g, " ").trim())
    .filter((item) => item.length >= 4);
  return [...new Set(pieces)].slice(0, 12);
}

function relevantRecordScore(text: string, jobType: QuoteTemplateType, contextTokens: Set<string>, templateType?: QuoteTemplateType) {
  const typeBoost = templateType === jobType ? 1 : inferJobType(text) === jobType ? 0.55 : 0;
  return typeBoost + overlapScore(contextTokens, tokens(text));
}

export function suggestMaterials({
  notes,
  jobType: selectedJobType,
  materials,
  documents,
  jobs,
  jobPacks,
  markupPercent,
  limit = 12,
}: {
  notes: string;
  jobType?: QuoteTemplateType | "";
  materials: Material[];
  documents: PricingDocument[];
  jobs: Job[];
  jobPacks: JobPack[];
  markupPercent: number;
  limit?: number;
}) {
  const jobType = inferJobType(notes, selectedJobType);
  const contextTokens = tokens(`${jobType} ${notes}`);
  const materialById = new Map(materials.map((material) => [material.id, material]));
  const aggregates = new Map<string, {
    suggestion: AiMaterialSuggestion;
    totalQuantity: number;
    occurrences: number;
    score: number;
  }>();

  function addSuggestion(suggestion: AiMaterialSuggestion, score: number) {
    const key = itemKey(suggestion.materialId, suggestion.description);
    const existing = aggregates.get(key);
    if (!existing) {
      aggregates.set(key, {
        suggestion,
        totalQuantity: suggestion.quantity,
        occurrences: Math.max(1, suggestion.evidenceCount),
        score,
      });
      return;
    }
    existing.totalQuantity += suggestion.quantity;
    existing.occurrences += Math.max(1, suggestion.evidenceCount);
    existing.score = Math.max(existing.score, score) + 0.1;
    if (existing.suggestion.source !== "Previous JR OS jobs" && suggestion.source === "Previous JR OS jobs") {
      existing.suggestion = suggestion;
    }
  }

  const linkedJobByQuote = new Map(jobs.filter((job) => job.sourceQuoteId).map((job) => [job.sourceQuoteId!, job]));
  documents
    .map((document) => {
      const linkedJob = linkedJobByQuote.get(document.id) ?? jobs.find((job) => job.id === document.jobId);
      const text = `${document.title} ${document.notes} ${linkedJob?.title ?? ""} ${linkedJob?.notes ?? ""}`;
      return { document, linkedJob, score: relevantRecordScore(text, jobType, contextTokens, document.templateType) };
    })
    .filter(({ document, linkedJob, score }) => score > 0.35 && (Boolean(linkedJob) || ["Accepted", "Sent"].includes(document.status)))
    .toSorted((left, right) => right.score - left.score)
    .slice(0, 8)
    .forEach(({ document, score }) => {
      document.items.filter((item) => item.category === "Materials").forEach((line) => {
        const material = line.materialId ? materialById.get(line.materialId) : undefined;
        const unitCost = line.unitCost ?? material?.tradeCost ?? line.unitPrice;
        addSuggestion({
          key: itemKey(line.materialId, line.description),
          materialId: line.materialId,
          description: material?.name || line.description,
          quantity: line.quantity,
          unitCost,
          unitPrice: unitCost * (1 + markupPercent / 100),
          supplier: line.supplier || material?.supplier || "Supplier to confirm",
          stockCode: line.stockCode || material?.stockCode || "",
          supplierUrl: material?.supplierUrl,
          source: "Previous JR OS jobs",
          confidence: score >= 1 ? "High" : "Medium",
          evidenceCount: 1,
          reason: `Used on similar JR OS work (${document.number} · ${document.title}).`,
        }, score + 2);
      });
    });

  jobPacks
    .map((pack) => ({
      pack,
      score: relevantRecordScore(`${pack.name} ${pack.category} ${pack.description} ${pack.notes}`, jobType, contextTokens),
    }))
    .filter(({ score }) => score > 0.35)
    .toSorted((left, right) => right.score - left.score)
    .slice(0, 5)
    .forEach(({ pack, score }) => {
      pack.materials.forEach((packMaterial) => {
        const material = packMaterial.materialId ? materialById.get(packMaterial.materialId) : undefined;
        const unitCost = material?.tradeCost ?? packMaterial.unitPrice;
        addSuggestion({
          key: itemKey(packMaterial.materialId, packMaterial.description),
          materialId: packMaterial.materialId,
          description: material?.name || packMaterial.description,
          quantity: packMaterial.quantity,
          unitCost,
          unitPrice: unitCost * (1 + markupPercent / 100),
          supplier: material?.supplier || "Supplier to confirm",
          stockCode: material?.stockCode || "",
          supplierUrl: material?.supplierUrl,
          source: "Job pack",
          confidence: score >= 1 ? "High" : "Medium",
          evidenceCount: 1,
          reason: `Included in the ${pack.name} JR OS job pack.`,
        }, score + 1);
      });
    });

  if (aggregates.size < Math.min(5, limit)) {
    const categoryKeywords: Partial<Record<QuoteTemplateType, string[]>> = {
      Rewire: ["cable", "protection", "accessories", "consumer unit"],
      EICR: ["testing", "labels", "accessories"],
      "Consumer Unit": ["protection", "consumer unit", "rcbo", "spd"],
      "Fault Finding": ["testing", "connectors", "accessories"],
      Commercial: ["containment", "cable", "accessories", "lighting"],
      Domestic: ["accessories", "cable", "lighting", "protection"],
    };
    const wanted = categoryKeywords[jobType] ?? [];
    materials
      .filter((material) => material.favourite || wanted.some((value) => `${material.category} ${material.name}`.toLowerCase().includes(value)))
      .toSorted((left, right) => Number(right.favourite) - Number(left.favourite) || right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, limit)
      .forEach((material) => addSuggestion({
        key: material.id,
        materialId: material.id,
        description: material.name,
        quantity: 1,
        unitCost: material.tradeCost,
        unitPrice: material.tradeCost * (1 + markupPercent / 100),
        supplier: material.supplier || "Supplier to confirm",
        stockCode: material.stockCode,
        supplierUrl: material.supplierUrl,
        source: "Materials library",
        confidence: "Low",
        evidenceCount: 1,
        reason: `Matches the ${jobType.toLowerCase()} job type or is saved as a favourite.`,
      }, material.favourite ? 0.65 : 0.35));
  }

  return [...aggregates.values()]
    .map(({ suggestion, totalQuantity, occurrences, score }) => ({
      ...suggestion,
      quantity: Math.max(0.01, roundMoney(totalQuantity / Math.max(1, occurrences))),
      unitCost: roundMoney(suggestion.unitCost),
      unitPrice: roundMoney(suggestion.unitCost * (1 + markupPercent / 100)),
      evidenceCount: occurrences,
      confidence: score >= 2.7 || occurrences >= 3 ? "High" as const : score >= 1.2 ? "Medium" as const : "Low" as const,
    }))
    .toSorted((left, right) => {
      const confidence = { High: 3, Medium: 2, Low: 1 };
      return confidence[right.confidence] - confidence[left.confidence] || right.evidenceCount - left.evidenceCount;
    })
    .slice(0, limit);
}

function rateHourlyCost(rate: LabourRate | undefined, labourSettings: LabourCostSettings) {
  if (!rate) return 0;
  if (rate.unit === "Day") return rate.costRate / Math.max(1, labourSettings.billableHoursPerDay);
  if (rate.unit === "Half day") return rate.costRate / Math.max(1, labourSettings.billableHoursPerDay / 2);
  return rate.costRate;
}

export function recommendPricing({
  notes,
  jobType: selectedJobType,
  labourRates,
  overheads,
  labourSettings,
  quoteSettings,
  documents,
  jobPacks,
}: {
  notes: string;
  jobType?: QuoteTemplateType | "";
  labourRates: LabourRate[];
  overheads: BusinessOverhead[];
  labourSettings: LabourCostSettings;
  quoteSettings: QuotePricingSettings;
  documents: PricingDocument[];
  jobPacks: JobPack[];
}): AiPricingRecommendation {
  const jobType = inferJobType(notes, selectedJobType);
  const contextTokens = tokens(`${jobType} ${notes}`);
  const historicHours = documents
    .map((document) => ({
      score: relevantRecordScore(`${document.title} ${document.notes}`, jobType, contextTokens, document.templateType),
      hours: document.items
        .filter((item) => item.category === "Labour")
        .reduce((sum, item) => sum + (item.labourHours ?? (item.labourMode === "Days" ? item.quantity * labourSettings.billableHoursPerDay : item.quantity)), 0),
    }))
    .filter((item) => item.score > 0.5 && item.hours > 0)
    .toSorted((left, right) => right.score - left.score)
    .slice(0, 8);
  const packHours = jobPacks
    .map((pack) => ({
      score: relevantRecordScore(`${pack.name} ${pack.category} ${pack.description}`, jobType, contextTokens),
      hours: pack.labourHours,
    }))
    .filter((item) => item.score > 0.5 && item.hours > 0)
    .toSorted((left, right) => right.score - left.score)
    .slice(0, 5);
  const evidence = [...historicHours, ...packHours];
  const labourHours = evidence.length
    ? evidence.reduce((sum, item) => sum + item.hours, 0) / evidence.length
    : fallbackHours[jobType];
  const roundedHours = Math.max(1, Math.round(labourHours * 2) / 2);
  const labourMode: QuoteLabourMode = roundedHours >= labourSettings.billableHoursPerDay * 1.5 ? "Days" : "Hours";
  const activeRates = labourRates.filter((rate) => rate.active);
  const preferred = activeRates.find((rate) => rate.id === quoteSettings.defaultLabourRateId);
  const matchingUnit = labourMode === "Days"
    ? activeRates.find((rate) => rate.unit === "Day" && /day|electrician/i.test(rate.name))
    : activeRates.find((rate) => rate.unit === "Hour" && /hour|electrician/i.test(rate.name));
  const labourRate = preferred ?? matchingUnit ?? activeRates.find((rate) => rate.unit === (labourMode === "Days" ? "Day" : "Hour")) ?? activeRates[0];
  const annualOverheads = overheads.reduce((sum, overhead) => sum + annualOverheadCost(overhead), 0);
  const annualBillableHours = labourSettings.workingDaysPerYear * labourSettings.billableHoursPerDay;
  const overheadHourlyCost = annualBillableHours > 0 ? annualOverheads / annualBillableHours : 0;
  const labourHourlyCost = rateHourlyCost(labourRate, labourSettings);
  const breakEvenHourlyRate = labourHourlyCost + overheadHourlyCost;
  const marginDivisor = Math.max(0.05, 1 - labourSettings.targetNetMargin / 100);
  const recommendedHourlyRate = breakEvenHourlyRate / marginDivisor;
  const labourQuantity = labourMode === "Days"
    ? Math.max(0.5, Math.ceil((roundedHours / labourSettings.billableHoursPerDay) * 2) / 2)
    : roundedHours;
  const unitCost = labourRate?.costRate ?? 0;
  const savedCharge = labourRate?.chargeRate ?? 0;
  const recommendedUnitCharge = labourMode === "Days"
    ? Math.max(savedCharge, recommendedHourlyRate * labourSettings.billableHoursPerDay)
    : Math.max(savedCharge, recommendedHourlyRate);
  const labourCost = labourQuantity * unitCost;
  const labourPrice = labourQuantity * recommendedUnitCharge;
  const totalLabourCost = labourCost + roundedHours * overheadHourlyCost;
  const expectedLabourMargin = labourPrice > 0 ? ((labourPrice - totalLabourCost) / labourPrice) * 100 : 0;
  const baseContingency = Math.max(quoteSettings.contingencyPercent, labourSettings.contingencyPercent);
  const riskAdjustment = jobType === "Rewire" || jobType === "Fault Finding" ? 2.5 : 0;
  const contingencyPercent = Math.min(25, baseContingency + riskAdjustment);
  const materialMarkupPercent = Math.max(0, quoteSettings.materialMarkupPercent);
  const reasons = [
    evidence.length
      ? `Labour allowance uses ${evidence.length} similar saved quote or job-pack record${evidence.length === 1 ? "" : "s"}.`
      : `No close history was found, so the ${jobType.toLowerCase()} starter allowance is being used.`,
    labourRate
      ? `${labourRate.name} is the closest active Labour & Costs rate.`
      : "No active labour rate is saved; complete Labour & Costs before sending the quote.",
    `Break-even includes ${roundMoney(overheadHourlyCost).toFixed(2)} per billable hour of saved business overhead.`,
    `Material mark-up starts from the saved Quote Engine default of ${materialMarkupPercent.toFixed(1)}%.`,
    riskAdjustment
      ? `A small risk allowance was added for ${jobType.toLowerCase()} uncertainty; review it after the survey.`
      : `Contingency follows the saved Labour & Costs and Quote Engine defaults.`,
  ];

  return {
    jobType,
    labourRate,
    labourMode,
    labourQuantity: roundMoney(labourQuantity),
    labourHours: roundedHours,
    labourCost: roundMoney(labourCost),
    labourPrice: roundMoney(labourPrice),
    overheadHourlyCost: roundMoney(overheadHourlyCost),
    breakEvenHourlyRate: roundMoney(breakEvenHourlyRate),
    recommendedHourlyRate: roundMoney(recommendedHourlyRate),
    materialMarkupPercent: roundMoney(materialMarkupPercent),
    contingencyPercent: roundMoney(contingencyPercent),
    targetNetMargin: labourSettings.targetNetMargin,
    expectedLabourMargin: roundMoney(expectedLabourMargin),
    evidenceCount: evidence.length,
    reasons,
  };
}

export function buildAiQuoteDraft({
  notes,
  jobType,
  materials,
  documents,
  jobs,
  jobPacks,
  labourRates,
  overheads,
  labourSettings,
  quoteSettings,
  createId,
}: {
  notes: string;
  jobType?: QuoteTemplateType | "";
  materials: Material[];
  documents: PricingDocument[];
  jobs: Job[];
  jobPacks: JobPack[];
  labourRates: LabourRate[];
  overheads: BusinessOverhead[];
  labourSettings: LabourCostSettings;
  quoteSettings: QuotePricingSettings;
  createId: (prefix: string) => string;
}): AiQuoteDraft {
  const pricing = recommendPricing({ notes, jobType, labourRates, overheads, labourSettings, quoteSettings, documents, jobPacks });
  const materialSuggestions = suggestMaterials({
    notes,
    jobType: pricing.jobType,
    materials,
    documents,
    jobs,
    jobPacks,
    markupPercent: pricing.materialMarkupPercent,
  });
  const items: PricingLineItem[] = [];
  if (pricing.labourRate && pricing.labourPrice > 0) {
    items.push({
      id: createId("ai-line"),
      description: `${pricing.labourRate.name} · ${pricing.labourMode.toLowerCase()}`,
      category: "Labour",
      quantity: pricing.labourQuantity,
      unitCost: pricing.labourRate.costRate,
      unitPrice: pricing.labourPrice / pricing.labourQuantity,
      labourRateId: pricing.labourRate.id,
      labourMode: pricing.labourMode,
      labourHours: pricing.labourHours,
    });
  }
  materialSuggestions.forEach((suggestion) => {
    items.push({
      id: createId("ai-line"),
      description: suggestion.description,
      category: "Materials",
      quantity: suggestion.quantity,
      unitCost: suggestion.unitCost,
      unitPrice: suggestion.unitPrice,
      materialId: suggestion.materialId,
      supplier: suggestion.supplier,
      stockCode: suggestion.stockCode,
    });
  });
  const pricingSettings: QuotePricingSettings = {
    ...quoteSettings,
    defaultLabourRateId: pricing.labourRate?.id ?? quoteSettings.defaultLabourRateId,
    materialMarkupPercent: pricing.materialMarkupPercent,
    contingencyPercent: pricing.contingencyPercent,
  };
  return {
    jobType: pricing.jobType,
    title: titleFromNotes(notes, pricing.jobType),
    scopeItems: extractScopeItems(notes),
    items,
    pricingSettings,
    profitability: calculateQuoteProfitability(items, pricingSettings, overheads, labourSettings),
    materials: materialSuggestions,
    pricing,
    notes: [
      "AI-assisted draft created from supplied notes. Check quantities, cable routes, access, testing, certification and exclusions before sending.",
      notes.trim(),
    ].filter(Boolean).join("\n\n"),
  };
}

export function buildSmartRecommendations({
  jobs,
  documents,
  invoices,
  certificates,
  reminders = [],
  labourSettings,
  now = new Date(),
}: {
  jobs: Job[];
  documents: PricingDocument[];
  invoices: Invoice[];
  certificates: ElectricalCertificate[];
  reminders?: AiReminder[];
  labourSettings: LabourCostSettings;
  now?: Date;
}) {
  const recommendations: AiRecommendation[] = [];
  const lowMargin = documents
    .filter((document) => document.type === "Quote" && ["Draft", "Sent", "Accepted"].includes(document.status) && document.profitability)
    .filter((document) => document.profitability!.netMargin < labourSettings.targetNetMargin)
    .toSorted((left, right) => left.profitability!.netMargin - right.profitability!.netMargin);
  if (lowMargin.length) {
    const worst = lowMargin[0];
    recommendations.push({
      id: "low-margin",
      kind: "Margin",
      severity: worst.profitability!.netMargin < 10 ? "Urgent" : "Warning",
      title: `${lowMargin.length} quote${lowMargin.length === 1 ? "" : "s"} below target margin`,
      detail: `${worst.number} is lowest at ${worst.profitability!.netMargin.toFixed(1)}% versus the ${labourSettings.targetNetMargin.toFixed(1)}% saved target.`,
      href: `/quotes/${worst.id}`,
      recordId: worst.id,
    });
  }

  const completedWithoutCertificate = jobs.filter((job) =>
    job.status === "Complete" && !certificates.some((certificate) => certificate.jobId === job.id && !["Draft", "Superseded"].includes(certificate.status)),
  );
  if (completedWithoutCertificate.length) {
    recommendations.push({
      id: "missing-certificates",
      kind: "Certificate",
      severity: "Warning",
      title: `${completedWithoutCertificate.length} completed job${completedWithoutCertificate.length === 1 ? "" : "s"} need a certificate check`,
      detail: `${completedWithoutCertificate[0].title} has no completed or issued certificate linked. Confirm whether certification is required.`,
      href: `/jobs/${completedWithoutCertificate[0].id}`,
      recordId: completedWithoutCertificate[0].id,
    });
  }

  const overdue = invoices.filter((invoice) =>
    !["Paid", "Cancelled"].includes(invoice.status) && invoice.dueDate && daysFrom(now, invoice.dueDate) < 0,
  );
  if (overdue.length) {
    const value = overdue.reduce((sum, invoice) => sum + Math.max(0, invoiceTotal(invoice) - invoice.amountPaid), 0);
    recommendations.push({
      id: "overdue-invoices",
      kind: "Invoice",
      severity: "Urgent",
      title: `${overdue.length} overdue invoice${overdue.length === 1 ? "" : "s"}`,
      detail: `£${value.toFixed(2)} is overdue. Chase the oldest balance and record any payment received.`,
      href: "/invoices",
    });
  }

  const expiring = documents
    .filter((document) => document.type === "Quote" && ["Draft", "Sent"].includes(document.status) && document.validUntil)
    .map((document) => ({ document, days: daysFrom(now, document.validUntil) }))
    .filter(({ days }) => days <= 7)
    .toSorted((left, right) => left.days - right.days);
  if (expiring.length) {
    const first = expiring[0];
    recommendations.push({
      id: "expiring-quotes",
      kind: "Quote",
      severity: first.days < 0 ? "Urgent" : "Warning",
      title: `${expiring.length} quote${expiring.length === 1 ? "" : "s"} expiring or expired`,
      detail: `${first.document.number} ${first.days < 0 ? `expired ${Math.abs(first.days)} day${Math.abs(first.days) === 1 ? "" : "s"} ago` : `expires in ${first.days} day${first.days === 1 ? "" : "s"}`}. Review pricing before following up.`,
      href: `/quotes/${first.document.id}`,
      recordId: first.document.id,
    });
  }

  const acceptedWithoutJob = documents.filter((document) => document.type === "Quote" && document.status === "Accepted" && !document.jobId);
  if (acceptedWithoutJob.length) {
    recommendations.push({
      id: "accepted-without-job",
      kind: "Workflow",
      severity: "Opportunity",
      title: `${acceptedWithoutJob.length} accepted quote${acceptedWithoutJob.length === 1 ? "" : "s"} ready to convert`,
      detail: "Create the linked job so scheduling, materials, certification and invoicing remain connected.",
      href: "/ai#action-centre",
    });
  }

  const completedWithoutInvoice = jobs.filter((job) =>
    job.status === "Complete" && !invoices.some((invoice) => invoice.jobId === job.id && invoice.status !== "Cancelled"),
  );
  if (completedWithoutInvoice.length) {
    recommendations.push({
      id: "completed-without-invoice",
      kind: "Workflow",
      severity: "Urgent",
      title: `${completedWithoutInvoice.length} completed job${completedWithoutInvoice.length === 1 ? "" : "s"} not invoiced`,
      detail: `${completedWithoutInvoice[0].title} can be turned into a linked draft invoice now.`,
      href: "/ai#action-centre",
      recordId: completedWithoutInvoice[0].id,
    });
  }

  const dueReminders = reminders.filter((reminder) => !reminder.completed && reminder.dueDate && daysFrom(now, reminder.dueDate) <= 0);
  if (dueReminders.length) {
    recommendations.push({
      id: "due-reminders",
      kind: "Reminder",
      severity: dueReminders.some((reminder) => reminder.priority === "Urgent") ? "Urgent" : "Warning",
      title: `${dueReminders.length} reminder${dueReminders.length === 1 ? "" : "s"} due`,
      detail: dueReminders[0].title,
      href: "/ai#today",
    });
  }

  if (!recommendations.length) {
    recommendations.push({
      id: "all-clear",
      kind: "Workflow",
      severity: "Good",
      title: "No urgent warnings detected",
      detail: "Saved JR OS records show no overdue invoices, low-margin live quotes, expiring quotes or incomplete workflow hand-offs.",
      href: "/ai",
    });
  }

  const severityOrder: Record<AiRecommendationSeverity, number> = { Urgent: 4, Warning: 3, Opportunity: 2, Good: 1 };
  return recommendations.toSorted((left, right) => severityOrder[right.severity] - severityOrder[left.severity]);
}

export function buildTodayAssistant({
  jobs,
  planner,
  documents,
  invoices,
  profiles,
  reminders,
  recommendations,
  now = new Date(),
}: {
  jobs: Job[];
  planner: PlannerEntry[];
  documents: PricingDocument[];
  invoices: Invoice[];
  profiles: CustomerProfile[];
  reminders: AiReminder[];
  recommendations: AiRecommendation[];
  now?: Date;
}) {
  const today = dateKey(now);
  const todaysJobs = jobs.filter((job) => job.startDate === today && !["Complete", "On hold"].includes(job.status));
  const todaysPlanner = planner.filter((entry) => entry.date === today && entry.status !== "Cancelled");
  const overdueInvoices = invoices
    .filter((invoice) => !["Paid", "Cancelled"].includes(invoice.status) && invoice.dueDate && daysFrom(now, invoice.dueDate) < 0)
    .toSorted((left, right) => left.dueDate.localeCompare(right.dueDate));
  const quoteFollowUps = documents
    .filter((document) => document.type === "Quote" && document.status === "Sent")
    .filter((document) => {
      const ageDays = Math.floor((now.getTime() - new Date(document.updatedAt).getTime()) / 86_400_000);
      return ageDays >= 3 || daysFrom(now, document.validUntil) <= 7;
    })
    .toSorted((left, right) => left.updatedAt.localeCompare(right.updatedAt));
  const dueReminders = reminders
    .filter((reminder) => !reminder.completed && reminder.dueDate && reminder.dueDate <= today)
    .toSorted((left, right) => left.dueDate.localeCompare(right.dueDate) || left.dueTime.localeCompare(right.dueTime));
  const customerFollowUps = profiles
    .filter((profile) => profile.nextFollowUpDate && profile.nextFollowUpDate <= today)
    .toSorted((left, right) => left.nextFollowUpDate.localeCompare(right.nextFollowUpDate));

  return {
    today,
    todaysJobs,
    todaysPlanner,
    overdueInvoices,
    quoteFollowUps,
    dueReminders,
    customerFollowUps,
    urgentActions: recommendations.filter((item) => item.severity === "Urgent").slice(0, 5),
  };
}

function trend(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export function buildBusinessCoach({
  documents,
  invoices,
  jobs,
  certificates,
  reminders = [],
  labourSettings,
  now = new Date(),
}: {
  documents: PricingDocument[];
  invoices: Invoice[];
  jobs: Job[];
  certificates: ElectricalCertificate[];
  reminders?: AiReminder[];
  labourSettings: LabourCostSettings;
  now?: Date;
}): AiBusinessCoachSnapshot {
  const quotes = documents.filter((document) => document.type === "Quote");
  const decidedQuotes = quotes.filter((quote) => ["Accepted", "Declined", "Expired"].includes(quote.status));
  const acceptedQuotes = decidedQuotes.filter((quote) => quote.status === "Accepted");
  const marginQuotes = quotes.filter((quote) => quote.profitability && ["Sent", "Accepted"].includes(quote.status));
  const averageNetMargin = marginQuotes.length
    ? marginQuotes.reduce((sum, quote) => sum + quote.profitability!.netMargin, 0) / marginQuotes.length
    : 0;
  const quotesById = new Map(quotes.map((quote) => [quote.id, quote]));
  const months: AiBusinessMonth[] = [];

  for (let offset = 5; offset >= 0; offset -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const key = monthKey(date);
    const monthInvoices = invoices.filter((invoice) => invoice.status !== "Cancelled" && invoice.issueDate.startsWith(key));
    const monthQuotes = quotes.filter((quote) => (quote.updatedAt || quote.createdAt).startsWith(key) && ["Accepted", "Declined", "Expired"].includes(quote.status));
    const revenue = monthInvoices.reduce((sum, invoice) => sum + invoice.items.reduce((lineSum, item) => lineSum + item.quantity * item.unitPrice, 0), 0);
    const expectedProfit = monthInvoices.reduce((sum, invoice) => {
      const quote = invoice.quoteId ? quotesById.get(invoice.quoteId) : undefined;
      if (quote?.profitability) {
        const share = quote.profitability.sellingPrice > 0
          ? invoice.items.reduce((lineSum, item) => lineSum + item.quantity * item.unitPrice, 0) / quote.profitability.sellingPrice
          : 1;
        return sum + quote.profitability.expectedProfit * share;
      }
      return sum + invoice.items.reduce((lineSum, item) => lineSum + item.quantity * (item.unitPrice - (item.unitCost ?? item.unitPrice)), 0);
    }, 0);
    months.push({
      key,
      label: date.toLocaleDateString("en-GB", { month: "short" }),
      revenue,
      expectedProfit,
      invoiceCount: monthInvoices.length,
      acceptedQuotes: monthQuotes.filter((quote) => quote.status === "Accepted").length,
      decidedQuotes: monthQuotes.length,
    });
  }

  const currentMonth = months.at(-1)!;
  const previousMonth = months.at(-2)!;
  const unpaidInvoices = invoices.filter((invoice) => !["Paid", "Cancelled"].includes(invoice.status));
  const unpaidInvoiceValue = unpaidInvoices.reduce((sum, invoice) => sum + Math.max(0, invoiceTotal(invoice) - invoice.amountPaid), 0);
  const overdueInvoiceCount = unpaidInvoices.filter((invoice) => invoice.dueDate && daysFrom(now, invoice.dueDate) < 0).length;
  const coaching = buildSmartRecommendations({ jobs, documents, invoices, certificates, reminders, labourSettings, now });

  if (acceptedQuotes.length >= 3 && acceptedQuotes.length / Math.max(1, decidedQuotes.length) < 0.35) {
    coaching.push({
      id: "conversion-coaching",
      kind: "Quote",
      severity: "Opportunity",
      title: "Quote conversion needs attention",
      detail: "Review declined quotes for price, response-time or scope patterns before changing rates across every job.",
      href: "/quotes",
    });
  }
  if (marginQuotes.length && averageNetMargin < labourSettings.targetNetMargin) {
    coaching.push({
      id: "margin-coaching",
      kind: "Margin",
      severity: "Warning",
      title: "Average live margin is below target",
      detail: `Average net margin is ${averageNetMargin.toFixed(1)}% against the ${labourSettings.targetNetMargin.toFixed(1)}% target. Check labour recovery, overhead and material mark-up.`,
      href: "/ai/pricing",
    });
  }
  if (trend(currentMonth.revenue, previousMonth.revenue) !== null && (trend(currentMonth.revenue, previousMonth.revenue) ?? 0) < -20) {
    coaching.push({
      id: "revenue-coaching",
      kind: "Workflow",
      severity: "Opportunity",
      title: "Monthly invoiced revenue has slowed",
      detail: "Check accepted quotes waiting for jobs, completed work waiting for invoices and open quotes needing follow-up.",
      href: "/ai#action-centre",
    });
  }

  return {
    quoteConversion: decidedQuotes.length ? (acceptedQuotes.length / decidedQuotes.length) * 100 : 0,
    averageNetMargin,
    monthlyRevenue: currentMonth.revenue,
    monthlyProfit: currentMonth.expectedProfit,
    unpaidInvoiceCount: unpaidInvoices.length,
    unpaidInvoiceValue,
    overdueInvoiceCount,
    revenueTrendPercent: trend(currentMonth.revenue, previousMonth.revenue),
    profitTrendPercent: trend(currentMonth.expectedProfit, previousMonth.expectedProfit),
    months,
    coaching: coaching.filter((item, index, all) => all.findIndex((candidate) => candidate.id === item.id) === index),
  };
}
