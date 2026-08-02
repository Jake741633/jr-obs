export function buildMobileJobReadiness(input) {
  const checks = [
    { id: "schedule", label: "Visit scheduled", ready: Boolean(input.hasSchedule), href: "/planner" },
    { id: "contact", label: "Customer contact available", ready: Boolean(input.hasContact), href: input.customerHref || "/customers" },
    { id: "pricing", label: "Accepted pricing linked", ready: Boolean(input.hasAcceptedPricing), href: input.pricingHref || "/quotes" },
    { id: "materials", label: "Materials prepared", ready: Boolean(input.hasMaterials), href: "/field/materials" },
    { id: "rams", label: "RAMS available", ready: Boolean(input.hasRams), href: "/rams" },
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

export function mobileJobPriority(job, today) {
  if (job.startDate === today) return 0;
  if (["First fix", "Second fix", "Testing"].includes(job.status)) return 1;
  if (job.startDate && job.startDate > today) return 2;
  return 3;
}
