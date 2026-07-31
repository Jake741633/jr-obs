"use client";

import type { Customer, Job } from "../models";
import { useCloudLocalCollection } from "../storage";

export const coreBusinessStorageKeys = {
  customers: "jr-os-customers",
  jobs: "jr-os-jobs",
} as const;

export function useCustomersCollection() {
  return useCloudLocalCollection<Customer>(coreBusinessStorageKeys.customers);
}

export function useJobsCollection() {
  return useCloudLocalCollection<Job>(coreBusinessStorageKeys.jobs);
}
