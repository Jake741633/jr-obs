import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  acceptedVariationValue,
  applyVariationContractValue,
  currentJobContractValue,
  isAcceptedVariationStatus,
  nextJobVariationNumber,
  normaliseVariationStatus,
  transitionVariation,
  variationFinancials,
  variationInvoiceLine,
  variationPresentationView,
  variationTimelineEntry,
} from "../lib/jobManagement-core.mjs";
import { cloudRowsToCache, linkedSourceIds } from "../lib/cloud/repository-core.mjs";

const variation = {
  id: "variation-1",
  jobId: "job-1",
  number: "VAR-001",
  title: "Add two kitchen sockets",
  description: "Supply and install two additional double sockets.",
  pricingMode: "Fixed price",
  labourHours: 4,
  labourRate: 65,
  labourCostRate: 32,
  materialCost: 70,
  materialCharge: 110,
  otherCost: 10,
  otherCharge: 20,
  fixedPrice: 450,
  status: "Draft",
  approvalMethod: "Email",
  approvalReference: "Customer email 04/08/2026",
  requestedBy: "Customer",
  photos: [],
  customerNotes: "Decorating excluded.",
  internalNotes: "Allow half a day.",
  auditHistory: [],
  createdAt: "2026-08-04T09:00:00.000Z",
  updatedAt: "2026-08-04T09:00:00.000Z",
};

const job = {
  id: "job-1",
  title: "Kitchen alterations",
  siteAddress: "1 High Street",
  status: "First fix",
  startDate: "2026-08-04",
  value: 5_000,
  notes: "",
  createdAt: "2026-08-01T09:00:00.000Z",
  updatedAt: "2026-08-01T09:00:00.000Z",
};

test("fixed-price variation calculations retain underlying cost and profit evidence", () => {
  const result = variationFinancials(variation);
  assert.deepEqual(result, {
    labourCost: 128,
    labourSelling: 260,
    materialCost: 70,
    materialSelling: 110,
    otherCost: 10,
    otherSelling: 20,
    itemisedSellingPrice: 390,
    costPrice: 208,
    sellingPrice: 450,
    grossProfit: 242,
    grossMargin: 242 / 450 * 100,
  });
  assert.equal(variationFinancials({ ...variation, pricingMode: "Itemised", fixedPrice: undefined }).sellingPrice, 390);
});

test("legacy and canonical variation states remain compatible", () => {
  assert.equal(normaliseVariationStatus("Awaiting approval"), "Sent");
  assert.equal(normaliseVariationStatus("Approved"), "Accepted");
  assert.equal(isAcceptedVariationStatus("Approved"), true);
  assert.equal(isAcceptedVariationStatus("Invoiced"), true);
  assert.equal(isAcceptedVariationStatus("Declined"), false);
});

test("accepting a variation updates contract value exactly once and reversal removes it exactly once", () => {
  const firstAcceptance = applyVariationContractValue({ job, variation, nextStatus: "Accepted", now: "2026-08-04T10:00:00.000Z" });
  assert.equal(firstAcceptance.originalContractValue, 5_000);
  assert.equal(firstAcceptance.value, 5_450);

  const acceptedVariation = { ...variation, status: "Accepted" };
  const repeatedAcceptance = applyVariationContractValue({ job: firstAcceptance, variation: acceptedVariation, nextStatus: "Accepted", now: "2026-08-04T10:01:00.000Z" });
  assert.equal(repeatedAcceptance.value, 5_450);

  const reversed = applyVariationContractValue({ job: repeatedAcceptance, variation: acceptedVariation, nextStatus: "Declined", now: "2026-08-04T10:02:00.000Z" });
  assert.equal(reversed.value, 5_000);
  const repeatedReversal = applyVariationContractValue({ job: reversed, variation: { ...variation, status: "Declined" }, nextStatus: "Declined", now: "2026-08-04T10:03:00.000Z" });
  assert.equal(repeatedReversal.value, 5_000);
});

