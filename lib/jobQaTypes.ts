import type { EntityId, JobTaskCategory } from "./models";

export type JobQaInspectionType = "First fix" | "Second fix" | "Testing" | "Commissioning" | "Handover";
export type JobQaInspectionResult = "Pending" | "Pass" | "Fail";

export interface JobQaCheck {
  id: EntityId;
  label: string;
  completed: boolean;
  note: string;
}

export interface JobQaInspection {
  id: EntityId;
  jobId: EntityId;
  type: JobQaInspectionType;
  result: JobQaInspectionResult;
  checks: JobQaCheck[];
  inspectorId?: EntityId;
  inspectorName: string;
  notes: string;
  inspectedAt: string;
  createdAt: string;
  updatedAt: string;
}

export function qaTaskCategory(type: JobQaInspectionType): JobTaskCategory {
  if (type === "Testing") return "Testing";
  if (type === "Handover") return "Handover";
  if (type === "First fix") return "First fix";
  if (type === "Second fix") return "Second fix";
  return "General";
}
