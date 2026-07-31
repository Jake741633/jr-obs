import assert from "node:assert/strict";
import test from "node:test";
import {
  applyLocalCrud,
  cloudRowsToCache,
  coalesceQueue,
  hasVersionConflict,
  linkedSourceIds,
  makeTombstone,
  pendingImports,
  queueModeChange,
  retainVersionConflict,
  tenantListQuery,
  tenantRecordQuery,
} from "../lib/cloud/repository-core.mjs";

test("queries include organisation scope", () => {
  assert.match(tenantListQuery({ organisationId: "org-a", collectionKey: "jr-os-custom" }), /organisation_id=eq\.org-a/);
  assert.match(tenantRecordQuery({ organisationId: "org-a", sourceId: "rec-1", collectionKey: "jr-os-custom", includeDeleted: true }), /source_id=eq\.rec-1/);
});

test("local-only CRUD preserves IDs and never queues", () => {
  const created = applyLocalCrud([], { type: "save", record: { id: "cus-1", name: "Jake" } });
  const updated = applyLocalCrud(created, { type: "save", record: { id: "cus-1", name: "Jake R" } });
  const removed = applyLocalCrud(updated, { type: "remove", id: "cus-1" });
  const result = queueModeChange({ mode: "local", online: true, queue: [], change: { organisationId: "org-a", table: "customers", sourceId: "cus-1" } });
  assert.deepEqual(created, [{ id: "cus-1", name: "Jake" }]);
  assert.deepEqual(updated, [{ id: "cus-1", name: "Jake R" }]);
  assert.deepEqual(removed, []);
  assert.deepEqual(result, { queue: [], status: "Synced" });
});

test("migration mode queues non-blocking writes", () => {
  const change = { organisationId: "org-a", table: "customers", sourceId: "cus-1", operation: "upsert" };
  const result = queueModeChange({ mode: "migration", online: true, queue: [], change });
  assert.equal(result.status, "Pending");
  assert.deepEqual(result.queue, [{ ...change, state: "Pending" }]);
});

test("cloud mode loading deduplicates, caches latest payload and filters tombstones", () => {
  const rows = [
    { source_id: "a", version: 1, payload: { id: "a", name: "Old" } },
    { source_id: "a", version: 2, payload: { id: "a", name: "Latest" } },
    { source_id: "b", version: 3, deleted_at: "2026-07-31T08:00:00Z", payload: { id: "b", name: "Deleted" } },
  ];
  assert.deepEqual(cloudRowsToCache(rows), [{ id: "a", name: "Latest" }]);
});

test("offline writes remain queued with Offline status", () => {
  const change = { organisationId: "org-a", table: "payments", sourceId: "pay-1", operation: "upsert" };
  const result = queueModeChange({ mode: "cloud", online: false, queue: [], change });
  assert.equal(result.status, "Offline");
  assert.equal(result.queue[0].state, "Offline");
});

test("queue coalesces duplicate writes", () => {
  const first = { organisationId: "org-a", table: "customers", sourceId: "cus-1", operation: "upsert" };
  const second = { organisationId: "org-a", table: "customers", sourceId: "cus-1", operation: "upsert", payload: { name: "Updated" } };
  assert.deepEqual(coalesceQueue([first], second), [second]);
});

test("tenants and collections remain separate", () => {
  const queue = [{ organisationId: "org-a", table: "cloud_collections", sourceId: "same", collectionKey: "a" }];
  const otherCollection = { organisationId: "org-a", table: "cloud_collections", sourceId: "same", collectionKey: "b" };
  const otherTenant = { organisationId: "org-b", table: "cloud_collections", sourceId: "same", collectionKey: "a" };
  assert.equal(coalesceQueue(queue, otherCollection).length, 2);
  assert.equal(coalesceQueue(queue, otherTenant).length, 2);
});

test("version mismatch reports conflict and retains queued change", () => {
  const change = { organisationId: "org-a", table: "invoices", sourceId: "inv-1", operation: "upsert", expectedVersion: 2 };
  assert.equal(hasVersionConflict(3, 2), true);
  assert.equal(hasVersionConflict(3, 3), false);
  const retained = retainVersionConflict([], change, 3);
  assert.equal(retained.length, 1);
  assert.equal(retained[0].state, "Conflict");
  assert.match(retained[0].error, /Cloud version 3/);
});

