const onSiteStatuses = new Set(["First fix", "Second fix", "Testing"]);

export function buildMobileJobReadiness(input) {
  const checks = [
    { id: "schedule", label: "Visit scheduled", ready: Boolean(input.hasSchedule), href: "/field/day-planner" },
    { id: "contact", label: "Customer contact available", ready: Boolean(input.hasContact), href: input.jobHref || "/field/jobs" },
    { id: "materials", label: "Materials prepared", ready: Boolean(input.hasMaterials), href: "/field/materials" },
    { id: "testing", label: "Testing record started", ready: Boolean(input.hasTesting), href: "/field/testing" },
  ];
  const readyCount = checks.filter((check) => check.ready).length;
  return {
    checks,
    readyCount,
    totalCount: checks.length,
    percentage: Math.round((readyCount / checks.length) * 100),
    blockers: checks.filter((check) => !check.ready),
  };
}

export function mobileJobView(job, today) {
  if (job.startDate === today || onSiteStatuses.has(job.status)) return "today";
  if (job.startDate && job.startDate > today) return "upcoming";
  return "attention";
}

export function mobileJobPriority(job, today) {
  if (job.startDate === today) return 0;
  const view = mobileJobView(job, today);
  if (view === "today") return 1;
  if (view === "upcoming") return 2;
  return 3;
}
