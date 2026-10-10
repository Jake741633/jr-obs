import type { AssistantAction } from "./assistantBriefing";
import type { Job, JobTask } from "./models";
import { assistantDay } from "./assistantSignals-core.mjs";
import { isJobTaskStatus } from "./jobTasks-core.mjs";
import { taskReviewSignal } from "./taskInbox";

export function assistantTaskActions(tasks: JobTask[], jobs: Job[], now: Date, onlyAttention = true, canOpenTaskWorkspace = true): AssistantAction[] {
  const jobById = new Map(jobs.map((job) => [job.id, job]));
  const rank = { Now: 0, Today: 1, Next: 2 };
  return tasks.flatMap((task): AssistantAction[] => {
    const signal = taskReviewSignal(task, now);
    if (!signal || (onlyAttention && !signal.attention)) return [];
    const job = jobById.get(task.jobId);
    return [{ id: `task:${task.id}`, category: "Tasks", priority: signal.priority, title: `${task.type === "Snag" ? "Snag" : "Task"}: ${task.title}`,
      reason: signal.reason, nextStep: canOpenTaskWorkspace ? "Open the task, check the site position and record any update through the task workspace." : "Review the linked job and site position. Task updates use Tasks & Snagging through an owner or admin.",
      href: canOpenTaskWorkspace ? `/job-tasks?job=${encodeURIComponent(task.jobId)}&task=${encodeURIComponent(task.id)}` : job ? `/jobs/${encodeURIComponent(job.id)}` : "/jobs", actionLabel: canOpenTaskWorkspace ? "Review this task" : job ? "Review linked job" : "Find the linked job",
      jobIds: [task.jobId], dueDate: assistantDay(task.dueDate) === null ? "" : task.dueDate,
      evidence: [job ? `Job: ${job.title} · ${job.status}` : "Linked job was not found in the loaded records; review the task's job link.", `Status: ${task.status}${isJobTaskStatus(task.status) ? "" : " · needs review"}`, `Saved priority: ${task.priority}`, `Category: ${task.category}`, `Due: ${assistantDay(task.dueDate) === null ? "Not recorded or invalid" : task.dueDate}`, task.assignedTo ? "An assignee is recorded; check their current availability." : "No assignee recorded", ...(task.description ? [task.description] : [])] }];
  }).toSorted((a, b) => rank[a.priority] - rank[b.priority] || (a.dueDate || "9999").localeCompare(b.dueDate || "9999") || a.id.localeCompare(b.id));
}
