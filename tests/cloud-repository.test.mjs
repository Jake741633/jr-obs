import assert from "node:assert/strict";
import test from "node:test";
import { coalesceQueue, hasVersionConflict, linkedSourceIds, makeTombstone, pendingImports, tenantListQuery, tenantRecordQuery } from "../lib/cloud/repository-core.mjs";

test("queries include organisation scope", () => {
  assert.match(tenantListQuery({ organisationId: "org-a", collectionKey: "jr-os-custom" }), /organisation_id=eq\.org-a/);
  assert.match(tenantRecordQuery({ organisationId: "org-a", sourceId: "rec-1", collectionKey: "jr-os-custom", includeDeleted: true }), /source_id=eq\.rec-1/);
});

test("queue coalesces duplicate writes", () => {
  const first = { table: "customers", sourceId: "cus-1", operation: "upsert" };
  const second = { table: "customers", sourceId: "cus-1", operation: "upsert", payload: { name: "Updated" } };
  assert.deepEqual(coalesceQueue([first], second), [second]);
});

test("collections remain separate", () => {
  const queue = [{ table: "cloud_collections", sourceId: "same", collectionKey: "a" }];
  const next = { table: "cloud_collections", sourceId: "same", collectionKey: "b" };
  assert.equal(coalesceQueue(queue, next).length, 2);
});

test("version mismatch reports conflict", () => {
  assert.equal(hasVersionConflict(3, 2), true);
  assert.equal(hasVersionConflict(3, 3), false);
});

test("imports skip unchanged and deleted rows", () => {
  const records = [{ id: "a", updatedAt: "2026-07-01" }, { id: "b", updatedAt: "2026-07-03" }, { id: "c", updatedAt: "2026-07-04" }];
  const existing = [{ source_id: "a", source_updated_at: "2026-07-01" }, { source_id: "b", source_updated_at: "2026-07-02", deleted_at: "2026-07-05" }];
  assert.deepEqual(pendingImports(records, existing).map((item) => item.id), ["c"]);
});

test("deletions create versioned tombstones", () => {
  assert.equal(makeTombstone({ currentVersion: 4, userId: "user-1", deletedAt: "2026-07-31T08:00:00Z" }).version, 5);
});

test("customer and job links remain attached", () => {
  assert.deepEqual(linkedSourceIds({ customerId: "cus-1", jobId: "job-1" }), { customerSourceId: "cus-1", jobSourceId: "job-1" });
});
