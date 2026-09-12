function positiveNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function clampPowerFactor(value) {
  const number = positiveNumber(value, 1);
  if (number <= 0) return 1;
  return Math.min(1, number);
}

export function singlePhaseCurrent({ powerWatts, voltage = 230, powerFactor = 1, efficiency = 1 }) {
  const power = positiveNumber(powerWatts);
  const supplyVoltage = positiveNumber(voltage, 230);
  const pf = clampPowerFactor(powerFactor);
  const eta = clampPowerFactor(efficiency);
  if (!power || !supplyVoltage) return 0;
  return power / (supplyVoltage * pf * eta);
}

export function threePhaseCurrent({ powerWatts, voltage = 400, powerFactor = 1, efficiency = 1 }) {
  const power = positiveNumber(powerWatts);
  const lineVoltage = positiveNumber(voltage, 400);
  const pf = clampPowerFactor(powerFactor);
  const eta = clampPowerFactor(efficiency);
  if (!power || !lineVoltage) return 0;
  return power / (Math.sqrt(3) * lineVoltage * pf * eta);
}

export function apparentPowerVa({ activePowerWatts, powerFactor = 1 }) {
  const activePower = positiveNumber(activePowerWatts);
  const pf = clampPowerFactor(powerFactor);
  if (!activePower) return 0;
  return activePower / pf;
}

export function electricalLoadSummary(input) {
  const phase = input?.phase === "Three phase" ? "Three phase" : "Single phase";
  const powerWatts = positiveNumber(input?.powerWatts);
  const voltage = positiveNumber(input?.voltage, phase === "Three phase" ? 400 : 230);
  const powerFactor = clampPowerFactor(input?.powerFactor);
  const efficiency = clampPowerFactor(input?.efficiency);
  const currentAmps = phase === "Three phase"
    ? threePhaseCurrent({ powerWatts, voltage, powerFactor, efficiency })
    : singlePhaseCurrent({ powerWatts, voltage, powerFactor, efficiency });

  return {
    phase,
    powerWatts,
    voltage,
    powerFactor,
    efficiency,
    apparentPowerVa: apparentPowerVa({ activePowerWatts: powerWatts, powerFactor }),
    currentAmps,
    assumptions: [
      `Supply: ${phase.toLowerCase()} at ${voltage} V`,
      `Power factor: ${powerFactor}`,
      `Efficiency: ${efficiency}`,
      "Calculated current is a design aid only and does not select a cable or protective device.",
    ],
  };
}
