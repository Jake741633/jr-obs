import { positiveCalculatorNumber as positive, formatCalculatorNumber as format } from "./electricalCalculatorNumbers-core.mjs";

function percentage(value) {
  const number = positive(value);
  return number !== null && number <= 100 ? number : null;
}

export function voltageDropVolts({ millivoltsPerAmpMetre, designCurrentAmps, routeLengthMetres }) {
  const mv = positive(millivoltsPerAmpMetre);
  const current = positive(designCurrentAmps);
  const length = positive(routeLengthMetres);
  if ([mv, current, length].includes(null)) return null;
  const product = positive(mv * current * length);
  return product === null ? null : positive(product / 1000);
}

export function voltageDropPercent({ voltageDrop, nominalVoltage }) {
  const drop = positive(voltageDrop);
  const voltage = positive(nominalVoltage);
  return drop === null || voltage === null ? null : positive((drop / voltage) * 100);
}

export function maximumVoltageDropVolts({ nominalVoltage, maximumPercent }) {
  const voltage = positive(nominalVoltage);
  const percent = percentage(maximumPercent);
  return voltage === null || percent === null ? null : positive(voltage * (percent / 100));
}

export function voltageDropSummary(input = {}) {
  const phase = ["Single phase", "Three phase"].includes(input.phase) ? input.phase : null;
  const nominalVoltage = positive(input.nominalVoltage);
  const designCurrentAmps = positive(input.designCurrentAmps);
  const routeLengthMetres = positive(input.routeLengthMetres);
  const millivoltsPerAmpMetre = positive(input.millivoltsPerAmpMetre);
  const maximumPercent = percentage(input.maximumPercent);
  const errors = [];
  if (phase === null) errors.push("Select a supported supply phase.");
  for (const [label, value] of [["supply voltage", nominalVoltage], ["design current", designCurrentAmps], ["route length", routeLengthMetres], ["verified mV/A/m", millivoltsPerAmpMetre]]) {
    if (value === null) errors.push(`Enter a positive ${label}; blank is not zero.`);
  }
  if (maximumPercent === null) errors.push("Enter a selected voltage-drop limit greater than zero and no more than 100%.");
  let drop = null;
  let percent = null;
  let maximum = null;
  if (errors.length === 0) {
    drop = voltageDropVolts({ millivoltsPerAmpMetre, designCurrentAmps, routeLengthMetres });
    percent = voltageDropPercent({ voltageDrop: drop, nominalVoltage });
    maximum = maximumVoltageDropVolts({ nominalVoltage, maximumPercent });
    if ([drop, percent, maximum].includes(null)) errors.push("The voltage-drop calculation is outside the supported numeric range.");
  }
  const hasCompleteInputs = errors.length === 0;
  return {
    phase, nominalVoltage, designCurrentAmps, routeLengthMetres, millivoltsPerAmpMetre, maximumPercent, hasCompleteInputs, errors,
    voltageDropVolts: hasCompleteInputs ? drop : null,
    voltageDropPercent: hasCompleteInputs ? percent : null,
    maximumVoltageDropVolts: hasCompleteInputs ? maximum : null,
    remainingVoltageDropVolts: hasCompleteInputs ? Math.max(0, maximum - drop) : null,
    withinSelectedLimit: hasCompleteInputs && drop <= maximum,
    assumptions: [
      `Supply: ${phase?.toLowerCase() ?? "unselected"} at ${format(nominalVoltage)} V`,
      `Route length: ${format(routeLengthMetres)} m; design current: ${format(designCurrentAmps)} A`,
      `Conductor value: ${format(millivoltsPerAmpMetre)} mV/A/m; selected limit: ${format(maximumPercent)}%`,
      "Use the mV/A/m value applicable to the selected cable, conductor temperature, phase arrangement and installation design. The value must already include the applicable circuit arrangement; no extra phase multiplier is applied.",
      "This result is a design aid only and must be verified against the current BS 7671 requirements and actual installation conditions.",
    ],
  };
}
