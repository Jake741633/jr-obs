import type {
  BusinessBankDetails,
  Invoice,
  Job,
  JobDocument,
  JobTimelineEntry,
  Material,
  PaymentTermsTemplate,
  PricingDocument,
  PricingDocumentType,
  PurchaseItemStatus,
  PurchaseList,
  PurchaseListItem,
  RecordAttachment,
} from "./models";
import { bankDetailsText, paymentTermsFromTemplate, paymentTermsText } from "./businessSettings";

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

export function pricingDocumentNetTotal(document: PricingDocument) {
  return document.profitability?.sellingPrice
    ?? document.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
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
  invoices,
  invoiceId,
  now,
  createId,
  bankDetails,
  defaultPaymentTerms,
}: CreateInvoiceFromJobInput) {
  const snapshot = job.quoteSnapshot;
  const sourceItems = snapshot?.items?.length
    ? snapshot.items
    : quote?.items?.length
      ? quote.items
      : [{ id: createId("invoice-source-line"), description: job.title, category: "Labour" as const, quantity: 1, unitPrice: job.value }];
  const vatEnabled = snapshot?.vatEnabled ?? quote?.vatEnabled ?? false;
  const vatRate = snapshot?.vatRate ?? quote?.vatRate ?? 0;
  const paymentTerms = snapshot?.paymentTerms ?? quote?.paymentTerms ?? (defaultPaymentTerms ? paymentTermsFromTemplate(defaultPaymentTerms) : undefined);
  const issueDate = now.slice(0, 10);
  const dueDays = paymentTerms?.dueDays ?? (paymentTerms?.type === "Due on completion" ? 0 : 7);
  const dueDate = addDays(new Date(`${issueDate}T12:00:00`), dueDays);
  const quoteId = job.sourceQuoteId ?? snapshot?.quoteId ?? quote?.id;
  const quoteNumber = snapshot?.quoteNumber ?? quote?.number;
  const pricingSettings = snapshot?.pricingSettings ?? quote?.pricingSettings;
  const baseSellingPrice = sourceItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const invoiceItems = sourceItems.map((item) => ({ ...item, id: createId("invoice-line") }));
  if (pricingSettings?.travelPrice) invoiceItems.push({ id: createId("invoice-line"), description: "Travel allowance", category: "Travel", quantity: 1, unitPrice: pricingSettings.travelPrice, unitCost: pricingSettings.travelCost });
  if (pricingSettings?.parkingPrice) invoiceItems.push({ id: createId("invoice-line"), description: "Parking allowance", category: "Parking", quantity: 1, unitPrice: pricingSettings.parkingPrice, unitCost: pricingSettings.parkingCost });
  if (pricingSettings?.contingencyPercent) invoiceItems.push({ id: createId("invoice-line"), description: `Contingency (${pricingSettings.contingencyPercent}%)`, category: "Contingency", quantity: 1, unitPrice: baseSellingPrice * pricingSettings.contingencyPercent / 100 });

  const invoice: Invoice = {
    id: invoiceId,
    number: nextInvoiceNumber(invoices),
    status: "Draft",
    customerId: job.customerId,
    builderId: job.builderId,
    jobId: job.id,
    quoteId,
    paymentTermsTemplateId: paymentTerms?.templateId,
    paymentTermsText: paymentTermsText(paymentTerms),
    title: job.title,
    issueDate,
    dueDate,
    vatEnabled,
    vatRate,
    items: invoiceItems,
    amountPaid: 0,
    notes: [
      `Generated from completed job ${job.title}.`,
      quoteNumber ? `Based on accepted quote ${quoteNumber}.` : "",
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
      const material = materials.find((item) => item.id === line.materialId);
      return {
        id: createId("purchase-item"),
        materialId: line.materialId,
        description: line.description,
        supplier: line.supplier || material?.supplier || "Unassigned supplier",
        stockCode: line.stockCode || material?.stockCode || "",
        supplierUrl: material?.supplierUrl,
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
