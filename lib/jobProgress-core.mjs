const progressKeys = [
  "overall",
  "firstFix",
  "secondFix",
  "testing",
  "certificates",
  "materials",
  "payments",
];

function clampPercentage(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.min(100, Math.max(0, Math.round(number)));
}

export function normaliseJobProgress(progress = {}) {
  return progressKeys.reduce((result, key) => {
    result[key] = clampPercentage(progress[key]);
    return result;
  }, {});
}

export function updateManualJobProgress(progress, updates, now, updatedBy = "JR OS") {
  const current = normaliseJobProgress(progress);
  const next = normaliseJobProgress({ ...current, ...updates });

  return {
    ...next,
    source: "Manual",
    updatedAt: now,
    updatedBy,
  };
}

export function suggestJobProgress({ status, taskCounts = {}, testingComplete = false, certificateIssued = false, materialsReady = false, amountPaid = 0, contractValue = 0 }) {
  const statusProgress = {
    Enquiry: 0,
    "Survey required": 5,
    Quoted: 10,
    Accepted: 15,
    "Awaiting deposit": 18,
    Scheduled: 20,
    "First fix": 35,
    "Awaiting builder": 45,
    "Second fix": 60,
    Testing: 75,
    Snagging: 85,
    Complete: 95,
    Invoiced: 98,
    Paid: 100,
    "On hold": 0,
    Cancelled: 0,
  };

  const outstanding = Number(taskCounts.outstanding ?? 0);
  const completed = Number(taskCounts.completed ?? 0);
  const taskTotal = Math.max(0, outstanding + completed);
  const taskProgress = taskTotal ? (completed / taskTotal) * 100 : null;
  const paymentProgress = contractValue > 0 ? (amountPaid / contractValue) * 100 : 0;

  const suggestion = normaliseJobProgress({
    overall: taskProgress === null ? statusProgress[status] ?? 0 : ((statusProgress[status] ?? 0) + taskProgress) / 2,
    firstFix: ["First fix", "Awaiting builder", "Second fix", "Testing", "Snagging", "Complete", "Invoiced", "Paid"].includes(status) ? 100 : 0,
    secondFix: ["Testing", "Snagging", "Complete", "Invoiced", "Paid"].includes(status) ? 100 : status === "Second fix" ? 50 : 0,
    testing: testingComplete ? 100 : status === "Testing" ? 50 : 0,
    certificates: certificateIssued ? 100 : 0,
    materials: materialsReady ? 100 : 0,
    payments: paymentProgress,
  });

  return {
    ...suggestion,
    source: "Suggested",
    explanation: "Suggested from job status and available operational records. Review before saving.",
  };
}

export function jobProgressWarnings(progress) {
  const value = normaliseJobProgress(progress);
  const warnings = [];
  if (value.testing < 100) warnings.push("Testing is not recorded as complete.");
  if (value.certificates < 100) warnings.push("Required certificates may still be outstanding.");
  if (value.materials < 100) warnings.push("Final materials are not confirmed as complete.");
  if (value.payments < 100) warnings.push("The contract is not fully paid.");
  return warnings;
}
