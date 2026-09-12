function nonNegativeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function positiveNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function percentage(value, fallback = 100) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(100, Math.max(0, number));
}

export function calculateEarthFaultLoopImpedance({ externalEarthFaultLoopOhms, lineConductorResistanceOhms, cpcResistanceOhms }) {
  return nonNegativeNumber(externalEarthFaultLoopOhms)
    + nonNegativeNumber(lineConductorResistanceOhms)
    + nonNegativeNumber(cpcResistanceOhms);
}

export function maximumPermittedEarthFaultLoop({ tabulatedMaximumZsOhms, permittedPercentage = 100 }) {
  const tabulated = positiveNumber(tabulatedMaximumZsOhms);
  if (!tabulated) return 0;
  return tabulated * (percentage(permittedPercentage) / 100);
}

export function prospectiveEarthFaultCurrent({ nominalVoltage = 230, earthFaultLoopImpedanceOhms }) {
  const voltage = positiveNumber(nominalVoltage, 230);
  const impedance = positiveNumber(earthFaultLoopImpedanceOhms);
  if (!impedance) return 0;
  return voltage / impedance;
}

export function earthFaultLoopSummary(input) {
  const nominalVoltage = positiveNumber(input?.nominalVoltage, 230);
  const externalEarthFaultLoopOhms = nonNegativeNumber(input?.externalEarthFaultLoopOhms);
  const lineConductorResistanceOhms = nonNegativeNumber(input?.lineConductorResistanceOhms);
  const cpcResistanceOhms = nonNegativeNumber(input?.cpcResistanceOhms);
  const tabulatedMaximumZsOhms = positiveNumber(input?.tabulatedMaximumZsOhms);
  const permittedPercentage = percentage(input?.permittedPercentage);
  const calculatedZsOhms = calculateEarthFaultLoopImpedance({
    externalEarthFaultLoopOhms,
    lineConductorResistanceOhms,
    cpcResistanceOhms,
  });
  const permittedMaximumZsOhms = maximumPermittedEarthFaultLoop({
    tabulatedMaximumZsOhms,
    permittedPercentage,
  });
  const hasVerifiedLimit = permittedMaximumZsOhms > 0;
  const withinSelectedLimit = hasVerifiedLimit && calculatedZsOhms <= permittedMaximumZsOhms;
  const marginOhms = hasVerifiedLimit ? permittedMaximumZsOhms - calculatedZsOhms : 0;

  return {
    nominalVoltage,
    externalEarthFaultLoopOhms,
    lineConductorResistanceOhms,
    cpcResistanceOhms,
    calculatedZsOhms,
    tabulatedMaximumZsOhms,
    permittedPercentage,
    permittedMaximumZsOhms,
    hasVerifiedLimit,
    withinSelectedLimit,
    marginOhms,
    prospectiveEarthFaultCurrentAmps: prospectiveEarthFaultCurrent({
      nominalVoltage,
      earthFaultLoopImpedanceOhms: calculatedZsOhms,
    }),
    assumptions: [
      "Enter the verified tabulated maximum Zs for the selected protective device and disconnection requirement.",
      "The permitted percentage is designer-selected and is not inferred from a fixed BS 7671 table.",
      "Calculated Zs is Ze + R1 + R2 using the entered conductor resistances.",
      "Prospective earth fault current is a simplified voltage divided by Zs design aid.",
      "The result does not replace inspection, testing, manufacturer data or current BS 7671 requirements.",
    ],
  };
}
