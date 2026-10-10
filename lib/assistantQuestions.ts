import { buildAssistantBriefing, type AssistantAction, type AssistantRecords } from "./assistantBriefing";
import { assistantDateKey, assistantDay, assistantInvoiceBalance, assistantQuoteFollowUpDue } from "./assistantSignals-core.mjs";
import { isJobInactiveStatus } from "./jobManagement-core.mjs";
import { effectiveInvoicePaid, invoiceGross } from "./payments";
import { entryEndDate } from "./scheduling";
import { assistantTaskActions } from "./assistantTasks";

export type AssistantQuestionIntent = "today" | "tomorrow" | "week" | "overdue" | "unpaid" | "quotes" | "site" | "priorities" | "tasks" | "snags" | "job";
export interface AssistantAnswerItem { id: string; title: string; detail: string; evidence: string[]; href: string; actionLabel: string }
export interface AssistantJobChoice { id: string; title: string; address: string; status: string }
export interface AssistantAnswer { recognized: boolean; title: string; summary: string; scope: string; warnings: string[]; items: AssistantAnswerItem[]; jobChoices?: AssistantJobChoice[]; resolvedJobId?: string }

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
  if (/^(?:(?:show(?: me)? )?(?:a |the |my )?job briefing|brief this job)$/.test(query)) return "job";
  if (/^(?:(?:show(?: me)?|list)(?: my)? (?:open |outstanding )?tasks|what tasks (?:are open|are outstanding|need doing))$/.test(query)) return "tasks";
  if (/^(?:(?:show(?: me)?|list)(?: my)? (?:open |outstanding )?snags|what snags (?:are open|are outstanding|need fixing))$/.test(query)) return "snags";
  return null;
}

