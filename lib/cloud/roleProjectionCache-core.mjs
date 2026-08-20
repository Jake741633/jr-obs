export const ELECTRICIAN_VARIATION_TIMELINE_NOTE = "Variation status updated.";
export const ELECTRICIAN_CUSTOMER_PROJECTION_CACHE_GENERATION = "20260820150000";
export const ELECTRICIAN_JOB_DOCUMENT_CACHE_GENERATION = "20260820153000";
export const ELECTRICIAN_JOB_PROJECTION_CACHE_GENERATION = "20260820143000";
export const CUSTOMER_PROJECTION_CACHE_GENERATION = "20260814091500";

const CUSTOMER_PROJECTION_STORAGE_KEYS = new Set([
  "jr-os-certificates",
  "jr-os-customers",
  "jr-os-deposit-requirements",
  "jr-os-invoices",
  "jr-os-job-timeline",
  "jr-os-jobs",
  "jr-os-payments",
  "jr-os-portal-payment-links",
  "jr-os-pricing-documents",
]);

const CUSTOMER_ALWAYS_PURGED_STORAGE_KEYS = new Set([
  "jr-os-job-documents",
  "jr-os-planner",
  "jr-os-portal-access",
  "jr-os-portal-activity",
  "jr-os-portal-photo-shares",
]);

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
  "customerId",
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

const CUSTOMER_DEPOSIT_REQUIREMENT_KEYS = new Set([
  "id",
  "pricingDocumentId",
  "mode",
  "value",
  "dueRule",
  "dueDate",
  "createdAt",
  "updatedAt",
]);

const CUSTOMER_PAYMENT_LINK_KEYS = new Set([
  "id",
  "customerId",
  "jobId",
  "invoiceId",
  "paymentUrl",
  "providerConfigured",
  "updatedAt",
]);

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function mapChanged(records, transform) {
  let changed = false;
  const next = records.flatMap((record) => {
    if (!isRecord(record)) {
      changed = true;
      return [];
    }
    const transformed = transform(record);
    if (transformed !== record) changed = true;
    return [transformed];
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

export function roleProjectionCacheGeneration({ storageKey, role }) {
  if (role === "customer" && CUSTOMER_PROJECTION_STORAGE_KEYS.has(storageKey)) {
    return CUSTOMER_PROJECTION_CACHE_GENERATION;
  }
  if (role === "electrician" && storageKey === "jr-os-customers") {
    return ELECTRICIAN_CUSTOMER_PROJECTION_CACHE_GENERATION;
  }
  if (role === "electrician" && storageKey === "jr-os-job-documents") {
    return ELECTRICIAN_JOB_DOCUMENT_CACHE_GENERATION;
  }
  if (role === "electrician" && storageKey === "jr-os-jobs") {
    return ELECTRICIAN_JOB_PROJECTION_CACHE_GENERATION;
  }
  return undefined;
}

export function roleProjectionCachePolicy({ storageKey, role, mode, generation }) {
  if (mode === "local") return "keep";
  if (role === "customer" && CUSTOMER_ALWAYS_PURGED_STORAGE_KEYS.has(storageKey)) return "purge";
  const expectedGeneration = roleProjectionCacheGeneration({ storageKey, role });
  if (expectedGeneration && generation !== expectedGeneration) return "purge";
  return "keep";
}

export function sanitizeRoleProjectionCache({ storageKey, role, mode, records }) {
  if (mode === "local" || !Array.isArray(records)) return records;
  if (role === "customer") {
    if (CUSTOMER_ALWAYS_PURGED_STORAGE_KEYS.has(storageKey)) return records.length ? [] : records;
    if (storageKey === "jr-os-deposit-requirements") {
      return mapChanged(records, (record) => allowlistedRecord(record, CUSTOMER_DEPOSIT_REQUIREMENT_KEYS));
    }
    if (storageKey === "jr-os-portal-payment-links") {
      return mapChanged(records, (record) => allowlistedRecord(record, CUSTOMER_PAYMENT_LINK_KEYS));
    }
    return records;
  }
  if (role === "electrician" && storageKey === "jr-os-jobs") return mapChanged(records, fieldJobRecord);
  if (role === "electrician" && storageKey === "jr-os-job-timeline") return mapChanged(records, fieldTimelineRecord);
  return records;
}
