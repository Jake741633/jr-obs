function nonNegativeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function positiveInteger(value, fallback = 1) {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function demandFactor(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 1;
  return Math.min(1, Math.max(0, number));
}

function loadPhase(value) {
  return value === "L1" || value === "L2" || value === "L3" || value === "Three phase"
    ? value
    : "L1";
}

export function normaliseMaximumDemandLoad(load, index = 0) {
  const quantity = positiveInteger(load?.quantity);
  const connectedCurrentAmps = nonNegativeNumber(load?.connectedCurrentAmps);
  const factor = demandFactor(load?.demandFactor);
  const phase = loadPhase(load?.phase);
  const connectedTotalAmps = connectedCurrentAmps * quantity;
  const diversifiedCurrentAmps = connectedTotalAmps * factor;

  return {
    id: String(load?.id || `load-${index + 1}`),
    description: String(load?.description || `Load ${index + 1}`).trim() || `Load ${index + 1}`,
    quantity,
    connectedCurrentAmps,
    demandFactor: factor,
    phase,
    connectedTotalAmps,
    diversifiedCurrentAmps,
  };
}

export function maximumDemandSummary(input) {
  const loads = Array.isArray(input?.loads)
    ? input.loads.map((load, index) => normaliseMaximumDemandLoad(load, index))
    : [];

  const phaseDemandAmps = { L1: 0, L2: 0, L3: 0 };
  let totalConnectedCurrentAmps = 0;
  let totalDiversifiedCurrentAmps = 0;

  for (const load of loads) {
    totalConnectedCurrentAmps += load.connectedTotalAmps;
    totalDiversifiedCurrentAmps += load.diversifiedCurrentAmps;

    if (load.phase === "Three phase") {
      phaseDemandAmps.L1 += load.diversifiedCurrentAmps;
      phaseDemandAmps.L2 += load.diversifiedCurrentAmps;
      phaseDemandAmps.L3 += load.diversifiedCurrentAmps;
    } else {
      phaseDemandAmps[load.phase] += load.diversifiedCurrentAmps;
    }
  }

  const maximumPhaseDemandAmps = Math.max(
    phaseDemandAmps.L1,
    phaseDemandAmps.L2,
    phaseDemandAmps.L3,
  );
  const minimumPhaseDemandAmps = Math.min(
    phaseDemandAmps.L1,
    phaseDemandAmps.L2,
    phaseDemandAmps.L3,
  );
  const overallDemandFactor = totalConnectedCurrentAmps > 0
    ? totalDiversifiedCurrentAmps / totalConnectedCurrentAmps
    : 0;

  return {
    loads,
    totalConnectedCurrentAmps,
    totalDiversifiedCurrentAmps,
    overallDemandFactor,
    phaseDemandAmps,
    maximumPhaseDemandAmps,
    phaseImbalanceAmps: maximumPhaseDemandAmps - minimumPhaseDemandAmps,
    assumptions: [
      "Demand factors must be selected and justified by the designer for the actual installation.",
      "A three-phase load contributes its stated line current to each phase.",
      "The highest phase demand is reported for supply and protective-device assessment.",
      "This result is a design aid and does not by itself confirm compliance with BS 7671 or distributor requirements.",
    ],
  };
}
