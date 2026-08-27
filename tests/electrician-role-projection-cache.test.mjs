import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  CUSTOMER_PROJECTION_CACHE_GENERATION,
  ELECTRICIAN_CUSTOMER_PROJECTION_CACHE_GENERATION,
  ELECTRICIAN_INVENTORY_PROJECTION_CACHE_GENERATION,
  ELECTRICIAN_JOB_DOCUMENT_CACHE_GENERATION,
  ELECTRICIAN_JOB_PROJECTION_CACHE_GENERATION,
  ELECTRICIAN_JOB_TIMELINE_CACHE_GENERATION,
  ELECTRICIAN_SITE_DIARY_CACHE_GENERATION,
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

test("electrician timeline caches remove finance activity and mask every variation note", () => {
  const timeline = [
    { id: "timeline-operational", jobId: "job-1", milestone: "Custom update", eventType: "Note", note: "Consumer unit isolated.", completedBy: "Electrician", internalDetail: "remove me" },
    { id: "timeline-1", jobId: "job-1", milestone: "Custom update", eventType: "Variation", sourceId: "variation-1", sourceType: "Legacy", fromStatus: "Quoted", toStatus: "Accepted", note: "VAR-1 accepted for £900 with £500 margin.", completedBy: "Office", completedAt: "2026-08-14T09:00:00.000Z", createdAt: "2026-08-14T09:00:00.000Z", amount: 900, margin: 500 },
    { id: "timeline-2", eventType: "Note", sourceType: "JobVariation", note: "Arbitrary historic price: £1,250.", completedBy: "Office", internalDetail: "remove me" },
    { id: "timeline-4", eventType: "vArIaTiOn", completedBy: "Office" },
    { id: "timeline-5", sourceType: "  jobvariation  ", note: "Case or padding must not bypass masking." },
    { id: "timeline-deposit", milestone: "Deposit received", note: "Deposit of £600 received.", completedBy: "Office", amount: 600 },
    { id: "timeline-invoice-created", milestone: "Invoice created", note: "Invoice INV-104 created for £1,200.", completedBy: "Office", invoiceTotal: 1_200 },
    { id: "timeline-invoice-sent", milestone: "Invoice sent", note: "Invoice INV-104 sent.", completedBy: "Office" },
    { id: "timeline-payment", milestone: "Payment received", note: "Payment of £1,200 received.", completedBy: "Office", amount: 1_200 },
    { id: "timeline-financial-type", milestone: "Custom update", eventType: "  FiNaNcIaL  ", note: "Private finance event.", completedBy: "Office" },
    { id: "timeline-invoice-source", milestone: "Custom update", eventType: "Note", sourceType: "  InVoIcE  ", note: "Private invoice event.", completedBy: "Office" },
    { id: "timeline-operational-invoice-word", milestone: "Invoice equipment installed", eventType: "Note", sourceType: "Payment", note: "Installed invoice printer power.", completedBy: "Electrician" },
  ];

  const sanitized = sanitizeRoleProjectionCache({
    storageKey: "jr-os-job-timeline",
    role: "electrician",
    mode: "migration",
    records: timeline,
  });

  const byId = new Map(sanitized.map((record) => [record.id, record]));
  assert.equal(byId.get("timeline-operational").note, "Consumer unit isolated.");
  assert.equal(byId.get("timeline-1").note, ELECTRICIAN_VARIATION_TIMELINE_NOTE);
  assert.equal(byId.get("timeline-2").note, ELECTRICIAN_VARIATION_TIMELINE_NOTE);
  assert.equal(byId.get("timeline-4").note, ELECTRICIAN_VARIATION_TIMELINE_NOTE, "missing variation notes must fail closed");
  assert.equal(byId.get("timeline-5").note, ELECTRICIAN_VARIATION_TIMELINE_NOTE, "classification casing or padding must not bypass masking");
  assert.equal(byId.get("timeline-operational-invoice-word").note, "Installed invoice printer power.", "classification must not rely on note text or broad payment source types");
  for (const financeId of [
    "timeline-deposit",
    "timeline-invoice-created",
    "timeline-invoice-sent",
    "timeline-payment",
    "timeline-financial-type",
    "timeline-invoice-source",
  ]) assert.equal(byId.has(financeId), false, `${financeId} must be removed from the field cache`);
  assert.equal(byId.get("timeline-1").completedBy, "Office");
  assert.equal("amount" in byId.get("timeline-1"), false);
  assert.equal("margin" in byId.get("timeline-1"), false);
  assert.equal("internalDetail" in byId.get("timeline-2"), false);
  assert.equal("internalDetail" in byId.get("timeline-operational"), false);
  assert.match(timeline[1].note, /£900/, "the source record must not be mutated");
  assert.equal(timeline[5].amount, 600, "removed source records must not be mutated");
});

