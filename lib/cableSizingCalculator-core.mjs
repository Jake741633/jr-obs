function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function correctionFactor(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 && number <= 1 ? number : 1;
}

export function combinedCorrectionFactor({
  ambientTemperatureFactor = 1,
  groupingFactor = 1,
  insulationFactor = 1,
  otherFactor = 1,
} = {}) {
  return correctionFactor(ambientTemperatureFactor)
    * correctionFactor(groupingFactor)
    * correctionFactor(insulationFactor)
    * correctionFactor(otherFactor);
}

export function requiredTabulatedCurrent({
  designCurrentAmps,
  ambientTemperatureFactor = 1,
  groupingFactor = 1,
  insulationFactor = 1,
  otherFactor = 1,
} = {}) {
  const designCurrent = positiveNumber(designCurrentAmps);
  if (!designCurrent) return 0;

  const factor = combinedCorrectionFactor({
    ambientTemperatureFactor,
    groupingFactor,
    insulationFactor,
    otherFactor,
  });

  return factor > 0 ? designCurrent / factor : 0;
}

export function selectMinimumCableSize({ requiredCurrentAmps, cableOptions = [] } = {}) {
  const requiredCurrent = positiveNumber(requiredCurrentAmps);
  if (!requiredCurrent || !Array.isArray(cableOptions)) return null;

  const candidates = cableOptions
    .map((option) => ({
      ...option,
      sizeMm2: positiveNumber(option?.sizeMm2),
      tabulatedCurrentAmps: positiveNumber(option?.tabulatedCurrentAmps),
    }))
    .filter((option) => option.sizeMm2 && option.tabulatedCurrentAmps >= requiredCurrent)
    .sort((a, b) => a.sizeMm2 - b.sizeMm2);

  return candidates[0] ?? null;
}

export function cableSizingSummary({
  designCurrentAmps,
  ambientTemperatureFactor = 1,
  groupingFactor = 1,
  insulationFactor = 1,
  otherFactor = 1,
  cableOptions = [],
} = {}) {
  const designCurrent = positiveNumber(designCurrentAmps);
  const combinedFactor = combinedCorrectionFactor({
    ambientTemperatureFactor,
    groupingFactor,
    insulationFactor,
    otherFactor,
  });
  const requiredCurrent = requiredTabulatedCurrent({
    designCurrentAmps: designCurrent,
    ambientTemperatureFactor,
    groupingFactor,
    insulationFactor,
    otherFactor,
  });
  const selectedCable = selectMinimumCableSize({
    requiredCurrentAmps: requiredCurrent,
    cableOptions,
  });

  return {
    designCurrentAmps: designCurrent,
    combinedCorrectionFactor: combinedFactor,
    requiredTabulatedCurrentAmps: requiredCurrent,
    selectedCable,
    hasSuitableCable: Boolean(selectedCable),
    assumptions: [
      "Correction factors are multiplied before deriving the minimum tabulated current-carrying capacity.",
      "Cable options must be supplied from verified BS 7671 tables or current manufacturer data for the actual installation method.",
      "This deterministic result is a design aid only. Final cable selection must also satisfy voltage drop, fault protection, adiabatic, protective device and installation requirements.",
    ],
  };
}
