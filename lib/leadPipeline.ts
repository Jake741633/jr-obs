import { savedIdentityIndex } from "./assistantIdentity";
import { leadValuePence, resolveLeadStage } from "./crmPro-core.mjs";
import { plannerViewDate } from "./scheduling";
import type { LeadSource, LeadStage, PricingDocument, SalesLead } from "./models";

const closedStages: LeadStage[] = ["Accepted", "Lost", "Completed", "Cancelled"];
const priorityOrder = ["Low", "Normal", "High", "Urgent"];
export function leadPriorityRank(value: unknown) { return typeof value === "string" ? priorityOrder.indexOf(value) + 1 : 0; }
export function leadDate(value: unknown) { return typeof value === "string" ? plannerViewDate(value) : null; }
export function recordedText(value: unknown, fallback = "") { return typeof value === "string" && value.trim() ? value : fallback; }

export function reviewLeadFollowUps(leads: SalesLead[]) {
  const index = savedIdentityIndex(leads);
  const reviews = index.selectable.flatMap(lead => {
    const issues = [resolveLeadStage(lead.stage) === null ? "Saved stage is unrecognised" : "", lead.followUpDate !== undefined && lead.followUpDate !== null && lead.followUpDate !== "" && !leadDate(lead.followUpDate) ? "Follow-up date is invalid" : ""].filter(Boolean);
    return issues.length ? [{ lead, detail: issues.join(" · ") }] : [];
  });
  const withheld = new Set(reviews.map(review => review.lead.id));
  return { leads: index.selectable.filter(lead => !withheld.has(lead.id)), reviews, unusableCount: index.unusableCount };
}

type Entry = { lead: SalesLead; stage: LeadStage | null; pence: number | null; date: string | null; dateIssue: boolean; issues: string[] };
type KnownEntry = Entry & { stage: LeadStage };
export function pipelineMoney(entries: Entry[], unclassified = 0) {
  const known = entries.filter(entry => entry.pence !== null);
  const missing = entries.length - known.length;
  const incomplete = missing > 0 || unclassified > 0;
  const sum = known.reduce((total, entry) => total + entry.pence!, 0);
  const overflow = !Number.isSafeInteger(sum);
  return { pence: overflow || (incomplete && !known.length) ? null : sum, incomplete, missing, overflow };
}

/** Classification and totals are read-only; invalid values never become zero-valued leads. */
export function buildLeadPipeline(leads: SalesLead[], documents: PricingDocument[], sources: LeadSource[], today: string) {
  const index = savedIdentityIndex(leads);
  const entries: Entry[] = index.selectable.map(lead => {
    const stage = resolveLeadStage(lead.stage), pence = leadValuePence(lead.estimatedValue), date = leadDate(lead.followUpDate);
    const dateIssue = lead.followUpDate !== undefined && lead.followUpDate !== null && lead.followUpDate !== "" && !date;
    const issues = [!stage ? "Stage needs review" : "", pence === null ? "Value needs review" : "", dateIssue ? "Follow-up date needs review" : "", !leadPriorityRank(lead.priority) ? "Priority needs review" : "", !sources.includes(lead.source) ? "Source needs review" : ""].filter(Boolean);
    return { lead, stage, pence, date, dateIssue, issues };
  });
  const byId = new Map(entries.map(entry => [entry.lead.id, entry]));
  const known = entries.filter((entry): entry is KnownEntry => entry.stage !== null);
  const unclassified = index.unusableCount + entries.length - known.length;
  const open = known.filter(entry => !closedStages.includes(entry.stage));
  const won = known.filter(entry => entry.stage === "Accepted" || entry.stage === "Completed");
  const lost = known.filter(entry => entry.stage === "Lost");
  const decided = won.length + lost.length;
  const dateReviews = open.filter(entry => entry.dateIssue).length;
  const due = open.filter(entry => !entry.dateIssue && (!entry.date || entry.date <= today) && (entry.stage === "Follow-up Due" || Boolean(entry.date && entry.date <= today))).length;
  const builderCount = open.filter(({ lead }) => lead.source === "Builder" || Boolean(recordedText(lead.builderId))).length;
  const builderReviews = open.filter(({ lead }) => !sources.includes(lead.source) && !recordedText(lead.builderId)).length;

  const documentIndex = savedIdentityIndex(documents);
  const quotes = documentIndex.selectable.filter(document => document.type === "Quote");
  const quoteReviews = documentIndex.unusableCount + documentIndex.selectable.filter(document => !["Quote", "Estimate"].includes(document.type)).length + quotes.filter(quote => !["Draft", "Sent", "Accepted", "Declined", "Expired"].includes(quote.status)).length;
  const quoteDecisions = quotes.filter(quote => quote.status === "Accepted" || quote.status === "Declined");
  const quoteRate = quoteDecisions.length ? quotes.filter(quote => quote.status === "Accepted").length / quoteDecisions.length * 100 : null;

  const sourcePerformance = [...sources, "Source needs review"].map(source => {
    const group = known.filter(({ lead }) => source === "Source needs review" ? !sources.includes(lead.source) : lead.source === source);
    const won = group.filter(entry => entry.stage === "Accepted" || entry.stage === "Completed"), lost = group.filter(entry => entry.stage === "Lost");
    const decided = won.length + lost.length;
    return { source, total: group.length, won: won.length, lost: lost.length, value: pipelineMoney(won, unclassified), conversion: decided ? won.length / decided * 100 : null };
  }).filter(group => group.total).toSorted((left, right) => (right.value.pence ?? -1) - (left.value.pence ?? -1) || right.total - left.total);
  const reasons = new Map<string, number>();
  for (const { lead } of lost) { const reason = recordedText(lead.lostReason, "Reason not recorded").trim(); reasons.set(reason, (reasons.get(reason) ?? 0) + 1); }
  return { index, entries, byId, unclassified, stageReviews: entries.length - known.length, reviewCount: entries.filter(entry => entry.issues.length).length,
    openCount: open.length, pipelineValue: pipelineMoney(open, unclassified), quotePipelineValue: pipelineMoney(known.filter(entry => entry.stage === "Quote Sent" || entry.stage === "Follow-up Due"), unclassified),
    conversionRate: decided ? won.length / decided * 100 : null, dateReviews, due, builderCount, builderReviews, quoteReviews, quoteRate, sourcePerformance,
    lossReasons: [...reasons.entries()].toSorted((left, right) => right[1] - left[1]),
  };
}
