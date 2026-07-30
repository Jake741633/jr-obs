import type {
  Job,
  JobDocument,
  JobTimelineEntry,
  PricingDocument,
  RecordAttachment,
} from "./models";

interface CreateJobFromQuoteInput {
  document: PricingDocument;
  customerAddress?: string;
  builderAddress?: string;
  jobId: string;
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
