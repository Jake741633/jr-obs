import type {
  BusinessBankDetails,
  Invoice,
  Job,
  JobDocument,
  JobTimelineEntry,
  JobVariation,
  Material,
  PaymentTermsTemplate,
  PricingDocument,
  PricingDocumentType,
  PricingLineItem,
  PurchaseItemStatus,
  PurchaseList,
  PurchaseListItem,
  RecordAttachment,
} from "./models";
import { bankDetailsText, paymentTermsFromTemplate, paymentTermsText } from "./businessSettings";
import { materialSupplierReferences } from "./materialSuppliers";
import { isAcceptedVariationStatus, variationInvoiceLine } from "./jobManagement-core.mjs";

import { finalInvoiceItems, linkedBillingInvoices, payablePence } from "./depositBilling-core.mjs";
import type { DepositRequirement } from "./payments";
export { finalInvoiceItems, linkedBillingInvoices } from "./depositBilling-core.mjs";

interface CreateJobFromQuoteInput {
  document: PricingDocument;
  customerAddress?: string;
  builderAddress?: string;
  jobId: string;
  now: string;
  createId: (prefix: string) => string;
}

interface CreateInvoiceFromJobInput {
  job: Job;
  quote?: PricingDocument;
  variations?: JobVariation[];
  invoices: Invoice[];
  invoiceId: string;
  now: string;
  createId: (prefix: string) => string;
  bankDetails?: BusinessBankDetails;
  defaultPaymentTerms?: PaymentTermsTemplate;
}

interface CreatePurchaseListInput {
  document: PricingDocument;
  materials: Material[];
  purchaseLists: PurchaseList[];
  purchaseListId: string;
  now: string;
  createId: (prefix: string) => string;
}

