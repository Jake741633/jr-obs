function nonNegativeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function positiveNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

export function requiredAdiabaticConductorSize({ faultCurrentAmps, disconnectionTimeSeconds, kFactor }) {
  const current = positiveNumber(faultCurrentAmps);
  const time = nonNegativeNumber(disconnectionTimeSeconds);
  const k = positiveNumber(kFactor);

  if (!current || !time || !k) return 0;
  return (current * Math.sqrt(time)) / k;
}

export function maximumAdiabaticFaultCurrent({ conductorSizeMm2, disconnectionTimeSeconds, kFactor }) {
  const size = positiveNumber(conductorSizeMm2);
  const time = nonNegativeNumber(disconnectionTimeSeconds);
  const k = positiveNumber(kFactor);

  if (!size || !time || !k) return 0;
  return (k * size) / Math.sqrt(time);
}

export function adiabaticSummary(input) {
  const faultCurrentAmps = positiveNumber(input?.faultCurrentAmps);
  const disconnectionTimeSeconds = nonNegativeNumber(input?.disconnectionTimeSeconds);
  const conductorSizeMm2 = positiveNumber(input?.conductorSizeMm2);
  const kFactor = positiveNumber(input?.kFactor);
  const requiredConductorSizeMm2 = requiredAdiabaticConductorSize({
    faultCurrentAmps,
    disconnectionTimeSeconds,
    kFactor,
  });
  const hasCompleteInputs = Boolean(
    faultCurrentAmps
      && disconnectionTimeSeconds
      && conductorSizeMm2
      && kFactor,
  );
  const conductorIsAdequate = hasCompleteInputs && conductorSizeMm2 >= requiredConductorSizeMm2;
  const sizeMarginMm2 = hasCompleteInputs ? conductorSizeMm2 - requiredConductorSizeMm2 : 0;

  return {
    faultCurrentAmps,
    disconnectionTimeSeconds,
    conductorSizeMm2,
    kFactor,
    requiredConductorSizeMm2,
    maximumFaultCurrentAmps: maximumAdiabaticFaultCurrent({
      conductorSizeMm2,
      disconnectionTimeSeconds,
      kFactor,
    }),
    hasCompleteInputs,
    conductorIsAdequate,
    sizeMarginMm2,
    assumptions: [
      "Uses the adiabatic relationship S = I × √t ÷ k.",
      "Enter a verified k-factor for the conductor material, insulation and temperature limits.",
      "Fault current and disconnection time must be based on the actual protective device and installation conditions.",
      "The result does not replace current BS 7671 tables, manufacturer data, inspection or engineering judgement.",
    ],
  };
}
