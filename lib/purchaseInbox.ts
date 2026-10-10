import type { Job, PurchaseList, PurchaseListItem } from "./models";

export const purchaseInboxFilters = ["All", "Need ordering", "Awaiting delivery", "Delivered", "Review"] as const;
export type PurchaseInboxFilter = typeof purchaseInboxFilters[number];
const knownStatuses = ["Needed", "Ordered", "Delivered"];

export function purchaseLinkedJob(list: PurchaseList, jobs: Job[]) {
  const matches = jobs.filter((job) => job.id === list.jobId);
  return list.jobId && matches.length === 1 ? matches[0] : undefined;
}

export function purchaseSavedTotal(items: PurchaseListItem[]) {
  let amount = 0, needsReview = false;
  for (const item of items) {
    const cost = item.unitCost;
    const value = item.quantity * cost;
    if (!Number.isFinite(item.quantity) || item.quantity <= 0 || !Number.isFinite(cost) || cost < 0 || !Number.isFinite(value) || !Number.isFinite(amount + value)) needsReview = true;
    else amount += value;
  }
  return { amount, needsReview };
}

export function filterPurchaseInbox(lists: PurchaseList[], jobs: Job[], options: { jobId: string; filter: PurchaseInboxFilter; query: string; includeCosts: boolean }) {
  if (options.jobId && jobs.filter((job) => job.id === options.jobId).length !== 1) return [];
  const words = options.query.toLocaleLowerCase("en-GB").trim().split(/\s+/).filter(Boolean);
  const jobById = new Map<string, Job | undefined>();
  for (const job of jobs) jobById.set(job.id, jobById.has(job.id) ? undefined : job);
  const listCounts = new Map<string, number>();
  for (const list of lists) listCounts.set(list.id, (listCounts.get(list.id) || 0) + 1);
  return lists.filter((list) => {
    const job = list.jobId ? jobById.get(list.jobId) : undefined;
    if (options.jobId && list.jobId !== options.jobId) return false;
    if (options.filter === "Need ordering" && !list.items.some((line) => line.status === "Needed")) return false;
    if (options.filter === "Awaiting delivery" && !list.items.some((line) => line.status === "Ordered")) return false;
    if (options.filter === "Delivered" && (!list.items.length || !list.items.every((line) => line.status === "Delivered"))) return false;
    if (options.filter === "Review") {
      const uncertain = typeof list.id !== "string" || !list.id.trim() || !list.items.length || listCounts.get(list.id) !== 1 || Boolean(list.jobId && !job) || new Set(list.items.map((line) => line.id)).size !== list.items.length || list.items.some((line) => typeof line.id !== "string" || !line.id.trim() || typeof line.description !== "string" || !line.description.trim() || !knownStatuses.includes(line.status) || !Number.isFinite(line.quantity) || line.quantity <= 0) || (options.includeCosts && purchaseSavedTotal(list.items).needsReview);
      if (!uncertain) return false;
    }
    const haystack = [list.number, list.title, list.notes, job?.title, job?.siteAddress, ...list.items.flatMap((line) => [line.description, line.supplier, line.stockCode, line.status])].join(" ").toLocaleLowerCase("en-GB");
    return words.every((word) => haystack.includes(word));
  });
}
