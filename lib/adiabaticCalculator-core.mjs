import { positiveCalculatorNumber as positive } from "./electricalCalculatorNumbers-core.mjs";

export const MAX_ADIABATIC_SECONDS = 5;
// Supported scope of the simple I²t calculation. Shorter clearing times must
// use manufacturer let-through energy, which also covers current limitation.
export const MIN_CURRENT_TIME_SECONDS = 0.1;

function currentTimeEnergy(current, time) {
  if (current === null || time === null || time < MIN_CURRENT_TIME_SECONDS || time > MAX_ADIABATIC_SECONDS) return null;
  return positive(current * current * time);
}

export function requiredAdiabaticConductorSize({ faultCurrentAmps, disconnectionTimeSeconds, kFactor } = {}) {
  const energy = currentTimeEnergy(positive(faultCurrentAmps), positive(disconnectionTimeSeconds));
  const k = positive(kFactor);
  if (energy === null || k === null) return null;
  return positive(Math.sqrt(energy) / k);
}

export function maximumAdiabaticFaultCurrent({ conductorSizeMm2, disconnectionTimeSeconds, kFactor } = {}) {
  const size = positive(conductorSizeMm2);
  const time = positive(disconnectionTimeSeconds);
  const k = positive(kFactor);
  if (size === null || k === null || time === null || time < MIN_CURRENT_TIME_SECONDS || time > MAX_ADIABATIC_SECONDS) return null;
  return positive(k * size / Math.sqrt(time));
}

export function adiabaticSummary(input) {
  const method = input?.method === undefined ? "current-time" : input.method;
  const faultCurrentAmps = positive(input?.faultCurrentAmps);
  const disconnectionTimeSeconds = positive(input?.disconnectionTimeSeconds);
  const conductorSizeMm2 = positive(input?.conductorSizeMm2);
  const kFactor = positive(input?.kFactor);
  const letThroughEnergyA2s = positive(input?.letThroughEnergyA2s);
  const errors = [];
  if (method !== "current-time" && method !== "energy") errors.push("Select a supported calculation method.");
  if (conductorSizeMm2 === null) errors.push("Enter a positive CPC cross-sectional area.");
  if (kFactor === null) errors.push("Enter a positive verified k-factor.");
  if (disconnectionTimeSeconds === null || disconnectionTimeSeconds > MAX_ADIABATIC_SECONDS) errors.push("Enter a device disconnection time greater than 0 and no more than 5 seconds. Longer durations are outside this calculator.");
  if (method === "current-time") {
    if (faultCurrentAmps === null) errors.push("Enter a positive fault current in amperes.");
    if (disconnectionTimeSeconds !== null && disconnectionTimeSeconds < MIN_CURRENT_TIME_SECONDS) errors.push("For times below 0.1 seconds, use the manufacturer I²t method. Do not substitute prospective current × an assumed trip time.");
  } else if (method === "energy" && letThroughEnergyA2s === null) {
    errors.push("Enter the manufacturer's verified let-through I²t in A²s.");
  }

  let faultEnergyA2s = null;
  let conductorWithstandA2s = null;
  let requiredConductorSizeMm2 = null;
  let maximumFaultCurrentAmps = null;
  if (errors.length === 0) {
    faultEnergyA2s = method === "energy" ? letThroughEnergyA2s : currentTimeEnergy(faultCurrentAmps, disconnectionTimeSeconds);
    conductorWithstandA2s = positive((kFactor * conductorSizeMm2) ** 2);
    requiredConductorSizeMm2 = faultEnergyA2s === null ? null : positive(Math.sqrt(faultEnergyA2s) / kFactor);
    maximumFaultCurrentAmps = method === "current-time" ? maximumAdiabaticFaultCurrent({ conductorSizeMm2, disconnectionTimeSeconds, kFactor }) : null;
    if (faultEnergyA2s === null || conductorWithstandA2s === null || requiredConductorSizeMm2 === null || (method === "current-time" && maximumFaultCurrentAmps === null)) {
      errors.push("The calculation is outside the supported numeric range. Check the entered values and units.");
    }
  }
  const hasCompleteInputs = errors.length === 0;
  return {
    method,
    faultCurrentAmps,
    disconnectionTimeSeconds,
    conductorSizeMm2,
    kFactor,
    letThroughEnergyA2s,
    requiredConductorSizeMm2: hasCompleteInputs ? requiredConductorSizeMm2 : null,
    maximumFaultCurrentAmps: hasCompleteInputs ? maximumFaultCurrentAmps : null,
    faultEnergyA2s: hasCompleteInputs ? faultEnergyA2s : null,
    conductorWithstandA2s: hasCompleteInputs ? conductorWithstandA2s : null,
    hasCompleteInputs,
    conductorIsAdequate: hasCompleteInputs && conductorSizeMm2 >= requiredConductorSizeMm2,
    sizeMarginMm2: hasCompleteInputs ? conductorSizeMm2 - requiredConductorSizeMm2 : null,
    errors,
    assumptions: [
      "Uses S = √(I²t) ÷ k and conductor thermal withstand k²S² for durations no greater than 5 seconds.",
      method === "energy" ? "Use the manufacturer's total let-through I²t for the actual device, voltage and applicable fault-current range." : "The current/time method supports 0.1–5 seconds. Use matched RMS fault current and device clearing time; use manufacturer I²t for current-limiting devices.",
      "Enter a verified k-factor for the conductor material, insulation and initial/final temperature limits. No k-factor is selected automatically.",
      "Check the worst thermal stress across the relevant fault-current range. One entered operating point is not a full protective-device assessment.",
      "The entered CPC must also satisfy mechanical minimum sizes, automatic disconnection, earth-fault loop and installation requirements.",
      "Displayed values are rounded; comparison uses unrounded values. No standard cable size is selected automatically.",
      "Design aid only: verify current BS 7671, manufacturer data and actual site conditions before final design approval.",
    ],
  };
}
