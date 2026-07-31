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
  const {
    items: evidenceItems,
    setItems: setEvidenceItems,
    isReady: evidenceReady,
  } = useAiRecommendationEvidenceCollection();
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
    () => JSON.stringify(evidenceItems.map((item) => [item.id, item.recordId, item.occurredAt, item.relevance])),
    [evidenceItems],
  );

  useEffect(() => {
    if (!isReady || !evidenceReady) return;
    if (storedMemory?.sourceSignature !== liveMemory.sourceSignature) setItems([liveMemory]);
    if (storedEvidenceSignature !== liveEvidenceSignature) setEvidenceItems(liveMemory.influentialRecords);
  }, [
    evidenceReady,
    isReady,
    liveEvidenceSignature,
    liveMemory,
    setEvidenceItems,
    setItems,
    storedEvidenceSignature,
    storedMemory?.sourceSignature,
  ]);

  return {
    memory: storedMemory?.sourceSignature === liveMemory.sourceSignature ? storedMemory : liveMemory,
    isReady: isReady && evidenceReady,
  };
}
