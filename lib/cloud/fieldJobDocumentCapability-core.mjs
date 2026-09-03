import { strictHttpsPaymentUrl } from "./portalPaymentLinkCapability-core.mjs";

function nonEmptyText(value) {
  return typeof value === "string" && value.length > 0;
}

export function liveFieldJobDocumentQuery({ organisationId, jobId, sourceId }) {
  for (const [name, value] of Object.entries({ organisationId, jobId, sourceId })) {
    if (!nonEmptyText(value)) throw new TypeError(`A live field job-document lookup requires ${name}.`);
  }

  return [
    "select=organisation_id,source_id,job_source_id,payload,deleted_at",
    `organisation_id=eq.${encodeURIComponent(organisationId)}`,
    `source_id=eq.${encodeURIComponent(sourceId)}`,
    `job_source_id=eq.${encodeURIComponent(jobId)}`,
    `payload->>jobId=eq.${encodeURIComponent(jobId)}`,
    "deleted_at=is.null",
    "limit=2",
  ].join("&");
}

export function strictHttpsJobDocumentUrl(value) {
  return strictHttpsPaymentUrl(value);
}

export function liveFieldJobDocumentUrlFromRows(rows, expected) {
  if (!Array.isArray(rows) || rows.length !== 1 || !expected) return undefined;
  const row = rows[0];
  if (!row || typeof row !== "object" || Array.isArray(row)) return undefined;
  const payload = row.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return undefined;

  if (row.organisation_id !== expected.organisationId
    || row.source_id !== expected.sourceId
    || row.job_source_id !== expected.jobId
    || row.deleted_at !== null
    || payload.id !== expected.sourceId
    || payload.jobId !== expected.jobId) return undefined;

  return strictHttpsJobDocumentUrl(payload.externalUrl);
}
