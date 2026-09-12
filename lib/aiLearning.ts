import type {
  AiConfidenceBreakdown,
  AiConfidenceLevel,
  AiLearningEvidence,
  AiLearningJobPattern,
  AiLearningMaterialPattern,
  AiLearningMemory,
  Builder,
  Customer,
  CustomerInteraction,
  CustomerProfile,
  Invoice,
  Job,
  LabourCostSettings,
  Material,
  PricingDocument,
  PricingLineItem,
  QuotePricingSettings,
  QuoteTemplateType,
} from "./models";
import { invoiceTotal, pricingDocumentNetTotal } from "./workflow";

export const AI_LEARNING_MEMORY_KEY = "jr-os-ai-learning-memory";

export interface AiLearningSources {
  jobs: Job[];
  documents: PricingDocument[];
  invoices: Invoice[];
  customers: Customer[];
  builders: Builder[];
  profiles: CustomerProfile[];
  interactions: CustomerInteraction[];
  materials: Material[];
}

export interface AiQuoteLearningSuggestion {
  jobType: QuoteTemplateType;
  sampleSize: number;
  averageSellingPrice: number;
  averageLabourHours: number;
  averageLabourPricePerHour: number;
  averageNetMargin: number;
  averageMaterialMarkup: number;
  averageContingency: number;
  confidence: AiConfidenceBreakdown;
  evidence: AiLearningEvidence[];
}

export interface CustomerInsight {
  quoteCount: number;
  acceptedQuotes: number;
  completedJobs: number;
  totalInvoiced: number;
  totalPaid: number;
  outstanding: number;
  averagePaymentDays: number | null;
  paymentHistory: string;
  preferredContact: CustomerProfile["preferredContact"] | "Not recorded";
  preferences: string[];
  repeatCustomer: boolean;
  lastActivityAt: string;
}

export interface BuilderInsight {
  quoteCount: number;
  acceptedQuotes: number;
  conversionRate: number;
  jobCount: number;
  completedJobs: number;
  averageJobValue: number;
  totalInvoiced: number;
  totalPaid: number;
  outstanding: number;
  averagePaymentDays: number | null;
  paymentHistory: string;
  repeatBusiness: boolean;
  lastActivityAt: string;
}

export interface AiMentorSuggestion {
  id: string;
  priority: "High" | "Medium" | "Opportunity";
  title: string;
  detail: string;
  action: string;
  href: string;
  evidenceCount: number;
}

interface SuccessfulWork {
  key: string;
  document?: PricingDocument;
  job?: Job;
  invoices: Invoice[];
  title: string;
  notes: string;
  jobType: QuoteTemplateType;
  items: PricingLineItem[];
  pricingSettings?: QuotePricingSettings;
  profitability?: PricingDocument["profitability"];
  sellingPrice: number;
  accepted: boolean;
  completed: boolean;
  paid: boolean;
  occurredAt: string;
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
  "quote", "price", "estimate", "customer", "builder", "job", "work", "works", "supply", "install", "replace",
  "move", "add", "new", "electrical",
]);

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

function round(value: number, places = 2) {
  const multiplier = 10 ** places;
  return Math.round(value * multiplier) / multiplier;
}

function average(values: number[]) {
  const valid = values.filter((value) => Number.isFinite(value) && value > 0);
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : 0;
}

function weightedAverage(values: Array<{ value: number; weight: number }>) {
  const valid = values.filter(({ value, weight }) => Number.isFinite(value) && value > 0 && weight > 0);
  const totalWeight = valid.reduce((sum, item) => sum + item.weight, 0);
  return totalWeight ? valid.reduce((sum, item) => sum + item.value * item.weight, 0) / totalWeight : 0;
}