const money = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const plural = (count: number, word: string, pluralWord = `${word}s`) => `${count} ${count === 1 ? word : pluralWord}`;
const actionItem = (action: AssistantAction): AssistantAnswerItem => ({ id: action.id, title: action.title, detail: `${action.reason} ${action.nextStep}`, evidence: [...action.evidence], href: action.href, actionLabel: action.actionLabel });
const dateAt = (day: number) => new Date(day * 86400000).toISOString().slice(0, 10);
const validTime = (time: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
const jobKey = (value: string) => value.trim().replace(/\s+/g, " ").replace(/’/g, "'").toLocaleLowerCase("en-GB");

function namedJobQuestion(question: string) {
  if (question.length > 180) return null;
  const query = question.trim().replace(/\s+/g, " ").replace(/^please /i, "").replace(/^can you /i, "").replace(/^tell me /i, "").replace(/ please[?.!]*$/i, "");
  const match = query.match(/^(.+?) (?:for|at) (.+)$/i);
  if (!match) return null;
  const parsedIntent = assistantQuestionIntent(match[1]);
  const intent = parsedIntent === "priorities" ? "job" : parsedIntent;
  if (intent !== "tasks" && intent !== "snags" && intent !== "job") return null;
  const raw = match[2].trim();
  const quoted = raw.match(/^["“](.+)["”][?.!]*$/);
  const label = quoted ? quoted[1].trim() : raw.replace(/[?.!]+$/, "").trim();
  // Preserve punctuation-bearing saved names as candidates too. Ambiguity is
  // resolved by the user; an exact title never silently outranks an address.
  const keys = new Set([jobKey(quoted ? quoted[1] : raw), jobKey(label)].filter(Boolean));
  return label && keys.size ? { intent, label, keys } : null;
}

export function answerAssistantQuestion(records: AssistantRecords, question: string, now = new Date(), briefing?: { today: string; actions: AssistantAction[] }, selectedJobId = "", canOpenTaskWorkspace = true): AssistantAnswer | null {
  if (!question.trim()) return null;
  const namedJob = namedJobQuestion(question);
  const intent = namedJob?.intent ?? assistantQuestionIntent(question);
  const today = assistantDateKey(now);
  const day = assistantDay(today);
  if (!intent || day === null) return { recognized: false, title: "Try a supported question", summary: "I could not reliably match that question. Try “What is booked tomorrow?”, “How much is overdue?” or “Which quotes need chasing?”.", scope: "Quick answers use local rules and your loaded records. Use the record search below for a particular job, quote or invoice.", warnings: [], items: [] };

  if (intent === "tasks" || intent === "snags" || intent === "job") {
    const matchingJobs = namedJob ? records.jobs.filter((job) => namedJob.keys.has(jobKey(job.title)) || (job.siteAddress.trim() && namedJob.keys.has(jobKey(job.siteAddress)))) : records.jobs;
    const selectedJob = selectedJobId ? matchingJobs.find((job) => job.id === selectedJobId) : namedJob && matchingJobs.length === 1 ? matchingJobs[0] : undefined;
    const needsChoice = Boolean((namedJob || intent === "job") && !selectedJob);
    if (needsChoice || (selectedJobId && !selectedJob)) {
      const choices = matchingJobs.toSorted((a, b) => a.title.localeCompare(b.title) || a.siteAddress.localeCompare(b.siteAddress) || a.id.localeCompare(b.id)).map((job) => ({ id: job.id, title: job.title, address: job.siteAddress, status: job.status }));
      const showChoices = Boolean(namedJob || (intent === "job" && !selectedJobId));
      return { recognized: true, title: showChoices && choices.length ? "Choose a job" : "Job unavailable",
        summary: namedJob ? choices.length ? `${plural(choices.length, "loaded job")} ${choices.length === 1 ? "matches" : "match"} “${namedJob.label}”. Choose a job before I show its records.` : `No exact saved job name or site address matches “${namedJob.label}”.` : selectedJobId ? "The selected job is no longer available in the loaded records." : records.jobs.length ? "Choose one loaded job for its briefing." : "No job records are available for a briefing.",
        scope: "Job names and site addresses must match in full, ignoring case and repeated spaces. I have not broadened this answer to other jobs.",
        warnings: selectedJobId ? ["The previous selection is unavailable or no longer matches this question. Choose a current record or clear the job scope."] : [], items: [], jobChoices: showChoices ? choices : [] };
    }
    if (intent === "job" && selectedJob) {
      const jobId = selectedJob.id;
      const actions = (briefing ?? buildAssistantBriefing(records, now, canOpenTaskWorkspace)).actions.filter((action) => action.jobIds?.includes(jobId));
      const scopedInvoices = records.invoices.filter((invoice) => invoice.jobId === jobId);
      const unpaid = answerAssistantQuestion({ ...records, invoices: scopedInvoices }, "Show unpaid invoices", now)!;
      const openTasks = assistantTaskActions((records.tasks || []).filter((task) => task.jobId === jobId), records.jobs, now, false, canOpenTaskWorkspace);
      const activeVisits = records.planner.filter((visit) => visit.jobId === jobId && ["Planned", "Confirmed"].includes(visit.status));
      const validVisits = activeVisits.filter((visit) => assistantDay(visit.date) !== null && assistantDay(entryEndDate(visit)) !== null && visit.date <= entryEndDate(visit));
      const visits = validVisits.filter((visit) => entryEndDate(visit) >= today).toSorted((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime) || a.id.localeCompare(b.id));
      const warnings = [...unpaid.warnings];
      if (records.tasks === undefined) warnings.push("Task records are not ready for this briefing; their absence does not mean no work remains.");
      if (activeVisits.length !== validVisits.length) warnings.push(`${plural(activeVisits.length - validVisits.length, "linked visit")} with invalid or reversed dates excluded. Review the job and diary.`);
      const context: AssistantAnswerItem = { id: `job:${jobId}`, title: selectedJob.title, detail: `Job status: ${selectedJob.status} · ${selectedJob.siteAddress || "Address not recorded"}`,
        evidence: [`Saved start: ${assistantDay(selectedJob.startDate) === null ? "Not recorded or invalid" : selectedJob.startDate}`, `Saved target completion: ${assistantDay(selectedJob.targetCompletionDate) === null ? "Not recorded or invalid" : selectedJob.targetCompletionDate}`, "Job dates alone do not confirm a booked visit."], href: `/jobs/${encodeURIComponent(jobId)}`, actionLabel: "Review job details" };
      const visitItems: AssistantAnswerItem[] = visits.map((visit) => ({ id: `visit:${visit.id}`, title: visit.title,
        detail: `${visit.date}${entryEndDate(visit) !== visit.date ? ` to ${entryEndDate(visit)}` : ""} · ${validTime(visit.startTime) && validTime(visit.endTime) && visit.startTime < visit.endTime ? `${visit.startTime}–${visit.endTime}` : "Time needs review"}`,
        evidence: [`Visit status: ${visit.status}`, `Address: ${visit.location || selectedJob.siteAddress || "Not recorded"}`, `${visit.teamMemberIds.length} assigned to this visit`, "A saved visit does not confirm availability or site readiness."], href: `/planner?date=${visit.date < today ? today : visit.date}`, actionLabel: "Review visit day" }));
      const items = new Map<string, AssistantAnswerItem>();
      // Keep ranked checks first; add all unpaid invoices and future/undated tasks once.
      for (const item of [...actions.map(actionItem), context, ...unpaid.items, ...visitItems, ...openTasks.map(actionItem)]) if (!items.has(item.id)) items.set(item.id, item);
      return { recognized: true, title: `Job briefing · ${selectedJob.title}`, resolvedJobId: jobId,
        summary: `${plural(actions.length, "priority check")} · ${records.tasks === undefined ? "Task records not ready" : plural(openTasks.length, "open task or snag", "open tasks and snags")} · ${plural(visits.length, "upcoming or ongoing visit")} in the loaded records.`,
        scope: `Only records explicitly linked to ${selectedJob.title} · ${selectedJob.siteAddress || "Address not recorded"} · Job status: ${selectedJob.status}. Diary clash checks retain the other affected visit. Priorities check site visits through ${dateAt(day + 6)}; later bookings and future or undated tasks are also listed. Billing includes loaded unpaid invoices after recorded payments. This is not a site inspection, confirmation of electrical compliance, or clearance to travel.`, warnings, items: [...items.values()] };
    }
    const tasks = (records.tasks || []).filter((task) => (!selectedJob || task.jobId === selectedJob.id) && (intent !== "snags" || task.type === "Snag"));
    const actions = assistantTaskActions(tasks, records.jobs, now, false, canOpenTaskWorkspace);
    return { recognized: true, title: `${intent === "snags" ? "Open snags" : "Open tasks and snags"}${selectedJob ? ` · ${selectedJob.title}` : ""}`, summary: records.tasks === undefined ? "Task records are not ready for this answer." : `${plural(actions.length, "open item")} in the loaded records.`, scope: `${selectedJob ? `Only ${selectedJob.title} · ${selectedJob.siteAddress || "Address not recorded"} · Job status: ${selectedJob.status}. ` : "All loaded jobs. "}Includes future and undated work. Saved urgency, Safety category and past due dates come first. Completed and customer-confirmed items are excluded. These are recorded tasks, not a site inspection or safety assessment.`, warnings: records.tasks === undefined ? ["Task records have not been supplied. Open Tasks & Snagging to review them."] : [], items: actions.map(actionItem), ...(selectedJob ? { resolvedJobId: selectedJob.id } : {}) };
  }

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
  const actions = (briefing ?? buildAssistantBriefing(records, now, canOpenTaskWorkspace)).actions.filter((action) => intent === "priorities" || (intent === "quotes" ? dueQuotes.has(action.id) : action.id.startsWith("readiness:")));
  return { recognized: true, title: intent === "quotes" ? "Quote follow-ups due" : intent === "site" ? "Site preparation" : "Your next actions",
    summary: actions.length ? `${plural(actions.length, intent === "site" ? "job" : "action")} to review in the loaded records.` : "No matching checks flagged in the loaded records.",
    scope: intent === "quotes" ? "Sent quotes due for follow-up. Saved contact dates and recent recorded contact take precedence; review pricing before following up an expired quote." : intent === "site" ? "Readiness gaps on active jobs and visits in the coming seven days. A clear list does not confirm that access, materials or safety requirements are satisfied." : `Priorities as of ${today}, ranked by urgency and saved evidence.`, warnings: [], items: actions.map(actionItem) };
}
