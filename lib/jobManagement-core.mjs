export const canonicalJobStatuses = [
  "Enquiry",
  "Survey required",
  "Quoted",
  "Accepted",
  "Awaiting deposit",
  "Scheduled",
  "First fix",
  "Awaiting builder",
  "Second fix",
  "Testing",
  "Snagging",
  "Complete",
  "Invoiced",
  "Paid",
  "On hold",
  "Cancelled",
];

const legacyStatusMap = {
  Lead: "Enquiry",
  "In progress": "First fix",
};

const closedStatuses = new Set(["Complete", "Invoiced", "Paid", "Cancelled"]);
const inactiveStatuses = new Set([...closedStatuses, "On hold"]);
const onSiteStatuses = new Set(["First fix", "Awaiting builder", "Second fix", "Testing", "Snagging"]);

export function normaliseJobStatus(status) {
  if (canonicalJobStatuses.includes(status)) return status;
  return legacyStatusMap[status] ?? "Enquiry";
}

const noFieldJobStatusTransitions = Object.freeze([]);
const fieldJobStatusTransitionGraph = Object.freeze({
  Scheduled: Object.freeze(["First fix"]),
  "First fix": Object.freeze(["Awaiting builder", "Second fix"]),
  "Awaiting builder": Object.freeze(["First fix", "Second fix"]),
  "Second fix": Object.freeze(["Testing"]),
  Testing: Object.freeze(["Snagging", "Complete"]),
  Snagging: Object.freeze(["Testing", "Complete"]),
});

export function normaliseFieldJobStatus(status) {
  return normaliseJobStatus(typeof status === "string" ? status.replace(/^ +| +$/g, "") : status);
}

export function fieldJobStatusTransitions(status) {
  return fieldJobStatusTransitionGraph[normaliseFieldJobStatus(status)] ?? noFieldJobStatusTransitions;
}

export function fieldJobStatusTransitionAllowed(currentStatus, requestedStatus) {
  return fieldJobStatusTransitions(currentStatus).includes(normaliseFieldJobStatus(requestedStatus));
}

export function isCanonicalJobStatus(status) {
  return canonicalJobStatuses.includes(status);
}

export function isJobClosedStatus(status) {
  return closedStatuses.has(normaliseJobStatus(status));
}

export function isJobInactiveStatus(status) {
  return inactiveStatuses.has(normaliseJobStatus(status));
}

export function isJobOnSiteStatus(status) {
  return onSiteStatuses.has(normaliseJobStatus(status));
}

export function transitionJobStatus({ job, nextStatus, now, timelineId, completedBy }) {
  if (!isCanonicalJobStatus(nextStatus)) throw new Error(`Unsupported job status: ${nextStatus}`);
  const fromStatus = normaliseJobStatus(job.status);
  const updatedJob = { ...job, status: nextStatus, updatedAt: now };
  if (fromStatus === nextStatus) return { job: updatedJob, timelineEntry: null };

  return {
    job: updatedJob,
    timelineEntry: {
      id: timelineId,
      jobId: job.id,
      milestone: nextStatus === "Complete" ? "Job completed" : "Custom update",
      eventType: "Status change",
      sourceId: job.id,
      sourceType: "Job",
      fromStatus,
      toStatus: nextStatus,
      note: `Job status changed from ${fromStatus} to ${nextStatus}.`,
      completedBy: completedBy || "JR OS",
      completedAt: now,
      createdAt: now,
    },
  };
}

export function initialJobTimelineEntry({ job, now, timelineId, completedBy }) {
  const status = normaliseJobStatus(job.status);
  return {
    id: timelineId,
    jobId: job.id,
    milestone: "Job created",
    eventType: "Status change",
    sourceId: job.id,
    sourceType: "Job",
    toStatus: status,
    note: `Job created with status ${status}.`,
    completedBy: completedBy || "JR OS",
    completedAt: now,
    createdAt: now,
  };
}

export function newestJobActivityFirst(entries) {
  return [...entries].sort((left, right) => {
    const leftDate = left.completedAt || left.createdAt || "";
    const rightDate = right.completedAt || right.createdAt || "";
    return rightDate.localeCompare(leftDate) || String(right.id).localeCompare(String(left.id));
  });
}

export function normaliseSiteDiaryEntry(entry) {
  return {
    ...entry,
    staffPresent: entry.staffPresent ?? [],
    otherStaffPresent: entry.otherStaffPresent ?? "",
    builderInstructions: entry.builderInstructions ?? "",
    customerInstructions: entry.customerInstructions ?? entry.customerRequests ?? "",
    materialsRequired: entry.materialsRequired ?? "",
    photos: entry.photos ?? [],
    photoDocumentIds: entry.photoDocumentIds ?? [],
    voiceNoteTranscript: entry.voiceNoteTranscript ?? entry.voiceNotes ?? "",
    weather: entry.weather ?? "",
    issuesAndRisks: entry.issuesAndRisks ?? entry.delays ?? "",
    followUpActions: entry.followUpActions ?? "",
  };
}

