import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const portal = readFileSync(new URL("../app/customer-portal/page.tsx", import.meta.url), "utf8");
const guard = readFileSync(new URL("../components/CloudAccessGuard.tsx", import.meta.url), "utf8");
const permissions = readFileSync(new URL("../lib/cloud/permissions.ts", import.meta.url), "utf8");

test("authenticated customer sessions are bound to the profile customer source id", () => {
  assert.match(portal, /const \{ identity \} = useCloudIdentity\(\)/);
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
  assert.match(portal, /customerId: activeCustomerId, jobId: document\.jobId/);
  assert.doesNotMatch(portal, /customerId: selectedCustomerId, documentId/);
});

test("portal requests reject foreign jobs and appointments", () => {
  assert.match(portal, /requestJobId && !jobIds\.has\(requestJobId\)/);
  assert.match(portal, /requestPlannerId && !appointments\.some\(\(entry\) => entry\.id === requestPlannerId\)/);
  assert.match(portal, /customerId: activeCustomerId, jobId: requestJobId \|\| undefined/);
  assert.doesNotMatch(portal, /customerId: selectedCustomerId, jobId: requestJobId/);
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
