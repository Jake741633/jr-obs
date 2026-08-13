export const ELECTRICIAN_VARIATION_TIMELINE_NOTE = "Variation status updated.";

const FIELD_JOB_KEYS = new Set([
  "id",
  "title",
  "customerId",
  "builderId",
  "siteAddress",
  "status",
  "startDate",
  "targetCompletionDate",
  "priority",
  "assignedTo",
  "contacts",
  "requiredCertificateTypes",
  "createdAt",
  "updatedAt",
]);

const FIELD_TIMELINE_KEYS = new Set([
  "id",
  "jobId",
  "milestone",
  "eventType",
  "sourceId",
  "sourceType",
  "fromStatus",
  "toStatus",
  "note",
  "completedBy",
  "completedAt",
  "createdAt",
]);

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function mapChanged(records, transform) {
  let changed = false;
  const next = records.map((record) => {
    const transformed = transform(record);
    if (transformed !== record) changed = true;
    return transformed;
  });
  return changed ? next : records;
}

function allowlistedRecord(record, allowedKeys, values = record) {
  if (!isRecord(record)) return record;
  const keys = Object.keys(record);
  const safeRecord = {};
  let changed = keys.some((key) => !allowedKeys.has(key));
  for (const key of allowedKeys) {
    if (!Object.prototype.hasOwnProperty.call(values, key)) continue;
    safeRecord[key] = values[key];
    if (!Object.prototype.hasOwnProperty.call(record, key) || values[key] !== record[key]) changed = true;
  }
  return changed ? safeRecord : record;
}

function fieldJobRecord(record) {
  return allowlistedRecord(record, FIELD_JOB_KEYS);
}

function fieldTimelineRecord(record) {
  if (!isRecord(record)) return record;
  const isVariation = String(record.eventType ?? "").trim().toLowerCase() === "variation"
    || String(record.sourceType ?? "").trim().toLowerCase() === "jobvariation";
  const values = isVariation ? { ...record, note: ELECTRICIAN_VARIATION_TIMELINE_NOTE } : record;
  return allowlistedRecord(record, FIELD_TIMELINE_KEYS, values);
}

export function sanitizeRoleProjectionCache({ storageKey, role, mode, records }) {
  if (role !== "electrician" || mode === "local" || !Array.isArray(records)) return records;
  if (storageKey === "jr-os-jobs") return mapChanged(records, fieldJobRecord);
  if (storageKey === "jr-os-job-timeline") return mapChanged(records, fieldTimelineRecord);
  return records;
}