export function siteDiaryDurationHours(entry) {
  if (!entry.workDate || !entry.startedAt || !entry.finishedAt) return 0;
  const start = new Date(`${entry.workDate}T${entry.startedAt}`).getTime();
  const finish = new Date(`${entry.workDate}T${entry.finishedAt}`).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(finish)) return 0;
  return Math.max(0, (finish - start) / 3_600_000 - Math.max(0, Number(entry.breakMinutes) || 0) / 60);
}

export function siteDiaryTimelineEntry({ entry, timelineId, completedBy, now }) {
  const details = [
    entry.workCompleted?.trim() || "Site diary recorded.",
    entry.delays?.trim() ? `Delays: ${entry.delays.trim()}` : "",
    entry.followUpActions?.trim() ? `Follow-up: ${entry.followUpActions.trim()}` : "",
  ].filter(Boolean).join(" ");
  return {
    id: timelineId,
    jobId: entry.jobId,
    milestone: "Custom update",
    eventType: "Site diary",
    sourceId: entry.id,
    sourceType: "SiteDiaryEntry",
    note: details,
    completedBy: completedBy || entry.completedBy || "JR OS",
    completedAt: entry.updatedAt || now,
    createdAt: now,
  };
}

export const canonicalVariationStatuses = ["Draft", "Sent", "Accepted", "Declined", "Invoiced"];

const variationTransitions = {
  Draft: ["Sent"],
  Sent: ["Draft", "Accepted", "Declined"],
  Accepted: ["Declined", "Invoiced"],
  Declined: ["Draft"],
  Invoiced: [],
};

const legacyVariationStatusMap = {
  "Awaiting approval": "Sent",
  Approved: "Accepted",
};

export function normaliseVariationStatus(status) {
  if (canonicalVariationStatuses.includes(status)) return status;
  return legacyVariationStatusMap[status] ?? "Draft";
}

export function isAcceptedVariationStatus(status) {
  const canonical = normaliseVariationStatus(status);
  return canonical === "Accepted" || canonical === "Invoiced";
}

export function acceptedVariationValue(variations) {
  return variations
    .filter((variation) => isAcceptedVariationStatus(variation.status))
    .reduce((total, variation) => total + variationFinancials(variation).sellingPrice, 0);
}

export function currentJobContractValue(originalContractValue, variations) {
  return Math.max(0, Number(originalContractValue) || 0) + acceptedVariationValue(variations);
}

export function nextJobVariationNumber(variations, jobId) {
  const highest = variations.filter((variation) => variation.jobId === jobId).reduce((maximum, variation) => {
    const match = String(variation.number || "").match(/^VAR-(\d+)$/i);
    return match ? Math.max(maximum, Number(match[1])) : maximum;
  }, 0);
  return `VAR-${String(highest + 1).padStart(3, "0")}`;
}

export function variationFinancials(variation) {
  const labourHours = Math.max(0, Number(variation.labourHours) || 0);
  const labourCost = labourHours * Math.max(0, Number(variation.labourCostRate) || 0);
  const labourSelling = labourHours * Math.max(0, Number(variation.labourRate) || 0);
  const materialCost = Math.max(0, Number(variation.materialCost) || 0);
  const materialSelling = Math.max(0, Number(variation.materialCharge) || 0);
  const otherCost = Math.max(0, Number(variation.otherCost) || 0);
  const otherSelling = Math.max(0, Number(variation.otherCharge) || 0);
  const itemisedSellingPrice = labourSelling + materialSelling + otherSelling;
  const usesFixedPrice = variation.pricingMode === "Fixed price" || Number.isFinite(Number(variation.fixedPrice));
  const sellingPrice = usesFixedPrice ? Math.max(0, Number(variation.fixedPrice) || 0) : itemisedSellingPrice;
  const costPrice = labourCost + materialCost + otherCost;
  const grossProfit = sellingPrice - costPrice;
  return {
    labourCost,
    labourSelling,
    materialCost,
    materialSelling,
    otherCost,
    otherSelling,
    itemisedSellingPrice,
    costPrice,
    sellingPrice,
    grossProfit,
    grossMargin: sellingPrice > 0 ? grossProfit / sellingPrice * 100 : 0,
  };
}

export function variationPresentationView(variation, audience = variation.presentation?.recipient ?? variation.sentTo ?? "Customer") {
  const financials = variationFinancials(variation);
  const outward = audience === "Customer" || audience === "Builder";
  return {
    audience,
    number: variation.number,
    title: variation.title,
    description: variation.description,
    customerNotes: variation.customerNotes ?? "",
    status: normaliseVariationStatus(variation.status),
    sellingPrice: financials.sellingPrice,
    labour: variation.presentation?.showLabourBreakdown ? { hours: variation.labourHours, rate: variation.labourRate, total: financials.labourSelling } : undefined,
    materials: variation.presentation?.showMaterialBreakdown ? { total: financials.materialSelling } : undefined,
    internalCost: outward ? undefined : financials.costPrice,
    grossProfit: outward ? undefined : financials.grossProfit,
    grossMargin: outward ? undefined : financials.grossMargin,
    internalNotes: outward ? undefined : variation.internalNotes ?? "",
  };
}

