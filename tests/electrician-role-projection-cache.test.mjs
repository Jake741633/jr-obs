import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  CUSTOMER_PROJECTION_CACHE_GENERATION,
  ELECTRICIAN_CUSTOMER_PROJECTION_CACHE_GENERATION,
  ELECTRICIAN_JOB_DOCUMENT_CACHE_GENERATION,
  ELECTRICIAN_JOB_PROJECTION_CACHE_GENERATION,
  ELECTRICIAN_JOB_TIMELINE_CACHE_GENERATION,
  ELECTRICIAN_VARIATION_TIMELINE_NOTE,
  roleProjectionCacheGeneration,
  roleProjectionCachePolicy,
  sanitizeRoleProjectionCache,
} from "../lib/cloud/roleProjectionCache-core.mjs";

test("electrician job projection caches mirror the field-job allowlist", () => {
  const jobs = [{
    id: "job-1",
    title: "Kitchen alterations",
    customerId: "customer-1",
    builderId: "builder-1",
    siteAddress: "1 High Street",
    status: "First fix",
    startDate: "2026-08-14",
    targetCompletionDate: "2026-08-21",
    priority: "High",
    assignedTo: ["team-1"],
    notes: "Margin is thin; discuss internally.",
    contacts: [{ id: "contact-1", notes: "Ring the bell at the side door." }],
    requiredCertificateTypes: ["EIC"],
    createdAt: "2026-08-14T08:00:00.000Z",
    updatedAt: "2026-08-14T09:00:00.000Z",
    value: 12_345,
    quoteSnapshot: { profitability: { grossProfit: 3_000 } },
    unexpectedPrivateField: "remove me",
  }];

  const sanitized = sanitizeRoleProjectionCache({
    storageKey: "jr-os-jobs",
    role: "electrician",
    mode: "cloud",
    records: jobs,
  });

  assert.deepEqual(sanitized, [{
    id: "job-1",
    title: "Kitchen alterations",
    customerId: "customer-1",
    builderId: "builder-1",
    siteAddress: "1 High Street",
    status: "First fix",
    startDate: "2026-08-14",
    targetCompletionDate: "2026-08-21",
    priority: "High",
    assignedTo: ["team-1"],
    contacts: [{ id: "contact-1", notes: "Ring the bell at the side door." }],
    requiredCertificateTypes: ["EIC"],
    createdAt: "2026-08-14T08:00:00.000Z",
    updatedAt: "2026-08-14T09:00:00.000Z",
  }]);
  assert.equal(jobs[0].notes, "Margin is thin; discuss internally.", "the source record must not be mutated");
  assert.equal(jobs[0].value, 12_345, "the source record must not be mutated");
});

test("electrician timeline caches mirror the safe allowlist and replace every variation note", () => {
  const timeline = [
    { id: "timeline-1", jobId: "job-1", milestone: "Custom update", eventType: "Variation", sourceId: "variation-1", sourceType: "Legacy", fromStatus: "Quoted", toStatus: "Accepted", note: "VAR-1 accepted for £900 with £500 margin.", completedBy: "Office", completedAt: "2026-08-14T09:00:00.000Z", createdAt: "2026-08-14T09:00:00.000Z", amount: 900, margin: 500 },
    { id: "timeline-2", eventType: "Note", sourceType: "JobVariation", note: "Arbitrary historic price: £1,250.", completedBy: "Office", internalDetail: "remove me" },
    { id: "timeline-3", eventType: "Financial", sourceType: "Invoice", note: "Invoice sent.", completedBy: "Office", invoiceTotal: 600 },
    { id: "timeline-4", eventType: "vArIaTiOn", completedBy: "Office" },
    { id: "timeline-5", sourceType: "  jobvariation  ", note: "Case or padding must not bypass masking." },
  ];

  const sanitized = sanitizeRoleProjectionCache({
    storageKey: "jr-os-job-timeline",
    role: "electrician",
    mode: "migration",
    records: timeline,
  });

  assert.equal(sanitized[0].note, ELECTRICIAN_VARIATION_TIMELINE_NOTE);
  assert.equal(sanitized[1].note, ELECTRICIAN_VARIATION_TIMELINE_NOTE);
  assert.equal(sanitized[2].note, "Invoice sent.", "non-variation notes must retain their value");
  assert.equal(sanitized[3].note, ELECTRICIAN_VARIATION_TIMELINE_NOTE, "missing variation notes must fail closed");
  assert.equal(sanitized[4].note, ELECTRICIAN_VARIATION_TIMELINE_NOTE, "classification casing or padding must not bypass masking");
  assert.equal(sanitized[0].completedBy, "Office");
  assert.equal("amount" in sanitized[0], false);
  assert.equal("margin" in sanitized[0], false);
  assert.equal("internalDetail" in sanitized[1], false);
  assert.equal("invoiceTotal" in sanitized[2], false);
  assert.match(timeline[0].note, /£900/, "the source record must not be mutated");
});

