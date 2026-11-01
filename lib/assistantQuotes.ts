import type { AssistantAction } from "./assistantBriefing";
import type { Job, PricingDocument } from "./models";
import { hasSavedIdentity, savedIdentityIndex } from "./assistantIdentity";
import { assistantDateKey, assistantDay, assistantQuoteFollowUpDue } from "./assistantSignals-core.mjs";

const statuses = new Set(["Draft", "Sent", "Accepted", "Declined", "Expired"]);
const recorded = (value: unknown, fallback: string) => typeof value === "string" && value.trim() ? value : fallback;
const quoteHref = (id: string) => id.length <= 300 ? `/quotes/${encodeURIComponent(id)}` : "/quotes";

/** Loaded sources only. Identity checks precede type, status and job filters. */
export function assistantQuoteSnapshot(documents: PricingDocument[], jobs: Job[], now: Date, options: { jobId?: string; followUpsOnly?: boolean } = {}) {
  const { jobId, followUpsOnly = false } = options;
  const identities = savedIdentityIndex(documents);
  const today = assistantDay(assistantDateKey(now))!;
  const linkedJobs = (quote: PricingDocument) => quote.jobId ? [quote.jobId] : hasSavedIdentity(quote.id) ? jobs.filter((job) => job.sourceQuoteId === quote.id || job.quoteSnapshot?.quoteId === quote.id).map((job) => job.id).filter(hasSavedIdentity) : [];
  const scoped = documents.filter((quote) => jobId === undefined || linkedJobs(quote).includes(jobId));
  const groups = new Map<string | null, PricingDocument[]>();
  for (const quote of scoped) {
    const id = hasSavedIdentity(quote.id) ? quote.id : null;
    const copies = groups.get(id);
    if (copies) copies.push(quote); else groups.set(id, [quote]);
  }
  const actions: AssistantAction[] = [];
  let followUpCount = 0, reviewCount = 0;
  const evidence = (quote: PricingDocument) => `${recorded(quote.type, "Type not recorded")} ${recorded(quote.number, "Number not recorded")}: ${recorded(quote.title, "Untitled document")} · Status: ${recorded(quote.status, "Not recorded")} · Valid until: ${recorded(quote.validUntil, "Not recorded")} · Next follow-up: ${recorded(quote.nextFollowUpDate, "Not set")} · Last contact/update: ${recorded(quote.lastFollowUpAt || quote.updatedAt, "Not recorded")}`;
  for (const [id, copies] of groups) {
    const relevant = copies.filter((quote) => quote.type === "Quote" && (quote.status === "Sent" || (!followUpsOnly && quote.status === "Accepted") || !statuses.has(quote.status)));
    if (!relevant.length) continue;
    const jobIds = [...new Set(copies.flatMap(linkedJobs))];
    if (id === null || identities.counts.get(id) !== 1) {
      reviewCount++;
      actions.push({ id: `quote-source:${JSON.stringify(id)}`, category: "Quotes", priority: "Today", title: "Quote identity needs review",
        reason: id === null ? "Saved document identities are missing. Follow-up and conversion claims are withheld." : `${identities.counts.get(id)} loaded pricing documents share one identity. Follow-up and conversion claims are withheld.`,
        nextStep: "Review the saved document copies before contacting the customer or converting a quote. No copy was chosen as authoritative.",
        href: "/quotes", actionLabel: "Review quote inbox", dueDate: "", jobIds,
        evidence: [id === null ? "Document identity not recorded" : `Saved identity: ${id}`, ...copies.map(evidence).sort(), "Only copies within the requested job scope are described; identity checks use every loaded pricing document, including estimates and closed quotes."] });
      continue;
    }
    const quote = relevant[0];
    const issues: string[] = [];
    if (!statuses.has(quote.status)) issues.push("The saved quote status is missing or unsupported.");
    if (quote.status === "Sent") {
      if (quote.validUntil && assistantDay(quote.validUntil) === null) issues.push("The saved validity date is invalid; pricing validity is unknown.");
      if (quote.nextFollowUpDate) {
        if (assistantDay(quote.nextFollowUpDate) === null) issues.push("The agreed follow-up date is invalid; it cannot be replaced with the default reminder.");
      } else {
        const last = quote.lastFollowUpAt || quote.updatedAt;
        const timestamp = typeof last === "string" ? Date.parse(last) : NaN;
        if (!Number.isFinite(timestamp) || assistantDay(typeof last === "string" ? last.slice(0, 10) : "") === null || timestamp > now.getTime()) issues.push("The last contact or update is missing, invalid or in the future; follow-up timing is unknown.");
      }
    }
    const href = quoteHref(id);
    const actionLabel = href === "/quotes" ? "Review quote inbox" : "Review quote";
    if (issues.length) {
      reviewCount++;
      actions.push({ id: `quote-evidence:${id}`, category: "Quotes", priority: "Today", title: `Review quote evidence · ${quote.number}`,
        reason: issues.join(" "), nextStep: "Check the saved status, contact history and dates before deciding whether to follow up. No customer contact is recommended from this uncertain evidence.",
        href, actionLabel, dueDate: "", jobIds, evidence: [evidence(quote), ...issues] });
      continue;
    }
    if (quote.status === "Accepted" && !quote.jobId && !linkedJobs(quote).length) {
      actions.push({ id: `convert:${id}`, category: "Quotes", priority: "Today", title: `Plan ${quote.number}`,
        reason: "This quote is accepted and no linked job was found in the loaded records.", nextStep: "Open the accepted quote and review its conversion to a job.",
        href, actionLabel: href === "/quotes" ? "Review quote inbox" : "Open accepted quote", dueDate: "", jobIds,
        evidence: [quote.title, "Status: Accepted", "No quote or job-side link found"] });
    }
    if (quote.status !== "Sent") continue;
    const expiry = assistantDay(quote.validUntil);
    const expired = expiry !== null && expiry < today;
    const followUp = assistantQuoteFollowUpDue(quote, now);
    if (followUp) followUpCount++;
    // Expiry alone asks for pricing review; an agreed contact date still wins.
    if (followUp || (expired && !followUpsOnly)) actions.push({ id: `follow-up:${id}`, category: "Quotes", priority: "Today",
      title: `${expired ? "Review expired quote" : "Follow up"} ${quote.number}`,
      reason: expired ? "The saved validity date has passed. Check pricing before making a new offer." : quote.nextFollowUpDate ? `The saved follow-up date is ${quote.nextFollowUpDate}.` : "This sent quote is due for review based on its last recorded contact or validity date.",
      nextStep: expired ? "Review validity and pricing; keep any future follow-up date agreed with the customer." : "Review the quote and recent contact, then record the outcome and next follow-up date.",
      href, actionLabel, dueDate: expired ? quote.validUntil : quote.nextFollowUpDate || "", jobIds,
      evidence: [quote.title, `Status: ${quote.status}`, `Valid until: ${quote.validUntil || "Not recorded"}`, `Next follow-up: ${quote.nextFollowUpDate || "Not set"}`, `Last contact: ${quote.lastFollowUpAt || quote.updatedAt}`] });
  }
  const warnings = reviewCount ? [`${reviewCount} quote source review(s) excluded from confirmed follow-up counts. The count is incomplete until uncertain identities, statuses or dates are reviewed.`] : [];
  return { actions: actions.toSorted((a, b) => (a.dueDate || "9999").localeCompare(b.dueDate || "9999") || a.id.localeCompare(b.id)), followUpCount, reviewCount, warnings };
}
