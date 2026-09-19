import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { effectivePortalPricingStatus, portalApprovalForCurrentDocument, portalApprovalQueueBlocksDocument, portalApprovalQueueState, portalRequestTargetMatchesJob } from "../lib/customerPortal-core.mjs";

const portal = readFileSync(new URL("../app/customer-portal/page.tsx", import.meta.url), "utf8");
const portalCore = readFileSync(new URL("../lib/customerPortal.ts", import.meta.url), "utf8");
const guard = readFileSync(new URL("../components/CloudAccessGuard.tsx", import.meta.url), "utf8");
const permissions = readFileSync(new URL("../lib/cloud/permissions.ts", import.meta.url), "utf8");

test("authenticated customer sessions are bound to the profile customer source id", () => {
  assert.match(portal, /const \{ identity, mode \} = useCloudIdentity\(\)/);
  assert.match(portal, /const customerSession = identity\?\.role === "customer"/);
  assert.match(portal, /const authenticatedCustomerId = customerSession \? identity\.customerSourceId \?\? "" : ""/);
  assert.match(portal, /const activeCustomerId = customerSession \? authenticatedCustomerId : selectedCustomerId/);
  assert.match(portal, /const portalUnlocked = customerSession \? Boolean\(authenticatedCustomerId\) : unlocked/);
  assert.match(portal, /customerSession && !authenticatedCustomerId/);
});

test("portal reads are filtered with the resolved active customer id", () => {
  assert.match(portal, /customer\.id === activeCustomerId/);
  assert.match(portal, /job\.customerId === activeCustomerId/);
  assert.match(portal, /customerDocuments\(documents\.items, activeCustomerId, jobIds\)/);
  assert.match(portal, /customerDocuments\(invoices\.items, activeCustomerId, jobIds\)/);
  assert.match(portal, /customerDocuments\(certificates\.items, activeCustomerId, jobIds\)/);
  assert.match(portal, /portalAppointments\(planner\.items, customerJobs, activeCustomerId\)/);
  assert.match(portal, /item\.customerId === activeCustomerId/);
});

test("portal approvals reject documents outside the active customer collection", () => {
  assert.match(portal, /!activeCustomerId \|\| !customerPricing\.some\(\(item\) => item\.id === document\.id\)/);
  assert.match(portal, /customerId: activeCustomerId, documentId: document\.id/);
  assert.match(portal, /if \(effectivePortalPricingStatus\(document, customerApprovals\) !== "Sent"\) return setNotice\("That document is no longer awaiting a decision\."\)/);
  assert.match(portal, /customerId: activeCustomerId, jobId: document\.jobId/);
  assert.doesNotMatch(portal, /customerId: selectedCustomerId, documentId/);
});

test("a locally queued approval closes the current document version immediately", () => {
  const document = { id: "quote-a", documentVersion: 4, status: "Sent", updatedAt: "2026-08-13T10:00:00.000Z" };
  const oldApproval = { documentId: "quote-a", documentVersion: 3, decision: "Declined", decidedAt: "2099-08-12T10:00:00.000Z" };
  const currentApproval = { documentId: "quote-a", documentVersion: 4, decision: "Accepted", decidedAt: "1900-08-13T10:00:01.000Z" };

  assert.equal(portalApprovalForCurrentDocument([oldApproval], document), undefined);
  assert.equal(effectivePortalPricingStatus(document, [oldApproval]), "Sent");
  assert.equal(portalApprovalForCurrentDocument([oldApproval, currentApproval], document), currentApproval);
  assert.equal(effectivePortalPricingStatus(document, [oldApproval, currentApproval]), "Accepted");
  assert.match(portal, /effectivePortalPricingStatus\(item, customerApprovals\) === "Sent"/);
  assert.match(portal, /effectiveStatus === "Sent"/);
  assert.match(portal, /documentVersion: document\.documentVersion/);
  assert.match(portal, /customerSession && !Number\.isInteger\(document\.documentVersion\)/);
});

