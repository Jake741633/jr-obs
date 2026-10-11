import type { AssistantAction } from "./assistantBriefing";
import type { Job, JobTask } from "./models";
import { assistantDay } from "./assistantSignals-core.mjs";
import { isJobTaskStatus, isOutstandingJobTask } from "./jobTasks-core.mjs";
import { taskReviewHref, taskReviewSignal } from "./taskInbox";
import { savedIdentityIndex, hasSavedIdentity } from "./assistantIdentity";

const rank = { Now: 0, Today: 1, Next: 2 };
const recorded = (value: unknown, fallback: string) => typeof value === "string" && value.trim() ? value : fallback;

/** Validate every loaded identity before narrowing to one job, task type or status. */
export function assistantTaskSnapshot(tasks: JobTask[], jobs: Job[], now: Date, options: { onlyAttention?: boolean; canOpenTaskWorkspace?: boolean; jobId?: string; snagsOnly?: boolean } = {}) {
  const { onlyAttention = true, canOpenTaskWorkspace = true, jobId, snagsOnly = false } = options;
  const taskIndex = savedIdentityIndex(tasks), jobIndex = savedIdentityIndex(jobs);
  const scoped = tasks.filter((task) => jobId === undefined || task.jobId === jobId);
  const groups = new Map<string | null, JobTask[]>();
  for (const task of scoped) {
    const id = hasSavedIdentity(task.id) ? task.id : null;
    const copies = groups.get(id);
    if (copies) copies.push(task); else groups.set(id, [task]);
  }
  const actions: AssistantAction[] = [];
  let openCount = 0, reviewCount = 0;
  const jobFact = (task: JobTask) => {
    const job = jobIndex.unique.get(task.jobId);
    return job ? `Job: ${job.title} · ${job.status}` : (jobIndex.counts.get(task.jobId) || 0) > 1 ? "Linked job identity is ambiguous; no job copy was chosen." : "Linked job was not found in the loaded records; review the task's job link.";
  };
  for (const [id, copies] of groups) {
    const relevant = copies.filter((task) => isOutstandingJobTask(task) && (!snagsOnly || task.type === "Snag"));
    if (!relevant.length) continue;
    if (id === null || taskIndex.counts.get(id) !== 1) {
      reviewCount++;
      const urgent = relevant.some((task) => taskReviewSignal(task, now)?.priority === "Now");
      actions.push({ id: `task-source:${JSON.stringify(id)}`, category: "Tasks", priority: urgent ? "Now" : "Today", title: "Task identity needs review",
        reason: id === null ? "Saved task identities are missing. Their open-work counts are withheld." : `${taskIndex.counts.get(id)} loaded tasks share one identity. Their open-work counts are withheld.`,
        nextStep: canOpenTaskWorkspace ? "Review the saved task copies before changing status. No copy was chosen as authoritative." : "Ask an owner or admin to review the saved task copies in Tasks & Snagging before changing status.",
        href: canOpenTaskWorkspace ? "/job-tasks" : jobId && jobIndex.unique.has(jobId) ? `/jobs/${encodeURIComponent(jobId)}` : "/jobs", actionLabel: canOpenTaskWorkspace ? "Review task inbox" : "Review job records", dueDate: "",
        jobIds: [...new Set(copies.map((task) => task.jobId).filter(hasSavedIdentity))],
        evidence: [id === null ? "Task identity not recorded" : `Saved identity: ${id}`, ...copies.map((task) => `${recorded(task.type, "Type not recorded")}: ${recorded(task.title, "Untitled task")} · Status: ${recorded(task.status, "Not recorded")} · Priority: ${recorded(task.priority, "Not recorded")} · Category: ${recorded(task.category, "Not recorded")} · Due: ${recorded(task.dueDate, "Not recorded")} · ${jobFact(task)}`).sort(), "Only copies within the requested job scope are described; identity checks use all loaded tasks, including closed work."] });
      continue;
    }
    const task = relevant[0];
    const signal = taskReviewSignal(task, now)!;
    if (onlyAttention && !signal.attention) continue;
    openCount++;
    const job = jobIndex.unique.get(task.jobId);
    const href = canOpenTaskWorkspace ? taskReviewHref(task) : job ? `/jobs/${encodeURIComponent(job.id)}` : "/jobs";
    actions.push({ id: `task:${task.id}`, category: "Tasks", priority: signal.priority, title: `${task.type === "Snag" ? "Snag" : "Task"}: ${task.title}`,
      reason: signal.reason, nextStep: canOpenTaskWorkspace ? "Open the task, check the site position and record any update through the task workspace." : "Review the linked job and site position. Task updates use Tasks & Snagging through an owner or admin.",
      href, actionLabel: canOpenTaskWorkspace ? href === "/job-tasks" ? "Review task inbox" : "Review this task" : job ? "Review linked job" : "Find the linked job",
      jobIds: [task.jobId], dueDate: assistantDay(task.dueDate) === null ? "" : task.dueDate,
      evidence: [jobFact(task), `Status: ${task.status}${isJobTaskStatus(task.status) ? "" : " · needs review"}`, `Saved priority: ${task.priority}`, `Category: ${task.category}`, `Due: ${assistantDay(task.dueDate) === null ? "Not recorded or invalid" : task.dueDate}`, task.assignedTo ? "An assignee is recorded; check their current availability." : "No assignee recorded", ...(task.description ? [task.description] : [])] });
  }
  const warnings = reviewCount ? [`${reviewCount} task identity review(s) excluded from the open-work count. The count is incomplete until missing or conflicting identities are reviewed.`] : [];
  return { actions: actions.toSorted((a, b) => rank[a.priority] - rank[b.priority] || (a.dueDate || "9999").localeCompare(b.dueDate || "9999") || a.id.localeCompare(b.id)), openCount, reviewCount, warnings };
}

export function assistantTaskActions(tasks: JobTask[], jobs: Job[], now: Date, onlyAttention = true, canOpenTaskWorkspace = true): AssistantAction[] {
  return assistantTaskSnapshot(tasks, jobs, now, { onlyAttention, canOpenTaskWorkspace }).actions;
}