test("office, customer projection, local-mode and unrelated caches retain their original records", () => {
  const records = [{ id: "timeline-finance", milestone: "Invoice sent", eventType: "Financial", sourceType: "Invoice", note: "Keep canonical finance activity" }];
  const contexts = [
    { storageKey: "jr-os-job-timeline", role: "office", mode: "cloud" },
    { storageKey: "jr-os-job-timeline", role: "customer", mode: "cloud" },
    { storageKey: "jr-os-job-timeline", role: "electrician", mode: "local" },
    { storageKey: "jr-os-rams", role: "electrician", mode: "local" },
    { storageKey: "jr-os-rams", role: "office", mode: "cloud" },
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
  assert.equal(roleProjectionCachePolicy({ storageKey: "jr-os-jobs", role: "electrician", mode: "cloud", generation: ELECTRICIAN_JOB_PROJECTION_CACHE_GENERATION }), "purge");
  assert.equal(roleProjectionCacheGeneration({ storageKey: "jr-os-jobs", role: "electrician" }), ELECTRICIAN_JOB_PROJECTION_CACHE_GENERATION);
  assert.equal(roleProjectionCachePolicy({ storageKey: "jr-os-customers", role: "electrician", mode: "cloud" }), "purge");
  assert.equal(roleProjectionCachePolicy({ storageKey: "jr-os-customers", role: "electrician", mode: "migration", generation: "old" }), "purge");
  assert.equal(roleProjectionCachePolicy({ storageKey: "jr-os-customers", role: "electrician", mode: "cloud", generation: ELECTRICIAN_CUSTOMER_PROJECTION_CACHE_GENERATION }), "purge");
  assert.equal(roleProjectionCacheGeneration({ storageKey: "jr-os-customers", role: "electrician" }), ELECTRICIAN_CUSTOMER_PROJECTION_CACHE_GENERATION);
  assert.equal(roleProjectionCachePolicy({ storageKey: "jr-os-job-documents", role: "electrician", mode: "cloud" }), "purge");
  assert.equal(roleProjectionCachePolicy({ storageKey: "jr-os-job-documents", role: "electrician", mode: "migration", generation: "old" }), "purge");
  assert.equal(roleProjectionCachePolicy({ storageKey: "jr-os-job-documents", role: "electrician", mode: "cloud", generation: ELECTRICIAN_JOB_DOCUMENT_CACHE_GENERATION }), "purge");
  assert.equal(roleProjectionCacheGeneration({ storageKey: "jr-os-job-documents", role: "electrician" }), ELECTRICIAN_JOB_DOCUMENT_CACHE_GENERATION);
  assert.equal(roleProjectionCachePolicy({ storageKey: "jr-os-job-timeline", role: "electrician", mode: "cloud" }), "purge");
  assert.equal(roleProjectionCachePolicy({ storageKey: "jr-os-job-timeline", role: "electrician", mode: "migration", generation: "old" }), "purge");
  assert.equal(roleProjectionCachePolicy({ storageKey: "jr-os-job-timeline", role: "electrician", mode: "cloud", generation: ELECTRICIAN_JOB_TIMELINE_CACHE_GENERATION }), "keep");
  assert.equal(roleProjectionCacheGeneration({ storageKey: "jr-os-job-timeline", role: "electrician" }), ELECTRICIAN_JOB_TIMELINE_CACHE_GENERATION);
  for (const storageKey of ["jr-os-site-diaries", "jr-os-site-diary"]) {
    assert.equal(roleProjectionCachePolicy({ storageKey, role: "electrician", mode: "cloud" }), "purge");
    assert.equal(roleProjectionCachePolicy({ storageKey, role: "electrician", mode: "migration", generation: "old" }), "purge");
    assert.equal(roleProjectionCachePolicy({ storageKey, role: "electrician", mode: "cloud", generation: ELECTRICIAN_SITE_DIARY_CACHE_GENERATION }), "keep");
    assert.equal(roleProjectionCacheGeneration({ storageKey, role: "electrician" }), ELECTRICIAN_SITE_DIARY_CACHE_GENERATION);
  }
  assert.equal(roleProjectionCachePolicy({ storageKey: "jr-os-jobs", role: "office", mode: "cloud" }), "keep");
  assert.equal(roleProjectionCachePolicy({ storageKey: "jr-os-customers", role: "office", mode: "cloud" }), "keep");
  assert.equal(roleProjectionCachePolicy({ storageKey: "jr-os-job-documents", role: "office", mode: "cloud" }), "keep");
  assert.equal(roleProjectionCachePolicy({ storageKey: "jr-os-job-timeline", role: "office", mode: "cloud" }), "keep");
  assert.equal(roleProjectionCachePolicy({ storageKey: "jr-os-site-diaries", role: "office", mode: "cloud" }), "keep");
  assert.equal(roleProjectionCachePolicy({ storageKey: "jr-os-site-diary", role: "office", mode: "cloud" }), "keep");
  assert.equal(roleProjectionCachePolicy({ storageKey: "jr-os-jobs", role: "electrician", mode: "local" }), "keep");
  assert.equal(roleProjectionCachePolicy({ storageKey: "jr-os-customers", role: "electrician", mode: "local" }), "keep");
  assert.equal(roleProjectionCachePolicy({ storageKey: "jr-os-job-documents", role: "electrician", mode: "local" }), "keep");
  assert.equal(roleProjectionCachePolicy({ storageKey: "jr-os-job-timeline", role: "electrician", mode: "local" }), "keep");
  assert.equal(roleProjectionCachePolicy({ storageKey: "jr-os-site-diaries", role: "electrician", mode: "local" }), "keep");
  assert.equal(roleProjectionCachePolicy({ storageKey: "jr-os-site-diary", role: "electrician", mode: "local" }), "keep");
});

test("electrician survey caches require a live assigned read", () => {
  assert.equal(roleProjectionCachePolicy({ storageKey: "jr-os-surveys", role: "electrician", mode: "cloud" }), "purge");
  assert.equal(roleProjectionCachePolicy({ storageKey: "jr-os-surveys", role: "electrician", mode: "migration", generation: "current" }), "purge");
  assert.equal(roleProjectionCachePolicy({ storageKey: "jr-os-surveys", role: "electrician", mode: "local" }), "keep");
  assert.equal(roleProjectionCachePolicy({ storageKey: "jr-os-surveys", role: "office", mode: "cloud" }), "keep");
  assert.equal(roleProjectionCacheGeneration({ storageKey: "jr-os-surveys", role: "electrician" }), undefined);
});

test("electrician office-finance caches never survive outside local mode", () => {
  for (const storageKey of [
    "jr-os-pricing-documents",
    "jr-os-invoices",
    "jr-os-bank-details",
    "jr-os-payment-terms-templates",
  ]) {
    assert.equal(roleProjectionCachePolicy({ storageKey, role: "electrician", mode: "cloud" }), "purge");
    assert.equal(roleProjectionCachePolicy({ storageKey, role: "electrician", mode: "migration", generation: "pre-hardening" }), "purge");
    assert.equal(roleProjectionCachePolicy({ storageKey, role: "electrician", mode: "local" }), "keep");
    assert.equal(roleProjectionCachePolicy({ storageKey, role: "office", mode: "cloud" }), "keep");
  }
});

test("electrician inventory caches discard records from before the field-safe price projections", () => {
  for (const storageKey of ["jr-os-materials", "jr-os-stock-items", "jr-os-purchase-lists"]) {
    assert.equal(roleProjectionCachePolicy({ storageKey, role: "electrician", mode: "cloud" }), "purge");
    assert.equal(roleProjectionCachePolicy({ storageKey, role: "electrician", mode: "migration", generation: "20260809_049" }), "purge");
    assert.equal(
      roleProjectionCachePolicy({ storageKey, role: "electrician", mode: "cloud", generation: ELECTRICIAN_INVENTORY_PROJECTION_CACHE_GENERATION }),
      "keep",
    );
    assert.equal(roleProjectionCacheGeneration({ storageKey, role: "electrician" }), ELECTRICIAN_INVENTORY_PROJECTION_CACHE_GENERATION);
    assert.equal(roleProjectionCachePolicy({ storageKey, role: "electrician", mode: "local" }), "keep");
    assert.equal(roleProjectionCachePolicy({ storageKey, role: "office", mode: "cloud" }), "keep");
  }
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
