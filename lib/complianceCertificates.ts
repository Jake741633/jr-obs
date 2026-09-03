import type { Customer, ElectricalCertificate, Invoice, Job } from "./models";
import type { ElectricalTestingRecord } from "./electricalTesting";

export type ComplianceCertificateStatus = "Draft" | "In Progress" | "Ready for Review" | "Issued" | "Archived";
export type SupportedComplianceCertificateType =
  | "Electrical Installation Certificate"
  | "Minor Electrical Installation Works Certificate"
  | "Electrical Installation Condition Report";

export interface CertificateSignature {
  name: string;
  signedAt: string;
  dataUrl?: string;
}

export interface CertificateRevision {
  id: string;
  revisionNumber: number;
  savedAt: string;
  savedBy: string;
  snapshot: Omit<ComplianceCertificate, "revisionHistory">;
}

export interface ComplianceCertificate extends Omit<ElectricalCertificate, "status"> {
  status: ComplianceCertificateStatus;
  invoiceId?: string;
  testingRecordId?: string;
  inspectorSignature?: CertificateSignature;
  customerSignature?: CertificateSignature;
  remedialActions?: string;
  limitations?: string;
  recommendations?: string;
  issuedAt?: string;
  archivedAt?: string;
  revisionHistory?: CertificateRevision[];
}

export const supportedCertificateTypes: SupportedComplianceCertificateType[] = [
  "Electrical Installation Certificate",
  "Minor Electrical Installation Works Certificate",
  "Electrical Installation Condition Report",
];

export const complianceStatuses: ComplianceCertificateStatus[] = [
  "Draft",
  "In Progress",
  "Ready for Review",
  "Issued",
  "Archived",
];

