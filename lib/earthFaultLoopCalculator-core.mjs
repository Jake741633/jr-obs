import { nonNegativeCalculatorNumber as nonNegative, positiveCalculatorNumber as positive } from "./electricalCalculatorNumbers-core.mjs";

function percentage(value) {
  const number = positive(value);
  return number !== null && number <= 100 ? number : null;
}

export function calculateEarthFaultLoopImpedance({ externalEarthFaultLoopOhms, lineConductorResistanceOhms, cpcResistanceOhms } = {}) {
  const values = [externalEarthFaultLoopOhms, lineConductorResistanceOhms, cpcResistanceOhms].map(nonNegative);
  if (values.some((value) => value === null)) return null;
  return positive(values.reduce((sum, value) => sum + value, 0));
}

export function maximumPermittedEarthFaultLoop({ tabulatedMaximumZsOhms, permittedPercentage = 100 } = {}) {
  const tabulated = positive(tabulatedMaximumZsOhms);
  const percent = percentage(permittedPercentage);
  if (tabulated === null || percent === null) return null;
  return positive(tabulated * (percent / 100));
}

export function prospectiveEarthFaultCurrent({ nominalVoltage = 230, earthFaultLoopImpedanceOhms } = {}) {
  const voltage = positive(nominalVoltage);
  const impedance = positive(earthFaultLoopImpedanceOhms);
  if (voltage === null || impedance === null) return null;
  return positive(voltage / impedance);
}

export function earthFaultLoopSummary(input) {
  const nominalVoltage = positive(input?.nominalVoltage);
  const externalEarthFaultLoopOhms = nonNegative(input?.externalEarthFaultLoopOhms);
  const lineConductorResistanceOhms = nonNegative(input?.lineConductorResistanceOhms);
  const cpcResistanceOhms = nonNegative(input?.cpcResistanceOhms);
  const tabulatedMaximumZsOhms = positive(input?.tabulatedMaximumZsOhms);
  const permittedPercentage = percentage(input?.permittedPercentage);
  const errors = [];
  if (nominalVoltage === null) errors.push("Enter a positive nominal voltage.");
  for (const [value, label] of [[externalEarthFaultLoopOhms, "Ze"], [lineConductorResistanceOhms, "R1"], [cpcResistanceOhms, "R2"]]) {
    if (value === null) errors.push(`Enter a non-negative resistance for ${label}; a blank is not zero.`);
  }
  if (tabulatedMaximumZsOhms === null) errors.push("Enter a positive verified tabulated maximum Zs.");
  if (permittedPercentage === null) errors.push("Enter a permitted percentage greater than 0 and no more than 100.");

  const calculatedZsOhms = calculateEarthFaultLoopImpedance({ externalEarthFaultLoopOhms, lineConductorResistanceOhms, cpcResistanceOhms });
  const permittedMaximumZsOhms = maximumPermittedEarthFaultLoop({ tabulatedMaximumZsOhms, permittedPercentage });
  const prospectiveEarthFaultCurrentAmps = prospectiveEarthFaultCurrent({ nominalVoltage, earthFaultLoopImpedanceOhms: calculatedZsOhms });
  if (errors.length === 0 && (calculatedZsOhms === null || permittedMaximumZsOhms === null || prospectiveEarthFaultCurrentAmps === null)) {
    errors.push("The circuit must have a positive total impedance and finite, non-zero calculated values. Check the entered values and units.");
  }
  const hasCompleteInputs = errors.length === 0;
  return {
    nominalVoltage,
    externalEarthFaultLoopOhms,
    lineConductorResistanceOhms,
    cpcResistanceOhms,
    calculatedZsOhms,
    tabulatedMaximumZsOhms,
    permittedPercentage,
    permittedMaximumZsOhms,
    hasVerifiedLimit: permittedMaximumZsOhms !== null,
    hasCompleteInputs,
    withinSelectedLimit: hasCompleteInputs && calculatedZsOhms <= permittedMaximumZsOhms,
    marginOhms: hasCompleteInputs ? permittedMaximumZsOhms - calculatedZsOhms : null,
    prospectiveEarthFaultCurrentAmps,
    errors,
    assumptions: [
      "Enter the verified tabulated maximum Zs for the selected protective device and disconnection requirement.",
      "The permitted percentage is designer-selected and is not inferred from a fixed BS 7671 table.",
      "Calculated Zs is Ze + R1 + R2 using the entered conductor resistances. Apply the appropriate conductor temperature correction before entry.",
      "Prospective earth fault current is a simplified voltage divided by Zs design aid, not a maximum fault-current or device breaking-capacity assessment.",
      "Displayed values are rounded; comparison uses unrounded values.",
      "The result does not replace inspection, testing, manufacturer data or current BS 7671 requirements.",
    ],
  };
}