test("failed queued evidence never renders as a final customer decision", () => {
  const document = { id: "quote-a", documentVersion: 4, status: "Sent", updatedAt: "2026-08-13T10:00:00.000Z" };
  const approval = { id: "approval-a", documentId: "quote-a", documentVersion: 4, decision: "Accepted", decidedAt: "2026-08-13T10:00:01.000Z" };
  const failedQueue = [{
    table: "portal_approvals",
    operation: "upsert",
    sourceId: "approval-a",
    state: "Failed",
    payload: approval,
  }];

  assert.equal(portalApprovalQueueState(failedQueue, approval.id), "Failed");
  assert.equal(portalApprovalQueueBlocksDocument(failedQueue, document), true);
  const displayApprovals = [approval].filter((item) => !["Failed", "Conflict"].includes(portalApprovalQueueState(failedQueue, item.id)));
  assert.equal(effectivePortalPricingStatus(document, displayApprovals), "Sent");
  assert.equal(portalApprovalQueueBlocksDocument(failedQueue, { ...document, documentVersion: 5 }), false);
  assert.match(portal, /!\["Failed", "Conflict"\]\.includes\(portalApprovalQueueState\(portalApprovalQueue, item\.id\)\)/);
  assert.match(portal, /decision was not recorded/i);
  assert.match(portal, /Evidence is not recorded until sync succeeds/);
  assert.match(portal, /Refresh to retry/);
});

test("portal requests reject foreign jobs and appointments", () => {
  assert.match(portal, /requestJobId && !jobIds\.has\(requestJobId\)/);
  assert.match(portal, /!portalRequestTargetMatchesJob\(appointments, requestPlannerId, requestJobId\)/);
  assert.match(portal, /customerId: activeCustomerId, jobId: requestJobId \|\| undefined/);
  assert.doesNotMatch(portal, /customerId: selectedCustomerId, jobId: requestJobId/);
  assert.match(portalCore, /\["Planned", "Confirmed"\]\.includes\(entry\.status\)/);
});

test("portal appointment requests keep the appointment bound to its exact job", () => {
  const appointments = [
    { id: "appointment-a", jobId: "job-a" },
    { id: "appointment-b", jobId: "job-b" },
  ];
  assert.equal(portalRequestTargetMatchesJob(appointments, "appointment-a", "job-a"), true);
  assert.equal(portalRequestTargetMatchesJob(appointments, "appointment-a", ""), false);
  assert.equal(portalRequestTargetMatchesJob(appointments, "appointment-a", "job-b"), false);
  assert.equal(portalRequestTargetMatchesJob(appointments, "missing", "job-a"), false);
  assert.equal(portalRequestTargetMatchesJob(appointments, "", "job-b"), true);
  assert.match(
    portal,
    /if \(!portalRequestTargetMatchesJob\(appointments, requestPlannerId, nextJobId\)\) setRequestPlannerId\(""\)/,
  );
});

test("customer selection and demo codes remain only in the locked preview flow", () => {
  const previewStart = portal.indexOf("if (!portalUnlocked)");
  const selector = portal.indexOf("<span>Customer</span>");
  const demoCode = portal.indexOf("Demo access code");

  assert.ok(previewStart >= 0);
  assert.ok(selector > previewStart);
  assert.ok(demoCode > previewStart);
});

test("customer portal access fails closed before page data can render", () => {
  assert.match(guard, /if \(!isReady\) return/);
  assert.match(guard, /if \(!identity\) \{/);
  assert.match(guard, /if \(!canAccessPath\(identity\.role, pathname, identity\.email\)\) \{/);
  assert.match(permissions, /customer: \["\/customer-portal", "\/cloud"\]/);
  assert.doesNotMatch(permissions, /office: \[[^\]]*"\/customer-portal"/s);
  assert.doesNotMatch(permissions, /electrician: \[[^\]]*"\/customer-portal"/s);
});

test("portal documents and photos stay within the active customer job set", () => {
  assert.match(portal, /const jobIds = useMemo\(\(\) => new Set\(customerJobs\.map\(\(job\) => job\.id\)\)/);
  assert.match(portal, /customerDocuments\(documents\.items, activeCustomerId, jobIds\)/);
  assert.match(portal, /customerDocuments\(invoices\.items, activeCustomerId, jobIds\)/);
  assert.match(portal, /customerDocuments\(certificates\.items, activeCustomerId, jobIds\)/);
  assert.match(portal, /sharedPhotos\(jobDocuments\.items, jobIds, photoShares\.items\)/);
  assert.doesNotMatch(portal, /sharedPhotos\(jobDocuments\.items, new Set\(jobs\.items\.map/);
});