export function nextCertificateNumber(prefix: string, certificates: Array<Pick<ComplianceCertificate, "number">>) {
  const cleanPrefix = prefix.trim().toUpperCase() || "CERT";
  const highest = certificates.reduce((max, certificate) => {
    const match = certificate.number.match(new RegExp(`^${cleanPrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-(\\d+)$`, "i"));
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `${cleanPrefix}-${String(highest + 1).padStart(4, "0")}`;
}

export function createCertificateDraft(input: {
  id: string;
  number: string;
  type: SupportedComplianceCertificateType;
  inspectorName: string;
  schemeProvider?: string;
  registrationNumber?: string;
  job?: Job;
  customer?: Customer;
  invoice?: Invoice;
  testing?: ElectricalTestingRecord;
  notes?: string;
}): ComplianceCertificate {
  const now = new Date().toISOString();
  const testingSummary = input.testing
    ? `Testing record ${input.testing.id}: ${input.testing.circuits.length} circuit result${input.testing.circuits.length === 1 ? "" : "s"} captured${input.testing.outstandingActions.length ? `; ${input.testing.outstandingActions.length} outstanding action${input.testing.outstandingActions.length === 1 ? "" : "s"}` : ""}.`
    : "";
  return {
    id: input.id,
    number: input.number,
    type: input.type,
    status: "Draft",
    customerId: input.customer?.id ?? input.job?.customerId,
    jobId: input.job?.id,
    invoiceId: input.invoice?.id,
    testingRecordId: input.testing?.id,
    installationAddress: input.job?.siteAddress || input.customer?.address || "",
    description: [input.job?.title, testingSummary].filter(Boolean).join("\n"),
    inspectorName: input.inspectorName,
    schemeProvider: input.schemeProvider,
    registrationNumber: input.registrationNumber,
    inspectionDate: input.testing?.testDate ?? "",
    nextInspectionDate: "",
    outcome: "Not applicable",
    observations: input.notes ?? "",
    structuredObservations: [],
    remedialActions: input.testing?.outstandingActions.join("\n") ?? "",
    limitations: "",
    recommendations: "",
    externalPdfUrl: "",
    revisionHistory: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function saveCertificateRevision(certificate: ComplianceCertificate, savedBy: string): ComplianceCertificate {
  const now = new Date().toISOString();
  const { revisionHistory: _history, ...snapshot } = certificate;
  const history = certificate.revisionHistory ?? [];
  const revision: CertificateRevision = {
    id: `certificate-revision-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    revisionNumber: history.length + 1,
    savedAt: now,
    savedBy: savedBy.trim() || certificate.inspectorName || "JR OS",
    snapshot: { ...snapshot, updatedAt: now },
  };
  return { ...certificate, updatedAt: now, revisionHistory: [...history, revision] };
}

export function certificateNeedsSignatures(certificate: ComplianceCertificate) {
  return !certificate.inspectorSignature?.signedAt || !certificate.customerSignature?.signedAt;
}

export function certificatePdfHtml(certificate: ComplianceCertificate, customer?: Customer, job?: Job, invoice?: Invoice) {
  const escape = (value: string | undefined) => (value ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
  const observations = certificate.structuredObservations?.map((item) =>
    `<tr><td>${escape(item.location)}</td><td>${escape(item.observation)}</td><td>${escape(item.code)}</td><td>${escape(item.recommendation)}</td></tr>`,
  ).join("") || `<tr><td colspan="4">${escape(certificate.observations) || "No observations recorded"}</td></tr>`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escape(certificate.number)}</title><style>body{font-family:Arial,sans-serif;color:#172033;margin:36px}header{border-bottom:3px solid #0891b2;padding-bottom:18px;margin-bottom:24px}h1{font-size:24px;margin:0}h2{font-size:16px;margin-top:24px}.meta{display:grid;grid-template-columns:1fr 1fr;gap:10px}.box{border:1px solid #cbd5e1;border-radius:8px;padding:12px;white-space:pre-wrap}table{width:100%;border-collapse:collapse}th,td{border:1px solid #cbd5e1;padding:8px;text-align:left;vertical-align:top}.signatures{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:30px}.muted{color:#64748b;font-size:12px}@media print{body{margin:18mm}}</style></head><body><header><p class="muted">JR ELECTRICAL SERVICES · COMPLIANCE & CERTIFICATE CENTRE</p><h1>${escape(certificate.type)}</h1><p>${escape(certificate.number)} · ${escape(certificate.status)}</p></header><div class="meta"><div class="box"><strong>Customer</strong><br>${escape(customer?.name)}<br>${escape(customer?.address)}</div><div class="box"><strong>Installation</strong><br>${escape(job?.title)}<br>${escape(certificate.installationAddress)}</div><div class="box"><strong>Inspector</strong><br>${escape(certificate.inspectorName)}<br>${escape(certificate.schemeProvider)} ${escape(certificate.registrationNumber)}</div><div class="box"><strong>References</strong><br>Job: ${escape(certificate.jobId)}<br>Invoice: ${escape(invoice?.number)}<br>Testing: ${escape(certificate.testingRecordId)}</div></div><h2>Description and test summary</h2><div class="box">${escape(certificate.description)}</div><h2>Observations</h2><table><thead><tr><th>Location</th><th>Observation</th><th>Code</th><th>Recommendation</th></tr></thead><tbody>${observations}</tbody></table><h2>Remedial actions</h2><div class="box">${escape(certificate.remedialActions)}</div><h2>Limitations</h2><div class="box">${escape(certificate.limitations)}</div><h2>Recommendations</h2><div class="box">${escape(certificate.recommendations)}</div><div class="signatures"><div class="box"><strong>Inspector signature</strong><br>${escape(certificate.inspectorSignature?.name)}<br>${escape(certificate.inspectorSignature?.signedAt)}</div><div class="box"><strong>Customer signature</strong><br>${escape(certificate.customerSignature?.name)}<br>${escape(certificate.customerSignature?.signedAt)}</div></div><p class="muted">Generated by JR OS. Review all certificate information before issue.</p></body></html>`;
}