function confidenceLevel(score: number): AiConfidenceLevel {
  if (score >= 75) return "High";
  if (score >= 45) return "Medium";
  return "Low";
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function buildConfidence(
  labour: number,
  materials: number,
  pricing: number,
  reasons: string[],
): AiConfidenceBreakdown {
  const scores = {
    labour: clampScore(labour),
    materials: clampScore(materials),
    pricing: clampScore(pricing),
  };
  const overall = clampScore((scores.labour + scores.materials + scores.pricing) / 3);
  return { ...scores, overall, level: confidenceLevel(overall), reasons };
}

function inferType(value: string, selected?: QuoteTemplateType): QuoteTemplateType {
  if (selected) return selected;
  const source = normalise(value);
  for (const [type, keywords] of jobTypeKeywords) {
    if (keywords.some((keyword) => source.includes(normalise(keyword)))) return type;
  }
  return "Domestic";
}

function labourHours(items: PricingLineItem[], settings: LabourCostSettings) {
  return items
    .filter((item) => item.category === "Labour")
    .reduce((sum, item) => {
      if (item.labourHours && item.labourHours > 0) return sum + item.labourHours;
      if (item.labourMode === "Days") return sum + item.quantity * settings.billableHoursPerDay;
      if (item.labourMode === "Fixed") return sum;
      return sum + item.quantity;
    }, 0);
}

function materialKey(item: PricingLineItem) {
  return item.materialId || normalise(item.description);
}

function paidAmount(invoice: Invoice) {
  return invoice.status === "Paid" ? Math.max(invoice.amountPaid, invoiceTotal(invoice)) : invoice.amountPaid;
}

function daysBetween(left: string, right: string) {
  if (!left || !right) return 0;
  const start = new Date(`${left.slice(0, 10)}T12:00:00`);
  const end = new Date(`${right.slice(0, 10)}T12:00:00`);
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 86_400_000));
}

function hash(value: string) {
  let result = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16_777_619);
  }
  return (result >>> 0).toString(36);
}

function sourceRows(sources: AiLearningSources) {
  return [
    ...sources.jobs.map((item) => `job:${item.id}:${item.status}:${item.updatedAt}:${item.value}`),
    ...sources.documents.map((item) => `document:${item.id}:${item.status}:${item.updatedAt}:${item.items.length}:${item.profitability?.sellingPrice ?? 0}`),
    ...sources.invoices.map((item) => `invoice:${item.id}:${item.status}:${item.updatedAt}:${item.amountPaid}:${item.items.length}`),
    ...sources.customers.map((item) => `customer:${item.id}:${item.updatedAt}`),
    ...sources.builders.map((item) => `builder:${item.id}:${item.updatedAt}`),
    ...sources.profiles.map((item) => `profile:${item.id}:${item.updatedAt}:${item.preferredContact}:${item.tags.join(",")}`),
    ...sources.interactions.map((item) => `interaction:${item.id}:${item.interactionAt}:${item.outcome}`),
    ...sources.materials.map((item) => `material:${item.id}:${item.updatedAt}:${item.tradeCost}:${item.sellPrice}`),
  ].toSorted();
}

export function learningSourceSignature(sources: AiLearningSources) {
  return `v1-${hash(sourceRows(sources).join("|"))}`;
}

function successfulWork(sources: Pick<AiLearningSources, "documents" | "jobs" | "invoices">): SuccessfulWork[] {
  const quotes = sources.documents.filter((document) => document.type === "Quote");
  const jobsByQuote = new Map<string, Job>();
  const jobsById = new Map(sources.jobs.map((job) => [job.id, job]));
  sources.jobs.forEach((job) => {
    if (job.sourceQuoteId) jobsByQuote.set(job.sourceQuoteId, job);
  });
  const invoicesByQuote = new Map<string, Invoice[]>();
  const invoicesByJob = new Map<string, Invoice[]>();
  sources.invoices.forEach((invoice) => {
    if (invoice.quoteId) invoicesByQuote.set(invoice.quoteId, [...(invoicesByQuote.get(invoice.quoteId) ?? []), invoice]);
    if (invoice.jobId) invoicesByJob.set(invoice.jobId, [...(invoicesByJob.get(invoice.jobId) ?? []), invoice]);
  });

  const linkedJobs = new Set<string>();
  const records: SuccessfulWork[] = quotes.flatMap((document): SuccessfulWork[] => {
    const job = jobsByQuote.get(document.id) ?? (document.jobId ? jobsById.get(document.jobId) : undefined);
    if (job) linkedJobs.add(job.id);
    const linkedInvoices = [
      ...(invoicesByQuote.get(document.id) ?? []),
      ...(job ? invoicesByJob.get(job.id) ?? [] : []),
    ].filter((invoice, index, all) => all.findIndex((candidate) => candidate.id === invoice.id) === index);
    const accepted = document.status === "Accepted";
    const completed = job?.status === "Complete";
    const paid = linkedInvoices.some((invoice) => invoice.status === "Paid");
    if (!accepted && !completed && !paid) return [];
    const text = `${document.title} ${document.notes} ${job?.title ?? ""} ${job?.notes ?? ""}`;
    return [{
      key: document.id,
      document,
      job,
      invoices: linkedInvoices,
      title: job?.title || document.title,
      notes: text,
      jobType: inferType(text, document.templateType),
      items: document.items,
      pricingSettings: document.pricingSettings,
      profitability: document.profitability,
      sellingPrice: pricingDocumentNetTotal(document),
      accepted,
      completed,
      paid,
      occurredAt: job?.updatedAt || document.updatedAt,
    }];
  });

  sources.jobs
    .filter((job) => job.status === "Complete" && !linkedJobs.has(job.id))
    .forEach((job) => {
      const linkedInvoices = invoicesByJob.get(job.id) ?? [];
      const snapshot = job.quoteSnapshot;
      const text = `${job.title} ${job.notes}`;
      records.push({
        key: `job-${job.id}`,
        job,
        invoices: linkedInvoices,
        title: job.title,
        notes: text,
        jobType: inferType(text),
        items: snapshot?.items ?? [],
        pricingSettings: snapshot?.pricingSettings,
        profitability: snapshot?.profitability,
        sellingPrice: snapshot?.profitability?.sellingPrice ?? job.value,
        accepted: Boolean(snapshot),
        completed: true,
        paid: linkedInvoices.some((invoice) => invoice.status === "Paid"),
        occurredAt: job.updatedAt,
      });
    });

  return records;
}

