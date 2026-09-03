export const jobTaskStatuses = ["Open", "In progress", "Completed", "Customer confirmed"];
export const jobTaskTypes = ["Task", "Snag"];

const taskTransitions = {
  Open: ["In progress", "Completed"],
  "In progress": ["Open", "Completed"],
  Completed: ["Open", "In progress", "Customer confirmed"],
  "Customer confirmed": ["Open"],
};

export function isJobTaskStatus(status) {
  return jobTaskStatuses.includes(status);
}

export function normaliseJobTaskStatus(status) {
  return isJobTaskStatus(status) ? status : "Open";
}

export function fieldJobTaskStatusTransitionAllowed(currentStatus, nextStatus) {
  return (currentStatus === "Open" && (nextStatus === "In progress" || nextStatus === "Completed"))
    || (currentStatus === "In progress" && (nextStatus === "Open" || nextStatus === "Completed"));
}

export function isOutstandingJobTask(task) {
  return !["Completed", "Customer confirmed"].includes(normaliseJobTaskStatus(task.status));
}

export function transitionJobTask({ task, nextStatus, now }) {
  if (!isJobTaskStatus(nextStatus)) throw new Error(`Unsupported job task status: ${nextStatus}`);
  const fromStatus = normaliseJobTaskStatus(task.status);
  if (fromStatus === nextStatus) return { ...task, status: nextStatus, updatedAt: now };
  if (!(taskTransitions[fromStatus] ?? []).includes(nextStatus)) {
    throw new Error(`${task.type || "Task"} cannot move from ${fromStatus} to ${nextStatus}.`);
  }

  return {
    ...task,
    status: nextStatus,
    completedAt: nextStatus === "Completed" || nextStatus === "Customer confirmed" ? (task.completedAt || now) : undefined,
    customerConfirmedAt: nextStatus === "Customer confirmed" ? now : undefined,
    updatedAt: now,
  };
}

export function jobTaskTimelineEntry({ task, fromStatus, toStatus, timelineId, completedBy, now }) {
  const type = task.type === "Snag" ? "Snag" : "Task";
  return {
    id: timelineId,
    jobId: task.jobId,
    milestone: "Custom update",
    eventType: type,
    sourceId: task.id,
    sourceType: "JobTask",
    note: `${type} · ${task.title} changed from ${normaliseJobTaskStatus(fromStatus)} to ${toStatus}.`,
    completedBy: completedBy || "JR OS",
    completedAt: now,
    createdAt: now,
  };
}

export function jobTaskCounts(tasks, jobId) {
  const matching = tasks.filter((task) => task.jobId === jobId);
  const outstandingTasks = matching.filter((task) => task.type !== "Snag" && isOutstandingJobTask(task));
  const outstandingSnags = matching.filter((task) => task.type === "Snag" && isOutstandingJobTask(task));
  return {
    total: matching.length,
    outstanding: outstandingTasks.length + outstandingSnags.length,
    outstandingTasks: outstandingTasks.length,
    outstandingSnags: outstandingSnags.length,
    completed: matching.filter((task) => !isOutstandingJobTask(task)).length,
  };
}

export function sortJobTasks(tasks) {
  const priorityRank = { Urgent: 0, High: 1, Normal: 2, Low: 3 };
  const statusRank = { Open: 0, "In progress": 1, Completed: 2, "Customer confirmed": 3 };
  return [...tasks].sort((left, right) => {
    const statusDifference = (statusRank[normaliseJobTaskStatus(left.status)] ?? 9) - (statusRank[normaliseJobTaskStatus(right.status)] ?? 9);
    if (statusDifference) return statusDifference;
    const priorityDifference = (priorityRank[left.priority] ?? 9) - (priorityRank[right.priority] ?? 9);
    if (priorityDifference) return priorityDifference;
    const leftDue = left.dueDate || "9999-12-31";
    const rightDue = right.dueDate || "9999-12-31";
    return leftDue.localeCompare(rightDue) || String(left.createdAt || "").localeCompare(String(right.createdAt || ""));
  });
}
