import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildCloudEnvelope, buildGenericEnvelope, buildTypedEnvelope } from "../lib/cloud/repository-core.mjs";

const certificate = {
  id: "certificate-1",
  customerId: "customer-1",
  jobId: "job-1",
  status: "Issued",
  revisionHistory: [{ id: "revision-1", revision: 1 }],
  signatures: [{ id: "signature-1", signedBy: "Inspector" }],
  observations: [{ id: "observation-1", code: "C2" }],
  testingRecordIds: ["testing-1"],
  issueHistory: [{ id: "issue-1", issuedAt: "2026-08-01T09:00:00.000Z" }],
};

const common = {
  organisationId: "organisation-1",
  sourceId: certificate.id,
  payload: certificate,
  version: 1,
  sourceUpdatedAt: "2026-08-01T09:00:00.000Z",
  createdBy: "owner-1",
  updatedBy: "owner-1",
};

test("certificate typed-table rows exclude generic-only columns", () => {
  const row = buildTypedEnvelope(common);
  assert.equal(Object.hasOwn(row, "collection_key"), false);
  assert.deepEqual(row.payload, certificate);
  assert.equal(row.customer_source_id, "customer-1");
  assert.equal(row.job_source_id, "job-1");
  assert.deepEqual(Object.keys(row).sort(), [
    "created_by",
    "customer_source_id",
    "deleted_at",
    "job_source_id",
    "organisation_id",
    "payload",
    "source_id",
    "source_updated_at",
    "updated_by",
    "version",
  ].sort());
});

test("generic collection rows include their required collection key", () => {
  const row = buildGenericEnvelope({ ...common, collectionKey: "jr-os-custom-data" });
  assert.equal(row.collection_key, "jr-os-custom-data");
  assert.deepEqual(row.payload, certificate);
});

test("canonical envelope selector keeps typed and generic rows separate", () => {
  const typed = buildCloudEnvelope(common);
  const generic = buildCloudEnvelope({ ...common, collectionKey: "jr-os-custom-data" });
  assert.equal(Object.hasOwn(typed, "collection_key"), false);
  assert.equal(Object.hasOwn(generic, "collection_key"), true);
});

test("certificate storage maps to the typed certificates table", async () => {
  const source = await readFile(new URL("../lib/cloud/collections.ts", import.meta.url), "utf8");
  assert.match(source, /"jr-os-certificates"\s*:\s*"certificates"/);
  assert.doesNotMatch(source, /"jr-os-certificates"[^\n]*collectionKey/);
});
