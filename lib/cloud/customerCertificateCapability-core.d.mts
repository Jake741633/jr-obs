export interface LiveCustomerCertificateTarget {
  organisationId: string;
  customerId: string;
  jobId?: string | null;
  sourceId: string;
}

export interface LiveCustomerCertificateEnvelope {
  organisation_id?: unknown;
  source_id?: unknown;
  customer_source_id?: unknown;
  job_source_id?: unknown;
  payload?: unknown;
  deleted_at?: unknown;
}

export function liveCustomerCertificateQuery(target: LiveCustomerCertificateTarget): string;
export function strictHttpsCertificateUrl(value: unknown): string | undefined;
export function liveCustomerCertificateUrlFromRows(
  rows: readonly LiveCustomerCertificateEnvelope[] | unknown,
  expected: LiveCustomerCertificateTarget,
): string | undefined;
