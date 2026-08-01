export const crmLeadStages = [
  "New Lead",
  "Contacted",
  "Survey Booked",
  "Survey Complete",
  "Quote Sent",
  "Follow-up Due",
  "Accepted",
  "Lost",
  "Completed",
  "Cancelled",
];

const legacyStages = {
  "New enquiry": "New Lead",
  "Survey booked": "Survey Booked",
  "Quote required": "Survey Complete",
  "Quote sent": "Quote Sent",
  Won: "Accepted",
};

export function normaliseLeadStage(stage) {
  if (crmLeadStages.includes(stage)) return stage;
  return legacyStages[stage] ?? "New Lead";
}

export function moveLeadStage(stage, direction) {
  const current = crmLeadStages.indexOf(normaliseLeadStage(stage));
  const next = Math.max(0, Math.min(crmLeadStages.length - 1, current + direction));
  return crmLeadStages[next];
}

export function ageInDays(value, now = new Date()) {
  if (!value) return 0;
  const timestamp = new Date(value.length === 10 ? `${value}T12:00:00` : value).getTime();
  if (!Number.isFinite(timestamp)) return 0;
  return Math.max(0, Math.floor((now.getTime() - timestamp) / 86_400_000));
}

export function repeatCustomerScore({ completedJobs = 0, acceptedQuotes = 0, paidInvoices = 0, interactions = 0, reviewReceived = false }) {
  return Math.min(100,
    Math.min(45, completedJobs * 20)
    + Math.min(20, acceptedQuotes * 10)
    + Math.min(20, paidInvoices * 10)
    + Math.min(10, interactions * 2)
    + (reviewReceived ? 5 : 0));
}

export function followUpPriority({ ageDays = 0, estimatedValue = 0, highValueThreshold = 1000, priority = "Normal", overdue = false, contactable = true }) {
  const priorityBoost = { Low: 0, Normal: 8, High: 18, Urgent: 28 }[priority] ?? 8;
  const valueBoost = estimatedValue >= highValueThreshold ? 18 : estimatedValue >= highValueThreshold / 2 ? 9 : 0;
  return Math.min(100, 25 + Math.min(25, ageDays * 3) + priorityBoost + valueBoost + (overdue ? 12 : 0) - (contactable ? 0 : 15));
}
