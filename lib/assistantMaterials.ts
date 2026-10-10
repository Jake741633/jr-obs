import type { AssistantRecords } from "./assistantBriefing";
import type { AssistantAnswer } from "./assistantQuestions";
import type { Job } from "./models";
import { purchaseListReviewHref } from "./purchaseListLink";

/** Saved purchase statuses are evidence for review, never an order or delivery confirmation. */
export function assistantMaterialsAnswer(records: AssistantRecords, mode: "materials" | "deliveries", selectedJob?: Job): AssistantAnswer {
  const wanted = mode === "materials" ? "Needed" : "Ordered";
  const jobs = new Map(records.jobs.map((job) => [job.id, job]));
  let matchedLines = 0, uncertainLines = 0, invalidQuantities = 0;
  const lists = (records.purchases || []).filter((list) => !selectedJob || list.jobId === selectedJob.id)
    .toSorted((a, b) => a.number.localeCompare(b.number) || a.id.localeCompare(b.id));
  const items = lists.flatMap((list) => {
    const lines = list.items.filter((item) => item.status === wanted || !["Needed", "Ordered", "Delivered"].includes(item.status));
    if (!lines.length) return [];
    const matching = lines.filter((item) => item.status === wanted).length;
    const uncertain = lines.length - matching;
    matchedLines += matching; uncertainLines += uncertain;
    const job = list.jobId ? jobs.get(list.jobId) : undefined;
    const evidence = lines.map((item) => {
      const validQuantity = Number.isFinite(item.quantity) && item.quantity > 0;
      if (!validQuantity) invalidQuantities++;
      return `${item.description || "Description not recorded"} · Line ${item.id || "identity missing"} · ${validQuantity ? `Quantity: ${item.quantity}` : "Quantity needs review"} · Status: ${item.status || "Not recorded"} · Supplier: ${item.supplier || "Not recorded"} · Stock code: ${item.stockCode || "Not recorded"}`;
    });
    return [{ id: `purchase:${list.id}`, title: `${list.number} · ${list.title || "Untitled purchase list"}`,
      detail: `${matching} line(s) marked ${wanted}${uncertain ? ` · ${uncertain} line status(es) need review` : ""}. ${mode === "materials" ? "Check current requirements and any recent orders before ordering." : "Check supplier confirmation and actual receipt before chasing delivery."}`,
      evidence: [job ? `Job: ${job.title} · ${job.siteAddress || "Address not recorded"} · Status: ${job.status}` : list.jobId ? `Linked job unavailable · ${list.jobId}` : "No saved job link", ...evidence],
      href: purchaseListReviewHref(list.id), actionLabel: "Review purchase list" }];
  });
  return { recognized: true, title: `${mode === "materials" ? "Materials to order" : "Awaiting deliveries"}${selectedJob ? ` · ${selectedJob.title}` : ""}`,
    summary: records.purchases === undefined ? "Purchase records are not ready for this answer." : `${matchedLines} line(s) marked ${wanted} · ${items.length} purchase list(s) to review${uncertainLines ? ` · ${uncertainLines} uncertain line status(es)` : ""}.`,
    scope: `${selectedJob ? `Only purchase lists explicitly linked to ${selectedJob.title} · ${selectedJob.siteAddress || "Address not recorded"} · Job status: ${selectedJob.status}. ` : "All loaded purchase lists, including unlinked lists and lists on closed jobs. "}Delivered lines are excluded. Unsupported statuses remain for review without being counted as ${wanted}. Quantities are saved line quantities, not a recalculation of requirements. ${mode === "materials" ? "Check stock and the current job scope before ordering." : "Ordered means not yet marked Delivered; no delivery dates are recorded here, so these are not confirmed late deliveries."}`,
    warnings: [...(records.purchases === undefined ? ["Purchase records have not been supplied. Open Purchase Lists to review them."] : []), ...(invalidQuantities ? [`${invalidQuantities} outstanding line(s) have a missing, zero, negative or invalid quantity. Review the source before acting.`] : [])],
    items, ...(selectedJob ? { resolvedJobId: selectedJob.id } : {}) };
}