test("imports skip unchanged and deleted rows", () => {
  const records = [{ id: "a", updatedAt: "2026-07-01" }, { id: "b", updatedAt: "2026-07-03" }, { id: "c", updatedAt: "2026-07-04" }];
  const existing = [{ source_id: "a", source_updated_at: "2026-07-01" }, { source_id: "b", source_updated_at: "2026-07-02", deleted_at: "2026-07-05" }];
  assert.deepEqual(pendingImports(records, existing).map((item) => item.id), ["c"]);
});

test("deletions create versioned tombstones", () => {
  const tombstone = makeTombstone({ currentVersion: 4, userId: "user-1", deletedAt: "2026-07-31T08:00:00Z" });
  assert.equal(tombstone.version, 5);
  assert.equal(tombstone.deleted_at, "2026-07-31T08:00:00Z");
});

test("customer and job links remain attached", () => {
  assert.deepEqual(linkedSourceIds({ customerId: "cus-1", jobId: "job-1" }), { customerSourceId: "cus-1", jobSourceId: "job-1" });
});

test("operational and field payloads round-trip without changing IDs or shapes", () => {
  const payloads = [
    { id: "mat-1", name: "2.5mm cable", tradeCost: 42.5, favourite: true },
    { id: "stock-1", materialId: "mat-1", locationId: "van-1", quantity: 3, minimumQuantity: 1 },
    { id: "movement-1", stockItemId: "stock-1", jobId: "job-1", type: "Used", quantity: 1 },
    { id: "purchase-1", jobId: "job-1", pricingDocumentId: "quote-1", items: [{ id: "line-1", quantity: 2 }] },
    { id: "team-1", name: "Electrician", qualifications: [{ id: "qual-1", name: "18th Edition" }] },
    { id: "timesheet-1", teamMemberId: "team-1", jobId: "job-1", workDate: "2026-07-31", breakMinutes: 30 },
    { id: "testing-1", customerId: "cus-1", jobId: "job-1", circuits: [{ id: "circuit-1", zs: "0.42" }] },
    { id: "certificate-1", customerId: "cus-1", jobId: "job-1", status: "Draft", revisionHistory: [] },
  ];
  const rows = payloads.map((payload, index) => ({ source_id: payload.id, version: index + 1, payload }));
  assert.deepEqual(cloudRowsToCache(rows), payloads);
  assert.deepEqual(linkedSourceIds(payloads[6]), { customerSourceId: "cus-1", jobSourceId: "job-1" });
  assert.deepEqual(linkedSourceIds(payloads[7]), { customerSourceId: "cus-1", jobSourceId: "job-1" });
});

test("portal approval and request payloads retain audit and customer links", () => {
  const approval = { id: "approval-1", customerId: "cus-1", documentId: "quote-1", decision: "Accepted", approvalName: "Customer", termsAccepted: true, termsSnapshot: "Terms", decidedAt: "2026-07-31T10:00:00Z" };
  const request = { id: "request-1", customerId: "cus-1", jobId: "job-1", type: "Appointment change", message: "Please move the visit", status: "Open", createdAt: "2026-07-31T10:05:00Z", updatedAt: "2026-07-31T10:05:00Z" };
  assert.deepEqual(cloudRowsToCache([{ source_id: approval.id, version: 1, payload: approval }, { source_id: request.id, version: 1, payload: request }]), [approval, request]);
  assert.deepEqual(linkedSourceIds(approval), { customerSourceId: "cus-1", jobSourceId: undefined });
  assert.deepEqual(linkedSourceIds(request), { customerSourceId: "cus-1", jobSourceId: "job-1" });
});

test("expense records round-trip without embedding receipt bytes in cloud payloads", () => {
  const expense = { id: "expense-1", jobId: "job-1", supplier: "CEF", grossAmount: 120, receiptFileName: "receipt.pdf", receiptUrl: "signed-url", privateStoragePath: "org-a/jobs/job-1/expense-1/receipt.pdf" };
  assert.deepEqual(cloudRowsToCache([{ source_id: expense.id, version: 1, payload: expense }]), [expense]);
  assert.deepEqual(linkedSourceIds(expense), { customerSourceId: undefined, jobSourceId: "job-1" });
});

test("survey records retain customer, job and nested inspection data", () => {
  const survey = { id: "survey-1", customerId: "cus-1", jobId: "job-1", number: "SUR-0001", circuits: [{ id: "circuit-1", protectiveDevice: "B32" }], photos: [{ id: "photo-1", category: "Consumer unit" }], defects: ["No SPD"], recommendations: ["Install surge protection"] };
  assert.deepEqual(cloudRowsToCache([{ source_id: survey.id, version: 1, payload: survey }]), [survey]);
  assert.deepEqual(linkedSourceIds(survey), { customerSourceId: "cus-1", jobSourceId: "job-1" });
});
