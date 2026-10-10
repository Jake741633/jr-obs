import type { AiReminder, Invoice, Job, PricingDocument, PurchaseList } from "./models";
import { detectScheduleClashes, entryEndDate, type ScheduledPlannerEntry } from "./scheduling";
import { isJobInactiveStatus } from "./jobManagement-core.mjs";
import { outstandingCertificateJobs, type CertificateSignal } from "./dashboardIntelligence";
import { assistantDateKey, assistantDay, assistantInvoiceBalance, assistantQuoteFollowUpDue, isAssistantInvoiceOverdue } from "./assistantSignals-core.mjs";

export type AssistantFocus = "All" | "Money" | "Quotes" | "Site" | "Diary" | "Reminders";
export interface AssistantAction {
  id: string;
  category: Exclude<AssistantFocus, "All">;
  priority: "Now" | "Today" | "Next";
  title: string;
  reason: string;
  nextStep: string;
  href: string;
  actionLabel: string;
  evidence: string[];
  dueDate: string;
}
export interface AssistantRecords {
  jobs: Job[];
  documents: PricingDocument[];
  invoices: Invoice[];
  planner: ScheduledPlannerEntry[];
  purchases: PurchaseList[];
  reminders: AiReminder[];
  certificates: CertificateSignal[];
}
const money = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const jobPath = (id: string) => `/jobs/${encodeURIComponent(id)}`;
const quotePath = (id: string) => `/quotes/${encodeURIComponent(id)}`;
const rank = { Now: 0, Today: 1, Next: 2 };
const plural = (value: number, singular: string) => `${value} ${singular}${value === 1 ? "" : "s"}`;

