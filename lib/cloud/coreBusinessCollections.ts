"use client";

import type { Customer, Job, PricingDocument } from "../models";
import type { ScheduledPlannerEntry } from "../scheduling";
import { useCloudLocalCollection } from "../storage";

export const coreBusinessStorageKeys = {
  customers: "jr-os-customers",
  jobs: "jr-os-jobs",
  planner: "jr-os-planner",
  pricingDocuments: "jr-os-pricing-documents",
} as const;

export function useCustomersCollection() {
  return useCloudLocalCollection<Customer>(coreBusinessStorageKeys.customers);
}

export function useJobsCollection() {
  return useCloudLocalCollection<Job>(coreBusinessStorageKeys.jobs);
}

export function usePlannerCollection() {
  return useCloudLocalCollection<ScheduledPlannerEntry>(coreBusinessStorageKeys.planner);
}

export function usePricingDocumentsCollection() {
  return useCloudLocalCollection<PricingDocument>(coreBusinessStorageKeys.pricingDocuments);
}