function evidenceFromWork(work: SuccessfulWork, relevance: number): AiLearningEvidence {
  const paidInvoice = work.invoices.find((invoice) => invoice.status === "Paid");
  const kind = work.completed ? "Completed job" : work.paid ? "Paid invoice" : "Accepted quote";
  const recordId = work.job?.id ?? work.document?.id ?? paidInvoice?.id ?? work.key;
  const reference = work.document?.number ?? paidInvoice?.number ?? "JR OS record";
  const hours = work.items
    .filter((item) => item.category === "Labour")
    .reduce((sum, item) => sum + (item.labourHours ?? (item.labourMode === "Hours" ? item.quantity : 0)), 0);
  const details = [
    reference,
    work.accepted ? "accepted" : "",
    work.completed ? "job complete" : "",
    work.paid ? "paid" : "",
    work.sellingPrice > 0 ? `£${work.sellingPrice.toFixed(0)} net` : "",
    hours > 0 ? `${hours.toFixed(1)} labour hrs` : "",
    work.profitability ? `${work.profitability.netMargin.toFixed(1)}% net margin` : "",
  ].filter(Boolean);
  return {
    id: `evidence-${work.key}`,
    kind,
    recordId,
    title: work.title,
    detail: details.join(" · "),
    jobType: work.jobType,
    occurredAt: work.occurredAt,
    relevance: clampScore(relevance),
    href: work.job ? `/jobs/${work.job.id}` : work.document ? `/quotes/${work.document.id}` : "/invoices",
  };
}

function relevanceForWork(work: SuccessfulWork, context: Set<string>, jobType: QuoteTemplateType) {
  const typeScore = work.jobType === jobType ? 45 : 0;
  const textScore = overlapScore(context, tokens(`${work.title} ${work.notes}`)) * 40;
  const outcomeScore = (work.completed ? 8 : 0) + (work.paid ? 7 : 0);
  return clampScore(typeScore + textScore + outcomeScore);
}

