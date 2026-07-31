import assert from "node:assert/strict";
import test from "node:test";
import { cloudRowsToCache, linkedSourceIds, tenantListQuery } from "../lib/cloud/repository-core.mjs";

test("RAMS records retain nested risks, controls, approvals and job links", () => {
  const rams = {
    id: "rams-1",
    jobId: "job-1",
    number: "RAMS-0001",
    status: "Approved",
    scopeOfWorks: "Electrical installation",
    methodStatement: "Isolate and prove dead before work.",
    ppeRequired: ["Safety footwear", "Safety glasses"],
    permitsRequired: ["Permit to work"],
    approvalName: "Site manager",
    risks: [{ id: "risk-1", hazard: "Electric shock", likelihood: 2, severity: 5, residualLikelihood: 1, residualSeverity: 2 }],
  };
  assert.deepEqual(cloudRowsToCache([{ source_id: rams.id, version: 1, payload: rams }]), [rams]);
  assert.deepEqual(linkedSourceIds(rams), { customerSourceId: undefined, jobSourceId: "job-1" });
  assert.match(tenantListQuery({ organisationId: "org-a", collectionKey: "jr-os-rams" }), /organisation_id=eq\.org-a/);
});

test("Job Pack records retain labour, materials, tasks, notes and stable IDs", () => {
  const pack = {
    id: "pack-1",
    name: "Consumer unit change",
    category: "Consumer unit",
    labourDescription: "Electrician labour",
    labourHours: 8,
    labourRate: 55,
    materials: [{ id: "jpm-1", materialId: "mat-1", description: "RCBO board", quantity: 1, unitPrice: 350 }],
    tasks: [{ id: "task-1", title: "Test existing circuits", complete: false }],
    testingRequirements: "Full circuit testing",
    certificatesRequired: "EIC",
    notes: "Allow for labels and notices",
  };
  assert.deepEqual(cloudRowsToCache([{ source_id: pack.id, version: 1, payload: pack }]), [pack]);
  assert.match(tenantListQuery({ organisationId: "org-a", collectionKey: "jr-os-job-packs" }), /organisation_id=eq\.org-a/);
});
