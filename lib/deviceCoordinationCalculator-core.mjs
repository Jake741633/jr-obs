import { nonNegativeCalculatorNumber, positiveCalculatorNumber } from "./electricalCalculatorNumbers-core.mjs";

const text = (value) => typeof value === "string" && value.trim().length > 0 && value.length <= 2000 ? value.trim() : null;
const assumptions = [
  "Design aid only. Verify current BS 7671, manufacturer documents and actual site conditions before design approval.",
  "This is a comparison of entered evidence for one upstream/downstream device pair and one supply/fault case, not an automatic device selection or a verified catalogue.",
  "Confirm exact models, standards, ratings, trip units/settings, device order, voltage, poles, frequency, fault type and all manufacturer table conditions. The app cannot validate the source documents.",
  "Use the maximum prospective RMS fault current at each device location, without reducing it for the upstream device's current-limiting effect. A simple voltage/Zs estimate is not sufficient maximum-PFC evidence.",
  "Backup protection uses only the entered manufacturer-tested combination limit. It gives no credit to the upstream device's own breaking capacity and does not establish selectivity.",
  "The selectivity comparison requires site PFC strictly below the documented numeric limit. Equality requires boundary review. A table marked T must be resolved to its applicable numeric limit from the manufacturer's definition, never infinity.",
  "Stand-alone or backup breaking capacity and selectivity are separate comparisons. A positive selectivity comparison does not correct a failed breaking-capacity check.",
  "Check every relevant supply source and fault case separately. Overload coordination, RCD selectivity, ADS/disconnection time, Zs, conductor thermal withstand and assembly compatibility remain separate checks.",
];

export function deviceCoordinationSummary(input = {}) {
  const errors = [];
  const values = {
    upstreamDeviceReference: text(input.upstreamDeviceReference), downstreamDeviceReference: text(input.downstreamDeviceReference),
    supplyConditions: text(input.supplyConditions), circuitEvidenceReference: text(input.circuitEvidenceReference),
    supplyVoltageVolts: positiveCalculatorNumber(input.supplyVoltageVolts),
    upstreamBreakingCapacityKa: positiveCalculatorNumber(input.upstreamBreakingCapacityKa), upstreamFaultCurrentKa: positiveCalculatorNumber(input.upstreamFaultCurrentKa),
    downstreamBreakingCapacityKa: positiveCalculatorNumber(input.downstreamBreakingCapacityKa), downstreamFaultCurrentKa: positiveCalculatorNumber(input.downstreamFaultCurrentKa),
    backupLimitKa: input.backupMode === "manufacturer" ? positiveCalculatorNumber(input.backupLimitKa) : null,
    backupEvidenceReference: input.backupMode === "manufacturer" ? text(input.backupEvidenceReference) : null,
    selectivityLimitKa: input.selectivityMode === "documented" ? nonNegativeCalculatorNumber(input.selectivityLimitKa) : null,
    selectivityEvidenceReference: input.selectivityMode === "documented" ? text(input.selectivityEvidenceReference) : null,
  };
  for (const [key, label] of [
    ["upstreamDeviceReference", "upstream device identification"],
    ["downstreamDeviceReference", "downstream device identification"],
    ["supplyConditions", "supply, poles and fault-case conditions"],
    ["circuitEvidenceReference", "site fault-current and device-rating evidence"],
  ]) {
    if (values[key] === null) errors.push(`Enter ${label} (up to 2,000 characters).`);
  }
  for (const [key, label] of [
    ["supplyVoltageVolts", "supply voltage"],
    ["upstreamBreakingCapacityKa", "upstream stand-alone breaking capacity"],
    ["upstreamFaultCurrentKa", "maximum PFC at the upstream device"],
    ["downstreamBreakingCapacityKa", "downstream stand-alone breaking capacity"],
    ["downstreamFaultCurrentKa", "maximum PFC at the downstream device"],
  ]) {
    if (values[key] === null) errors.push(`Enter a positive finite ${label}.`);
  }
  const backupMode = input.backupMode;
  const selectivityMode = input.selectivityMode;
  if (!["none", "manufacturer"].includes(backupMode)) errors.push("Choose whether manufacturer backup evidence is being used.");
  if (!["unassessed", "documented"].includes(selectivityMode)) errors.push("Choose whether a documented selectivity limit is available.");
  if (backupMode === "manufacturer") {
    if (values.backupLimitKa === null) errors.push("Enter the positive manufacturer-tested backup limit in kA.");
    if (values.backupEvidenceReference === null) errors.push("Enter the backup document, revision, table and conditions (up to 2,000 characters).");
    if (values.backupLimitKa !== null && values.downstreamBreakingCapacityKa !== null && values.backupLimitKa < values.downstreamBreakingCapacityKa) errors.push("The backup limit is below the stand-alone capacity. Review the ratings and source conditions.");
  }
  if (selectivityMode === "documented") {
    if (values.selectivityLimitKa === null) errors.push("Enter a finite numeric selectivity limit in kA; explicit zero records no selectivity.");
    if (values.selectivityEvidenceReference === null) errors.push("Enter the selectivity document, revision, table and conditions (up to 2,000 characters).");
  }
  if (input.evidenceConfirmed !== true) errors.push("Confirm the evidence matches this exact device pair and supply/fault case.");

  const hasCompleteInputs = errors.length === 0;
  const effectiveDownstreamCapacityKa = hasCompleteInputs ? (backupMode === "manufacturer" ? values.backupLimitKa : values.downstreamBreakingCapacityKa) : null;
  const upstreamCapacityAdequate = hasCompleteInputs ? values.upstreamBreakingCapacityKa >= values.upstreamFaultCurrentKa : null;
  const downstreamStandaloneAdequate = hasCompleteInputs ? values.downstreamBreakingCapacityKa >= values.downstreamFaultCurrentKa : null;
  const downstreamCapacityAdequate = hasCompleteInputs ? effectiveDownstreamCapacityKa >= values.downstreamFaultCurrentKa : null;
  const selectivityCovered = hasCompleteInputs && selectivityMode === "documented" ? values.downstreamFaultCurrentKa < values.selectivityLimitKa : null;
  return {
    ...values, backupMode, selectivityMode, hasCompleteInputs, errors, assumptions: [...assumptions],
    effectiveDownstreamCapacityKa, upstreamCapacityAdequate, downstreamStandaloneAdequate, downstreamCapacityAdequate, selectivityCovered,
    upstreamMarginKa: hasCompleteInputs ? values.upstreamBreakingCapacityKa - values.upstreamFaultCurrentKa : null,
    downstreamMarginKa: hasCompleteInputs ? effectiveDownstreamCapacityKa - values.downstreamFaultCurrentKa : null,
    selectivityMarginKa: hasCompleteInputs && selectivityMode === "documented" ? values.selectivityLimitKa - values.downstreamFaultCurrentKa : null,
    meetsEnteredChecks: hasCompleteInputs && upstreamCapacityAdequate && downstreamCapacityAdequate && selectivityCovered === true,
  };
}