export function buildQuoteLearningSuggestion({
  notes,
  jobType: selectedJobType,
  documents,
  jobs,
  invoices,
  labourSettings,
}: {
  notes: string;
  jobType?: QuoteTemplateType | "";
  documents: PricingDocument[];
  jobs: Job[];
  invoices: Invoice[];
  labourSettings: LabourCostSettings;
}): AiQuoteLearningSuggestion {
  const jobType = inferType(notes, selectedJobType || undefined);
  const context = tokens(`${jobType} ${notes}`);
  const matches = successfulWork({ documents, jobs, invoices })
    .map((work) => ({ work, relevance: relevanceForWork(work, context, jobType) }))
    .filter(({ relevance }) => relevance >= 35)
    .toSorted((left, right) => right.relevance - left.relevance || right.work.occurredAt.localeCompare(left.work.occurredAt))
    .slice(0, 10);
  const weighted = matches.map(({ work, relevance }) => ({ work, weight: Math.max(0.25, relevance / 100) }));
  const labourSamples = weighted.filter(({ work }) => labourHours(work.items, labourSettings) > 0);
  const materialSamples = weighted.filter(({ work }) => work.items.some((item) => item.category === "Materials"));
  const pricingSamples = weighted.filter(({ work }) => work.sellingPrice > 0);
  const completedCount = matches.filter(({ work }) => work.completed).length;
  const paidCount = matches.filter(({ work }) => work.paid).length;
  const qualityBoost = completedCount * 3 + paidCount * 4;
  const reasons = [
    matches.length
      ? `${matches.length} successful ${jobType.toLowerCase()} record${matches.length === 1 ? "" : "s"} matched the scope.`
      : `No successful ${jobType.toLowerCase()} record closely matched this scope yet.`,
    completedCount ? `${completedCount} match${completedCount === 1 ? " is" : "es are"} backed by completed work.` : "No completed-job result is available for this match yet.",
    paidCount ? `${paidCount} match${paidCount === 1 ? " has" : "es have"} a paid invoice outcome.` : "Paid-invoice evidence is still limited.",
  ];
  const confidence = buildConfidence(
    15 + labourSamples.length * 14 + qualityBoost,
    12 + materialSamples.length * 13 + completedCount * 3,
    18 + pricingSamples.length * 12 + qualityBoost,
    reasons,
  );

  return {
    jobType,
    sampleSize: matches.length,
    averageSellingPrice: round(weightedAverage(pricingSamples.map(({ work, weight }) => ({ value: work.sellingPrice, weight })))),
    averageLabourHours: round(weightedAverage(labourSamples.map(({ work, weight }) => ({ value: labourHours(work.items, labourSettings), weight })))),
    averageLabourPricePerHour: round(weightedAverage(labourSamples.map(({ work, weight }) => {
      const hours = labourHours(work.items, labourSettings);
      const labourPrice = work.items.filter((item) => item.category === "Labour").reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
      return { value: hours > 0 ? labourPrice / hours : 0, weight };
    }))),
    averageNetMargin: round(weightedAverage(weighted.map(({ work, weight }) => ({ value: work.profitability?.netMargin ?? 0, weight })))),
    averageMaterialMarkup: round(weightedAverage(weighted.map(({ work, weight }) => ({ value: work.pricingSettings?.materialMarkupPercent ?? 0, weight })))),
    averageContingency: round(weightedAverage(weighted.map(({ work, weight }) => ({ value: work.pricingSettings?.contingencyPercent ?? 0, weight })))),
    confidence,
    evidence: matches.map(({ work, relevance }) => evidenceFromWork(work, relevance)),
  };
}

function buildMaterialPatterns(sources: AiLearningSources) {
  const library = new Map(sources.materials.map((material) => [material.id, material]));
  const patterns = new Map<string, {
    key: string;
    materialId?: string;
    description: string;
    quantities: number[];
    unitCosts: number[];
    unitPrices: number[];
    completedJobUses: number;
    lastUsedAt: string;
    evidence: AiLearningEvidence[];
  }>();

  successfulWork(sources).forEach((work) => {
    const evidence = evidenceFromWork(work, 100);
    work.items.filter((item) => item.category === "Materials").forEach((item) => {
      const key = materialKey(item);
      if (!key) return;
      const material = item.materialId ? library.get(item.materialId) : undefined;
      const existing = patterns.get(key) ?? {
        key,
        materialId: item.materialId,
        description: material?.name || item.description,
        quantities: [],
        unitCosts: [],
        unitPrices: [],
        completedJobUses: 0,
        lastUsedAt: work.occurredAt,
        evidence: [],
      };
      existing.quantities.push(item.quantity);
      existing.unitCosts.push(item.unitCost ?? material?.tradeCost ?? 0);
      existing.unitPrices.push(item.unitPrice);
      if (work.completed) existing.completedJobUses += 1;
      if (work.occurredAt > existing.lastUsedAt) existing.lastUsedAt = work.occurredAt;
      if (!existing.evidence.some((itemEvidence) => itemEvidence.id === evidence.id)) existing.evidence.push(evidence);
      patterns.set(key, existing);
    });
  });

  return [...patterns.values()]
    .map<AiLearningMaterialPattern>((pattern) => {
      const uses = pattern.evidence.length;
      return {
        key: pattern.key,
        materialId: pattern.materialId,
        description: pattern.description,
        uses,
        completedJobUses: pattern.completedJobUses,
        averageQuantity: round(average(pattern.quantities)),
        averageUnitCost: round(average(pattern.unitCosts)),
        averageUnitPrice: round(average(pattern.unitPrices)),
        lastUsedAt: pattern.lastUsedAt,
        confidenceScore: clampScore(20 + uses * 13 + pattern.completedJobUses * 7),
        evidence: pattern.evidence
          .toSorted((left, right) => right.occurredAt.localeCompare(left.occurredAt))
          .slice(0, 5),
      };
    })
    .toSorted((left, right) => right.confidenceScore - left.confidenceScore || right.uses - left.uses);
}

