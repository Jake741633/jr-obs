import assert from "node:assert/strict";
import test from "node:test";
import { loadLocalTs } from "./helpers/load-local-ts.mjs";

const learning = loadLocalTs(new URL("../lib/aiLearning.ts", import.meta.url));

test("the learning-memory consumer replaces prior-policy memory even when saved source rows are unchanged", () => {
  const document = { id: "memory-quote", type: "Quote", status: "Accepted", number: "Q1", title: "Replace fusebox", notes: "Replace fusebox", createdAt: "2026-01-01", updatedAt: "2026-01-01", items: [{ id: "labour", category: "Labour", quantity: 3, unitPrice: 50, unitCost: 20 }] };
  const sources = { jobs: [], documents: [document], invoices: [], customers: [], builders: [], profiles: [], interactions: [], materials: [] };
  const settings = { workingDaysPerYear: 220, billableHoursPerDay: 7.5, targetNetMargin: 25, contingencyPercent: 0 };
  const current = learning.buildAiLearningMemory(sources, settings);
  // Literal persisted signature of these source rows under the previous policy.
  const stored = { ...current, sourceSignature: "v1-recorded-costs-1aw71rq", jobPatterns: [] };
  const effects = [], writes = [];
  const hook = loadLocalTs(new URL("../lib/useAiLearningMemory.ts", import.meta.url), {
    react: { useMemo: build => build(), useEffect: effect => effects.push(effect) },
    "./cloud/coreBusinessCollections": {
      useAiLearningMemoryCollection: () => ({ items: [stored], isReady: true, setItems: items => writes.push(items) }),
      useAiRecommendationEvidenceCollection: () => ({ items: current.influentialRecords, isReady: true, setItems() { throw new Error("Unchanged evidence does not need rewriting"); } }),
    },
  });
  const result = hook.useAiLearningMemory(sources, settings);
  assert.equal(result.memory.jobPatterns.find(pattern => pattern.jobType === "Consumer Unit")?.successfulRecords, 1);
  assert.equal(result.memory.schemaVersion, 1);
  effects.forEach(effect => effect());
  assert.equal(writes.length, 1);
  assert.equal(writes[0][0].jobPatterns.find(pattern => pattern.jobType === "Consumer Unit").successfulRecords, 1);
  assert.notEqual(writes[0][0].sourceSignature, stored.sourceSignature);
  assert.deepEqual(stored.jobPatterns, []);
});
