import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const aiPage = readFileSync(new URL("../app/ai/page.tsx", import.meta.url), "utf8");
const aiMemoryHook = readFileSync(new URL("../lib/useAiLearningMemory.ts", import.meta.url), "utf8");
const collections = readFileSync(new URL("../lib/cloud/coreBusinessCollections.ts", import.meta.url), "utf8");
const cloudCollections = readFileSync(new URL("../lib/cloud/collections.ts", import.meta.url), "utf8");
const storage = readFileSync(new URL("../lib/storage.ts", import.meta.url), "utf8");
const repository = readFileSync(new URL("../lib/cloud/repository.ts", import.meta.url), "utf8");

test("AI source data is loaded through the organisation-scoped collection layer", () => {
  assert.match(aiPage, /useCloudIdentity\(\)/);
  assert.match(aiPage, /useLocalStorageCollection<Job>\("jr-os-jobs"\)/);
  assert.match(aiPage, /useLocalStorageCollection<Customer>\("jr-os-customers"\)/);
  assert.match(aiPage, /useLocalStorageCollection<Builder>\("jr-os-builders"\)/);
  assert.match(aiPage, /useLocalStorageCollection<PricingDocument>\("jr-os-pricing-documents"\)/);
  assert.match(aiPage, /useLocalStorageCollection<Invoice>\("jr-os-invoices"\)/);
  assert.match(storage, /const activeStorageKey = organisationId \? organisationStorageKey\(key, organisationId\) : key/);
  assert.match(storage, /organisationId,\s*userId,/s);
});

test("AI learning memory and recommendation evidence use tenant-scoped cloud collections", () => {
  assert.match(collections, /aiRecommendationEvidence: "jr-os-ai-recommendation-evidence"/);
  assert.match(collections, /aiLearningMemory: "jr-os-ai-learning-memory"/);
  assert.match(collections, /useAiRecommendationEvidenceCollection\(\).*useCloudLocalCollection/s);
  assert.match(collections, /useAiLearningMemoryCollection\(\).*useCloudLocalCollection/s);
  assert.match(cloudCollections, /"jr-os-ai-recommendation-evidence": "ai_recommendation_evidence"/);
  assert.match(cloudCollections, /if \(storageKey\.startsWith\("jr-os-"\)\) return \{ table: "cloud_collections", collectionKey: storageKey \}/);
  assert.match(repository, /organisation_id=eq\.\$\{encodeURIComponent\(organisationId\)\}/);
});

test("AI memory is rebuilt only from the active organisation's resolved source collections", () => {
  assert.match(aiMemoryHook, /useAiLearningMemoryCollection\(\)/);
  assert.match(aiMemoryHook, /useAiRecommendationEvidenceCollection\(\)/);
  assert.match(aiMemoryHook, /buildAiLearningMemory\(\{\s*jobs,\s*documents,\s*invoices,\s*customers,\s*builders,\s*profiles,\s*interactions,\s*materials,/s);
  assert.match(aiMemoryHook, /if \(!isReady \|\| !evidenceReady\) return;/);
  assert.match(aiMemoryHook, /setItems\(\[liveMemory\]\)/);
  assert.match(aiMemoryHook, /setEvidenceItems\(liveMemory\.influentialRecords\)/);
});

test("AI-created activity is attributed to the authenticated user and not a fixed operator", () => {
  assert.match(aiPage, /completedBy: identity\?\.email \?\? "JR OS user"/);
  assert.doesNotMatch(aiPage, /completedBy:\s*"Jake"/);
  assert.doesNotMatch(aiPage, /completedBy:\s*"JR Electrical Services"/);
});
