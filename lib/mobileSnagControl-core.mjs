import { isOutstandingJobTask } from "./jobTasks-core.mjs";

export const snagCategories = ["General", "First fix", "Second fix", "Testing", "Certificate", "Materials", "Handover", "Safety", "Other"];

export function snagSummary(tasks, jobId, today = new Date().toISOString().slice(0, 10)) {
  const snags = tasks.filter((task) => task.jobId === jobId && task.type === "Snag");
  const outstanding = snags.filter(isOutstandingJobTask);
  return {
    total: snags.length,
    outstanding: outstanding.length,
    completed: snags.length - outstanding.length,
    overdue: outstanding.filter((task) => task.dueDate && task.dueDate < today).length,
    urgent: outstanding.filter((task) => task.priority === "Urgent").length,
  };
}

export function prioritiseSnags(tasks, today = new Date().toISOString().slice(0, 10)) {
  const priorityRank = { Urgent: 0, High: 1, Normal: 2, Low: 3 };
  return [...tasks]
    .filter((task) => task.type === "Snag")
    .sort((left, right) => {
      const leftComplete = isOutstandingJobTask(left) ? 0 : 1;
      const rightComplete = isOutstandingJobTask(right) ? 0 : 1;
      if (leftComplete !== rightComplete) return leftComplete - rightComplete;
      const leftOverdue = left.dueDate && left.dueDate < today ? 0 : 1;
      const rightOverdue = right.dueDate && right.dueDate < today ? 0 : 1;
      if (leftOverdue !== rightOverdue) return leftOverdue - rightOverdue;
      const priorityDifference = (priorityRank[left.priority] ?? 9) - (priorityRank[right.priority] ?? 9);
      if (priorityDifference) return priorityDifference;
      return String(left.dueDate || "9999-12-31").localeCompare(String(right.dueDate || "9999-12-31"));
    });
}
