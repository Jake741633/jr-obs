import { jobHandoverReadiness } from "./jobProgress-core.mjs";
import type { HandoverReadinessSummary } from "../components/jobs/HandoverReadinessCard";

export interface JobHandoverEvidence {
  testingComplete: boolean;
  certificateIssued: boolean;
  materialsComplete: boolean;
  outstandingTasks?: number;
  outstandingSnags?: number;
  failedQa?: number;
  pendingQa?: number;
  requiredDocumentsMissing?: number;
}

export function buildJobHandoverSummary(evidence: JobHandoverEvidence): HandoverReadinessSummary {
  return jobHandoverReadiness({
    progress: {
      testing: evidence.testingComplete ? 100 : 0,
      certificates: evidence.certificateIssued ? 100 : 0,
      materials: evidence.materialsComplete ? 100 : 0,
    },
    outstandingTasks: evidence.outstandingTasks,
    outstandingSnags: evidence.outstandingSnags,
    failedQa: evidence.failedQa,
    pendingQa: evidence.pendingQa,
    requiredDocumentsMissing: evidence.requiredDocumentsMissing,
  });
}
