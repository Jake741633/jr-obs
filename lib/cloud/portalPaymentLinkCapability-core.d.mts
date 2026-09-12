export interface LivePortalPaymentLinkTarget {
  organisationId: string;
  customerId: string;
  jobId?: string | null;
  invoiceId: string;
  sourceId: string;
}

export interface LivePortalPaymentLinkEnvelope {
  organisation_id?: unknown;
  source_id?: unknown;
  collection_key?: unknown;
  customer_source_id?: unknown;
  job_source_id?: unknown;
  payload?: unknown;
  deleted_at?: unknown;
}

export function livePortalPaymentLinkQuery(target: LivePortalPaymentLinkTarget): string;
export function strictHttpsPaymentUrl(value: unknown): string | undefined;
export function livePortalPaymentUrlFromRows(
  rows: readonly LivePortalPaymentLinkEnvelope[] | unknown,
  expected: LivePortalPaymentLinkTarget,
): string | undefined;
