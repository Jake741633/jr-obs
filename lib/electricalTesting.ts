import type { EntityId } from "./models";

export type TestingRecordStatus = "Draft" | "In progress" | "Ready for certificate" | "Complete";
export type PolarityResult = "" | "Confirmed" | "Not confirmed" | "Not tested";

export interface CircuitTestResult {
  id: EntityId;
  circuitReference: string;
  description: string;
  protectiveDevice: string;
  r1r2: string;
  insulationResistance: string;
  polarity: PolarityResult;
  zs: string;
  rcdTest: string;
  notes: string;
}

export interface ElectricalTestingRecord {
  id: EntityId;
  jobId: EntityId;
  customerId?: EntityId;
  certificateId?: EntityId;
  status: TestingRecordStatus;
  inspectorName: string;
  testDate: string;
  supplyDetails: string;
  earthingArrangement: string;
  circuits: CircuitTestResult[];
  outstandingActions: string[];
  generalNotes: string;
  createdAt: string;
  updatedAt: string;
}

export interface TestingWarning {
  circuitId?: EntityId;
  field: string;
  message: string;
  severity: "Missing" | "Review";
}

function numericValue(value: string) {
  const match = value.trim().replace(",", ".").match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : undefined;
}

export function validateTestingRecord(record: ElectricalTestingRecord): TestingWarning[] {
  const warnings: TestingWarning[] = [];
  if (!record.jobId) warnings.push({ field: "jobId", message: "Link the testing record to a job.", severity: "Missing" });
  if (!record.inspectorName.trim()) warnings.push({ field: "inspectorName", message: "Inspector name is missing.", severity: "Missing" });
  if (!record.testDate) warnings.push({ field: "testDate", message: "Test date is missing.", severity: "Missing" });
  if (record.circuits.length === 0) warnings.push({ field: "circuits", message: "No circuit test results have been recorded.", severity: "Missing" });

  record.circuits.forEach((circuit, index) => {
    const label = circuit.circuitReference.trim() || `Circuit ${index + 1}`;
    if (!circuit.circuitReference.trim()) warnings.push({ circuitId: circuit.id, field: "circuitReference", message: `${label}: circuit reference is missing.`, severity: "Missing" });
    if (!circuit.description.trim()) warnings.push({ circuitId: circuit.id, field: "description", message: `${label}: description is missing.`, severity: "Missing" });
    if (!circuit.protectiveDevice.trim()) warnings.push({ circuitId: circuit.id, field: "protectiveDevice", message: `${label}: protective device is missing.`, severity: "Missing" });
    if (!circuit.r1r2.trim()) warnings.push({ circuitId: circuit.id, field: "r1r2", message: `${label}: R1+R2 has not been entered.`, severity: "Missing" });
    if (!circuit.insulationResistance.trim()) warnings.push({ circuitId: circuit.id, field: "insulationResistance", message: `${label}: insulation resistance has not been entered.`, severity: "Missing" });
    if (!circuit.polarity) warnings.push({ circuitId: circuit.id, field: "polarity", message: `${label}: polarity result is missing.`, severity: "Missing" });
    if (!circuit.zs.trim()) warnings.push({ circuitId: circuit.id, field: "zs", message: `${label}: Zs has not been entered.`, severity: "Missing" });

    const r1r2 = numericValue(circuit.r1r2);
    const insulation = numericValue(circuit.insulationResistance);
    const zs = numericValue(circuit.zs);
    if (r1r2 !== undefined && (r1r2 < 0 || r1r2 > 10)) warnings.push({ circuitId: circuit.id, field: "r1r2", message: `${label}: R1+R2 looks unusual and should be checked.`, severity: "Review" });
    if (insulation !== undefined && insulation < 1) warnings.push({ circuitId: circuit.id, field: "insulationResistance", message: `${label}: insulation resistance is below 1 MΩ or may use an unexpected format. Review the entry.`, severity: "Review" });
    if (zs !== undefined && (zs < 0 || zs > 20)) warnings.push({ circuitId: circuit.id, field: "zs", message: `${label}: Zs looks unusual and should be checked against the installation details.`, severity: "Review" });
    if (circuit.polarity === "Not confirmed") warnings.push({ circuitId: circuit.id, field: "polarity", message: `${label}: polarity is recorded as not confirmed.`, severity: "Review" });
  });

  return warnings;
}

export function testingProgress(record: ElectricalTestingRecord) {
  const requiredFields = record.circuits.length * 7 + 3;
  const completeFields = record.circuits.reduce((total, circuit) => total + [
    circuit.circuitReference,
    circuit.description,
    circuit.protectiveDevice,
    circuit.r1r2,
    circuit.insulationResistance,
    circuit.polarity,
    circuit.zs,
  ].filter(Boolean).length, 0) + [record.jobId, record.inspectorName, record.testDate].filter(Boolean).length;
  return requiredFields === 0 ? 0 : Math.round((completeFields / requiredFields) * 100);
}

export function certificateReadySummary(record: ElectricalTestingRecord, jobTitle: string, customerName: string) {
  const circuitLines = record.circuits.map((circuit) =>
    `${circuit.circuitReference || "Unreferenced"} — ${circuit.description || "No description"}; device ${circuit.protectiveDevice || "not entered"}; R1+R2 ${circuit.r1r2 || "not entered"}; IR ${circuit.insulationResistance || "not entered"}; polarity ${circuit.polarity || "not entered"}; Zs ${circuit.zs || "not entered"}; RCD ${circuit.rcdTest || "not entered"}.`,
  );
  return [
    `Testing summary for ${jobTitle || "job"}${customerName ? ` — ${customerName}` : ""}`,
    `Test date: ${record.testDate || "not entered"}. Inspector: ${record.inspectorName || "not entered"}.`,
    record.supplyDetails ? `Supply: ${record.supplyDetails}.` : "",
    record.earthingArrangement ? `Earthing arrangement: ${record.earthingArrangement}.` : "",
    ...circuitLines,
    record.outstandingActions.length ? `Outstanding actions: ${record.outstandingActions.join("; ")}.` : "No outstanding actions recorded.",
    record.generalNotes ? `Notes: ${record.generalNotes}` : "",
  ].filter(Boolean).join("\n");
}
