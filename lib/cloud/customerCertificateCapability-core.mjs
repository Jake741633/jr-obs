import { strictHttpsPaymentUrl } from "./portalPaymentLinkCapability-core.mjs";

function nonEmptyText(value) {
  return typeof value === "string" && value.length > 0;
}

function expectedJobId(value) {
  return nonEmptyText(value) ? value : null;
}

export function liveCustomerCertificateQuery({ organisationId, customerId, jobId, sourceId }) {
  for (const [name, value] of Object.entries({ organisationId, customerId, sourceId })) {
    if (!nonEmptyText(value)) throw new TypeError(`A live certificate lookup requires ${name}.`);
  }
  if (jobId !== undefined && jobId !== null && !nonEmptyText(jobId)) {
    throw new TypeError("A live certificate lookup requires a valid jobId or no jobId.");
  }

  const jobFilter = expectedJobId(jobId) === null
    ? "job_source_id=is.null"
    : `job_source_id=eq.${encodeURIComponent(jobId)}`;
  return [
    "select=organisation_id,source_id,customer_source_id,job_source_id,payload,deleted_at",
    `organisation_id=eq.${encodeURIComponent(organisationId)}`,
    `source_id=eq.${encodeURIComponent(sourceId)}`,
    `customer_source_id=eq.${encodeURIComponent(customerId)}`,
    jobFilter,
    "payload->>status=eq.Issued",
    "deleted_at=is.null",
    "limit=2",
  ].join("&");
}

export function strictHttpsCertificateUrl(value) {
  return strictHttpsPaymentUrl(value);
}

export function liveCustomerCertificateUrlFromRows(rows, expected) {
  if (!Array.isArray(rows) || rows.length !== 1 || !expected) return undefined;
  const row = rows[0];
  if (!row || typeof row !== "object" || Array.isArray(row)) return undefined;
  const payload = row.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return undefined;

  const jobId = expectedJobId(expected.jobId);
  if (row.organisation_id !== expected.organisationId
    || row.source_id !== expected.sourceId
    || row.customer_source_id !== expected.customerId
    || (row.job_source_id ?? null) !== jobId
    || row.deleted_at !== null
    || payload.id !== expected.sourceId
    || payload.customerId !== expected.customerId
    || (payload.jobId ?? null) !== jobId
    || payload.status !== "Issued") return undefined;

  return strictHttpsCertificateUrl(payload.externalPdfUrl);
}
