export interface PortalAppointmentTarget {
  id: string;
  jobId?: string;
}

export function portalRequestTargetMatchesJob<T extends PortalAppointmentTarget>(
  appointments: readonly T[],
  plannerEntryId: string,
  jobId: string,
): boolean;

export interface PortalApprovalTarget {
  documentId: string;
  documentVersion?: number;
  decision: "Accepted" | "Declined";
  decidedAt: string;
}

export interface PortalPricingDocumentTarget {
  id: string;
  documentVersion?: number;
  status: string;
  updatedAt: string;
}

export function portalApprovalForCurrentDocument<T extends PortalApprovalTarget>(
  approvals: readonly T[],
  document: PortalPricingDocumentTarget,
): T | undefined;

export function effectivePortalPricingStatus<
  TApproval extends PortalApprovalTarget,
  TDocument extends PortalPricingDocumentTarget,
>(document: TDocument, approvals: readonly TApproval[]): TDocument["status"] | TApproval["decision"];

export interface PortalApprovalQueueTarget {
  table?: string;
  operation?: string;
  sourceId?: string;
  state?: string;
  payload?: unknown;
}

export function portalApprovalQueueState(
  queue: readonly PortalApprovalQueueTarget[],
  approvalId: string,
): string;

export function portalApprovalQueueBlocksDocument(
  queue: readonly PortalApprovalQueueTarget[],
  document: PortalPricingDocumentTarget,
): boolean;

export interface PortalPaymentInvoiceTarget {
  id: string;
  customerId?: string;
  jobId?: string;
}

export interface PortalPaymentLinkTarget {
  invoiceId: string;
  customerId?: string;
  jobId?: string;
}

export function portalPaymentLinkForInvoice<T extends PortalPaymentLinkTarget>(
  paymentLinks: readonly T[],
  invoice: PortalPaymentInvoiceTarget | undefined,
  customerId: string,
): T | (T & { customerId: string; jobId?: string }) | undefined;
