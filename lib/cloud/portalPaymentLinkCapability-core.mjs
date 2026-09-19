const PAYMENT_LINK_COLLECTION_KEY = "jr-os-portal-payment-links";

function nonEmptyText(value) {
  return typeof value === "string" && value.length > 0;
}

function expectedJobId(value) {
  return nonEmptyText(value) ? value : null;
}

export function livePortalPaymentLinkQuery({ organisationId, customerId, jobId, invoiceId, sourceId }) {
  for (const [name, value] of Object.entries({ organisationId, customerId, invoiceId, sourceId })) {
    if (!nonEmptyText(value)) throw new TypeError(`A live payment-link lookup requires ${name}.`);
  }
  if (jobId !== undefined && jobId !== null && !nonEmptyText(jobId)) {
    throw new TypeError("A live payment-link lookup requires a valid jobId or no jobId.");
  }

  const jobFilter = expectedJobId(jobId) === null
    ? "job_source_id=is.null"
    : `job_source_id=eq.${encodeURIComponent(jobId)}`;
  return [
    "select=organisation_id,source_id,collection_key,customer_source_id,job_source_id,payload,deleted_at",
    `organisation_id=eq.${encodeURIComponent(organisationId)}`,
    `collection_key=eq.${encodeURIComponent(PAYMENT_LINK_COLLECTION_KEY)}`,
    `source_id=eq.${encodeURIComponent(sourceId)}`,
    `customer_source_id=eq.${encodeURIComponent(customerId)}`,
    jobFilter,
    `payload->>invoiceId=eq.${encodeURIComponent(invoiceId)}`,
    "deleted_at=is.null",
    "limit=2",
  ].join("&");
}

export function strictHttpsPaymentUrl(value) {
  if (!nonEmptyText(value) || !/^https:\/\/[^/?#]/u.test(value) || /[\s\\\u0000-\u001f\u007f]/u.test(value)) return undefined;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" || !parsed.hostname || parsed.username || parsed.password) return undefined;
    return parsed.toString();
  } catch {
    return undefined;
  }
}

export function livePortalPaymentUrlFromRows(rows, expected) {
  if (!Array.isArray(rows) || rows.length !== 1 || !expected) return undefined;
  const row = rows[0];
  if (!row || typeof row !== "object" || Array.isArray(row)) return undefined;
  const payload = row.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return undefined;

  const jobId = expectedJobId(expected.jobId);
  if (row.organisation_id !== expected.organisationId
    || row.collection_key !== PAYMENT_LINK_COLLECTION_KEY
    || row.source_id !== expected.sourceId
    || row.customer_source_id !== expected.customerId
    || (row.job_source_id ?? null) !== jobId
    || row.deleted_at !== null
    || payload.id !== expected.sourceId
    || payload.customerId !== expected.customerId
    || (payload.jobId ?? null) !== jobId
    || payload.invoiceId !== expected.invoiceId
    || payload.providerConfigured !== true) return undefined;

  return strictHttpsPaymentUrl(payload.paymentUrl);
}