test("office, customer projection, local-mode and unrelated caches retain their original records", () => {
  const records = [{ id: "job-1", notes: "Keep me", eventType: "Variation", note: "Keep this too" }];
  const contexts = [
    { storageKey: "jr-os-jobs", role: "office", mode: "cloud" },
    { storageKey: "jr-os-jobs", role: "customer", mode: "cloud" },
    { storageKey: "jr-os-jobs", role: "electrician", mode: "local" },
    { storageKey: "jr-os-rams", role: "electrician", mode: "cloud" },
  ];

  for (const context of contexts) {
    assert.strictEqual(sanitizeRoleProjectionCache({ ...context, records }), records);
  }
});

test("role projection cache generations fail closed on the first upgraded offline read", () => {
  for (const storageKey of [
    "jr-os-certificates", "jr-os-customers", "jr-os-deposit-requirements",
    "jr-os-invoices", "jr-os-job-timeline", "jr-os-jobs", "jr-os-payments",
    "jr-os-portal-payment-links", "jr-os-pricing-documents",
  ]) {
    assert.equal(roleProjectionCachePolicy({ storageKey, role: "customer", mode: "cloud" }), "purge");
    assert.equal(roleProjectionCachePolicy({ storageKey, role: "customer", mode: "migration", generation: "old" }), "purge");
    assert.equal(roleProjectionCachePolicy({ storageKey, role: "customer", mode: "cloud", generation: CUSTOMER_PROJECTION_CACHE_GENERATION }), "keep");
    assert.equal(roleProjectionCacheGeneration({ storageKey, role: "customer" }), CUSTOMER_PROJECTION_CACHE_GENERATION);
  }
  for (const storageKey of ["jr-os-job-documents", "jr-os-planner", "jr-os-portal-access", "jr-os-portal-activity", "jr-os-portal-photo-shares"]) {
    assert.equal(roleProjectionCachePolicy({ storageKey, role: "customer", mode: "cloud", generation: CUSTOMER_PROJECTION_CACHE_GENERATION }), "purge");
  }
  assert.equal(roleProjectionCachePolicy({ storageKey: "jr-os-jobs", role: "electrician", mode: "cloud" }), "purge");
  assert.equal(roleProjectionCachePolicy({ storageKey: "jr-os-jobs", role: "electrician", mode: "migration", generation: "old" }), "purge");
  assert.equal(roleProjectionCachePolicy({ storageKey: "jr-os-jobs", role: "electrician", mode: "cloud", generation: ELECTRICIAN_JOB_PROJECTION_CACHE_GENERATION }), "keep");
  assert.equal(roleProjectionCacheGeneration({ storageKey: "jr-os-jobs", role: "electrician" }), ELECTRICIAN_JOB_PROJECTION_CACHE_GENERATION);
  assert.equal(roleProjectionCachePolicy({ storageKey: "jr-os-customers", role: "electrician", mode: "cloud" }), "purge");
  assert.equal(roleProjectionCachePolicy({ storageKey: "jr-os-customers", role: "electrician", mode: "migration", generation: "old" }), "purge");
  assert.equal(roleProjectionCachePolicy({ storageKey: "jr-os-customers", role: "electrician", mode: "cloud", generation: ELECTRICIAN_CUSTOMER_PROJECTION_CACHE_GENERATION }), "keep");
  assert.equal(roleProjectionCacheGeneration({ storageKey: "jr-os-customers", role: "electrician" }), ELECTRICIAN_CUSTOMER_PROJECTION_CACHE_GENERATION);
  assert.equal(roleProjectionCachePolicy({ storageKey: "jr-os-job-documents", role: "electrician", mode: "cloud" }), "purge");
  assert.equal(roleProjectionCachePolicy({ storageKey: "jr-os-job-documents", role: "electrician", mode: "migration", generation: "old" }), "purge");
  assert.equal(roleProjectionCachePolicy({ storageKey: "jr-os-job-documents", role: "electrician", mode: "cloud", generation: ELECTRICIAN_JOB_DOCUMENT_CACHE_GENERATION }), "keep");
  assert.equal(roleProjectionCacheGeneration({ storageKey: "jr-os-job-documents", role: "electrician" }), ELECTRICIAN_JOB_DOCUMENT_CACHE_GENERATION);
  assert.equal(roleProjectionCachePolicy({ storageKey: "jr-os-job-timeline", role: "electrician", mode: "cloud" }), "purge");
  assert.equal(roleProjectionCachePolicy({ storageKey: "jr-os-job-timeline", role: "electrician", mode: "migration", generation: "old" }), "purge");
  assert.equal(roleProjectionCachePolicy({ storageKey: "jr-os-job-timeline", role: "electrician", mode: "cloud", generation: ELECTRICIAN_JOB_TIMELINE_CACHE_GENERATION }), "keep");
  assert.equal(roleProjectionCacheGeneration({ storageKey: "jr-os-job-timeline", role: "electrician" }), ELECTRICIAN_JOB_TIMELINE_CACHE_GENERATION);
  assert.equal(roleProjectionCachePolicy({ storageKey: "jr-os-jobs", role: "office", mode: "cloud" }), "keep");
  assert.equal(roleProjectionCachePolicy({ storageKey: "jr-os-customers", role: "office", mode: "cloud" }), "keep");
  assert.equal(roleProjectionCachePolicy({ storageKey: "jr-os-job-documents", role: "office", mode: "cloud" }), "keep");
  assert.equal(roleProjectionCachePolicy({ storageKey: "jr-os-job-timeline", role: "office", mode: "cloud" }), "keep");
  assert.equal(roleProjectionCachePolicy({ storageKey: "jr-os-jobs", role: "electrician", mode: "local" }), "keep");
  assert.equal(roleProjectionCachePolicy({ storageKey: "jr-os-customers", role: "electrician", mode: "local" }), "keep");
  assert.equal(roleProjectionCachePolicy({ storageKey: "jr-os-job-documents", role: "electrician", mode: "local" }), "keep");
  assert.equal(roleProjectionCachePolicy({ storageKey: "jr-os-job-timeline", role: "electrician", mode: "local" }), "keep");
  assert.equal(roleProjectionCachePolicy({ storageKey: "jr-os-surveys", role: "electrician", mode: "cloud" }), "keep");
  assert.equal(roleProjectionCacheGeneration({ storageKey: "jr-os-surveys", role: "electrician" }), undefined);
});

