import type { Builder, Customer, Job, JobDocument, JobTimelineEntry, PricingDocument } from "./models";
import { createJobFromAcceptedQuote } from "./workflow";
import type { PrivateFileBackedRecord } from "./cloud/privateFiles";

type ReadCollection<T> = { items: T[]; isReady: boolean };
type Collection<T extends { id: string }> = ReadCollection<T> & { createItem(record: T): T };
type PricingCollection = Collection<PricingDocument> & { updateItem(id: string, update: (record: PricingDocument) => PricingDocument): PricingDocument };
type DocumentCollection = Collection<JobDocument> & { updateItem(id: string, update: (record: JobDocument) => JobDocument): JobDocument };
export type QuoteConversionCollections = {
  pricing: PricingCollection; jobs: Collection<Job>; timeline: Collection<JobTimelineEntry>; jobDocuments: DocumentCollection;
  customers: ReadCollection<Customer>; builders: ReadCollection<Builder>;
};
export type QuoteConversionOptions = {
  expectedPrivatePath?: (document: JobDocument) => string;
  confirmPrivateBytes?: (document: JobDocument) => void;
};
type RecoverableJob = Job & { quoteSnapshot?: NonNullable<Job["quoteSnapshot"]> & { conversionSource?: string } };
const snapshotFields = ["items", "pricingSettings", "profitability", "attachments", "vatEnabled", "vatRate", "notes", "exclusions", "internalNotes", "fixedPriceWorkflow", "terms", "paymentTerms"] as const;
function snapshot(value: object) {
  return JSON.stringify(value, (_key, item) => item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
}
function sourceRemainder(document: PricingDocument) {
  return snapshot(Object.fromEntries(Object.entries(document).filter(([key]) => !snapshotFields.some(field => field === key))));
}
function sourceSnapshot(document: PricingDocument) {
  return snapshot({ ...document, attachments: document.attachments === undefined ? [] : document.attachments });
}
function conversionId(quoteId: string, kind: string, index = 0) {
  // Reversible URL-safe encoding keeps distinct source identities distinct
  // after private object paths sanitize their record-id segments.
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let buffer = 0, bits = 0, encoded = "";
  for (const character of JSON.stringify([quoteId, kind, index]).split("")) {
    const code = character.charCodeAt(0);
    for (const byte of [code >>> 8, code & 255]) {
      buffer = (buffer << 8) | byte; bits += 8;
      while (bits >= 6) { bits -= 6; encoded += alphabet[(buffer >>> bits) & 63]; }
      buffer &= (1 << bits) - 1;
    }
  }
  if (bits) encoded += alphabet[(buffer << (6 - bits)) & 63];
  return `quote-conversion-${encoded}`;
}
function ensureRecord<T extends { id: string }>(collection: Collection<T>, record: T): Collection<T> {
  const items = collection.items;
  const matches = items.filter(item => item.id === record.id);
  if (matches.length) {
    if (matches.length !== 1 || snapshot(matches[0]) !== snapshot(record)) throw new Error("A conversion record changed or has an ambiguous identity. Review the saved job before retrying.");
    return collection;
  }
  const saved = collection.createItem(record) ?? record;
  return { ...collection, items: [saved, ...items] };
}
const documentTransportFields = new Set(["dataUrl", "privateStoragePath", "privateFileId", "privateUploadState", "privateUploadError", "signedDownloadUrl"]);
function documentContent(record: JobDocument) {
  return snapshot(Object.fromEntries(Object.entries(record).filter(([field]) => !documentTransportFields.has(field))));
}
function ensureDocument(collection: DocumentCollection, expected: JobDocument, expectedPrivatePath?: (document: JobDocument) => string): DocumentCollection {
  const matches = collection.items.filter(item => item.id === expected.id);
  if (!matches.length) return { ...collection, ...ensureRecord(collection, expected) };
  if (matches.length !== 1) throw new Error("The conversion attachment identity is ambiguous. Review the saved job document.");
  const saved = matches[0] as JobDocument & PrivateFileBackedRecord;
  if (documentContent(saved) !== documentContent(expected) || (saved.dataUrl !== undefined && saved.dataUrl !== expected.dataUrl)) {
    throw new Error("The conversion attachment content changed. Review the saved job document before retrying.");
  }
  if ((saved.privateFileId !== undefined && (typeof saved.privateFileId !== "string" || !saved.privateFileId.trim()))
    || (saved.privateUploadState !== undefined && !["Pending", "Offline", "Uploading", "Synced", "Failed"].includes(saved.privateUploadState))
    || (saved.privateUploadError !== undefined && typeof saved.privateUploadError !== "string")
    || (saved.signedDownloadUrl !== undefined && typeof saved.signedDownloadUrl !== "string")) {
    throw new Error("Review the conversion attachment's private file metadata before retrying.");
  }
  if (saved.privateStoragePath !== undefined) {
    if (!expectedPrivatePath || !expected.dataUrl || saved.privateStoragePath !== expectedPrivatePath(expected)) {
      throw new Error("The conversion attachment private file is not bound to this organisation, job and document. Review it before retrying.");
    }
  } else {
    if (saved.privateFileId !== undefined || saved.privateUploadState === "Synced" || saved.signedDownloadUrl !== undefined) {
      throw new Error("The conversion attachment's private file binding is incomplete. Review it before retrying.");
    }
    if (expected.dataUrl && saved.dataUrl === undefined) {
      // Cloud-safe rows omit inline bytes. Restore only this exact source's
      // bytes into hook state so the existing private-file bridge can queue them.
      const restored = collection.updateItem(expected.id, current => {
        if (snapshot(current) !== snapshot(saved)) throw new Error("The saved conversion attachment changed before its bytes could be reconciled.");
        return { ...current, dataUrl: expected.dataUrl };
      });
      return { ...collection, items: collection.items.map(item => item.id === expected.id ? restored : item) };
    }
  }
  return collection;
}

/** Durable, resumable steps. There is no transaction across these collections. */
export function convertAcceptedQuote(expected: PricingDocument, input: QuoteConversionCollections, options: QuoteConversionOptions = {}) {
  const { pricing, jobs, timeline, jobDocuments, customers, builders } = input;
  let collections = { pricing, jobs, timeline, jobDocuments, customers, builders };
  let savedJob = false, phase = "job";
  try {
    if (!Object.values(collections).every(store => store.isReady)) throw new Error("Wait for the conversion records to finish loading.");
    const matches = collections.pricing.items.filter(item => item.id === expected.id);
    if (!expected.id?.trim() || matches.length !== 1 || snapshot(matches[0]) !== snapshot(expected) || matches[0].status !== "Accepted") {
      throw new Error("The accepted quote changed or is unavailable or ambiguous. Review its current saved record before converting.");
    }
    const document = matches[0];
    const customers = collections.customers.items.filter(item => item.id === document.customerId);
    const builders = collections.builders.items.filter(item => item.id === document.builderId);
    if ((!document.customerId && !document.builderId) || (document.customerId && customers.length !== 1) || (document.builderId && builders.length !== 1)) {
      throw new Error("Review the quote customer and builder identities before converting.");
    }
    const jobId = conversionId(document.id, "job");
    const linked = collections.jobs.items.filter(job => job.id === jobId || job.sourceQuoteId === document.id || job.quoteSnapshot?.quoteId === document.id || job.id === document.jobId);
    if (linked.length > 1) throw new Error("Review ambiguous existing jobs linked to this quote before converting.");
    const existing = linked[0] as RecoverableJob | undefined;
    let original = document;
    if (existing) {
      if (existing.id !== jobId || !existing.quoteSnapshot?.conversionSource || collections.jobs.items.filter(job => job.id === existing.id).length !== 1) {
        throw new Error("Review the existing job before converting. Its exact conversion candidate cannot be recovered automatically.");
      }
      const quoteSnapshot = existing.quoteSnapshot;
      original = { ...JSON.parse(quoteSnapshot.conversionSource!), ...Object.fromEntries(snapshotFields.map(field => [field, quoteSnapshot[field]])) } as PricingDocument;
      const currentSource = document.jobId === jobId ? { ...document, jobId: original.jobId, updatedAt: original.updatedAt } : document;
      // Conversion snapshots record [] for omitted attachments. That default
      // represents the same empty scope; every other source field stays exact.
      if (sourceSnapshot(currentSource) !== sourceSnapshot(original)) {
        throw new Error("The quote changed after conversion began. Review the saved job and quote before retrying.");
      }
    } else if (document.jobId) throw new Error("The linked job is unavailable. Review the quote before converting.");
    const ordinals = new Map<string, number>();
    const generated = createJobFromAcceptedQuote({
      document: original, customerAddress: customers[0]?.address, builderAddress: builders[0]?.address, jobId,
      now: existing?.createdAt ?? new Date().toISOString(),
      createId(prefix) { const index = ordinals.get(prefix) ?? 0; ordinals.set(prefix, index + 1); return conversionId(document.id, prefix, index); },
    });
    const candidate: RecoverableJob = { ...generated.job, quoteSnapshot: { ...generated.job.quoteSnapshot!, conversionSource: sourceRemainder(original) } };
    if (!Number.isFinite(candidate.value) || candidate.value < 0) throw new Error("Review the agreed quote value before converting.");
    collections = { ...collections, jobs: ensureRecord(collections.jobs, candidate) }; savedJob = true;
    phase = "job timeline";
    for (const entry of generated.timelineEntries) collections = { ...collections, timeline: ensureRecord(collections.timeline, entry) };
    phase = "job attachments";
    for (const entry of generated.jobDocuments) {
      collections = { ...collections, jobDocuments: ensureDocument(collections.jobDocuments, entry, options.expectedPrivatePath) };
      phase = "private file bytes";
      options.confirmPrivateBytes?.(collections.jobDocuments.items.find(document => document.id === entry.id)!);
      phase = "job attachments";
    }
    phase = "quote link";
    if (document.jobId !== jobId) {
      const linkedDocument = collections.pricing.updateItem(document.id, current => {
        if (snapshot(current) !== snapshot(document)) throw new Error("The saved quote changed before its job could be linked. Review it before retrying.");
        return { ...current, jobId, updatedAt: new Date().toISOString() };
      });
      collections = { ...collections, pricing: { ...collections.pricing, items: collections.pricing.items.map(item => item.id === document.id ? linkedDocument : item) } };
    }
    return { collections, message: `${document.number} converted and linked to ${candidate.title}.`, complete: true };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Review the current conversion records.";
    return { collections, complete: false, message: savedJob
      ? `The job is saved, but conversion is incomplete at ${phase}. Retry this quote to finish without another job. ${detail}`
      : `Conversion could not be completed. Review the quote and saved jobs before retrying. ${detail}` };
  }
}
