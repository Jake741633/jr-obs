// Migration is intentionally deny-by-default. New browser collections must be
// reviewed and registered here before they can be uploaded to Supabase.
export const typedCollectionTables = Object.freeze({
  "jr-os-customers": "customers",
  "jr-os-builders": "builders",
  "jr-os-jobs": "jobs",
  "jr-os-pricing-documents": "pricing_documents",
  "jr-os-invoices": "invoices",
  "jr-os-payments": "payments",
  "jr-os-expenses": "expenses",
  "jr-os-materials": "materials",
  "jr-os-stock-items": "stock_items",
  "jr-os-stock-movements": "stock_movements",
  "jr-os-purchase-lists": "purchase_lists",
  "jr-os-planner": "planner_entries",
  "jr-os-team": "team_members",
  "jr-os-timesheets": "timesheets",
  "jr-os-certificates": "certificates",
  "jr-os-electrical-testing-records": "electrical_testing_records",
  "jr-os-job-documents": "job_documents",
  "jr-os-portal-approvals": "portal_approvals",
  "jr-os-portal-requests": "portal_requests",
  "jr-os-ai-recommendation-evidence": "ai_recommendation_evidence",
});

export const genericCloudCollectionStorageKeys = Object.freeze([
  "jr-os-ai-learning-memory",
  "jr-os-ai-reminders",
  "jr-os-bank-details",
  "jr-os-business-overheads",
  "jr-os-business-profile",
  "jr-os-business-terms-templates",
  "jr-os-certificate-defaults",
  "jr-os-crm-follow-up-settings",
  "jr-os-customer-interactions",
  "jr-os-customer-profiles",
  "jr-os-deposit-requirements",
  "jr-os-document-branding",
  "jr-os-electrical-testing",
  "jr-os-equipment-checks",
  "jr-os-fleet",
  "jr-os-job-completion",
  "jr-os-job-material-usage",
  "jr-os-job-packs",
  "jr-os-job-payment-stages",
  "jr-os-job-progress",
  "jr-os-job-qa-inspections",
  "jr-os-job-tasks",
  "jr-os-job-timeline",
  "jr-os-job-variations",
  "jr-os-labour-cost-settings",
  "jr-os-labour-rates",
  "jr-os-lead-activities",
  "jr-os-leads",
  "jr-os-payment-terms-templates",
  "jr-os-portal-access",
  "jr-os-portal-activity",
  "jr-os-portal-payment-links",
  "jr-os-portal-photo-shares",
  "jr-os-price-book",
  "jr-os-quote-engine-settings",
  "jr-os-quote-presentation-defaults",
  "jr-os-quote-presentation-overrides",
  "jr-os-rams",
  "jr-os-release-readiness-v0-1",
  "jr-os-room-estimates",
  "jr-os-scheduled-cash-flow",
  "jr-os-site-diaries",
  "jr-os-site-diary",
  "jr-os-stock-locations",
  "jr-os-surveys",
  "jr-os-test-instruments",
  "jr-os-tools",
  "jr-os-vat-settings",
]);

export const cloudCollectionStorageKeys = Object.freeze([
  ...Object.keys(typedCollectionTables),
  ...genericCloudCollectionStorageKeys,
]);

export const legacyAggregateStorageKeys = Object.freeze([
  ...cloudCollectionStorageKeys,
  "jr-os-ai-profile",
]);

export const LEGACY_MIGRATION_CLAIM_KEY = "jr-os-legacy-migration-claim";

const cloudCollectionStorageKeySet = new Set(cloudCollectionStorageKeys);
const genericCloudCollectionStorageKeySet = new Set(genericCloudCollectionStorageKeys);
const legacyAggregateStorageKeySet = new Set(legacyAggregateStorageKeys);
const ORGANISATION_MARKER = ":organisation:";
const ACCOUNT_MARKER = ":account:";
const FOREIGN_IDENTITY_KEYS = ["jr-os-active-organisation"];
const FOREIGN_QUEUE_KEYS = ["jr-os-cloud-sync-queue", "jr-os-private-file-upload-queue"];

function storageKeys(storage) {
  const keys = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (typeof key === "string") keys.push(key);
  }
  return keys;
}

function parseStorageValue(raw) {
  if (raw === null) return undefined;
  try { return JSON.parse(raw); } catch { return raw; }
}

export function isCloudCollectionStorageKey(storageKey) {
  return cloudCollectionStorageKeySet.has(storageKey);
}

