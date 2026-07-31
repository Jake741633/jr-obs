"use client";

import type { Customer, Invoice, Job, Material, PricingDocument, PurchaseList, StockItem, StockLocation, StockMovement, TeamMember, TimesheetEntry } from "../models";
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
  stockLocations: "jr-os-stock-locations",
  stockItems: "jr-os-stock-items",
  stockMovements: "jr-os-stock-movements",
  purchaseLists: "jr-os-purchase-lists",
  team: "jr-os-team",
  timesheets: "jr-os-timesheets",
} as const;

export function useCustomersCollection() { return useCloudLocalCollection<Customer>(coreBusinessStorageKeys.customers); }
export function useJobsCollection() { return useCloudLocalCollection<Job>(coreBusinessStorageKeys.jobs); }
export function usePlannerCollection() { return useCloudLocalCollection<ScheduledPlannerEntry>(coreBusinessStorageKeys.planner); }
export function usePricingDocumentsCollection() { return useCloudLocalCollection<PricingDocument>(coreBusinessStorageKeys.pricingDocuments); }
export function useInvoicesCollection() { return useCloudLocalCollection<Invoice>(coreBusinessStorageKeys.invoices); }
export function usePaymentsCollection() { return useCloudLocalCollection<PaymentRecord>(coreBusinessStorageKeys.payments); }
export function useMaterialsCollection() { return useCloudLocalCollection<Material>(coreBusinessStorageKeys.materials); }
export function useStockLocationsCollection() { return useCloudLocalCollection<StockLocation>(coreBusinessStorageKeys.stockLocations); }
export function useStockItemsCollection() { return useCloudLocalCollection<StockItem>(coreBusinessStorageKeys.stockItems); }
export function useStockMovementsCollection() { return useCloudLocalCollection<StockMovement>(coreBusinessStorageKeys.stockMovements); }
export function usePurchaseListsCollection() { return useCloudLocalCollection<PurchaseList>(coreBusinessStorageKeys.purchaseLists); }
export function useTeamCollection() { return useCloudLocalCollection<TeamMember>(coreBusinessStorageKeys.team); }
export function useTimesheetsCollection() { return useCloudLocalCollection<TimesheetEntry>(coreBusinessStorageKeys.timesheets); }
