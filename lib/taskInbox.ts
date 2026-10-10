import type { Job, JobTask } from "./models";
import { isOutstandingJobTask, sortJobTasks } from "./jobTasks-core.mjs";
import { assistantDateKey, assistantDay } from "./assistantSignals-core.mjs";

export const taskInboxFilters = ["Open", "Due", "Snags", "Completed", "All"] as const;
export type TaskInboxFilter = typeof taskInboxFilters[number];

export function taskMatchesInboxFilter(task: JobTask, filter: TaskInboxFilter, today: string) {
  const open = isOutstandingJobTask(task);
  const due = assistantDay(task.dueDate);
  const day = assistantDay(today);
  if (filter === "Open") return open;
  if (filter === "Due") return open && due !== null && day !== null && due <= day;
  if (filter === "Snags") return open && task.type === "Snag";
  if (filter === "Completed") return !open;
  return true;
}

export function filterTaskInbox(tasks: JobTask[], jobs: Job[], options: { jobId: string; filter: TaskInboxFilter; query: string; today: string }) {
  const jobById = new Map(jobs.map((job) => [job.id, job]));
  const words = options.query.toLocaleLowerCase("en-GB").trim().split(/\s+/).filter(Boolean);
  return sortJobTasks(tasks.filter((task) => {
    const job = jobById.get(task.jobId);
    const haystack = [task.title, task.description, task.category, task.notes, job?.title, job?.siteAddress].join(" ").toLocaleLowerCase("en-GB");
    return (!options.jobId || task.jobId === options.jobId) && taskMatchesInboxFilter(task, options.filter, options.today) && words.every((word) => haystack.includes(word));
  }));
}

/** Resolve only records already loaded for this account; a bad link never opens a different task. */
export function resolveTaskInboxLink(tasks: JobTask[], jobs: Job[], search: string) {
  const params = new URLSearchParams(search);
  const taskId = params.get("task") || "";
  const jobId = params.get("job") || "";
  const task = tasks.find((item) => item.id === taskId);
  const missing = Boolean(taskId ? !task || (jobId && task.jobId !== jobId) : jobId && !jobs.some((job) => job.id === jobId));
  return { taskId: missing ? "" : taskId, jobId: missing ? "" : jobs.some((job) => job.id === (task?.jobId || jobId)) ? task?.jobId || jobId : "", missing };
}

export function taskReviewSignal(task: JobTask, now: Date) {
  if (!isOutstandingJobTask(task)) return null;
  const today = assistantDay(assistantDateKey(now));
  const due = assistantDay(task.dueDate);
  const reasons = [
    task.priority === "Urgent" ? "Saved priority is Urgent." : "",
    task.category === "Safety" ? "An open task is categorised as Safety; review the recorded issue." : "",
    today !== null && due !== null && due < today ? `The saved due date (${task.dueDate}) has passed.` : "",
    today !== null && due !== null && due === today ? "The saved due date is today." : "",
  ].filter(Boolean);
  const priority = reasons.length && (task.priority === "Urgent" || task.category === "Safety" || (today !== null && due !== null && due < today)) ? "Now" : (due !== null && due === today) || task.priority === "High" ? "Today" : "Next";
  const attention = priority !== "Next" || (today !== null && due !== null && due <= today + 6);
  return { priority: priority as "Now" | "Today" | "Next", attention, reason: reasons.join(" ") || (task.priority === "High" ? "Saved priority is High." : due === null ? "No valid due date is recorded. Review when this work is needed." : `Open work is due ${task.dueDate}.`) };
}
