"use client";

import { useCloudLocalCollection } from "./storage";
import {
  defaultQuotePresentationRecord,
  type QuotePresentationDefaultsRecord,
  type QuotePresentationSettings,
} from "./quotePresentation";

export function useQuotePresentationDefaults() {
  const collection = useCloudLocalCollection<QuotePresentationDefaultsRecord>(
    "jr-os-quote-presentation-defaults",
    [defaultQuotePresentationRecord],
  );

  const settings: QuotePresentationSettings = collection.items[0] ?? defaultQuotePresentationRecord;

  function save(next: QuotePresentationSettings) {
    collection.setItems([{
      id: "quote-presentation-defaults",
      ...next,
      updatedAt: new Date().toISOString(),
    }]);
  }

  return {
    ...collection,
    settings,
    save,
  };
}
