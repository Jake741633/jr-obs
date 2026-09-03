import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const quotesPage = readFileSync(new URL("../app/quotes/page.tsx", import.meta.url), "utf8");
const mobileQuotesPage = readFileSync(new URL("../app/quotes/mobile/page.tsx", import.meta.url), "utf8");
const estimatesPage = readFileSync(new URL("../app/estimates/page.tsx", import.meta.url), "utf8");
const collections = readFileSync(new URL("../lib/cloud/coreBusinessCollections.ts", import.meta.url), "utf8");
const storage = readFileSync(new URL("../lib/storage.ts", import.meta.url), "utf8");
const cloudAccessGuard = readFileSync(new URL("../components/CloudAccessGuard.tsx", import.meta.url), "utf8");

test("saved quote and estimate drafts remain in the tenant-scoped pricing collection", () => {
  assert.match(quotesPage, /const documents = usePricingDocumentsCollection\(\)/);
  assert.match(mobileQuotesPage, /const documents = usePricingDocumentsCollection\(\)/);
  assert.match(estimatesPage, /const documents = usePricingDocumentsCollection\(\)/);
  assert.match(collections, /pricingDocuments: "jr-os-pricing-documents"/);
  assert.match(collections, /usePricingDocumentsCollection\(\) \{ return useCloudLocalCollection<PricingDocument>\(coreBusinessStorageKeys\.pricingDocuments\); \}/);
  assert.match(quotesPage, /const statuses: PricingDocumentStatus\[\] = \["Draft", "Sent", "Accepted", "Declined", "Expired"\]/);
  assert.match(mobileQuotesPage, /status: "Draft"/);
});

test("draft lists and searches derive only from the resolved scoped collection", () => {
  assert.match(quotesPage, /documents\.items\.filter\(/);
  assert.match(quotesPage, /quoteDocs\.filter\(\(document\) => document\.status === "Draft"\)/);
  assert.match(estimatesPage, /return documents\.items[\s\S]*document\.type === "Estimate"/);
  assert.match(mobileQuotesPage, /return documents\.items[\s\S]*\.slice\(0, 20\)/);
  assert.doesNotMatch(quotesPage, /localStorage\.(?:getItem|setItem)/);
  assert.doesNotMatch(estimatesPage, /localStorage\.(?:getItem|setItem)/);
  assert.doesNotMatch(mobileQuotesPage, /localStorage\.(?:getItem|setItem)/);
});

test("draft cache and unsaved editor state reset across account boundaries", () => {
  assert.match(storage, /const activeStorageKey = organisationId \? accountStorageKey\(key, organisationId, cacheUserId, cacheRole, cacheCustomerSourceId\) : key/);
  assert.match(storage, /\[activeStorageKey, cacheCustomerSourceId, cacheRole, cacheUserId, identityReady, key, mode, organisationId, target, userId\]/);
  assert.match(cloudAccessGuard, /<Fragment key=\{workspaceIdentityKey\}>\{children\}<\/Fragment>/);
  assert.match(quotesPage, /const \[form, setForm\] = useState\(blankForm\)/);
  assert.match(quotesPage, /const \[items, setItems\] = useState<PricingLineItem\[\]>\(\[\]\)/);
  assert.match(mobileQuotesPage, /const \[draft, setDraft\] = useState\(blankDraft\)/);
});
