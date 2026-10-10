import type { AssistantRecords } from "./assistantBriefing";
import type { AssistantAnswer, AssistantAnswerItem } from "./assistantQuestions";
import type { Job, PurchaseList, PurchaseListItem } from "./models";
import { assistantJobIdentityIndex, hasSavedIdentity } from "./assistantIdentity";
import { purchaseListReviewHref } from "./purchaseListLink";

const recordedText = (value: unknown, fallback: string) => typeof value === "string" && value.trim() ? value : fallback;
const knownStatus = (item: PurchaseListItem) => ["Needed", "Ordered", "Delivered"].includes(item.status);
const validQuantity = (item: PurchaseListItem) => Number.isFinite(item.quantity) && item.quantity > 0;
const lineFact = (item: PurchaseListItem, identityReview = "") => `${recordedText(item.description, "Description not recorded")} · Line ${recordedText(item.id, "identity missing")}${identityReview ? ` (${identityReview})` : ""} · ${validQuantity(item) ? `Quantity: ${item.quantity}` : "Quantity needs review"} · Status: ${recordedText(item.status, "Not recorded")} · Supplier: ${recordedText(item.supplier, "Not recorded")} · Stock code: ${recordedText(item.stockCode, "Not recorded")}`;

/** Saved purchase statuses are evidence for review, never an order or delivery confirmation. */
export function assistantMaterialsAnswer(records: AssistantRecords, mode: "materials" | "deliveries", selectedJob?: Job): AssistantAnswer {
  const wanted = mode === "materials" ? "Needed" : "Ordered";
  const jobs = assistantJobIdentityIndex(records.jobs);
  const loadedLists = records.purchases || [];
  const copies = new Map<string, PurchaseList[]>();
  for (const list of loadedLists) if (hasSavedIdentity(list.id)) {
    const group = copies.get(list.id);
    if (group) group.push(list); else copies.set(list.id, [list]);
  }
  let matchedLines = 0, uncertainLines = 0, invalidQuantities = 0, invalidDescriptions = 0, listIdentityReviews = 0, lineIdentityReviews = 0, emptyLists = 0, unavailableJobLinks = 0;
  const reviewedIdentities = new Set<string>();
  const compareLists = (a: PurchaseList, b: PurchaseList) => recordedText(a.number, "").localeCompare(recordedText(b.number, "")) || recordedText(a.id, "").localeCompare(recordedText(b.id, ""));
  const lists = loadedLists.filter((list) => !selectedJob || list.jobId === selectedJob.id).toSorted(compareLists);
  function jobFact(list: PurchaseList) {
    const job = list.jobId ? jobs.uniqueJobs.get(list.jobId) : undefined;
    if (list.jobId && !job) unavailableJobLinks++;
    return job ? `Job: ${job.title} · ${job.siteAddress || "Address not recorded"} · Status: ${job.status}` : list.jobId ? `${(jobs.counts.get(list.jobId) || 0) > 1 ? "Linked job identity ambiguous" : "Linked job unavailable"} · ${list.jobId}` : "No saved job link";
  }
  const items: AssistantAnswerItem[] = lists.flatMap((list, index) => {
    const usableId = hasSavedIdentity(list.id) && list.id.length <= 300;
    const duplicateId = (copies.get(list.id)?.length || 0) > 1;
    if (!usableId || duplicateId) {
      if (hasSavedIdentity(list.id) && reviewedIdentities.has(list.id)) return [];
      const allCopies = hasSavedIdentity(list.id) ? copies.get(list.id) || [list] : [list];
      const scopedCopies = allCopies.filter((entry) => !selectedJob || entry.jobId === selectedJob.id).toSorted(compareLists);
      if (allCopies.every((entry) => entry.items.length && entry.items.every((item) => item.status === "Delivered"))) return [];
      if (hasSavedIdentity(list.id)) reviewedIdentities.add(list.id);
      listIdentityReviews++;
      return [{ id: hasSavedIdentity(list.id) ? `purchase-source:${JSON.stringify(list.id)}` : `purchase-missing:${index}`, title: `Purchase identity needs review · ${recordedText(list.id, "Identity not recorded")}`,
        detail: `${duplicateId ? `${copies.get(list.id)!.length} loaded records share this identity.` : "The purchase identity is missing or cannot open an exact list."} Outstanding status counts are withheld for this source. Review the saved records before ordering or chasing delivery.`,
        evidence: scopedCopies.flatMap((entry, copyIndex) => [`Saved copy ${copyIndex + 1}: ${recordedText(entry.number, "Number not recorded")} · ${recordedText(entry.title, "Untitled purchase list")}`, jobFact(entry), ...(entry.items.length ? entry.items.map((item) => lineFact(item)) : ["No saved material lines; requirements cannot be assessed."])]),
        href: usableId ? purchaseListReviewHref(list.id) : "/purchases", actionLabel: usableId ? "Review purchase identity" : "Review purchase inbox" }];
    }
    if (!list.items.length) {
      emptyLists++;
      return [{ id: `purchase:${list.id}`, title: `${recordedText(list.number, "Number not recorded")} · ${recordedText(list.title, "Untitled purchase list")}`,
        detail: "No saved material lines. Review requirements; an empty list does not confirm that materials are ordered or delivered.", evidence: [jobFact(list), "No saved material lines; requirements cannot be assessed."], href: purchaseListReviewHref(list.id), actionLabel: "Review purchase list" }];
    }
    const lineCounts = new Map<string, number>();
    for (const item of list.items) if (hasSavedIdentity(item.id)) lineCounts.set(item.id, (lineCounts.get(item.id) || 0) + 1);
    const ambiguousOutstandingIds = new Set(list.items.filter((item) => (item.status === wanted || !knownStatus(item)) && (lineCounts.get(item.id) || 0) > 1).map((item) => item.id));
    const lines = list.items.filter((item) => item.status === wanted || !knownStatus(item) || ambiguousOutstandingIds.has(item.id));
    if (!lines.length) return [];
    const unambiguousLine = (item: PurchaseListItem) => hasSavedIdentity(item.id) && lineCounts.get(item.id) === 1;
    const matching = lines.filter((item) => unambiguousLine(item) && item.status === wanted).length;
    const uncertain = lines.filter((item) => unambiguousLine(item) && !knownStatus(item)).length;
    const identityReviews = ambiguousOutstandingIds.size + lines.filter((item) => !hasSavedIdentity(item.id)).length;
    matchedLines += matching; uncertainLines += uncertain; lineIdentityReviews += identityReviews;
    const evidence = lines.map((item) => {
      if (!validQuantity(item)) invalidQuantities++;
      if (!recordedText(item.description, "")) invalidDescriptions++;
      return lineFact(item, !hasSavedIdentity(item.id) ? "identity missing" : !unambiguousLine(item) ? "identity ambiguous; count withheld" : "");
    });
    return [{ id: `purchase:${list.id}`, title: `${recordedText(list.number, "Number not recorded")} · ${recordedText(list.title, "Untitled purchase list")}`,
      detail: `${matching} line(s) marked ${wanted}${uncertain ? ` · ${uncertain} line status(es) need review` : ""}${identityReviews ? ` · ${identityReviews} line identity review(s); ambiguous counts withheld` : ""}. ${mode === "materials" ? "Check current requirements and any recent orders before ordering." : "Check supplier confirmation and actual receipt before chasing delivery."}`,
      evidence: [jobFact(list), ...evidence], href: purchaseListReviewHref(list.id), actionLabel: "Review purchase list" }];
  });
  return { recognized: true, title: `${mode === "materials" ? "Materials to order" : "Awaiting deliveries"}${selectedJob ? ` · ${selectedJob.title}` : ""}`,
    summary: records.purchases === undefined ? "Purchase records are not ready for this answer." : `${matchedLines} line(s) marked ${wanted} · ${items.length} purchase list(s) to review${uncertainLines ? ` · ${uncertainLines} uncertain line status(es)` : ""}${listIdentityReviews + lineIdentityReviews ? ` · ${listIdentityReviews + lineIdentityReviews} source identity review(s)` : ""}${emptyLists ? ` · ${emptyLists} empty list(s)` : ""}.`,
    scope: `${selectedJob ? `Only purchase lists explicitly linked to ${selectedJob.title} · ${selectedJob.siteAddress || "Address not recorded"} · Job status: ${selectedJob.status}. ` : "All loaded purchase lists, including unlinked lists and lists on closed jobs. "}Delivered lines are excluded from outstanding counts; conflicting copies may appear in source review. Unsupported statuses remain for review without being counted as ${wanted}. Counts exclude missing or ambiguous list/line identities. Quantities are saved line quantities, not a recalculation of requirements. ${mode === "materials" ? "Check stock and the current job scope before ordering." : "Ordered means not yet marked Delivered; no delivery dates are recorded here, so these are not confirmed late deliveries."}`,
    warnings: [...(records.purchases === undefined ? ["Purchase records have not been supplied. Open Purchase Lists to review them."] : []), ...(invalidQuantities ? [`${invalidQuantities} outstanding line(s) have a missing, zero, negative or invalid quantity. Review the source before acting.`] : []), ...(invalidDescriptions ? [`${invalidDescriptions} outstanding line(s) have no recorded description. Review the source before acting.`] : []), ...(listIdentityReviews ? [`${listIdentityReviews} purchase source(s) have missing, duplicate or unsupported identities. Their outstanding status counts are withheld; no loaded copy was chosen as authoritative.`] : []), ...(lineIdentityReviews ? [`${lineIdentityReviews} line identity review(s) require checking the saved copies. Ambiguous lines are excluded from status counts.`] : []), ...(emptyLists ? [`${emptyLists} saved purchase list(s) contain no material lines. This does not confirm that job requirements are covered.`] : []), ...(unavailableJobLinks ? [`${unavailableJobLinks} reviewed purchase record(s) have unavailable or ambiguous job links. No job name was inferred.`] : [])],
    items, ...(selectedJob ? { resolvedJobId: selectedJob.id } : {}) };
}
