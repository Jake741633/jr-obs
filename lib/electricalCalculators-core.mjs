import { positiveCalculatorNumber as positive, formatCalculatorNumber as format } from "./electricalCalculatorNumbers-core.mjs";

function ratio(value) {
  const number = positive(value);
  return number !== null && number <= 1 ? number : null;
}

function loadCurrent(input, threePhase) {
  const power = positive(input?.powerWatts);
  const voltage = positive(input?.voltage);
  const pf = ratio(input?.powerFactor);
  const eta = ratio(input?.efficiency);
  if ([power, voltage, pf, eta].includes(null)) return null;
  const denominator = positive((threePhase ? Math.sqrt(3) : 1) * voltage * pf * eta);
  return denominator === null ? null : positive(power / denominator);
}

export function singlePhaseCurrent(input) {
  return loadCurrent(input, false);
}

export function threePhaseCurrent(input) {
  return loadCurrent(input, true);
}

export function apparentPowerVa({ activePowerWatts, powerFactor }) {
  const power = positive(activePowerWatts);
  const pf = ratio(powerFactor);
  return power === null || pf === null ? null : positive(power / pf);
}

export function electricalLoadSummary(input = {}) {
  const phase = ["Single phase", "Three phase"].includes(input.phase) ? input.phase : null;
  const powerWatts = positive(input.powerWatts);
  const voltage = positive(input.voltage);
  const powerFactor = ratio(input.powerFactor);
  const efficiency = ratio(input.efficiency);
  const errors = [];
  if (phase === null) errors.push("Select a supported supply phase.");
  if (powerWatts === null) errors.push("Enter a positive load power; blank is not zero.");
  if (voltage === null) errors.push("Enter a positive supply voltage.");
  if (powerFactor === null) errors.push("Enter a power factor greater than zero and no more than 1.");
  if (efficiency === null) errors.push("Enter an efficiency greater than zero and no more than 1.");
  let inputPowerWatts = null;
  let apparentPower = null;
  let currentAmps = null;
  if (errors.length === 0) {
    inputPowerWatts = positive(powerWatts / efficiency);
    apparentPower = apparentPowerVa({ activePowerWatts: inputPowerWatts, powerFactor });
    currentAmps = loadCurrent({ powerWatts, voltage, powerFactor, efficiency }, phase === "Three phase");
    if ([inputPowerWatts, apparentPower, currentAmps].includes(null)) errors.push("The load calculation is outside the supported numeric range.");
  }
  const hasCompleteInputs = errors.length === 0;
  return {
    phase, powerWatts, voltage, powerFactor, efficiency, hasCompleteInputs, errors,
    inputPowerWatts: hasCompleteInputs ? inputPowerWatts : null,
    apparentPowerVa: hasCompleteInputs ? apparentPower : null,
    currentAmps: hasCompleteInputs ? currentAmps : null,
    assumptions: [
      `Supply: ${phase?.toLowerCase() ?? "unselected"} at ${format(voltage)} V`,
      `Power factor: ${format(powerFactor)}; efficiency: ${format(efficiency)}`,
      "For motor output power, input active power = entered power / efficiency. For known electrical input power, use efficiency 1.",
      "Apparent power = input active power / power factor. Three-phase current assumes a balanced load and line-to-line voltage.",
      "Calculated current is a design aid only and does not select a cable or protective device.",
    ],
  };
}