export function buildMaterialLearningPatterns({
  documents,
  jobs,
  invoices,
  materials,
}: Pick<AiLearningSources, "documents" | "jobs" | "invoices" | "materials">) {
  return buildMaterialPatterns({
    documents,
    jobs,
    invoices,
    materials,
    customers: [],
    builders: [],
    profiles: [],
    interactions: [],
  });
}

function buildJobPatterns(sources: AiLearningSources, settings: LabourCostSettings) {
  const successful = successfulWork(sources);
  const quoteDecisions = sources.documents.filter((document) =>
    document.type === "Quote" && ["Accepted", "Declined", "Expired"].includes(document.status),
  );
  return jobTypeKeywords.map(([jobType]) => {
    const matching = successful.filter((work) => work.jobType === jobType);
    const decisions = quoteDecisions.filter((document) =>
      inferType(`${document.title} ${document.notes}`, document.templateType) === jobType,
    );
    const acceptedDecisions = decisions.filter((document) => document.status === "Accepted");
    const evidences = matching
      .map((work) => evidenceFromWork(work, 100))
      .toSorted((left, right) => right.occurredAt.localeCompare(left.occurredAt))
      .slice(0, 6);
    return {
      jobType,
      successfulRecords: matching.length,
      completedJobs: matching.filter((work) => work.completed).length,
      acceptedQuotes: matching.filter((work) => work.accepted).length,
      paidInvoices: matching.filter((work) => work.paid).length,
      decidedQuotes: decisions.length,
      conversionRate: decisions.length ? round(acceptedDecisions.length / decisions.length * 100, 1) : 0,
      averageSellingPrice: round(average(matching.map((work) => work.sellingPrice))),
      averageLabourHours: round(average(matching.map((work) => labourHours(work.items, settings)))),
      averageNetMargin: round(average(matching.map((work) => work.profitability?.netMargin ?? 0))),
      averageMaterialMarkup: round(average(matching.map((work) => work.pricingSettings?.materialMarkupPercent ?? 0))),
      averageContingency: round(average(matching.map((work) => work.pricingSettings?.contingencyPercent ?? 0))),
      evidence: evidences,
    } satisfies AiLearningJobPattern;
  });
}

function hasCustomerHistory(customerId: string, sources: AiLearningSources) {
  return sources.jobs.some((item) => item.customerId === customerId)
    || sources.documents.some((item) => item.customerId === customerId)
    || sources.invoices.some((item) => item.customerId === customerId)
    || sources.profiles.some((item) => item.customerId === customerId)
    || sources.interactions.some((item) => item.customerId === customerId);
}

function hasBuilderHistory(builderId: string, sources: AiLearningSources) {
  return sources.jobs.some((item) => item.builderId === builderId)
    || sources.documents.some((item) => item.builderId === builderId)
    || sources.invoices.some((item) => item.builderId === builderId);
}

