import { positiveCalculatorNumber as positive, nonNegativeCalculatorNumber as nonNegative } from "./electricalCalculatorNumbers-core.mjs";

function demandFactor(value) {
  const number = nonNegative(value);
  return number !== null && number <= 1 ? number : null;
}

export function maximumDemandFactorFromPercent(value) {
  const percent = nonNegative(value);
  if (percent === null || percent > 100) return null;
  const factor = percent / 100;
  return percent > 0 && factor === 0 ? null : factor;
}

export function normaliseMaximumDemandLoad(load, index = 0) {
  const candidateQuantity = positive(load?.quantity);
  const quantity = Number.isSafeInteger(candidateQuantity) ? candidateQuantity : null;
  const connectedCurrentAmps = positive(load?.connectedCurrentAmps);
  const factor = demandFactor(load?.demandFactor);
  const phase = ["L1", "L2", "L3", "Three phase"].includes(load?.phase) ? load.phase : null;
  const errors = [];
  if (quantity === null) errors.push("Enter a positive whole-number quantity.");
  if (connectedCurrentAmps === null) errors.push("Enter a positive connected current; blank is not zero.");
  if (factor === null) errors.push("Enter a justified demand factor from 0% to 100%; blank is not 0%.");
  if (phase === null) errors.push("Assign a supported phase to the load.");
  let connectedTotalAmps = null;
  let diversifiedCurrentAmps = null;
  if (errors.length === 0) {
    connectedTotalAmps = positive(connectedCurrentAmps * quantity);
    diversifiedCurrentAmps = connectedTotalAmps === null ? null : nonNegative(connectedTotalAmps * factor);
    if (connectedTotalAmps === null || diversifiedCurrentAmps === null || (factor > 0 && diversifiedCurrentAmps === 0)) {
      errors.push("The load calculation is outside the supported numeric range.");
    }
  }
  const hasCompleteInputs = errors.length === 0;
  return {
    id: String(load?.id || `load-${index + 1}`),
    description: String(load?.description || `Load ${index + 1}`).trim() || `Load ${index + 1}`,
    quantity, connectedCurrentAmps, demandFactor: factor, phase, hasCompleteInputs, errors,
    connectedTotalAmps: hasCompleteInputs ? connectedTotalAmps : null,
    diversifiedCurrentAmps: hasCompleteInputs ? diversifiedCurrentAmps : null,
  };
}

export function maximumDemandSummary(input) {
  const loads = Array.isArray(input?.loads) ? input.loads.map((load, index) => normaliseMaximumDemandLoad(load, index)) : [];
  const errors = loads.flatMap((load, index) => load.errors.map((error) => `Load ${index + 1}: ${error}`));
  if (loads.length === 0) errors.push("Add at least one complete load to assess maximum demand.");
  const phaseDemandAmps = { L1: 0, L2: 0, L3: 0 };
  let totalConnectedCurrentAmps = 0;
  let totalDiversifiedCurrentAmps = 0;
  if (errors.length === 0) {
    for (const load of loads) {
      totalConnectedCurrentAmps += load.connectedTotalAmps;
      totalDiversifiedCurrentAmps += load.diversifiedCurrentAmps;
      for (const phase of load.phase === "Three phase" ? ["L1", "L2", "L3"] : [load.phase]) {
        phaseDemandAmps[phase] += load.diversifiedCurrentAmps;
      }
    }
    if (![totalConnectedCurrentAmps, totalDiversifiedCurrentAmps, ...Object.values(phaseDemandAmps)].every(Number.isFinite)) {
      errors.push("The schedule totals are outside the supported numeric range.");
    }
  }
  const overallDemandFactor = totalConnectedCurrentAmps > 0 ? totalDiversifiedCurrentAmps / totalConnectedCurrentAmps : null;
  if (errors.length === 0 && (overallDemandFactor === null || !Number.isFinite(overallDemandFactor) || (totalDiversifiedCurrentAmps > 0 && overallDemandFactor === 0))) {
    errors.push("The schedule demand factor is outside the supported numeric range.");
  }
  const maximumPhaseDemandAmps = Math.max(...Object.values(phaseDemandAmps));
  const minimumPhaseDemandAmps = Math.min(...Object.values(phaseDemandAmps));
  const hasCompleteInputs = errors.length === 0;
  return {
    loads, hasCompleteInputs, errors,
    totalConnectedCurrentAmps: hasCompleteInputs ? totalConnectedCurrentAmps : null,
    totalDiversifiedCurrentAmps: hasCompleteInputs ? totalDiversifiedCurrentAmps : null,
    overallDemandFactor: hasCompleteInputs ? overallDemandFactor : null,
    phaseDemandAmps: hasCompleteInputs ? phaseDemandAmps : { L1: null, L2: null, L3: null },
    maximumPhaseDemandAmps: hasCompleteInputs ? maximumPhaseDemandAmps : null,
    phaseImbalanceAmps: hasCompleteInputs ? maximumPhaseDemandAmps - minimumPhaseDemandAmps : null,
    assumptions: [
      "Demand factors must be selected and justified by the designer for the actual installation. An explicitly entered 0% excludes that load's demand; a blank factor leaves the schedule unassessed.",
      "A balanced three-phase load contributes its stated line current to each phase. Enter unbalanced loads separately by phase.",
      "Schedule sums count each load's current once, including three-phase loads; they are bookkeeping totals, not supply current. Use the highest phase demand for supply and protective-device assessment.",
      "This result is a design aid and does not by itself confirm compliance with BS 7671 or distributor requirements.",
    ],
  };
}
