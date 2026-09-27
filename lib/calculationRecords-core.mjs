import { electricalLoadSummary } from "./electricalCalculators-core.mjs";
import { voltageDropSummary } from "./voltageDropCalculator-core.mjs";
import { cableSizingSummary } from "./cableSizingCalculator-core.mjs";
import { earthFaultLoopSummary } from "./earthFaultLoopCalculator-core.mjs";
import { adiabaticSummary } from "./adiabaticCalculator-core.mjs";
import { protectiveDeviceSummary } from "./protectiveDeviceCalculator-core.mjs";
import { maximumDemandSummary } from "./maximumDemandCalculator-core.mjs";

export const CALCULATION_RECORDS_STORAGE_KEY = "jr-os-electrical-calculations";
export const CALCULATION_RECORD_WARNING = "Design aid only. Verify current BS 7671, manufacturer evidence and site conditions before final design approval.";

// Labels and units are stored with the snapshot, so a later calculator release
// cannot silently reinterpret or recalculate historical evidence.
const fields = {
  phase: ["Supply phase", ""], powerWatts: ["Entered power", "W"], voltage: ["Supply voltage", "V"],
  powerFactor: ["Power factor", ""], efficiency: ["Efficiency", ""],
  inputPowerWatts: ["Electrical input power", "W"], apparentPowerVa: ["Apparent power", "VA"], currentAmps: ["Design current", "A"],
  nominalVoltage: ["Nominal voltage", "V"], designCurrentAmps: ["Design current Ib", "A"], routeLengthMetres: ["Route length", "m"],
  millivoltsPerAmpMetre: ["Verified conductor value", "mV/A/m"], maximumPercent: ["Selected voltage-drop limit", "%"],
  voltageDropVolts: ["Voltage drop", "V"], voltageDropPercent: ["Voltage drop", "%"], maximumVoltageDropVolts: ["Selected maximum drop", "V"],
  remainingVoltageDropVolts: ["Remaining drop allowance", "V"],
  ambientTemperatureFactor: ["Ambient temperature factor", ""], groupingFactor: ["Grouping factor", ""], insulationFactor: ["Thermal insulation factor", ""], otherFactor: ["Other correction factor", ""],
  combinedCorrectionFactor: ["Combined correction factor", ""], requiredTabulatedCurrentAmps: ["Required tabulated capacity", "A"],
  sizeMm2: ["Cable size", "mm²"], tabulatedCurrentAmps: ["Tabulated current capacity", "A"],
  externalEarthFaultLoopOhms: ["External loop impedance Ze", "Ω"], lineConductorResistanceOhms: ["Line resistance R1", "Ω"], cpcResistanceOhms: ["CPC resistance R2", "Ω"],
  tabulatedMaximumZsOhms: ["Verified tabulated maximum Zs", "Ω"], permittedPercentage: ["Selected permitted percentage", "%"],
  calculatedZsOhms: ["Calculated Zs", "Ω"], permittedMaximumZsOhms: ["Selected maximum Zs", "Ω"], marginOhms: ["Zs margin", "Ω"], prospectiveEarthFaultCurrentAmps: ["Simplified earth fault current", "A"],
  method: ["Thermal calculation method", ""], faultCurrentAmps: ["Fault current", "A"], disconnectionTimeSeconds: ["Device disconnection time", "s"], kFactor: ["Verified k-factor", "A√s/mm²"], conductorSizeMm2: ["Proposed CPC area", "mm²"],
  letThroughEnergyA2s: ["Manufacturer let-through energy", "A²s"], faultEnergyA2s: ["Fault energy", "A²s"], conductorWithstandA2s: ["CPC thermal withstand", "A²s"], requiredConductorSizeMm2: ["Required thermal area", "mm²"], sizeMarginMm2: ["Area margin", "mm²"], maximumFaultCurrentAmps: ["Thermal current limit at entered time", "A"],
  deviceReference: ["Device identification and standard", ""], evidenceReference: ["Device and circuit evidence", ""], deviceRatingAmps: ["Device rating or setting In/Ir", "A"], cableCapacityAmps: ["Corrected cable capacity Iz", "A"], overloadOperatingCurrentAmps: ["Conventional overload current I2", "A"], breakingCapacityKa: ["Device breaking capacity", "kA"], prospectiveFaultCurrentKa: ["Maximum prospective fault current", "kA"],
  maximumOverloadOperatingCurrentAmps: ["Overload limit 1.45 × Iz", "A"], overloadMarginAmps: ["Overload margin", "A"], breakingCapacityMarginKa: ["Breaking-capacity margin", "kA"],
  description: ["Description", ""], quantity: ["Quantity", ""], connectedCurrentAmps: ["Connected current per item", "A"], demandFactor: ["Demand factor (0–1)", ""], connectedTotalAmps: ["Connected current × quantity", "A"], diversifiedCurrentAmps: ["Diversified current", "A"],
  totalConnectedCurrentAmps: ["Schedule sum of connected currents", "A"], totalDiversifiedCurrentAmps: ["Schedule sum of diversified currents", "A"], overallDemandFactor: ["Overall demand factor (0–1)", ""], maximumPhaseDemandAmps: ["Highest phase demand", "A"], phaseImbalanceAmps: ["Phase imbalance", "A"],
};