export function buildAiLearningMemory(
  sources: AiLearningSources,
  labourSettings: LabourCostSettings,
  learnedAt = new Date().toISOString(),
): AiLearningMemory {
  const successful = successfulWork(sources);
  const materialPatterns = buildMaterialPatterns(sources);
  const labourSignals = successful.filter((work) => labourHours(work.items, labourSettings) > 0).length;
  const pricingSignals = successful.filter((work) => work.sellingPrice > 0).length;
  const paidInvoices = sources.invoices.filter((invoice) => invoice.status === "Paid").length;
  const completedJobs = sources.jobs.filter((job) => job.status === "Complete").length;
  const acceptedQuotes = sources.documents.filter((document) => document.type === "Quote" && document.status === "Accepted").length;
  const confidence = buildConfidence(
    12 + labourSignals * 11 + completedJobs * 4,
    10 + materialPatterns.length * 5 + materialPatterns.reduce((sum, pattern) => sum + Math.min(3, pattern.completedJobUses), 0) * 3,
    15 + pricingSignals * 10 + paidInvoices * 5,
    [
      `${completedJobs} completed job${completedJobs === 1 ? "" : "s"} can inform delivery and labour.`,
      `${acceptedQuotes} accepted quote${acceptedQuotes === 1 ? "" : "s"} can inform pricing.`,
      `${paidInvoices} paid invoice${paidInvoices === 1 ? "" : "s"} can confirm commercial outcomes.`,
    ],
  );
  const influentialRecords = successful
    .toSorted((left, right) => Number(right.completed) - Number(left.completed)
      || Number(right.paid) - Number(left.paid)
      || right.occurredAt.localeCompare(left.occurredAt))
    .slice(0, 10)
    .map((work) => evidenceFromWork(work, 100));

  return {
    id: "ai-learning-memory",
    schemaVersion: 1,
    sourceSignature: learningSourceSignature(sources),
    learnedAt,
    completedJobs,
    acceptedQuotes,
    paidInvoices,
    customerHistories: sources.customers.filter((customer) => hasCustomerHistory(customer.id, sources)).length,
    builderHistories: sources.builders.filter((builder) => hasBuilderHistory(builder.id, sources)).length,
    pricingSignals,
    materialSignals: materialPatterns.reduce((sum, pattern) => sum + pattern.uses, 0),
    confidence,
    jobPatterns: buildJobPatterns(sources, labourSettings),
    frequentMaterials: materialPatterns.slice(0, 20),
    influentialRecords,
  };
}

function paymentMetrics(invoices: Invoice[]) {
  const active = invoices.filter((invoice) => invoice.status !== "Cancelled");
  const paid = active.filter((invoice) => invoice.status === "Paid");
  const totalInvoiced = active.reduce((sum, invoice) => sum + invoiceTotal(invoice), 0);
  const totalPaid = active.reduce((sum, invoice) => sum + paidAmount(invoice), 0);
  const outstanding = active.reduce((sum, invoice) => sum + Math.max(0, invoiceTotal(invoice) - paidAmount(invoice)), 0);
  const paymentDays = paid.map((invoice) => daysBetween(invoice.issueDate, invoice.updatedAt));
  const averagePaymentDays = paymentDays.length ? round(paymentDays.reduce((sum, value) => sum + value, 0) / paymentDays.length, 1) : null;
  const latePaid = paid.filter((invoice) => invoice.dueDate && invoice.updatedAt.slice(0, 10) > invoice.dueDate).length;
  const overdue = active.filter((invoice) =>
    !["Paid", "Cancelled"].includes(invoice.status) && invoice.dueDate && invoice.dueDate < new Date().toISOString().slice(0, 10),
  ).length;
  const paymentHistory = !active.length
    ? "No invoice history"
    : overdue
      ? `${overdue} overdue invoice${overdue === 1 ? "" : "s"}`
      : outstanding > 0
        ? "Open balance, not overdue"
        : paid.length && latePaid === 0
          ? "Paid on time"
          : latePaid
            ? `${latePaid} late payment${latePaid === 1 ? "" : "s"}`
            : "No balance outstanding";
  return { totalInvoiced, totalPaid, outstanding, averagePaymentDays, paymentHistory };
}

function latestDate(values: string[]) {
  return values.filter(Boolean).toSorted((left, right) => right.localeCompare(left))[0] ?? "";
}

function mostCommonJobType(documents: PricingDocument[]) {
  const counts = new Map<QuoteTemplateType, number>();
  documents.forEach((document) => {
    const type = inferType(`${document.title} ${document.notes}`, document.templateType);
    counts.set(type, (counts.get(type) ?? 0) + 1);
  });
  return [...counts.entries()].toSorted((left, right) => right[1] - left[1])[0]?.[0];
}

