import type { Job, PurchaseList } from "./models";

export interface CertificateSignal {
  jobId?: string;
  status: string;
}

export function outstandingCertificateJobs(jobs: Job[], certificates: CertificateSignal[]) {
  const completeStatuses = new Set(["Complete", "Issued", "Archived"]);
  return jobs.filter((job) => job.status === "Complete" && !certificates.some((certificate) => certificate.jobId === job.id && completeStatuses.has(certificate.status)));
}

export function materialOrderLists(purchaseLists: PurchaseList[]) {
  return purchaseLists
    .filter((list) => list.items.some((item) => item.status === "Needed"))
    .toSorted((left, right) => right.items.filter((item) => item.status === "Needed").length - left.items.filter((item) => item.status === "Needed").length || left.updatedAt.localeCompare(right.updatedAt));
}

export function operationalHealthScore({
  overdueInvoices,
  quoteFollowUps,
  outstandingCertificates,
  materialItemsNeeded,
  urgentRecommendations,
}: {
  overdueInvoices: number;
  quoteFollowUps: number;
  outstandingCertificates: number;
  materialItemsNeeded: number;
  urgentRecommendations: number;
}) {
  const deductions = {
    overdueInvoices: Math.min(30, overdueInvoices * 8),
    quoteFollowUps: Math.min(18, quoteFollowUps * 3),
    outstandingCertificates: Math.min(20, outstandingCertificates * 5),
    materialItemsNeeded: Math.min(15, materialItemsNeeded * 2),
    urgentRecommendations: Math.min(20, urgentRecommendations * 5),
  };
  const score = Math.max(0, Math.min(100, 100 - Object.values(deductions).reduce((sum, value) => sum + value, 0)));
  return {
    score,
    label: score >= 80 ? "Healthy" : score >= 60 ? "Needs attention" : "Action required",
    deductions,
  };
}