const definitions = {
  load: { title: "Load and design current", calculate: electricalLoadSummary, inputs: "phase powerWatts voltage powerFactor efficiency", outputs: "inputPowerWatts apparentPowerVa currentAmps" },
  "voltage-drop": { title: "Voltage drop", calculate: voltageDropSummary, inputs: "phase nominalVoltage designCurrentAmps routeLengthMetres millivoltsPerAmpMetre maximumPercent", outputs: "voltageDropVolts voltageDropPercent maximumVoltageDropVolts remainingVoltageDropVolts", assessment: "withinSelectedLimit" },
  "cable-sizing": { title: "Cable current capacity", calculate: cableSizingSummary, inputs: "designCurrentAmps ambientTemperatureFactor groupingFactor insulationFactor otherFactor", outputs: "combinedCorrectionFactor requiredTabulatedCurrentAmps", assessment: "hasSuitableCable" },
  "earth-fault-loop": { title: "Earth fault loop", calculate: earthFaultLoopSummary, inputs: "nominalVoltage externalEarthFaultLoopOhms lineConductorResistanceOhms cpcResistanceOhms tabulatedMaximumZsOhms permittedPercentage", outputs: "calculatedZsOhms permittedMaximumZsOhms marginOhms prospectiveEarthFaultCurrentAmps", assessment: "withinSelectedLimit" },
  adiabatic: { title: "Adiabatic CPC sizing", calculate: adiabaticSummary, inputs: "method disconnectionTimeSeconds kFactor conductorSizeMm2", outputs: "faultEnergyA2s conductorWithstandA2s requiredConductorSizeMm2 sizeMarginMm2", assessment: "conductorIsAdequate" },
  "protective-device": { title: "Protective device checks", calculate: protectiveDeviceSummary, inputs: "deviceReference evidenceReference designCurrentAmps deviceRatingAmps cableCapacityAmps overloadOperatingCurrentAmps breakingCapacityKa prospectiveFaultCurrentKa", outputs: "maximumOverloadOperatingCurrentAmps overloadMarginAmps breakingCapacityMarginKa", assessment: "meetsEnteredChecks" },
  "maximum-demand": { title: "Maximum demand", calculate: maximumDemandSummary, inputs: "", outputs: "totalConnectedCurrentAmps totalDiversifiedCurrentAmps overallDemandFactor maximumPhaseDemandAmps phaseImbalanceAmps" },
};

const plainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const validText = (value, max = 2000) => typeof value === "string" && value.trim().length > 0 && value.length <= max;
const validValue = (value) => (typeof value === "number" && Number.isFinite(value)) || validText(value);
const rowsFor = (keys, source, prefix = "") => keys.split(" ").filter(Boolean).map((key) => ({ label: prefix + fields[key][0], value: source[key], unit: fields[key][1] }));

