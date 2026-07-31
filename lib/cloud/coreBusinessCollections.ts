"use client";

import type { Customer, Job } from "../models";
import type { ScheduledPlannerEntry } from "../scheduling";
import { useCloudLocalCollection } from "../storage";

export const coreBusinessStorageKeys = {
  customers: "jr-os-customers",
  jobs: "jr-os-jobs",
  planner: "jr-os-planner",
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