export function transitionVariation({ variation, nextStatus, now, auditId, completedBy, recipient, detail, approvalMethod, approvalReference, invoiceId }) {
  if (!canonicalVariationStatuses.includes(nextStatus)) throw new Error(`Unsupported variation status: ${nextStatus}`);
  const fromStatus = normaliseVariationStatus(variation.status);
  if (fromStatus === nextStatus) return { ...variation, status: nextStatus };
  if (!(variationTransitions[fromStatus] ?? []).includes(nextStatus)) throw new Error(`Variation cannot move from ${fromStatus} to ${nextStatus}.`);
  const actor = completedBy || "JR OS";
  const recipientLabel = recipient || variation.sentTo;
  const recordedApprovalMethod = approvalMethod || variation.approvalMethod;
  const recordedApprovalReference = approvalReference ?? variation.approvalReference;
  if (nextStatus === "Sent" && !recipientLabel) throw new Error("Choose Customer or Builder before sending the variation.");
  if (nextStatus === "Accepted" && (!recordedApprovalMethod || recordedApprovalMethod === "Not approved")) throw new Error("Record how the variation was accepted.");
  if (nextStatus === "Invoiced" && !invoiceId) throw new Error("Link the invoice before marking the variation invoiced.");
  const actionDetail = detail?.trim()
    || (nextStatus === "Sent" ? `Variation sent to ${recipientLabel}.` : `Variation status changed from ${fromStatus} to ${nextStatus}.`);
  const auditEntry = {
    id: auditId,
    action: nextStatus === "Sent" ? "Variation sent" : `Variation ${nextStatus.toLowerCase()}`,
    fromStatus,
    toStatus: nextStatus,
    detail: actionDetail,
    completedBy: actor,
    completedAt: now,
  };
  return {
    ...variation,
    status: nextStatus,
    sentTo: nextStatus === "Sent" ? recipientLabel : variation.sentTo,
    sentAt: nextStatus === "Sent" ? now : variation.sentAt,
    presentation: recipientLabel ? {
      recipient: recipientLabel,
      showLabourBreakdown: variation.presentation?.showLabourBreakdown ?? false,
      showMaterialBreakdown: variation.presentation?.showMaterialBreakdown ?? false,
      showInternalCosts: false,
      showProfit: false,
    } : variation.presentation,
    decidedAt: nextStatus === "Accepted" || nextStatus === "Declined" ? now : variation.decidedAt,
    decidedBy: nextStatus === "Accepted" || nextStatus === "Declined" ? actor : variation.decidedBy,
    approvalMethod: nextStatus === "Accepted" ? recordedApprovalMethod : variation.approvalMethod,
    approvalReference: nextStatus === "Accepted" || nextStatus === "Declined" ? recordedApprovalReference : variation.approvalReference,
    invoiceId: nextStatus === "Invoiced" ? invoiceId : variation.invoiceId,
    auditHistory: [auditEntry, ...(variation.auditHistory ?? [])],
    updatedAt: now,
  };
}

export function applyVariationContractValue({ job, variation, nextStatus, now }) {
  const wasAccepted = isAcceptedVariationStatus(variation.status);
  const willBeAccepted = isAcceptedVariationStatus(nextStatus);
  if (wasAccepted === willBeAccepted) return { ...job, updatedAt: now };
  const value = variationFinancials(variation).sellingPrice;
  const delta = willBeAccepted ? value : -value;
  return {
    ...job,
    originalContractValue: job.originalContractValue ?? job.value,
    value: Math.max(0, Number(job.value || 0) + delta),
    updatedAt: now,
  };
}

export function variationTimelineEntry({ variation, fromStatus, toStatus, timelineId, completedBy, now }) {
  return {
    id: timelineId,
    jobId: variation.jobId,
    milestone: "Custom update",
    eventType: "Variation",
    sourceId: variation.id,
    sourceType: "JobVariation",
    note: `${variation.number} · ${variation.title} changed from ${normaliseVariationStatus(fromStatus)} to ${toStatus}.`,
    completedBy: completedBy || "JR OS",
    completedAt: now,
    createdAt: now,
  };
}

export function variationInvoiceLine(variation, lineId) {
  const financials = variationFinancials(variation);
  return {
    id: lineId,
    variationId: variation.id,
    description: `${variation.number} · ${variation.title}`,
    category: "Other",
    quantity: 1,
    unitPrice: financials.sellingPrice,
    unitCost: financials.costPrice,
  };
}
