function nonNegativeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function positiveNumber(value, fallback = 0) {
  const number = nonNegativeNumber(value, fallback);
  return number > 0 ? number : fallback;
}

export function voltageDropVolts({
  millivoltsPerAmpMetre,
  designCurrentAmps,
  routeLengthMetres,
}) {
  const mvPerAmpMetre = nonNegativeNumber(millivoltsPerAmpMetre);
  const current = nonNegativeNumber(designCurrentAmps);
  const length = nonNegativeNumber(routeLengthMetres);
  if (!mvPerAmpMetre || !current || !length) return 0;
  return (mvPerAmpMetre * current * length) / 1000;
}

export function voltageDropPercent({ voltageDrop, nominalVoltage }) {
  const drop = nonNegativeNumber(voltageDrop);
  const voltage = positiveNumber(nominalVoltage);
  if (!drop || !voltage) return 0;
  return (drop / voltage) * 100;
}

export function maximumVoltageDropVolts({ nominalVoltage, maximumPercent }) {
  const voltage = positiveNumber(nominalVoltage);
  const percent = nonNegativeNumber(maximumPercent);
  if (!voltage || !percent) return 0;
  return voltage * (percent / 100);
}

export function voltageDropSummary(input = {}) {
  const phase = input.phase === "Three phase" ? "Three phase" : "Single phase";
  const nominalVoltage = positiveNumber(input.nominalVoltage, phase === "Three phase" ? 400 : 230);
  const designCurrentAmps = nonNegativeNumber(input.designCurrentAmps);
  const routeLengthMetres = nonNegativeNumber(input.routeLengthMetres);
  const millivoltsPerAmpMetre = nonNegativeNumber(input.millivoltsPerAmpMetre);
  const maximumPercent = nonNegativeNumber(input.maximumPercent, 3);
  const dropVolts = voltageDropVolts({
    millivoltsPerAmpMetre,
    designCurrentAmps,
    routeLengthMetres,
  });
  const dropPercent = voltageDropPercent({ voltageDrop: dropVolts, nominalVoltage });
  const maximumDropVolts = maximumVoltageDropVolts({ nominalVoltage, maximumPercent });

  return {
    phase,
    nominalVoltage,
    designCurrentAmps,
    routeLengthMetres,
    millivoltsPerAmpMetre,
    maximumPercent,
    voltageDropVolts: dropVolts,
    voltageDropPercent: dropPercent,
    maximumVoltageDropVolts: maximumDropVolts,
    remainingVoltageDropVolts: Math.max(0, maximumDropVolts - dropVolts),
    withinSelectedLimit: dropVolts <= maximumDropVolts,
    assumptions: [
      `Supply: ${phase.toLowerCase()} at ${nominalVoltage} V`,
      `Route length entered: ${routeLengthMetres} m`,
      `Design current entered: ${designCurrentAmps} A`,
      `Conductor value entered: ${millivoltsPerAmpMetre} mV/A/m`,
      `Selected voltage-drop limit: ${maximumPercent}%`,
      "Use the mV/A/m value applicable to the selected cable, conductor temperature, phase arrangement and installation design.",
      "This result is a design aid only and must be verified against the current BS 7671 requirements and actual installation conditions.",
    ],
  };
}