export function buildCalculationSnapshot(kind, input) {
  const definition = Object.hasOwn(definitions, kind) ? definitions[kind] : null;
  if (!definition || !plainObject(input)) return null;
  if (kind === "cable-sizing" && (!Array.isArray(input.cableOptions) || input.cableOptions.length > 200)) return null;
  if (kind === "maximum-demand" && (!Array.isArray(input.loads) || input.loads.length > 200)) return null;
  const result = definition.calculate(input);
  if (!result.hasCompleteInputs) return null;
  const inputs = rowsFor(definition.inputs, input);
  const outputs = rowsFor(definition.outputs, result);
  if (kind === "adiabatic") {
    // Inactive method fields are deliberately excluded from the historical record.
    inputs[0].value = result.method === "energy" ? "Manufacturer I²t" : "Fault current and time";
    inputs.push(...rowsFor(result.method === "energy" ? "letThroughEnergyA2s" : "faultCurrentAmps", input));
    if (result.method === "current-time") outputs.push(...rowsFor("maximumFaultCurrentAmps", result));
  }
  if (kind === "cable-sizing") {
    input.cableOptions.forEach((option, index) => inputs.push(...rowsFor("sizeMm2 tabulatedCurrentAmps", option, `Option ${index + 1}: `)));
    if (result.selectedCable) outputs.push(...rowsFor("sizeMm2 tabulatedCurrentAmps", result.selectedCable, "Smallest suitable entered option: "));
  }
  if (kind === "maximum-demand") {
    result.loads.forEach((load, index) => {
      inputs.push(...rowsFor("description quantity connectedCurrentAmps demandFactor phase", load, `Load ${index + 1}: `));
      outputs.push(...rowsFor("connectedTotalAmps diversifiedCurrentAmps", load, `Load ${index + 1}: `));
    });
    for (const phase of ["L1", "L2", "L3"]) outputs.push({ label: `${phase} demand`, value: result.phaseDemandAmps[phase], unit: "A" });
  }
  if (kind === "protective-device") {
    for (const [key, label] of [["loadWithinRating", "Load and device: Ib ≤ In/Ir"], ["ratingWithinCable", "Device and cable: In/Ir ≤ Iz"], ["overloadWithinLimit", "Conventional overload: I2 ≤ 1.45 × Iz"], ["breakingCapacityAdequate", "Breaking capacity ≥ maximum PFC"]]) outputs.push({ label, value: result[key] ? "Meets entered check" : "Review required", unit: "" });
  }
  if (![...inputs, ...outputs].every((row) => validValue(row.value))) return null;
  return {
    kind, calculatorVersion: 1, title: definition.title, inputs, outputs,
    assessment: definition.assessment ? (result[definition.assessment] ? "Meets entered checks" : "Review required") : "Calculated",
    assumptions: [...result.assumptions], warning: CALCULATION_RECORD_WARNING,
  };
}

/** @param {{id: string, createdAt: string, title: string, evidenceReference: string, designNote?: string, kind: string, input: Record<string, unknown>, job?: {id: string, title: string, customerId?: string} | null}} options */
export function createCalculationRecord({ id, createdAt, title, evidenceReference, designNote = "", kind, input, job = null }) {
  if (!validText(id, 200) || !validText(createdAt, 40) || !Number.isFinite(Date.parse(createdAt))) throw new Error("A stable record id and valid date are required.");
  if (!validText(title, 120)) throw new Error("Enter a calculation title of up to 120 characters.");
  if (!validText(evidenceReference)) throw new Error("Enter the source and revision of the design evidence (up to 2,000 characters).");
  if (typeof designNote !== "string" || designNote.length > 4000) throw new Error("Keep the design note within 4,000 characters.");
  const snapshot = buildCalculationSnapshot(kind, input);
  if (!snapshot) throw new Error("Complete all calculation inputs before saving a record.");
  if (job !== null && (!plainObject(job) || !validText(job.id, 200) || !validText(job.title, 2000) || (job.customerId !== undefined && !validText(job.customerId, 200)))) throw new Error("Choose an available job or save a standalone design note.");
  return {
    id, schemaVersion: 1, createdAt, updatedAt: createdAt, title: title.trim(), evidenceReference: evidenceReference.trim(), designNote: designNote.trim(),
    ...(job ? { jobId: job.id, jobTitle: job.title, ...(job.customerId ? { customerId: job.customerId } : {}) } : {}), snapshot,
  };
}

export function isCalculationRecord(record) {
  if (!plainObject(record) || record.schemaVersion !== 1 || !validText(record.id, 200) || !validText(record.title, 120) || !validText(record.evidenceReference) || typeof record.designNote !== "string" || record.designNote.length > 4000) return false;
  if (!validText(record.createdAt, 40) || !Number.isFinite(Date.parse(record.createdAt))) return false;
  if (record.jobId !== undefined && (!validText(record.jobId, 200) || !validText(record.jobTitle))) return false;
  if (record.customerId !== undefined && (!record.jobId || !validText(record.customerId, 200))) return false;
  const snapshot = record.snapshot;
  if (!plainObject(snapshot) || !Object.hasOwn(definitions, snapshot.kind) || snapshot.calculatorVersion !== 1 || !validText(snapshot.title, 120) || snapshot.warning !== CALCULATION_RECORD_WARNING || !["Calculated", "Meets entered checks", "Review required"].includes(snapshot.assessment)) return false;
  for (const key of ["inputs", "outputs"]) {
    if (!Array.isArray(snapshot[key]) || snapshot[key].length === 0 || snapshot[key].length > 1400 || !snapshot[key].every((row) => plainObject(row) && validText(row.label, 200) && validValue(row.value) && typeof row.unit === "string" && row.unit.length <= 40)) return false;
  }
  return Array.isArray(snapshot.assumptions) && snapshot.assumptions.length > 0 && snapshot.assumptions.length <= 30 && snapshot.assumptions.every((value) => validText(value));
}
