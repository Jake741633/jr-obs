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

test("AI recommendation evidence retains source links, confidence inputs and tenant scoping", () => {
  const evidence = {
    id: "evidence-1",
    kind: "Completed job",
    recordId: "job-1",
    title: "Consumer unit change",
    detail: "Completed below quoted labour allowance",
    jobType: "Consumer Unit",
    occurredAt: "2026-07-31T12:00:00Z",
    relevance: 92,
    href: "/jobs/job-1",
    jobId: "job-1",
  };
  assert.deepEqual(cloudRowsToCache([{ source_id: evidence.id, version: 1, payload: evidence }]), [evidence]);
  assert.deepEqual(linkedSourceIds(evidence), { customerSourceId: undefined, jobSourceId: "job-1" });
  const orgA = tenantListQuery({ organisationId: "org-a" });
  const orgB = tenantListQuery({ organisationId: "org-b" });
  assert.match(orgA, /organisation_id=eq\.org-a/);
  assert.match(orgB, /organisation_id=eq\.org-b/);
  assert.notEqual(orgA, orgB);
});

test("AI learning memory retains confidence, job patterns, material patterns and evidence links", () => {
  const memory = {
    id: "ai-learning-memory",
    schemaVersion: 1,
    sourceSignature: "v1-org-a-signature",
    learnedAt: "2026-07-31T13:00:00Z",
    completedJobs: 4,
    acceptedQuotes: 5,
    paidInvoices: 3,
    customerHistories: 6,
    builderHistories: 2,
    pricingSignals: 7,
    materialSignals: 8,
    confidence: { overall: 78, labour: 75, materials: 80, pricing: 79, level: "High", reasons: ["Recent completed work"] },
    jobPatterns: [{ jobType: "EICR", successfulRecords: 3, averageSellingPrice: 420, evidence: [{ id: "evidence-1", recordId: "job-1" }] }],
    frequentMaterials: [{ key: "mat-1", materialId: "mat-1", description: "RCBO", uses: 4, evidence: [{ id: "evidence-2", recordId: "quote-1" }] }],
    influentialRecords: [{ id: "evidence-1", recordId: "job-1", href: "/jobs/job-1" }],
  };
  assert.deepEqual(cloudRowsToCache([{ source_id: memory.id, version: 1, payload: memory }]), [memory]);
  const orgAQuery = tenantListQuery({ organisationId: "org-a", collectionKey: "jr-os-ai-learning-memory" });
  const orgBQuery = tenantListQuery({ organisationId: "org-b", collectionKey: "jr-os-ai-learning-memory" });
  assert.match(orgAQuery, /organisation_id=eq\.org-a/);
  assert.match(orgBQuery, /organisation_id=eq\.org-b/);
  assert.notEqual(orgAQuery, orgBQuery);
});