export function isGenericCloudCollectionStorageKey(storageKey) {
  return genericCloudCollectionStorageKeySet.has(storageKey);
}

export function isLegacyAggregateStorageKey(storageKey) {
  return legacyAggregateStorageKeySet.has(storageKey);
}

export function typedLegacyMigrationStorageKeys(storage) {
  return storageKeys(storage).filter(isCloudCollectionStorageKey).sort();
}

export function aggregateLegacyMigrationStorageKeys(storage) {
  return storageKeys(storage).filter(isLegacyAggregateStorageKey).sort();
}

export function collectLegacyAggregateData(storage) {
  const data = {};
  for (const key of aggregateLegacyMigrationStorageKeys(storage)) {
    const value = parseStorageValue(storage.getItem(key));
    if (value !== undefined) data[key] = value;
  }
  return data;
}

export function scopedBusinessStorageKey(storageKey) {
  const markerIndex = storageKey.indexOf(ORGANISATION_MARKER);
  if (markerIndex <= 0) return null;
  const baseStorageKey = storageKey.slice(0, markerIndex);
  if (!isLegacyAggregateStorageKey(baseStorageKey)) return null;

  const suffix = storageKey.slice(markerIndex + ORGANISATION_MARKER.length);
  const accountIndex = suffix.indexOf(ACCOUNT_MARKER);
  const encodedOrganisation = accountIndex === -1 ? suffix : suffix.slice(0, accountIndex);
  const encodedAccount = accountIndex === -1 ? null : suffix.slice(accountIndex + ACCOUNT_MARKER.length);
  try {
    const organisation = JSON.parse(encodedOrganisation);
    if (!Array.isArray(organisation) || organisation.length !== 1 || typeof organisation[0] !== "string"
      || JSON.stringify(organisation) !== encodedOrganisation) return null;
    if (encodedAccount !== null) {
      const account = JSON.parse(encodedAccount);
      if (!Array.isArray(account) || account.length !== 3 || typeof account[0] !== "string"
        || JSON.stringify(account) !== encodedAccount) return null;
    }
    return { baseStorageKey, organisationId: organisation[0], accountScoped: encodedAccount !== null };
  } catch {
    return null;
  }
}

export function collectOrganisationBusinessData(storage, organisationId) {
  const data = {};
  for (const key of storageKeys(storage)) {
    const scoped = scopedBusinessStorageKey(key);
    if (!scoped || scoped.organisationId !== organisationId || scoped.accountScoped) continue;
    const value = parseStorageValue(storage.getItem(key));
    if (value !== undefined) data[scoped.baseStorageKey] = value;
  }
  return data;
}

function foreignOrganisationIds(storage, organisationId) {
  const ids = new Set();
  for (const key of storageKeys(storage)) {
    const scoped = scopedBusinessStorageKey(key);
    if (scoped && scoped.organisationId !== organisationId) ids.add(scoped.organisationId);
  }
  for (const key of FOREIGN_IDENTITY_KEYS) {
    const value = storage.getItem(key);
    if (value && value !== organisationId) ids.add(value);
  }
  for (const key of FOREIGN_QUEUE_KEYS) {
    const value = parseStorageValue(storage.getItem(key));
    if (!Array.isArray(value)) continue;
    for (const item of value) {
      if (item && typeof item === "object" && typeof item.organisationId === "string"
        && item.organisationId !== organisationId) ids.add(item.organisationId);
    }
  }
  return [...ids].sort();
}

export function claimLegacyMigrationStorage(storage, organisationId) {
  if (!organisationId) throw new Error("Legacy migration requires an active organisation.");
  // Unscoped legacy records carry no tenant identity. Bind them once and refuse
  // a claim when the browser proves that another organisation has used it.
  const foreignIds = foreignOrganisationIds(storage, organisationId);
  if (foreignIds.length) {
    throw new Error("Legacy migration is blocked because this browser contains data for another organisation. Use that organisation or a separate browser profile.");
  }

  const rawClaim = storage.getItem(LEGACY_MIGRATION_CLAIM_KEY);
  if (rawClaim !== null) {
    try {
      const claim = JSON.parse(rawClaim);
      if (!claim || typeof claim !== "object" || claim.organisationId !== organisationId) throw new Error("mismatch");
      return false;
    } catch {
      throw new Error("This browser's legacy data is already claimed by a different organisation.");
    }
  }

  storage.setItem(LEGACY_MIGRATION_CLAIM_KEY, JSON.stringify({ organisationId }));
  return true;
}
