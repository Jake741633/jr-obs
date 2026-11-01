import { positiveCalculatorNumber as positive } from "./electricalCalculatorNumbers-core.mjs";

// These are entered-evidence comparisons, not device selection or certification.
export function protectiveDeviceSummary(input = {}) {
  const designCurrentAmps = positive(input.designCurrentAmps);
  const deviceRatingAmps = positive(input.deviceRatingAmps);
  const cableCapacityAmps = positive(input.cableCapacityAmps);
  const overloadOperatingCurrentAmps = positive(input.overloadOperatingCurrentAmps);
  const breakingCapacityKa = positive(input.breakingCapacityKa);
  const prospectiveFaultCurrentKa = positive(input.prospectiveFaultCurrentKa);
  const deviceReference = typeof input.deviceReference === "string" ? input.deviceReference.trim() : "";
  const evidenceReference = typeof input.evidenceReference === "string" ? input.evidenceReference.trim() : "";
  const errors = [];
  for (const [label, value] of [
    ["design current Ib", designCurrentAmps], ["device rating or overload setting In/Ir", deviceRatingAmps],
    ["corrected cable capacity Iz", cableCapacityAmps], ["conventional overload operating current I2", overloadOperatingCurrentAmps],
    ["verified breaking capacity", breakingCapacityKa], ["maximum prospective fault current", prospectiveFaultCurrentKa],
  ]) {
    if (value === null) errors.push(`Enter a positive ${label}; blank is not zero.`);
  }
  if (!deviceReference) errors.push("Identify the device, applicable standard and rating or setting.");
  if (!evidenceReference) errors.push("Record the manufacturer and circuit evidence references, including applicable voltage and fault conditions.");
  if (overloadOperatingCurrentAmps !== null && deviceRatingAmps !== null && overloadOperatingCurrentAmps <= deviceRatingAmps) {
    errors.push("I2 must exceed the entered normal rating or setting. Verify the conventional overload operating current, not an instantaneous trip value.");
  }
  const limit = cableCapacityAmps === null ? null : positive(1.45 * cableCapacityAmps);
  if (errors.length === 0 && limit === null) errors.push("The overload calculation is outside the supported numeric range.");
  const hasCompleteInputs = errors.length === 0;
  const loadWithinRating = hasCompleteInputs && designCurrentAmps <= deviceRatingAmps;
  const ratingWithinCable = hasCompleteInputs && deviceRatingAmps <= cableCapacityAmps;
  const overloadWithinLimit = hasCompleteInputs && overloadOperatingCurrentAmps <= limit;
  const breakingCapacityAdequate = hasCompleteInputs && breakingCapacityKa >= prospectiveFaultCurrentKa;
  return {
    designCurrentAmps, deviceRatingAmps, cableCapacityAmps, overloadOperatingCurrentAmps,
    breakingCapacityKa, prospectiveFaultCurrentKa, deviceReference, evidenceReference, errors, hasCompleteInputs,
    maximumOverloadOperatingCurrentAmps: hasCompleteInputs ? limit : null,
    overloadMarginAmps: hasCompleteInputs ? limit - overloadOperatingCurrentAmps : null,
    breakingCapacityMarginKa: hasCompleteInputs ? breakingCapacityKa - prospectiveFaultCurrentKa : null,
    loadWithinRating, ratingWithinCable, overloadWithinLimit, breakingCapacityAdequate,
    meetsEnteredChecks: loadWithinRating && ratingWithinCable && overloadWithinLimit && breakingCapacityAdequate,
    assumptions: [
      "Ib ≤ In/Ir ≤ Iz checks load, device rating or verified overload setting, and corrected cable capacity. Iz must cover the least capable part of the circuit under its actual conditions.",
      "I2 ≤ 1.45 × Iz is a conventional overload check. Enter verified I2 for the device and its conventional operating time; the app does not infer a trip curve or fuse factor.",
      "Breaking capacity must cover maximum prospective fault current at the device location, for the applicable voltage, poles, supply and device standard. Do not substitute the earth-loop page's simple voltage/Zs estimate for maximum fault current.",
      "This check takes no credit for upstream backup protection. Selectivity and cascading need manufacturer coordination evidence and are not assessed.",
      "Design aid only. Verify applicability against current BS 7671 and manufacturer data. Disconnection time, Zs, conductor thermal withstand, RCD requirements, starting currents and final device selection remain separate checks.",
    ],
  };
}
