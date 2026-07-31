"use client";

import { useEffect, useMemo } from "react";
import {
  AI_LEARNING_MEMORY_KEY,
  buildAiLearningMemory,
  type AiLearningSources,
} from "./aiLearning";
import { useAiRecommendationEvidenceCollection } from "./cloud/coreBusinessCollections";
import type { AiLearningMemory, LabourCostSettings } from "./models";
import { useLocalStorageCollection } from "./storage";

export function useAiLearningMemory(
  sources: AiLearningSources,
  labourSettings: LabourCostSettings,
) {
  const {
    items,
    setItems,
    isReady,
  } = useLocalStorageCollection<AiLearningMemory>(AI_LEARNING_MEMORY_KEY);
  const evidenceStore = useAiRecommendationEvidenceCollection();
  const {
    jobs,
    documents,
    invoices,
    customers,
    builders,
    profiles,
    interactions,
    materials,
  } = sources;
  const liveMemory = useMemo(
    () => buildAiLearningMemory({
      jobs,
      documents,
      invoices,
      customers,
      builders,
      profiles,
      interactions,
      materials,
    }, labourSettings),
    [
      builders,
      customers,
      documents,
      interactions,
      invoices,
      jobs,
      labourSettings,
      materials,
      profiles,
    ],
  );
  const storedMemory = items[0];
  const liveEvidenceSignature = useMemo(
    () => JSON.stringify(liveMemory.influentialRecords.map((item) => [item.id, item.recordId, item.occurredAt, item.relevance])),
    [liveMemory.influentialRecords],
  );
  const storedEvidenceSignature = useMemo(
    () => JSON.stringify(evidenceStore.items.map((item) => [item.id, item.recordId, item.occurredAt, item.relevance])),
    [evidenceStore.items],
  );

  useEffect(() => {
    if (!isReady || !evidenceStore.isReady) return;
    if (storedMemory?.sourceSignature !== liveMemory.sourceSignature) setItems([liveMemory]);
    if (storedEvidenceSignature !== liveEvidenceSignature) evidenceStore.setItems(liveMemory.influentialRecords);
  }, [
    evidenceStore,
    isReady,
    liveEvidenceSignature,
    liveMemory,
    setItems,
    storedEvidenceSignature,
    storedMemory?.sourceSignature,
  ]);

  return {
    memory: storedMemory?.sourceSignature === liveMemory.sourceSignature ? storedMemory : liveMemory,
    isReady: isReady && evidenceStore.isReady,
  };
}
