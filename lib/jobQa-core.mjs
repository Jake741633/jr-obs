export const jobQaTypes = ["First fix", "Second fix", "Testing", "Commissioning", "Handover"];
export const jobQaResults = ["Pending", "Pass", "Fail"];

export const jobQaChecklists = {
  "First fix": [
    "Routes and containment complete",
    "Cable sizes and identification checked",
    "Back boxes and accessories positioned",
    "Bonding and earthing provisions checked",
  ],
  "Second fix": [
    "Accessories secure and aligned",
    "Terminations checked",
    "Labels and circuit identification complete",
    "Damage and finishing defects reviewed",
  ],
  Testing: [
    "Dead tests recorded",
    "Live tests recorded",
    "Results reviewed for compliance",
    "Defects or limitations recorded",
  ],
  Commissioning: [
    "Controls and equipment operate correctly",
    "Settings and protective devices confirmed",
    "Manufacturer checks completed",
    "Client operating notes prepared",
  ],
  Handover: [
    "Snags reviewed",
    "Certificates and records available",
    "Photos and documents attached",
    "Customer handover requirements reviewed",
  ],
};

export function isJobQaType(value) {
  return jobQaTypes.includes(value);
}

export function normaliseJobQaResult(value) {
  return jobQaResults.includes(value) ? value : "Pending";
}

export function qaCompletion(inspection) {
  const checks = Array.isArray(inspection?.checks) ? inspection.checks : [];
  if (!checks.length) return 0;
  const complete = checks.filter((check) => Boolean(check?.completed)).length;
  return Math.round((complete / checks.length) * 100);
}

export function buildQaInspection({ id, jobId, type, inspectorId, inspectorName, notes, now }) {
  if (!jobId) throw new Error("Choose a job before creating a QA inspection.");
  if (!isJobQaType(type)) throw new Error(`Unsupported QA inspection type: ${type}`);
  return {
    id,
    jobId,
    type,
    result: "Pending",
    checks: jobQaChecklists[type].map((label, index) => ({ id: `${id}-check-${index + 1}`, label, completed: false, note: "" })),
    inspectorId: inspectorId || undefined,
    inspectorName: inspectorName || "JR OS engineer",
    notes: notes || "",
    inspectedAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

export function completeQaInspection({ inspection, result, notes, now }) {
  if (!["Pass", "Fail"].includes(result)) throw new Error("QA result must be Pass or Fail.");
  if (result === "Pass" && qaCompletion(inspection) < 100) throw new Error("Complete every checklist item before passing QA.");
  return { ...inspection, result, notes: notes ?? inspection.notes ?? "", inspectedAt: now, updatedAt: now };
}

export function qaTimelineEntry({ inspection, timelineId, completedBy, now }) {
  return {
    id: timelineId,
    jobId: inspection.jobId,
    milestone: "Custom update",
    eventType: "Note",
    sourceId: inspection.id,
    sourceType: "JobQaInspection",
    note: `${inspection.type} QA inspection ${String(inspection.result).toLowerCase()}ed${inspection.notes ? ` · ${inspection.notes}` : ""}.`,
    completedBy: completedBy || inspection.inspectorName || "JR OS",
    completedAt: now,
    createdAt: now,
  };
}

export function failedQaTask({ inspection, taskId, now }) {
  if (inspection.result !== "Fail") return null;
  const failed = (inspection.checks || []).filter((check) => !check.completed).map((check) => check.label);
  return {
    id: taskId,
    jobId: inspection.jobId,
    type: "Snag",
    title: `${inspection.type} QA actions`,
    description: failed.length ? `Resolve: ${failed.join("; ")}` : `Resolve failed ${inspection.type.toLowerCase()} QA inspection.`,
    category: inspection.type === "Testing" ? "Testing" : inspection.type === "Handover" ? "Handover" : inspection.type,
    priority: "High",
    dueDate: "",
    status: "Open",
    photos: [],
    notes: inspection.notes || "",
    createdAt: now,
    updatedAt: now,
  };
}

export function qaSummary(inspections, jobId) {
  const matching = inspections.filter((inspection) => inspection.jobId === jobId);
  return {
    total: matching.length,
    passed: matching.filter((inspection) => inspection.result === "Pass").length,
    failed: matching.filter((inspection) => inspection.result === "Fail").length,
    pending: matching.filter((inspection) => inspection.result === "Pending").length,
    completion: matching.length ? Math.round(matching.reduce((sum, inspection) => sum + qaCompletion(inspection), 0) / matching.length) : 0,
  };
}