test("variation transitions retain immutable audit history and safe recipient presentation", () => {
  const sent = transitionVariation({ variation, nextStatus: "Sent", recipient: "Builder", now: "2026-08-04T10:00:00.000Z", auditId: "audit-1", completedBy: "Jake" });
  assert.equal(variation.status, "Draft");
  assert.equal(sent.status, "Sent");
  assert.equal(sent.sentTo, "Builder");
  assert.equal(sent.presentation.showInternalCosts, false);
  assert.equal(sent.presentation.showProfit, false);
  assert.equal(sent.auditHistory.length, 1);
  assert.equal(sent.auditHistory[0].fromStatus, "Draft");
  assert.equal(sent.auditHistory[0].toStatus, "Sent");
  assert.throws(() => transitionVariation({ variation, nextStatus: "Accepted", now: "", auditId: "audit-skip" }), /cannot move from Draft to Accepted/);
  assert.throws(() => transitionVariation({ variation, nextStatus: "Unknown", now: "", auditId: "audit-x" }), /Unsupported variation status/);
  const accepted = transitionVariation({ variation: sent, nextStatus: "Accepted", now: "2026-08-04T11:00:00.000Z", auditId: "audit-2", completedBy: "Jake" });
  assert.equal(accepted.status, "Accepted");
  assert.equal(accepted.auditHistory.length, 2);
  assert.throws(() => transitionVariation({ variation: accepted, nextStatus: "Invoiced", now: "", auditId: "audit-3" }), /Link the invoice/);
});

test("contract roll-ups, numbering and outward documents are deterministic and hide internal figures", () => {
  const accepted = { ...variation, status: "Accepted", presentation: { recipient: "Customer", showLabourBreakdown: true, showMaterialBreakdown: true, showInternalCosts: true, showProfit: true } };
  assert.equal(acceptedVariationValue([variation, accepted]), 450);
  assert.equal(currentJobContractValue(5_000, [variation, accepted]), 5_450);
  assert.equal(nextJobVariationNumber([{ ...variation, number: "VAR-001" }, { ...variation, id: "variation-3", number: "VAR-003" }], "job-1"), "VAR-004");

  const customerView = variationPresentationView(accepted, "Customer");
  assert.equal(customerView.sellingPrice, 450);
  assert.equal(customerView.labour.total, 260);
  assert.equal(customerView.internalCost, undefined);
  assert.equal(customerView.grossProfit, undefined);
  assert.equal(customerView.internalNotes, undefined);
  const internalView = variationPresentationView(accepted, "Internal");
  assert.equal(internalView.internalCost, 208);
  assert.equal(internalView.grossProfit, 242);
  assert.equal(internalView.internalNotes, "Allow half a day.");
});

test("variation activity and invoice lines retain stable source links", () => {
  const timeline = variationTimelineEntry({ variation, fromStatus: "Sent", toStatus: "Accepted", timelineId: "timeline-1", completedBy: "Jake", now: "2026-08-04T11:00:00.000Z" });
  assert.equal(timeline.jobId, "job-1");
  assert.equal(timeline.sourceId, "variation-1");
  assert.equal(timeline.eventType, "Variation");
  assert.match(timeline.note, /£450\.00/);

  const line = variationInvoiceLine({ ...variation, status: "Accepted" }, "invoice-line-1");
  assert.equal(line.variationId, "variation-1");
  assert.equal(line.unitPrice, 450);
  assert.equal(line.unitCost, 208);
  assert.deepEqual(linkedSourceIds(variation), { customerSourceId: undefined, jobSourceId: "job-1" });
  assert.deepEqual(cloudRowsToCache([{ source_id: variation.id, version: 1, payload: variation }]), [variation]);
});

test("production workflow includes accepted variations once and exposes audited mobile actions", async () => {
  const workflow = await readFile(new URL("../lib/workflow.ts", import.meta.url), "utf8");
  const siteManagement = await readFile(new URL("../app/site-management/page.tsx", import.meta.url), "utf8");
  const jobWorkspace = await readFile(new URL("../app/jobs/[id]/page.tsx", import.meta.url), "utf8");
  const aiCommandCentre = await readFile(new URL("../app/ai/page.tsx", import.meta.url), "utf8");
  assert.match(workflow, /isAcceptedVariationStatus\(variation\.status\)/);
  assert.match(workflow, /!invoiceItems\.some\(\(item\) => item\.variationId === variation\.id\)/);
  assert.match(workflow, /job\.originalContractValue \?\? job\.value/);
  assert.match(workflow, /variationIds: acceptedVariations\.map/);
  assert.match(siteManagement, /applyVariationContractValue/);
  assert.match(siteManagement, /variationTimelineEntry/);
  assert.match(siteManagement, /Send customer/);
  assert.match(siteManagement, /Send builder/);
  assert.match(siteManagement, /Add to invoice/);
  assert.match(siteManagement, /photoDocumentIds: savedPhotos\.map/);
  assert.match(siteManagement, /useJobDocumentsCollection/);
  assert.match(siteManagement, /Internal labour, material cost, markup and profit are hidden/);
  assert.match(jobWorkspace, /variations: linkedVariations/);
  assert.match(jobWorkspace, /nextStatus: "Invoiced"/);
  assert.match(aiCommandCentre, /variations: linkedVariations/);
  assert.match(aiCommandCentre, /nextStatus: "Invoiced"/);
});