type QuoteBillingSource = Pick<PricingDocument, "items" | "pricingSettings" | "profitability">;
const billingAmountFormat = new Intl.NumberFormat("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false });

export function pricingDocumentNetTotal(document: QuoteBillingSource) {
  const recorded = document.profitability?.sellingPrice;
  if (typeof recorded === "number" && Number.isFinite(recorded)) return recorded;
  const subtotal = (Array.isArray(document.items) ? document.items : []).reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const pricing = document.pricingSettings;
  return subtotal + subtotal * ((pricing?.contingencyPercent ?? 0) / 100)
    + (pricing?.travelPrice ?? 0) + (pricing?.parkingPrice ?? 0);
}

export function invoiceItemsFromQuote(document: QuoteBillingSource & Pick<PricingDocument, "vatEnabled" | "vatRate">, createId: (prefix: string) => string): PricingLineItem[] {
  const sourceItems = Array.isArray(document.items) ? document.items : [];
  const agreedNet = pricingDocumentNetTotal(document);
  const agreedGross = agreedNet + (document.vatEnabled ? agreedNet * document.vatRate / 100 : 0);
  if (!Number.isFinite(agreedNet) || agreedNet < 0 || !Number.isFinite(agreedGross) || agreedGross < 0
    || (!sourceItems.length && !Number.isFinite(document.profitability?.sellingPrice))) {
    throw new Error("Review the accepted quote price before creating an invoice.");
  }
  const items = sourceItems.map((item) => ({ ...item, id: createId("invoice-line") }));
  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const pricing = document.pricingSettings;
  if (pricing?.travelPrice) items.push({ id: createId("invoice-line"), description: "Travel allowance", category: "Travel", quantity: 1, unitPrice: pricing.travelPrice, unitCost: pricing.travelCost });
  if (pricing?.parkingPrice) items.push({ id: createId("invoice-line"), description: "Parking allowance", category: "Parking", quantity: 1, unitPrice: pricing.parkingPrice, unitCost: pricing.parkingCost });
  if (pricing?.contingencyPercent) items.push({ id: createId("invoice-line"), description: `Contingency (${pricing.contingencyPercent}%)`, category: "Contingency", quantity: 1, unitPrice: subtotal * (pricing.contingencyPercent / 100) });
  const itemNet = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const itemGross = itemNet + (document.vatEnabled ? itemNet * document.vatRate / 100 : 0);
  if (billingAmountFormat.format(itemNet) !== billingAmountFormat.format(agreedNet)
    || billingAmountFormat.format(itemGross) !== billingAmountFormat.format(agreedGross) || !items.length) {
    return [{ id: createId("invoice-line"), description: "Accepted scope — fixed price", category: "Other", quantity: 1, unitPrice: agreedNet }];
  }
  return items;
}

export function pricingDocumentTotal(document: PricingDocument) {
  const net = pricingDocumentNetTotal(document);
  return net + (document.vatEnabled ? net * document.vatRate / 100 : 0);
}

export function invoiceTotal(invoice: Invoice) {
  const net = invoice.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  return net + (invoice.vatEnabled ? net * invoice.vatRate / 100 : 0);
}

export function nextInvoiceNumber(invoices: Invoice[]) {
  const highest = invoices.reduce((max, invoice) => {
    const match = invoice.number.match(/^INV-(\d+)$/i);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `INV-${String(highest + 1).padStart(4, "0")}`;
}

export function createDepositInvoiceFromQuote({ document, requirement, grossAmount, invoices, invoiceId, now, createId }: {
  document: PricingDocument; requirement: DepositRequirement; grossAmount: number; invoices: Invoice[];
  invoiceId: string; now: string; createId: (prefix: string) => string;
}): Invoice {
  const grossTotal = pricingDocumentTotal(document);
  const dueDateValue = requirement.dueDate ?? "";
  const parsedDueDate = new Date(`${dueDateValue}T12:00:00Z`);
  const validSpecifiedDate = /^\d{4}-\d{2}-\d{2}$/.test(dueDateValue) && Number.isFinite(parsedDueDate.getTime())
    && parsedDueDate.toISOString().slice(0, 10) === dueDateValue;
  const divisor = document.vatEnabled ? 1 + document.vatRate / 100 : 1;
  if (document.status !== "Accepted" || typeof document.id !== "string" || !document.id.trim()
    || typeof requirement.id !== "string" || !requirement.id.trim() || typeof invoiceId !== "string" || !invoiceId.trim()
    || requirement.pricingDocumentId !== document.id
    || !["Fixed", "Percentage"].includes(requirement.mode) || !Number.isFinite(requirement.value) || requirement.value <= 0
    || (requirement.mode === "Percentage" && requirement.value > 100)
    || !Number.isFinite(grossAmount) || grossAmount <= 0 || !Number.isFinite(grossTotal)
    || !Number.isFinite(divisor) || divisor < 1 || !Number.isFinite(document.vatRate) || document.vatRate < 0
    || !["On acceptance", "Specified date"].includes(requirement.dueRule)
    || (requirement.dueRule === "Specified date" && !validSpecifiedDate)) {
    throw new Error("Review the accepted quote and deposit requirement amount, due date and VAT.");
  }
  const grossPence = payablePence(grossAmount);
  if (grossPence <= 0 || grossPence > payablePence(grossTotal)) {
    throw new Error("Review the deposit source identities and payable amount before billing.");
  }
  const existing = linkedBillingInvoices({ invoices, quoteId: document.id, jobId: document.jobId, customerId: document.customerId, builderId: document.builderId });
  if (existing.length) throw new Error("Review the existing linked invoice before creating another deposit invoice.");
  return {
    id: invoiceId, number: nextInvoiceNumber(invoices), status: "Draft", purpose: "Deposit", depositRequirementId: requirement.id,
    customerId: document.customerId, builderId: document.builderId, jobId: document.jobId, quoteId: document.id,
    title: `Deposit - ${document.title}`, issueDate: now.slice(0, 10),
    dueDate: requirement.dueRule === "Specified date" ? requirement.dueDate! : now.slice(0, 10),
    vatEnabled: document.vatEnabled, vatRate: document.vatRate,
    items: [{ id: createId("invoice-line"), description: `Deposit for ${document.number}`, category: "Other", quantity: 1, unitPrice: grossPence / 100 / divisor }],
    amountPaid: 0, notes: "Created from accepted quote or estimate deposit requirement.", paymentDetails: "", createdAt: now, updatedAt: now,
  };
}

export function nextPricingDocumentNumber(documents: PricingDocument[], type: PricingDocumentType) {
  const prefix = type === "Quote" ? "Q" : "E";
  const highest = documents.reduce((max, document) => {
    if (document.type !== type) return max;
    const match = document.number.match(new RegExp(`^${prefix}-(\\d+)$`, "i"));
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `${prefix}-${String(highest + 1).padStart(4, "0")}`;
}

export function nextPurchaseListNumber(purchaseLists: PurchaseList[]) {
  const highest = purchaseLists.reduce((max, list) => {
    const match = list.number.match(/^PO-(\d+)$/i);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `PO-${String(highest + 1).padStart(4, "0")}`;
}

function addDays(date: Date, days: number) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result.toISOString().slice(0, 10);
}

function cloneAttachments(attachments: RecordAttachment[] = []) {
  return attachments.map((attachment) => ({ ...attachment }));
}

export function createJobFromAcceptedQuote({
  document,
  customerAddress,
  builderAddress,
  jobId,
  now,
  createId,
}: CreateJobFromQuoteInput) {
  const attachments = cloneAttachments(document.attachments);
  const siteAddress = document.siteAddress?.trim()
    || customerAddress?.trim()
    || builderAddress?.trim()
    || "Address to be confirmed";
  const scope = document.items
    .map((item) => `- ${item.description} (${item.quantity} × £${item.unitPrice.toFixed(2)})`)
    .join("\n");

  const job: Job = {
    id: jobId,
    title: document.title,
    customerId: document.customerId,
    builderId: document.builderId,
    sourceQuoteId: document.id,
    quoteSnapshot: {
      quoteId: document.id,
      quoteNumber: document.number,
      items: document.items.map((item) => ({ ...item })),
      pricingSettings: document.pricingSettings ? { ...document.pricingSettings } : undefined,
      profitability: document.profitability ? { ...document.profitability } : undefined,
      attachments,
      vatEnabled: document.vatEnabled,
      vatRate: document.vatRate,
      notes: document.notes,
      exclusions: document.exclusions,
      internalNotes: document.internalNotes,
      fixedPriceWorkflow: document.fixedPriceWorkflow ? { ...document.fixedPriceWorkflow } : undefined,
      terms: document.terms,
      paymentTerms: document.paymentTerms ? { ...document.paymentTerms } : undefined,
      convertedAt: now,
    },
    siteAddress,
    status: "Scheduled",
    startDate: "",
    value: pricingDocumentTotal(document),
    notes: [
      `Created from ${document.type.toLowerCase()} ${document.number}.`,
      document.notes,
      document.exclusions ? `Exclusions:\n${document.exclusions}` : "",
      document.internalNotes ? `Internal quote notes:\n${document.internalNotes}` : "",
      `Agreed scope:\n${scope}`,
      `Terms:\n${document.terms}`,
    ].filter(Boolean).join("\n\n"),
    createdAt: now,
    updatedAt: now,
  };

  const timelineEntries: JobTimelineEntry[] = [
    {
      id: createId("timeline"),
      jobId,
      milestone: "Job created",
      note: `Created automatically from accepted ${document.type.toLowerCase()} ${document.number}.`,
      completedBy: "JR OS",
      completedAt: now,
      createdAt: now,
    },
    {
      id: createId("timeline"),
      jobId,
      milestone: "Quote accepted",
      note: `${document.number} accepted and linked to this job.`,
      completedBy: "JR OS",
      completedAt: document.updatedAt || now,
      createdAt: now,
    },
  ];

  const jobDocuments: JobDocument[] = attachments.map((attachment) => ({
    id: createId("document"),
    jobId,
    name: attachment.name,
    category: "Other",
    fileName: attachment.fileName,
    mimeType: attachment.mimeType,
    dataUrl: attachment.dataUrl,
    externalUrl: attachment.externalUrl,
    notes: [
      `Copied from ${document.type.toLowerCase()} ${document.number}.`,
      attachment.notes,
    ].filter(Boolean).join(" "),
    uploadedBy: "JR OS",
    uploadedAt: now,
    createdAt: now,
  }));

  return { job, timelineEntries, jobDocuments };
}

export function createInvoiceFromCompletedJob({
  job,
  quote,
  variations = [],
  invoices,
  invoiceId,
  now,
  createId,
  bankDetails,
  defaultPaymentTerms,
}: CreateInvoiceFromJobInput) {
  const snapshot = job.quoteSnapshot;
  const source = snapshot ?? quote;
  const vatEnabled = snapshot?.vatEnabled ?? quote?.vatEnabled ?? false;
  const vatRate = snapshot?.vatRate ?? quote?.vatRate ?? 0;
  const paymentTerms = snapshot?.paymentTerms ?? quote?.paymentTerms ?? (defaultPaymentTerms ? paymentTermsFromTemplate(defaultPaymentTerms) : undefined);
  const issueDate = now.slice(0, 10);
  const dueDays = paymentTerms?.dueDays ?? (paymentTerms?.type === "Due on completion" ? 0 : 7);
  const dueDate = addDays(new Date(`${issueDate}T12:00:00`), dueDays);
  const quoteId = job.sourceQuoteId ?? snapshot?.quoteId ?? quote?.id;
  const quoteNumber = snapshot?.quoteNumber ?? quote?.number;
  const liveInvoiceIds = new Set(invoices.filter((invoice) => invoice.status !== "Cancelled").map((invoice) => invoice.id));
  const acceptedVariations = variations.filter((variation) => variation.jobId === job.id
    && isAcceptedVariationStatus(variation.status)
    && (!variation.invoiceId || !liveInvoiceIds.has(variation.invoiceId)));
  const hasRecordedTotal = typeof source?.profitability?.sellingPrice === "number" && Number.isFinite(source.profitability.sellingPrice);
  // Job contract values already include VAT. A fallback is the complete scope,
  // so neither quote allowances nor VAT should be applied to that value again.
  const aggregateValue = job.originalContractValue ?? job.value;
  const aggregateNet = aggregateValue / (vatEnabled ? 1 + vatRate / 100 : 1);
  const aggregateGross = aggregateNet + (vatEnabled ? aggregateNet * vatRate / 100 : 0);
  const sourceItems = Array.isArray(source?.items) ? source.items : [];
  const hasSourcePrice = source && (sourceItems.length || hasRecordedTotal);
  if (!hasSourcePrice && (!Number.isFinite(aggregateValue) || aggregateValue < 0
    || !Number.isFinite(aggregateNet) || aggregateNet < 0 || !Number.isFinite(aggregateGross))) {
    throw new Error("Review the agreed job value before creating an invoice.");
  }
  const invoiceItems: PricingLineItem[] = hasSourcePrice
    ? invoiceItemsFromQuote({ ...source, vatEnabled, vatRate }, createId)
    : [{ id: createId("invoice-line"), description: job.title, category: "Other", quantity: 1, unitPrice: aggregateNet }];
  const sourceVariationIds = new Set(sourceItems.map((item) => item.variationId).filter(Boolean));
  acceptedVariations
    .filter((variation) => !sourceVariationIds.has(variation.id))
    .forEach((variation) => invoiceItems.push(variationInvoiceLine(variation, createId("invoice-line"))));

  const billing = finalInvoiceItems({ items: invoiceItems, quoteId, jobId: job.id, customerId: job.customerId, builderId: job.builderId, vatEnabled, vatRate, invoices, createId });
  const invoice: Invoice = {
    purpose: "Final",
    appliedDepositInvoiceIds: billing.appliedDepositInvoiceIds,
    id: invoiceId,
    number: nextInvoiceNumber(invoices),
    status: "Draft",
    customerId: job.customerId,
    builderId: job.builderId,
    jobId: job.id,
    quoteId,
    variationIds: acceptedVariations.map((variation) => variation.id),
    paymentTermsTemplateId: paymentTerms?.templateId,
    paymentTermsText: paymentTermsText(paymentTerms),
    title: job.title,
    issueDate,
    dueDate,
    vatEnabled,
    vatRate,
    items: billing.items,
    amountPaid: 0,
    notes: [
      `Generated from completed job ${job.title}.`,
      quoteNumber ? `Based on accepted quote ${quoteNumber}.` : "",
      acceptedVariations.length ? "Includes accepted job variations." : "",
      snapshot?.notes ?? quote?.notes ?? "",
    ].filter(Boolean).join("\n\n"),
    paymentDetails: bankDetails ? bankDetailsText(bankDetails) : "",
    createdAt: now,
    updatedAt: now,
  };

  const timelineEntry: JobTimelineEntry = {
    id: createId("timeline"),
    jobId: job.id,
    milestone: "Invoice created",
    note: `${invoice.number} generated directly from the completed job.`,
    completedBy: "JR OS",
    completedAt: now,
    createdAt: now,
  };

  return { invoice, timelineEntry };
}

/** Saved product identities win over names; a changed catalogue must not mix wholesalers. */
export function purchaseMaterialReference(line: PricingLineItem, materials: Material[]) {
  const matches = line.materialId
    ? materials.filter((material) => material.id === line.materialId)
    : materials.filter((material) => material.name.trim().toLowerCase() === line.description.trim().toLowerCase());
  const material = matches[0];
  if (matches.length > 1 || (material && (!material.id?.trim() || materials.filter((item) => item.id === material.id).length !== 1))) {
    throw new Error("Review ambiguous material identities or duplicate catalogue names before creating a purchase list.");
  }
  const supplier = line.supplier?.trim() || "", stockCode = line.stockCode?.trim() || "";
  const reference = material && materialSupplierReferences(material).find((item) =>
    (!supplier || item.supplier.toLowerCase() === supplier.toLowerCase())
    && (!stockCode || item.stockCode.toLowerCase() === stockCode.toLowerCase()));
  return {
    materialId: line.materialId || material?.id,
    supplier: supplier || reference?.supplier || "",
    stockCode: stockCode || reference?.stockCode || "",
    supplierUrl: reference?.supplierUrl || undefined,
  };
}

export function createPurchaseListFromPricingDocument({
  document,
  materials,
  purchaseLists,
  purchaseListId,
  now,
  createId,
}: CreatePurchaseListInput) {
  const items: PurchaseListItem[] = document.items
    .filter((item) => item.category === "Materials")
    .map((line) => {
      const reference = purchaseMaterialReference(line, materials);
      const material = materials.find((item) => item.id === reference.materialId);
      return {
        id: createId("purchase-item"),
        ...reference,
        description: line.description,
        supplier: reference.supplier || "Unassigned supplier",
        quantity: line.quantity,
        unitCost: line.unitCost ?? material?.tradeCost ?? line.unitPrice,
        status: "Needed" as PurchaseItemStatus,
      };
    });

  if (!items.length) return null;

  const list: PurchaseList = {
    id: purchaseListId,
    number: nextPurchaseListNumber(purchaseLists),
    title: document.title,
    pricingDocumentId: document.id,
    jobId: document.jobId,
    items,
    notes: `Created from ${document.type.toLowerCase()} ${document.number}. Confirm quantities and live supplier prices before ordering.`,
    createdAt: now,
    updatedAt: now,
  };

  return list;
}