export function buildCustomerInsight({
  customerId,
  documents,
  jobs,
  invoices,
  profiles,
  interactions,
}: {
  customerId: string;
  documents: PricingDocument[];
  jobs: Job[];
  invoices: Invoice[];
  profiles: CustomerProfile[];
  interactions: CustomerInteraction[];
}): CustomerInsight {
  const linkedDocuments = documents.filter((item) => item.customerId === customerId);
  const linkedJobs = jobs.filter((item) => item.customerId === customerId);
  const linkedInvoices = invoices.filter((item) => item.customerId === customerId);
  const linkedInteractions = interactions.filter((item) => item.customerId === customerId);
  const profile = profiles.find((item) => item.customerId === customerId);
  const quotes = linkedDocuments.filter((item) => item.type === "Quote");
  const acceptedQuotes = quotes.filter((item) => item.status === "Accepted");
  const completedJobs = linkedJobs.filter((item) => item.status === "Complete");
  const payment = paymentMetrics(linkedInvoices);
  const commonType = mostCommonJobType(linkedDocuments);
  const preferences = [
    ...(profile?.tags ?? []),
    commonType ? `Often requests ${commonType.toLowerCase()} work` : "",
    profile?.reviewStatus === "Received" ? "Has left a review" : "",
    linkedJobs.length > 1 ? "Repeat customer" : "",
  ].filter(Boolean);
  return {
    quoteCount: quotes.length,
    acceptedQuotes: acceptedQuotes.length,
    completedJobs: completedJobs.length,
    ...payment,
    preferredContact: profile?.preferredContact ?? "Not recorded",
    preferences: [...new Set(preferences)],
    repeatCustomer: linkedJobs.length > 1 || acceptedQuotes.length > 1,
    lastActivityAt: latestDate([
      ...linkedDocuments.map((item) => item.updatedAt),
      ...linkedJobs.map((item) => item.updatedAt),
      ...linkedInvoices.map((item) => item.updatedAt),
      ...linkedInteractions.map((item) => item.interactionAt),
    ]),
  };
}

export function buildBuilderInsight({
  builderId,
  documents,
  jobs,
  invoices,
}: {
  builderId: string;
  documents: PricingDocument[];
  jobs: Job[];
  invoices: Invoice[];
}): BuilderInsight {
  const linkedDocuments = documents.filter((item) => item.builderId === builderId);
  const linkedJobs = jobs.filter((item) => item.builderId === builderId);
  const linkedInvoices = invoices.filter((item) => item.builderId === builderId);
  const quotes = linkedDocuments.filter((item) => item.type === "Quote");
  const decisions = quotes.filter((item) => ["Accepted", "Declined", "Expired"].includes(item.status));
  const accepted = decisions.filter((item) => item.status === "Accepted");
  const completedJobs = linkedJobs.filter((item) => item.status === "Complete");
  const values = linkedJobs.map((item) => item.value).filter((value) => value > 0);
  return {
    quoteCount: quotes.length,
    acceptedQuotes: accepted.length,
    conversionRate: decisions.length ? round(accepted.length / decisions.length * 100, 1) : 0,
    jobCount: linkedJobs.length,
    completedJobs: completedJobs.length,
    averageJobValue: round(average(values)),
    ...paymentMetrics(linkedInvoices),
    repeatBusiness: linkedJobs.length > 1 || accepted.length > 1,
    lastActivityAt: latestDate([
      ...linkedDocuments.map((item) => item.updatedAt),
      ...linkedJobs.map((item) => item.updatedAt),
      ...linkedInvoices.map((item) => item.updatedAt),
    ]),
  };
}

