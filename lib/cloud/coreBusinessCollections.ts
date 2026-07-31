"use client";

import { useEffect, useMemo, useState } from "react";
import type { ComplianceCertificate } from "../complianceCertificates";
import type { ElectricalTestingRecord } from "../electricalTesting";
import type { Customer, Invoice, Job, JobDocument, Material, PricingDocument, PurchaseList, StockItem, StockLocation, StockMovement, TeamMember, TimesheetEntry } from "../models";
import type { PaymentRecord } from "../payments";
import type { ScheduledPlannerEntry } from "../scheduling";
import { useCloudLocalCollection } from "../storage";
import {
  dataUrlByteSize,
  flushPrivateFileUploadQueue,
  privateObjectPath,
  queuePrivateFileUpload,
  readPrivateUploadQueue,
  signedPrivateDownloadUrl,
  validatePrivateFile,
  type PrivateUploadState,
} from "./privateFiles";
import { useCloudIdentity } from "./useCloudIdentity";

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

export function useJobDocumentsCollection() {
  const collection = useCloudLocalCollection<CloudJobDocument>(coreBusinessStorageKeys.jobDocuments);
  const { identity, mode } = useCloudIdentity();
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!collection.isReady || mode === "local" || !identity) return;
    const queuedIds = new Set(readPrivateUploadQueue().map((item) => item.sourceId));
    for (const document of collection.items) {
      if (!document.dataUrl || !document.fileName || !document.mimeType || document.privateStoragePath || queuedIds.has(document.id)) continue;
      const size = dataUrlByteSize(document.dataUrl);
      const validationError = validatePrivateFile({ name: document.fileName, size, type: document.mimeType });
      if (validationError) continue;
      queuePrivateFileUpload({
        organisationId: identity.organisationId,
        userId: identity.userId,
        sourceId: document.id,
        jobSourceId: document.jobId,
        fileName: document.fileName,
        mimeType: document.mimeType,
        size,
        dataUrl: document.dataUrl,
        objectPath: privateObjectPath(identity.organisationId, document.jobId, document.id, document.fileName),
      });
    }

    const syncUploadedDocument = (sourceId: string, path: string, privateFileId?: string, signedDownloadUrl?: string) => {
      collection.setItems((current) => current.map((document) => document.id === sourceId ? {
        ...document,
        privateStoragePath: path,
        privateFileId,
        privateUploadState: "Synced",
        privateUploadError: undefined,
      } : document));
      if (signedDownloadUrl) setSignedUrls((current) => ({ ...current, [sourceId]: signedDownloadUrl }));
    };

    const flush = () => void flushPrivateFileUploadQueue((item, result) => {
      if (result.state !== "Synced") return;
      syncUploadedDocument(item.sourceId, item.objectPath, result.metadata.id, result.signedDownloadUrl);
    });
    flush();
    window.addEventListener("online", flush);
    return () => window.removeEventListener("online", flush);
  }, [collection.isReady, collection.items, collection.setItems, identity, mode]);

  useEffect(() => {
    if (!collection.isReady || mode === "local" || !identity) return;
    let active = true;
    const missing = collection.items.filter((document) => document.privateStoragePath && !document.dataUrl && !signedUrls[document.id]);
    if (!missing.length) return;
    void Promise.all(missing.map(async (document) => [document.id, await signedPrivateDownloadUrl(document.privateStoragePath!)] as const))
      .then((entries) => { if (active) setSignedUrls((current) => ({ ...current, ...Object.fromEntries(entries) })); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [collection.isReady, collection.items, identity, mode, signedUrls]);

  const items = useMemo(() => collection.items.map((document) => signedUrls[document.id] && !document.dataUrl
    ? { ...document, dataUrl: signedUrls[document.id] }
    : document), [collection.items, signedUrls]);

  return { ...collection, items };
}
