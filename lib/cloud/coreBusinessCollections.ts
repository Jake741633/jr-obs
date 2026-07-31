"use client";

import type { ComplianceCertificate } from "../complianceCertificates";
import type { PortalApprovalRecord, PortalRequest } from "../customerPortal";
import type { ElectricalTestingRecord } from "../electricalTesting";
import type { AiLearningEvidence, AiLearningMemory, BusinessExpense, Customer, Invoice, Job, JobDocument, JobPack, Material, PricingDocument, PurchaseList, RamsDocument, SiteSurvey, StockItem, StockLocation, StockMovement, TeamMember, TimesheetEntry } from "../models";
import type { PaymentRecord } from "../payments";
import type { ScheduledPlannerEntry } from "../scheduling";
import { useCloudLocalCollection } from "../storage";
import type { PrivateUploadState } from "./privateFiles";

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
  electricalTesting: "jr-os-electrical-testing",
  certificates: "jr-os-certificates",
  jobDocuments: "jr-os-job-documents",
  portalApprovals: "jr-os-portal-approvals",
  portalRequests: "jr-os-portal-requests",
  expenses: "jr-os-expenses",
  surveys: "jr-os-surveys",
  rams: "jr-os-rams",
  jobPacks: "jr-os-job-packs",
  aiRecommendationEvidence: "jr-os-ai-recommendation-evidence",
  aiLearningMemory: "jr-os-ai-learning-memory",
} as const;

export interface CloudJobDocument extends JobDocument {
  privateStoragePath?: string;
  privateFileId?: string;
  privateUploadState?: PrivateUploadState;
  privateUploadError?: string;
}

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
export function useElectricalTestingCollection() { return useCloudLocalCollection<ElectricalTestingRecord>(coreBusinessStorageKeys.electricalTesting); }
export function useCertificatesCollection() { return useCloudLocalCollection<ComplianceCertificate>(coreBusinessStorageKeys.certificates); }
export function useJobDocumentsCollection() { return useCloudLocalCollection<CloudJobDocument>(coreBusinessStorageKeys.jobDocuments); }
export function usePortalApprovalsCollection() { return useCloudLocalCollection<PortalApprovalRecord>(coreBusinessStorageKeys.portalApprovals); }
export function usePortalRequestsCollection() { return useCloudLocalCollection<PortalRequest>(coreBusinessStorageKeys.portalRequests); }
export function useExpensesCollection() { return useCloudLocalCollection<BusinessExpense>(coreBusinessStorageKeys.expenses); }
export function useSurveysCollection() { return useCloudLocalCollection<SiteSurvey>(coreBusinessStorageKeys.surveys); }
export function useRamsCollection() { return useCloudLocalCollection<RamsDocument>(coreBusinessStorageKeys.rams); }
export function useJobPacksCollection() { return useCloudLocalCollection<JobPack>(coreBusinessStorageKeys.jobPacks); }
export function useAiRecommendationEvidenceCollection() { return useCloudLocalCollection<AiLearningEvidence>(coreBusinessStorageKeys.aiRecommendationEvidence); }
export function useAiLearningMemoryCollection() { return useCloudLocalCollection<AiLearningMemory>(coreBusinessStorageKeys.aiLearningMemory); }