export function buildAiMentor({
  memory,
  documents,
  jobs,
  invoices,
  labourSettings,
  quoteSettings,
}: {
  memory: AiLearningMemory;
  documents: PricingDocument[];
  jobs: Job[];
  invoices: Invoice[];
  labourSettings: LabourCostSettings;
  quoteSettings: QuotePricingSettings;
}) {
  const suggestions: AiMentorSuggestion[] = [];
  memory.jobPatterns.forEach((pattern) => {
    if (pattern.decidedQuotes >= 3 && pattern.conversionRate < 45) {
      suggestions.push({
        id: `conversion-${pattern.jobType}`,
        priority: "High",
        title: `${pattern.jobType} quote conversion is ${pattern.conversionRate.toFixed(0)}%`,
        detail: `${pattern.acceptedQuotes} accepted from ${pattern.decidedQuotes} decided quotes. Check scope clarity, response time and follow-up before reducing price.`,
        action: `Compare the declined ${pattern.jobType.toLowerCase()} quotes with the accepted examples and offer clearer options or exclusions.`,
        href: "/quotes",
        evidenceCount: pattern.decidedQuotes,
      });
    }
    if (pattern.successfulRecords >= 2 && pattern.averageNetMargin > 0 && pattern.averageNetMargin < labourSettings.targetNetMargin) {
      suggestions.push({
        id: `margin-${pattern.jobType}`,
        priority: "High",
        title: `${pattern.jobType} margin is below target`,
        detail: `Successful records average ${pattern.averageNetMargin.toFixed(1)}% net margin against the ${labourSettings.targetNetMargin.toFixed(1)}% target.`,
        action: "Recover more labour time, overhead or material margin on the next similar quote.",
        href: "/ai/pricing",
        evidenceCount: pattern.successfulRecords,
      });
    }
    if (pattern.successfulRecords >= 3 && pattern.conversionRate >= 60 && pattern.averageNetMargin >= labourSettings.targetNetMargin) {
      suggestions.push({
        id: `growth-${pattern.jobType}`,
        priority: "Opportunity",
        title: `${pattern.jobType} work is a strong pattern`,
        detail: `${pattern.conversionRate.toFixed(0)}% conversion and ${pattern.averageNetMargin.toFixed(1)}% average net margin are both healthy in the saved history.`,
        action: `Prioritise qualified ${pattern.jobType.toLowerCase()} enquiries and reuse the successful scope structure.`,
        href: "/quotes",
        evidenceCount: pattern.successfulRecords,
      });
    }
    if (pattern.successfulRecords >= 2 && pattern.averageMaterialMarkup > 0 && pattern.averageMaterialMarkup < quoteSettings.materialMarkupPercent) {
      suggestions.push({
        id: `markup-${pattern.jobType}`,
        priority: "Medium",
        title: `${pattern.jobType} material recovery has drifted`,
        detail: `Successful records average ${pattern.averageMaterialMarkup.toFixed(1)}% mark-up, below the saved ${quoteSettings.materialMarkupPercent.toFixed(1)}% default.`,
        action: "Check live trade costs and apply the saved mark-up consistently before sending.",
        href: "/ai/pricing",
        evidenceCount: pattern.successfulRecords,
      });
    }
  });

  const overdue = invoices.filter((invoice) =>
    !["Paid", "Cancelled"].includes(invoice.status) && invoice.dueDate && invoice.dueDate < new Date().toISOString().slice(0, 10),
  );
  if (overdue.length) {
    const value = overdue.reduce((sum, invoice) => sum + Math.max(0, invoiceTotal(invoice) - paidAmount(invoice)), 0);
    suggestions.push({
      id: "mentor-overdue",
      priority: "High",
      title: "Profit is tied up in overdue invoices",
      detail: `£${value.toFixed(0)} remains overdue across ${overdue.length} invoice${overdue.length === 1 ? "" : "s"}.`,
      action: "Contact the oldest debtor first and tighten deposit or staged-payment terms for similar customers.",
      href: "/invoices",
      evidenceCount: overdue.length,
    });
  }

  const completedWithoutProfit = jobs.filter((job) =>
    job.status === "Complete" && !documents.some((document) =>
      (document.id === job.sourceQuoteId || document.jobId === job.id) && Boolean(document.profitability),
    ),
  );
  if (completedWithoutProfit.length) {
    suggestions.push({
      id: "mentor-missing-costs",
      priority: "Medium",
      title: "Some completed jobs cannot teach profitability yet",
      detail: `${completedWithoutProfit.length} completed job${completedWithoutProfit.length === 1 ? "" : "s"} has no linked Quote Engine profitability snapshot.`,
      action: "Link the accepted quote and keep labour and material costs current so future recommendations become stronger.",
      href: "/jobs",
      evidenceCount: completedWithoutProfit.length,
    });
  }

  if (!memory.pricingSignals || memory.confidence.overall < 45) {
    suggestions.push({
      id: "mentor-build-history",
      priority: "Opportunity",
      title: "Build a stronger learning history",
      detail: "Confidence is cautious because successful quote, completed-job or paid-invoice evidence is still limited.",
      action: "Keep quote outcomes, job completion, material lines, invoice payments and true costs updated.",
      href: "/ai/learning",
      evidenceCount: memory.pricingSignals,
    });
  }

  const priorityOrder = { High: 3, Medium: 2, Opportunity: 1 };
  return suggestions
    .filter((item, index, all) => all.findIndex((candidate) => candidate.id === item.id) === index)
    .toSorted((left, right) => priorityOrder[right.priority] - priorityOrder[left.priority] || right.evidenceCount - left.evidenceCount)
    .slice(0, 8);
}