test("customer generic finance caches retain only the projection allowlists", () => {
  const deposits = sanitizeRoleProjectionCache({
    storageKey: "jr-os-deposit-requirements", role: "customer", mode: "cloud",
    records: [null, "private", 42, { id: "deposit-1", pricingDocumentId: "quote-1", mode: "Percentage", value: 20, dueRule: "On acceptance", createdAt: "now", updatedAt: "now", internalNote: "private", customerId: "forged" }],
  });
  assert.deepEqual(deposits, [{ id: "deposit-1", pricingDocumentId: "quote-1", mode: "Percentage", value: 20, dueRule: "On acceptance", createdAt: "now", updatedAt: "now" }]);

  const links = sanitizeRoleProjectionCache({
    storageKey: "jr-os-portal-payment-links", role: "customer", mode: "cloud",
    records: [{ id: "link-1", customerId: "customer-1", jobId: "job-1", invoiceId: "invoice-1", paymentUrl: "https://pay.example/1", providerConfigured: true, updatedAt: "now", providerName: "private label", secret: "private" }],
  });
  assert.deepEqual(links, [{ id: "link-1", customerId: "customer-1", jobId: "job-1", invoiceId: "invoice-1", paymentUrl: "https://pay.example/1", providerConfigured: true, updatedAt: "now" }]);
  assert.deepEqual(sanitizeRoleProjectionCache({ storageKey: "jr-os-portal-activity", role: "customer", mode: "cloud", records: [{ id: "activity-1", detail: "private" }] }), []);
});

test("collection adapter sanitizes cached fallback and fetched role-projection records before returning", async () => {
  const adapter = await readFile(new URL("../lib/cloud/adapter.ts", import.meta.url), "utf8");
  assert.match(adapter, /: sanitizeRoleProjectionCache\(\{ storageKey, role: cacheRole, mode, records: cached \}\)/);
  assert.match(adapter, /roleProjectionCachePolicy\(\{ storageKey, role: cacheRole, mode, generation: cachedGeneration \}\)/);
  assert.match(adapter, /cachePolicy === "purge"[\s\S]*\? \[\]/);
  assert.match(adapter, /if \(local !== cached\) writeLocal\(scopedStorageKey, local\)/);
  assert.match(adapter, /if \(mode === "local" \|\| !navigator\.onLine\) return local/);
  assert.match(adapter, /const roleProjectionRecords = sanitizeRoleProjectionCache\(\{ storageKey, role: cacheRole, mode, records: cloudRecords \}\)/);
  assert.match(adapter, /writeLocal\(scopedStorageKey, roleProjectionRecords\)/);
  assert.match(adapter, /const projectionGeneration = roleProjectionCacheGeneration\(\{ storageKey, role: cacheRole \}\)/);
  assert.match(adapter, /if \(projectionGeneration\) window\.localStorage\.setItem\(projectionGenerationKey\(scopedStorageKey\), projectionGeneration\)/);
  assert.match(adapter, /return roleProjectionRecords/);
});
