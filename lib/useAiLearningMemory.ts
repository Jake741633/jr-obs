"use client";

import { useEffect, useMemo } from "react";
import {
  AI_LEARNING_MEMORY_KEY,
  buildAiLearningMemory,
  type AiLearningSources,
} from "./aiLearning";
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

  useEffect(() => {
    if (!isReady || storedMemory?.sourceSignature === liveMemory.sourceSignature) return;
    setItems([liveMemory]);
  }, [isReady, liveMemory, setItems, storedMemory?.sourceSignature]);

  return {
    memory: storedMemory?.sourceSignature === liveMemory.sourceSignature ? storedMemory : liveMemory,
    isReady,
  };
}