/** Read-only, deterministic recommendations. The caller supplies only authorized collections. */
export function buildAssistantBriefing(records: AssistantRecords, now = new Date()) {
  const today = assistantDateKey(now);
  const todayDay = assistantDay(today)!;
  const actions: AssistantAction[] = [];
  const add = (action: AssistantAction) => actions.push(action);
  const { jobs, documents, invoices, planner, purchases, reminders, certificates } = records;

  for (const invoice of invoices.filter((item) => isAssistantInvoiceOverdue(item, now))) {
    const overdueDays = todayDay - assistantDay(invoice.dueDate)!;
    add({ id: `invoice:${invoice.id}`, category: "Money", priority: "Now", title: `Chase ${invoice.number}`,
      reason: `${money.format(assistantInvoiceBalance(invoice))} remains unpaid, ${plural(overdueDays, "day")} after the due date.`,
      nextStep: "Check for a recent payment, then review the invoice before contacting the customer.",
      href: `/invoices?invoice=${encodeURIComponent(invoice.id)}`, actionLabel: "Review invoice", dueDate: invoice.dueDate,
      evidence: [invoice.title, `Status: ${invoice.status}`, `Due: ${invoice.dueDate}`, `Recorded paid: ${money.format(invoice.amountPaid)}`] });
  }

  const linkedQuoteIds = new Set(jobs.flatMap((job) => [job.sourceQuoteId, job.quoteSnapshot?.quoteId].filter(Boolean)));
  for (const quote of documents.filter((item) => item.type === "Quote")) {
    if (quote.status === "Accepted" && !quote.jobId && !linkedQuoteIds.has(quote.id)) {
      add({ id: `convert:${quote.id}`, category: "Quotes", priority: "Today", title: `Plan ${quote.number}`,
        reason: "This quote is accepted and no linked job was found in the loaded records.", nextStep: "Open the accepted quote and review its conversion to a job.",
        href: quotePath(quote.id), actionLabel: "Open accepted quote", dueDate: "", evidence: [quote.title, "Status: Accepted", "No quote or job-side link found"] });
    }
    if (quote.status !== "Sent") continue;
    const expiry = assistantDay(quote.validUntil);
    const expired = expiry !== null && expiry < todayDay;
    const followUp = assistantQuoteFollowUpDue(quote, now);
    // One action per quote; expiry is a pricing review, never permission to chase early.
    if (expired || followUp) add({ id: `follow-up:${quote.id}`, category: "Quotes", priority: "Today",
      title: `${expired ? "Review expired quote" : "Follow up"} ${quote.number}`,
      reason: expired ? "The saved validity date has passed. Check pricing before making a new offer." : quote.nextFollowUpDate ? `The saved follow-up date is ${quote.nextFollowUpDate}.` : "This sent quote is due for review based on its last recorded contact or validity date.",
      nextStep: expired ? "Review validity and pricing; keep any future follow-up date agreed with the customer." : "Review the quote and recent contact, then record the outcome and next follow-up date.",
      href: quotePath(quote.id), actionLabel: "Review quote", dueDate: expired ? quote.validUntil : quote.nextFollowUpDate || "",
      evidence: [quote.title, `Status: ${quote.status}`, `Valid until: ${quote.validUntil || "Not recorded"}`, `Next follow-up: ${quote.nextFollowUpDate || "Not set"}`, `Last contact: ${quote.lastFollowUpAt || quote.updatedAt}`] });
  }

  const visits = planner.filter((entry) => ["Planned", "Confirmed"].includes(entry.status)
    && assistantDay(entry.date) !== null && assistantDay(entryEndDate(entry)) !== null
    && entry.date <= entryEndDate(entry) && assistantDay(entry.date)! <= todayDay + 7 && assistantDay(entryEndDate(entry))! >= todayDay);
  const jobVisits = new Map<string, ScheduledPlannerEntry[]>();
  for (const visit of visits) if (visit.jobId) jobVisits.set(visit.jobId, [...(jobVisits.get(visit.jobId) || []), visit]);
  const jobPurchases = new Map<string, PurchaseList[]>();
  for (const list of purchases) if (list.jobId) jobPurchases.set(list.jobId, [...(jobPurchases.get(list.jobId) || []), list]);
  for (const job of jobs.filter((item) => !isJobInactiveStatus(item.status))) {
    const linkedVisits = jobVisits.get(job.id) || [];
    const start = assistantDay(job.startDate);
    const scheduledSoon = start !== null && start >= todayDay && start <= todayDay + 7;
    const onSite = ["First fix", "Second fix", "Testing", "Snagging", "In progress", "Awaiting builder"].includes(job.status);
    if (!scheduledSoon && !onSite && !linkedVisits.length) continue;
    const dueDate = linkedVisits.map((visit) => visit.date).concat(scheduledSoon || onSite ? [job.startDate] : []).filter((date) => assistantDay(date) !== null).sort()[0] || today;
    const lists = jobPurchases.get(job.id) || [];
    const needed = lists.flatMap((list) => list.items.filter((item) => item.status === "Needed"));
    const ordered = lists.flatMap((list) => list.items.filter((item) => item.status === "Ordered"));
    const gaps = [!job.siteAddress.trim() && !linkedVisits.some((visit) => visit.location.trim()) ? "No site or visit address recorded" : "",
      !job.assignedTo?.length && !linkedVisits.some((visit) => visit.teamMemberIds.length) ? "No worker assigned to the job or upcoming visits" : "",
      needed.length ? `${plural(needed.length, "material line")} still marked Needed` : "",
      ordered.length ? `${plural(ordered.length, "material line")} ordered but not marked delivered` : ""].filter(Boolean);
    if (gaps.length) add({ id: `readiness:${job.id}`, category: "Site", priority: dueDate <= today ? "Now" : "Today", title: `Prepare ${job.title}`,
      reason: `${plural(gaps.length, "readiness check")} before the next site visit.`, nextStep: "Confirm access and the assigned worker, then check linked material orders before travelling.",
      href: jobPath(job.id), actionLabel: "Open job", dueDate, evidence: [`Job status: ${job.status}`, `Visit/start: ${dueDate}`, ...gaps, ...lists.map((list) => `${list.number} · ${list.title}`)] });
  }

  const invoicedJobs = new Set(invoices.filter((item) => item.status !== "Cancelled").map((item) => item.jobId));
  for (const job of jobs.filter((item) => ["Complete", "Invoiced"].includes(item.status) && !invoicedJobs.has(item.id))) {
    add({ id: `invoice-job:${job.id}`, category: "Money", priority: "Today", title: `Check billing for ${job.title}`,
      reason: "The job is complete but no linked, non-cancelled invoice was found.", nextStep: "Review payment stages and previous billing before preparing a draft invoice.",
      href: jobPath(job.id), actionLabel: "Review job billing", dueDate: "", evidence: [`Job status: ${job.status}`, "No linked invoice in loaded records"] });
  }
  for (const job of outstandingCertificateJobs(jobs, certificates)) {
    add({ id: `certificate:${job.id}`, category: "Site", priority: "Today", title: `Check certification for ${job.title}`,
      reason: "No complete, issued or archived certificate is linked to this closed job.", nextStep: "Confirm which certification the work requires and review its evidence before issue.",
      href: jobPath(job.id), actionLabel: "Review job records", dueDate: "", evidence: [`Job status: ${job.status}`, "No completed certificate in loaded records"] });
  }

  // Only assert a timed clash with valid explicit times; missing times need human review.
  const timedVisits = visits.filter((entry) => /^([01]\d|2[0-3]):[0-5]\d$/.test(entry.startTime) && /^([01]\d|2[0-3]):[0-5]\d$/.test(entry.endTime) && entry.startTime < entry.endTime);
  const visitById = new Map(timedVisits.map((entry) => [entry.id, entry]));
  const clashGroups = new Map<string, { a: ScheduledPlannerEntry; b: ScheduledPlannerEntry; kinds: Set<string> }>();
  for (const clash of detectScheduleClashes(timedVisits, [], [])) {
    const ids = [clash.entryId, clash.otherEntryId].sort();
    const key = JSON.stringify(ids);
    const group = clashGroups.get(key) || { a: visitById.get(ids[0])!, b: visitById.get(ids[1])!, kinds: new Set<string>() };
    group.kinds.add(clash.kind.toLowerCase()); clashGroups.set(key, group);
  }
  for (const [key, { a, b, kinds }] of clashGroups) {
    const dueDate = a.date > b.date ? a.date : b.date;
    add({ id: `clash:${key}`, category: "Diary", priority: dueDate <= today ? "Now" : "Today", title: `Resolve ${a.title} / ${b.title}`,
      reason: `Overlapping visits share ${[...kinds].sort().join(", ")}.`, nextStep: "Review both visits in the planner and confirm the assignment or timing.",
      href: "/planner", actionLabel: "Open planner", dueDate,
      evidence: [a, b].map((entry) => `${entry.title} · ${entry.date}${entryEndDate(entry) !== entry.date ? ` to ${entryEndDate(entry)}` : ""} · ${entry.startTime}–${entry.endTime}`) });
  }
  for (const reminder of reminders.filter((item) => !item.completed && assistantDay(item.dueDate) !== null && item.dueDate <= today)) {
    add({ id: `reminder:${reminder.id}`, category: "Reminders", priority: reminder.priority === "Urgent" ? "Now" : "Today", title: reminder.title,
      reason: `Reminder due ${reminder.dueDate}${reminder.dueTime ? ` at ${reminder.dueTime}` : ""}.`, nextStep: "Open the reminder to review it or mark it complete.",
      href: "/ai#today", actionLabel: "Open reminders", dueDate: reminder.dueDate, evidence: [`Priority: ${reminder.priority}`, reminder.notes || "No additional notes"] });
  }
  return { today, actions: actions.toSorted((a, b) => rank[a.priority] - rank[b.priority] || (a.dueDate || "9999").localeCompare(b.dueDate || "9999") || a.id.localeCompare(b.id)) };
}

export function filterAssistantActions(actions: AssistantAction[], focus: AssistantFocus, query: string) {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return actions.filter((action) => (focus === "All" || action.category === focus)
    && words.every((word) => [action.title, action.reason, ...action.evidence].join(" ").toLowerCase().includes(word)));
}
