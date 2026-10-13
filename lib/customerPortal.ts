import type { ElectricalCertificate, Invoice, Job, JobDocument, PlannerEntry, PricingDocument } from "./models";
import { normaliseJobStatus } from "./jobManagement-core.mjs";
export { effectivePortalPricingStatus, portalApprovalForCurrentDocument, portalApprovalQueueBlocksDocument, portalApprovalQueueState, portalPaymentLinkForInvoice, portalRequestTargetMatchesJob } from "./customerPortal-core.mjs";

export type PortalDecision = "Accepted" | "Declined";
export type PortalRequestType = "Appointment change" | "Question" | "Additional work" | "General message";

export interface PortalAccessRecord { id: string; customerId: string; accessCode: string; enabled: boolean; createdAt: string; updatedAt: string; }
export interface PortalApprovalRecord { id: string; customerId: string; documentId: string; documentVersion?: number; documentType: "Quote" | "Estimate"; decision: PortalDecision; approvalName: string; comments: string; termsAccepted: boolean; termsSnapshot: string; decidedAt: string; }
export interface PortalRequest { id: string; customerId: string; jobId?: string; plannerEntryId?: string; type: PortalRequestType; message: string; requestedDate?: string; status: "Open" | "In review" | "Resolved"; createdAt: string; updatedAt: string; }
export interface PortalPaymentLink { id: string; customerId: string; jobId?: string; invoiceId: string; paymentUrl: string; providerName?: string; providerConfigured: boolean; updatedAt: string; }
export interface PortalPhotoShare { id: string; documentId: string; safeToShare: boolean; caption: string; updatedAt: string; }
export interface PortalActivity { id: string; customerId: string; jobId?: string; action: string; detail: string; createdAt: string; }

export function invoicePortalStatus(invoice: Invoice, today = new Date().toISOString().slice(0, 10)) {
  if (invoice.status === "Paid") return "Paid";
  if (invoice.amountPaid > 0) return "Part paid";
  if (invoice.status === "Overdue" || (invoice.dueDate && invoice.dueDate < today)) return "Overdue";
  return "Due";
}

export function jobProgress(job: Job, timelineCount: number) {
  const status = normaliseJobStatus(job.status);
  if (["Complete", "Invoiced", "Paid"].includes(status)) return 100;
  if (status === "Snagging") return Math.min(95, 80 + timelineCount * 2);
  if (status === "Testing") return Math.min(90, 72 + timelineCount * 2);
  if (status === "Second fix") return Math.min(80, 60 + timelineCount * 3);
  if (["First fix", "Awaiting builder"].includes(status)) return Math.min(60, 35 + timelineCount * 4);
  if (status === "Scheduled") return 25;
  if (["Quoted", "Accepted", "Awaiting deposit"].includes(status)) return 10;
  return 5;
}

export function portalAppointments(entries: PlannerEntry[], jobs: Job[], customerId: string) {
  const ids = new Set(jobs.filter((job) => job.customerId === customerId).map((job) => job.id));
  const today = new Date().toISOString().slice(0, 10);
  return entries.filter((entry) => entry.jobId && ids.has(entry.jobId) && ["Planned", "Confirmed"].includes(entry.status) && entry.date >= today).sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
}

export function customerDocuments<T extends PricingDocument | Invoice | ElectricalCertificate>(items: T[], customerId: string, jobIds: Set<string>) {
  return items.filter((item) => (
    item.customerId === customerId
    || (item.jobId && jobIds.has(item.jobId))
  ) && !(
    "type" in item
    && (item.type === "Quote" || item.type === "Estimate")
    && item.status === "Draft"
  ));
}

export function sharedPhotos(documents: JobDocument[], jobIds: Set<string>, shares: PortalPhotoShare[]) {
  const allowed = new Map(shares.filter((share) => share.safeToShare).map((share) => [share.documentId, share]));
  return documents.filter((document) => document.category === "Photo" && jobIds.has(document.jobId) && allowed.has(document.id)).map((document) => ({ document, share: allowed.get(document.id)! }));
}
