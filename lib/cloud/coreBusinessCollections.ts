"use client";

import type { Customer, Invoice, Job, Material, PricingDocument } from "../models";
import type { PaymentRecord } from "../payments";
import type { ScheduledPlannerEntry } from "../scheduling";
import { useCloudLocalCollection } from "../storage";

export const coreBusinessStorageKeys = {
  customers: "jr-os-customers",
  jobs: "jr-os-jobs",
  planner: "jr-os-planner",
  pricingDocuments: "jr-os-pricing-documents",
  invoices: "jr-os-invoices",
  payments: "jr-os-payments",
  materials: "jr-os-materials",
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

export function useInvoicesCollection() {
  return useCloudLocalCollection<Invoice>(coreBusinessStorageKeys.invoices);
}

export function usePaymentsCollection() {
  return useCloudLocalCollection<PaymentRecord>(coreBusinessStorageKeys.payments);
}

export function useMaterialsCollection() {
  return useCloudLocalCollection<Material>(coreBusinessStorageKeys.materials);
}
