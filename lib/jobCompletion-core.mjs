function cleanText(value) {
  return String(value ?? "").trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function hasCompletedTesting(testingRecords) {
  return asArray(testingRecords).some((record) => {
    const status = cleanText(record?.status).toLowerCase();
    return status === "complete" || status === "completed" || Boolean(record?.completedAt ?? record?.completed_at);
  });
}

function hasIssuedCertificate(certificates) {
  return asArray(certificates).some((certificate) => {
    const status = cleanText(certificate?.status).toLowerCase();
    return status === "issued" || status === "complete" || status === "completed" || Boolean(certificate?.issuedAt ?? certificate?.issued_at);
  });
}

function hasFinalInvoice(invoices) {
  return asArray(invoices).some((invoice) => {
    const type = cleanText(invoice?.type ?? invoice?.invoiceType ?? invoice?.invoice_type).toLowerCase();
    const status = cleanText(invoice?.status).toLowerCase();
    return type === "final" || status === "sent" || status === "paid" || Boolean(invoice?.finalInvoice ?? invoice?.final_invoice);
  });
}

export function buildJobCompletionWarnings({
  tasks = [],
  variations = [],
  testingRecords = [],
  certificates = [],
  documents = [],
  materials = [],
  timesheets = [],
  invoices = [],
  customerSignOff,
} = {}) {
  const warnings = [];
  const openTasks = asArray(tasks).filter((task) => {
    const status = cleanText(task?.status).toLowerCase();
    return task?.type !== "Snag" && status !== "completed" && status !== "customer confirmed";
  });
  const unresolvedSnags = asArray(tasks).filter((task) => {
    const status = cleanText(task?.status).toLowerCase();
    return task?.type === "Snag" && status !== "completed" && status !== "customer confirmed";
  });
  const unresolvedVariations = asArray(variations).filter((variation) => {
    const status = cleanText(variation?.status).toLowerCase();
    return status === "draft" || status === "sent" || status === "awaiting approval";
  });

  if (openTasks.length) warnings.push({ code: "open-tasks", severity: "warning", count: openTasks.length, message: `${openTasks.length} required task${openTasks.length === 1 ? " is" : "s are"} still open.` });
  if (unresolvedSnags.length) warnings.push({ code: "open-snags", severity: "warning", count: unresolvedSnags.length, message: `${unresolvedSnags.length} snag${unresolvedSnags.length === 1 ? " is" : "s are"} still unresolved.` });
  if (!hasCompletedTesting(testingRecords)) warnings.push({ code: "missing-testing", severity: "warning", count: 1, message: "Testing has not been recorded as complete." });
  if (!hasIssuedCertificate(certificates)) warnings.push({ code: "missing-certificate", severity: "warning", count: 1, message: "A required certificate has not been issued." });
  if (!asArray(documents).some((document) => cleanText(document?.type).toLowerCase().includes("photo")) && !asArray(documents).some((document) => asArray(document?.photos).length > 0)) {
    warnings.push({ code: "missing-photos", severity: "advisory", count: 1, message: "No completion photos are attached." });
  }
  if (!asArray(materials).length) warnings.push({ code: "missing-final-materials", severity: "advisory", count: 1, message: "Final materials have not been recorded." });
  if (!asArray(timesheets).length) warnings.push({ code: "missing-timesheets", severity: "advisory", count: 1, message: "No completed timesheets are linked to this job." });
  if (unresolvedVariations.length) warnings.push({ code: "unresolved-variations", severity: "warning", count: unresolvedVariations.length, message: `${unresolvedVariations.length} variation${unresolvedVariations.length === 1 ? " is" : "s are"} unresolved.` });
  if (!hasFinalInvoice(invoices)) warnings.push({ code: "missing-final-invoice", severity: "advisory", count: 1, message: "A final invoice has not been created." });
  if (!customerSignOff) warnings.push({ code: "missing-sign-off", severity: "advisory", count: 1, message: "Customer sign-off has not been recorded." });

  return warnings;
}

export function jobCompletionReadiness(input = {}) {
  const warnings = buildJobCompletionWarnings(input);
  const blocking = warnings.filter((warning) => warning.severity === "warning");
  return {
    ready: blocking.length === 0,
    warningCount: warnings.length,
    blockingWarningCount: blocking.length,
    warnings,
  };
}

export function completionTimelineEntry({ jobId, timelineId, completedBy, now, warnings = [] }) {
  const unresolved = asArray(warnings).length;
  return {
    id: timelineId,
    jobId,
    milestone: "Job completed",
    eventType: "Completion",
    sourceId: jobId,
    sourceType: "Job",
    note: unresolved
      ? `Job marked complete with ${unresolved} outstanding completion warning${unresolved === 1 ? "" : "s"}.`
      : "Job marked complete with no outstanding completion warnings.",
    completedBy: cleanText(completedBy) || "JR OS",
    completedAt: now,
    createdAt: now,
  };
}
