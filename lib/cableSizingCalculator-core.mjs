import { positiveCalculatorNumber as positive } from "./electricalCalculatorNumbers-core.mjs";

/** @typedef {{ sizeMm2: unknown, tabulatedCurrentAmps: unknown }} CableOption */

export function combinedCorrectionFactor(input = {}) {
  const factors = [input.ambientTemperatureFactor, input.groupingFactor, input.insulationFactor, input.otherFactor].map(positive);
  if (factors.includes(null)) return null;
  return positive(factors.reduce((product, factor) => product * factor, 1));
}

export function requiredTabulatedCurrent(input = {}) {
  const current = positive(input.designCurrentAmps);
  const factor = combinedCorrectionFactor(input);
  return current === null || factor === null ? null : positive(current / factor);
}

/** @param {{ requiredCurrentAmps?: unknown, cableOptions?: CableOption[] }} [input] */
export function selectMinimumCableSize({ requiredCurrentAmps, cableOptions = [] } = {}) {
  const required = positive(requiredCurrentAmps);
  if (required === null || !Array.isArray(cableOptions)) return null;
  const candidates = cableOptions
    .map((option) => ({ ...option, sizeMm2: positive(option?.sizeMm2), tabulatedCurrentAmps: positive(option?.tabulatedCurrentAmps) }))
    .filter((option) => option.sizeMm2 !== null && option.tabulatedCurrentAmps !== null && option.tabulatedCurrentAmps >= required)
    .sort((a, b) => a.sizeMm2 - b.sizeMm2);
  return candidates[0] ?? null;
}

/**
 * @param {{ designCurrentAmps?: unknown, ambientTemperatureFactor?: unknown,
 * groupingFactor?: unknown, insulationFactor?: unknown, otherFactor?: unknown,
 * cableOptions?: CableOption[] }} [input]
 */
export function cableSizingSummary(input = {}) {
  const designCurrent = positive(input.designCurrentAmps);
  const combinedFactor = combinedCorrectionFactor(input);
  const requiredCurrent = requiredTabulatedCurrent(input);
  const errors = [];
  if (designCurrent === null) errors.push("Enter a positive design current; blank is not zero.");
  for (const [key, label] of [["ambientTemperatureFactor", "ambient temperature"], ["groupingFactor", "grouping"], ["insulationFactor", "thermal insulation"], ["otherFactor", "other"]]) {
    if (positive(input[key]) === null) errors.push(`Enter a positive verified ${label} factor; use 1 only where no correction applies.`);
  }
  const options = input.cableOptions;
  if (!Array.isArray(options) || options.length === 0 || options.some((option) => positive(option?.sizeMm2) === null || positive(option?.tabulatedCurrentAmps) === null)) {
    errors.push("Enter a positive verified cable size and tabulated rating for every option.");
  }
  if (errors.length === 0 && (combinedFactor === null || requiredCurrent === null || options.some((option) => positive(positive(option.tabulatedCurrentAmps) * combinedFactor) === null))) {
    errors.push("The cable calculation is outside the supported numeric range.");
  }
  const hasCompleteInputs = errors.length === 0;
  const selectedCable = hasCompleteInputs ? selectMinimumCableSize({ requiredCurrentAmps: requiredCurrent, cableOptions: options }) : null;
  return {
    designCurrentAmps: designCurrent, hasCompleteInputs, errors,
    combinedCorrectionFactor: hasCompleteInputs ? combinedFactor : null,
    requiredTabulatedCurrentAmps: hasCompleteInputs ? requiredCurrent : null,
    selectedCable, hasSuitableCable: Boolean(selectedCable),
    assumptions: [
      "Correction factors are multiplied before deriving the minimum tabulated current-carrying capacity for design current only. Enter every applicable factor; 1 means no correction. Verified factors above 1 are supported.",
      "Cable options must be supplied from verified BS 7671 tables or current manufacturer data for the actual installation method.",
      "This deterministic result is a design aid only. Final cable selection must also satisfy voltage drop, fault protection, adiabatic, protective device and installation requirements.",
    ],
  };
}
