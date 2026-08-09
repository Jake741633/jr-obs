import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const mobileQuotes = readFileSync(new URL("../app/quotes/mobile/page.tsx", import.meta.url), "utf8");
const collections = readFileSync(new URL("../lib/cloud/coreBusinessCollections.ts", import.meta.url), "utf8");
const storage = readFileSync(new URL("../lib/storage.ts", import.meta.url), "utf8");

test("recent quote search reads only organisation-scoped business collections", () => {
  assert.match(mobileQuotes, /const documents = usePricingDocumentsCollection\(\)/);
  assert.match(mobileQuotes, /useCloudLocalCollection<Customer>\("jr-os-customers"\)/);
  assert.match(mobileQuotes, /useCloudLocalCollection<Builder>\("jr-os-builders"\)/);
  assert.match(mobileQuotes, /useCloudLocalCollection<PriceBookItem>\("jr-os-price-book"\)/);
  assert.match(mobileQuotes, /return documents\.items[\s\S]*\.filter\([\s\S]*\.toSorted\([\s\S]*\.slice\(0, 20\)/);
  assert.doesNotMatch(mobileQuotes, /localStorage\.(?:getItem|setItem)/);
});

test("pricing document search stays on the shared cloud-aware collection layer", () => {
  assert.match(collections, /usePricingDocumentsCollection\(\) \{ return useCloudLocalCollection<PricingDocument>\(coreBusinessStorageKeys\.pricingDocuments\); \}/);
  assert.match(collections, /pricingDocuments: "jr-os-pricing-documents"/);
});

test("authenticated recent-item caches follow organisation and user identity", () => {
  assert.match(storage, /const cacheUserId = userId/);
  assert.doesNotMatch(storage, /identity\?\.role === "customer" \? userId : undefined/);
  assert.match(storage, /const activeStorageKey = organisationId \? accountStorageKey\(key, organisationId, cacheUserId\) : key/);
  assert.match(storage, /createCollectionRepository<RepositoryRecord>\(\{[\s\S]*organisationId,[\s\S]*userId,[\s\S]*cacheUserId,/);
  assert.match(storage, /\[activeStorageKey, cacheUserId, identityReady, key, mode, organisationId, target, userId\]/);
});
