import { buildAssistantBriefing, type AssistantAction, type AssistantRecords } from "./assistantBriefing";
import { assistantDateKey, assistantDay, assistantInvoiceBalance, assistantQuoteFollowUpDue } from "./assistantSignals-core.mjs";
import { isJobInactiveStatus } from "./jobManagement-core.mjs";
import { effectiveInvoicePaid, invoiceGross } from "./payments";
import { entryEndDate } from "./scheduling";

export type AssistantQuestionIntent = "today" | "tomorrow" | "week" | "overdue" | "unpaid" | "quotes" | "site" | "priorities";
export interface AssistantAnswerItem { id: string; title: string; detail: string; evidence: string[]; href: string; actionLabel: string }
export interface AssistantAnswer { recognized: boolean; title: string; summary: string; scope: string; warnings: string[]; items: AssistantAnswerItem[] }

/** Explicit supported question forms; never infer a broad answer from one keyword. */
export function assistantQuestionIntent(question: string): AssistantQuestionIntent | null {
  if (question.length > 180) return null;
  const query = question.toLowerCase().trim().replace(/[’']/g, "").replace(/[?.!]+$/g, "").replace(/\s+/g, " ").replace(/\bfollow-ups\b/g, "follow ups").replace(/^please /, "").replace(/^can you /, "").replace(/^tell me /, "").replace(/ please$/, "").trim();
  const schedule = query.match(/^(?:(?:whats|what is) (?:on|booked|scheduled)|what have i got on|(?:show(?: me)?|list)(?: my)? (?:diary|schedule|bookings|visits)) (today|tomorrow|(?:the )?next (?:7|seven) days)$/);
  if (schedule) return schedule[1] === "today" ? "today" : schedule[1] === "tomorrow" ? "tomorrow" : "week";
  if (/^(?:how much is overdue|(?:what|which) invoices are overdue|show(?: me)? overdue invoices)$/.test(query)) return "overdue";
  if (/^(?:who owes me money|how much am i owed|show(?: me)? unpaid invoices|what is outstanding)$/.test(query)) return "unpaid";
  if (/^(?:(?:which|what) quotes need (?:chasing|following up)|show(?: me)? quote follow ups)$/.test(query)) return "quotes";
  if (/^(?:am i ready for site|what needs preparing for site|show(?: me)? site readiness)$/.test(query)) return "site";
  if (/^(?:what should i do(?: next| today)?|what needs(?: my)? attention(?: today)?|show(?: me)?(?: my)? priorities)$/.test(query)) return "priorities";
  return null;
}

const money = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const plural = (count: number, word: string, pluralWord = `${word}s`) => `${count} ${count === 1 ? word : pluralWord}`;
const actionItem = (action: AssistantAction): AssistantAnswerItem => ({ id: action.id, title: action.title, detail: `${action.reason} ${action.nextStep}`, evidence: [...action.evidence], href: action.href, actionLabel: action.actionLabel });
const dateAt = (day: number) => new Date(day * 86400000).toISOString().slice(0, 10);
const validTime = (time: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(time);

export function answerAssistantQuestion(records: AssistantRecords, question: string, now = new Date(), briefing = buildAssistantBriefing(records, now)): AssistantAnswer | null {
  if (!question.trim()) return null;
  const intent = assistantQuestionIntent(question);
  const today = assistantDateKey(now);
  const day = assistantDay(today);
  if (!intent || day === null) return { recognized: false, title: "Try a supported question", summary: "I could not reliably match that question. Try “What is booked tomorrow?”, “How much is overdue?” or “Which quotes need chasing?”.", scope: "Quick answers use local rules and your loaded records. Use the record search below for a particular job, quote or invoice.", warnings: [], items: [] };

  if (["today", "tomorrow", "week"].includes(intent)) {
    const start = day + (intent === "tomorrow" ? 1 : 0);
    const end = intent === "week" ? day + 6 : start;
    const active = records.planner.filter((entry) => ["Planned", "Confirmed"].includes(entry.status));
    const valid = active.filter((entry) => assistantDay(entry.date) !== null && assistantDay(entryEndDate(entry)) !== null && entry.date <= entryEndDate(entry));
    const visits = valid.filter((entry) => assistantDay(entry.date)! <= end && assistantDay(entryEndDate(entry))! >= start);
    const jobById = new Map(records.jobs.map((job) => [job.id, job]));
    const visitedJobs = new Set(visits.map((visit) => visit.jobId));
    const starts = records.jobs.filter((job) => !isJobInactiveStatus(job.status) && !visitedJobs.has(job.id) && assistantDay(job.startDate) !== null && assistantDay(job.startDate)! >= start && assistantDay(job.startDate)! <= end);
    const items: (AssistantAnswerItem & { order: string })[] = visits.map((visit) => {
      const job = jobById.get(visit.jobId || "");
      const time = validTime(visit.startTime) && validTime(visit.endTime) && visit.startTime < visit.endTime ? `${visit.startTime}–${visit.endTime}` : "Time needs review";
      const date = dateAt(Math.max(start, assistantDay(visit.date)!));
      return { id: `visit:${visit.id}`, title: visit.title, detail: `${date} · ${time} · ${visit.location.trim() || job?.siteAddress.trim() || "Address not recorded"}`,
        evidence: [`Diary status: ${visit.status}`, `Recorded dates: ${visit.date}${entryEndDate(visit) !== visit.date ? ` to ${entryEndDate(visit)}` : ""}`, `${plural(visit.teamMemberIds.length, "worker")} assigned`, ...(job ? [`Linked job: ${job.title} · ${job.status}`] : [])],
        href: `/planner?date=${date}`, actionLabel: "Open this day in planner", order: `${date}:${time === "Time needs review" ? "99:99" : visit.startTime}:${visit.id}` };
    });
    items.push(...starts.map((job) => ({ id: `job:${job.id}`, title: job.title, detail: `${job.startDate} · Job start, visit time not confirmed · ${job.siteAddress || "Address not recorded"}`, evidence: [`Job status: ${job.status}`, "No matching active diary entry in this date range"], href: `/jobs/${encodeURIComponent(job.id)}`, actionLabel: "Review job scheduling", order: `${job.startDate}:99:99:${job.id}` })));
    const warnings = active.length > valid.length ? [`${plural(active.length - valid.length, "diary entry", "diary entries")} with invalid dates could not be placed in a date range.`] : [];
    return { recognized: true, title: intent === "today" ? "Today's work" : intent === "tomorrow" ? "Tomorrow's work" : "Next seven days",
      summary: visits.length || starts.length ? `${plural(visits.length, "diary booking")} and ${plural(starts.length, "job start")} without a matching visit.` : "No active diary bookings or job starts found for this date range in the loaded records.",
      scope: `${dateAt(start)}${end !== start ? ` to ${dateAt(end)} (today plus six days)` : ""}. Planned and confirmed diary entries, including visits spanning these dates, plus active job starts. This does not confirm availability or site readiness.`, warnings,
      items: items.toSorted((a, b) => a.order.localeCompare(b.order)).map((item) => ({ id: item.id, title: item.title, detail: item.detail, evidence: item.evidence, href: item.href, actionLabel: item.actionLabel })) };
  }

  if (intent === "overdue" || intent === "unpaid") {
    let invalidAmounts = 0, missingDates = 0;
    const entries = records.invoices.filter((invoice) => ["Sent", "Part paid", "Overdue"].includes(invoice.status)).flatMap((invoice) => {
      const paid = effectiveInvoicePaid(invoice, records.payments || []);
      const balance = assistantInvoiceBalance(invoice, paid);
      const pence = Math.round(balance * 100);
      if (!Number.isFinite(invoiceGross(invoice)) || invoiceGross(invoice) < 0 || !Number.isFinite(invoice.amountPaid) || invoice.amountPaid < 0 || !Number.isFinite(paid) || !Number.isSafeInteger(pence)) { invalidAmounts++; return []; }
      if (pence <= 0) return [];
      const due = assistantDay(invoice.dueDate);
      if (due === null) missingDates++;
      if (intent === "overdue" && (due === null || due >= day)) return [];
      return [{ invoice, paid, pence, due }];
    }).toSorted((a, b) => (a.due ?? Infinity) - (b.due ?? Infinity) || a.invoice.id.localeCompare(b.invoice.id));
    const totalPence = entries.reduce((sum, entry) => sum + entry.pence, 0);
    const warnings = [...(invalidAmounts ? [`${plural(invalidAmounts, "invoice")} with invalid or unsupported amounts excluded from the total.`] : []), ...(missingDates && intent === "overdue" ? [`${plural(missingDates, "unpaid invoice")} with missing or invalid due dates cannot be classified as overdue.`] : [])];
    return { recognized: true, title: intent === "overdue" ? "Overdue invoices" : "Unpaid invoices",
      summary: Number.isSafeInteger(totalPence) ? `${money.format(totalPence / 100)} across ${plural(entries.length, "invoice")} in the loaded records.` : "The combined amount is outside the supported total range. Review the individual invoices.",
      scope: intent === "overdue" ? `Due before ${today}, with a positive remaining balance after recorded payments. Invoices due today are not overdue.` : "Sent, part-paid or overdue invoices with a positive remaining balance after recorded payments, including invoices not yet due. Draft, paid and cancelled invoices are excluded.", warnings,
      items: entries.map(({ invoice, paid, pence, due }) => ({ id: `invoice:${invoice.id}`, title: `${invoice.number} · ${invoice.title}`, detail: `${money.format(pence / 100)} outstanding · ${due === null ? "Due date needs review" : `Due ${invoice.dueDate}`}`, evidence: [`Status: ${invoice.status}`, `Effective recorded paid: ${money.format(paid)}`, "Invoice and ledger paid amounts are not added together. Check recent payments before contacting the customer."], href: `/invoices?invoice=${encodeURIComponent(invoice.id)}`, actionLabel: "Review invoice" })) };
  }

  const dueQuotes = new Set(records.documents.filter((quote) => assistantQuoteFollowUpDue(quote, now)).map((quote) => `follow-up:${quote.id}`));
  const actions = briefing.actions.filter((action) => intent === "priorities" || (intent === "quotes" ? dueQuotes.has(action.id) : action.id.startsWith("readiness:")));
  return { recognized: true, title: intent === "quotes" ? "Quote follow-ups due" : intent === "site" ? "Site preparation" : "Your next actions",
    summary: actions.length ? `${plural(actions.length, intent === "site" ? "job" : "action")} to review in the loaded records.` : "No matching checks flagged in the loaded records.",
    scope: intent === "quotes" ? "Sent quotes due for follow-up. Saved contact dates and recent recorded contact take precedence; review pricing before following up an expired quote." : intent === "site" ? "Readiness gaps on active jobs and visits in the coming seven days. A clear list does not confirm that access, materials or safety requirements are satisfied." : `Priorities as of ${today}, ranked by urgency and saved evidence.`, warnings: [], items: actions.map(actionItem) };
}
