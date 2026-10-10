import type { Job } from "./models";
import type { AssistantAction } from "./assistantBriefing";
import { isJobOnSiteStatus, normaliseJobStatus } from "./jobManagement-core.mjs";
import { entryEndDate, jobVisitPlan, plannerViewDate, type ScheduledPlannerEntry } from "./scheduling";

/** Planning checks are read-only. A saved job date or survey is not a booked work visit. */
export function assistantVisitActions(jobs: Job[], planner: ScheduledPlannerEntry[], today: string): AssistantAction[] {
  const actions: AssistantAction[] = [];
  for (const job of jobs) {
    const status = normaliseJobStatus(job.status);
    if (!["Accepted", "Awaiting deposit", "Scheduled"].includes(status) && !isJobOnSiteStatus(status)) continue;
    const plan = jobVisitPlan(job.id, planner, today);
    if (plan.upcoming.length && !plan.uncertain.length) continue;
    const review = plan.uncertain.length > 0;
    const count = plan.uncertain.length;
    const nextStep = status === "Awaiting deposit" ? "Review the deposit and customer agreement before agreeing another visit."
      : status === "Awaiting builder" ? "Confirm the builder's access and dependencies before agreeing the next visit."
      : "Review the job, recent diary changes and customer agreement before planning the next work visit.";
    actions.push({ id: `visit-plan:${job.id}`, category: "Diary", priority: review ? "Today" : "Next",
      title: `${review ? "Review work bookings" : "Plan next visit"} for ${job.title}`,
      reason: review ? `${count} linked work booking${count === 1 ? " has" : "s have"} invalid/reversed dates or an unsupported status. Review these before creating another visit.`
        : "No ongoing or future planned/confirmed work visit was found for this accepted or on-site job in the loaded records.",
      nextStep, href: `/jobs/${encodeURIComponent(job.id)}`, actionLabel: "Review job scheduling", dueDate: "", jobIds: [job.id],
      evidence: [`Job status: ${job.status}`, `Address: ${job.siteAddress || "Not recorded"}`, `Checked as of: ${today}`,
        `Saved start: ${plannerViewDate(job.startDate || null) || "Not recorded or invalid"}`, "Job dates alone do not confirm a booked visit.",
        `${plan.upcoming.length} ongoing/future planned or confirmed Job visit(s) recorded. Missing times or assignments still require review.`,
        "Past, completed and cancelled visits, surveys and deliveries do not book the next work visit.",
        ...plan.uncertain.map((entry) => `${entry.title} · Record ${entry.id} · ${entry.status} · ${entry.date || "Start missing"} to ${entryEndDate(entry) || "End missing"}`)] });
  }
  return actions.toSorted((a, b) => (a.priority === "Today" ? 0 : 1) - (b.priority === "Today" ? 0 : 1) || a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
}
