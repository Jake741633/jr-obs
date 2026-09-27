import assert from "node:assert/strict";
import test from "node:test";
import { buildCalculationSnapshot, createCalculationRecord, isCalculationRecord, CALCULATION_RECORDS_STORAGE_KEY } from "../lib/calculationRecords-core.mjs";
import { backupStorageScope, collectAccountBusinessData } from "../lib/cloud/migrationStoragePolicy-core.mjs";
import { collectionCloudMutationRoute } from "../lib/cloud/fieldMutationPolicy-core.mjs";

export const examples = {
  load: { phase: "Single phase", powerWatts: "4600", voltage: "230", powerFactor: "1", efficiency: "1" },
  "voltage-drop": { phase: "Single phase", nominalVoltage: "230", designCurrentAmps: "20", routeLengthMetres: "20", millivoltsPerAmpMetre: "18", maximumPercent: "3" },
  "cable-sizing": { designCurrentAmps: "20", ambientTemperatureFactor: "0.8", groupingFactor: "1", insulationFactor: "1", otherFactor: "1", cableOptions: [{ sizeMm2: "2.5", tabulatedCurrentAmps: "27" }] },
  "earth-fault-loop": { nominalVoltage: "230", externalEarthFaultLoopOhms: "0", lineConductorResistanceOhms: "0.2", cpcResistanceOhms: "0.3", tabulatedMaximumZsOhms: "1", permittedPercentage: "80" },
  adiabatic: { method: "current-time", faultCurrentAmps: "1000", disconnectionTimeSeconds: "0.4", kFactor: "115", conductorSizeMm2: "6" },
  "protective-device": { deviceReference: "Verified device", evidenceReference: "Sheet rev 2, circuit A", designCurrentAmps: "20", deviceRatingAmps: "25", cableCapacityAmps: "32", overloadOperatingCurrentAmps: "36.25", breakingCapacityKa: "6", prospectiveFaultCurrentKa: "5" },
  "maximum-demand": { loads: [{ description: "Balanced load", quantity: "2", connectedCurrentAmps: "16", demandFactor: "0.5", phase: "Three phase" }] },
};
const options = { id: "calculation-a", createdAt: "2026-09-27T12:00:00.000Z", title: "Circuit A", evidenceReference: "Manufacturer sheet rev 2, site survey 14", kind: "load", input: examples.load };
const value = (snapshot, label) => snapshot.outputs.find((row) => row.label === label)?.value;

for (const [kind, input] of Object.entries(examples)) {
  test(`${kind} snapshots retain complete evidence and refuse incomplete inputs`, () => {
    const record = createCalculationRecord({ ...options, kind, input });
    assert.equal(isCalculationRecord(record), true);
    assert.equal(isCalculationRecord(JSON.parse(JSON.stringify(record))), true);
    assert.ok(record.snapshot.assumptions.length > 0);
    assert.ok(record.snapshot.inputs.length > 0);
    assert.ok(record.snapshot.outputs.length > 0);
    assert.match(record.snapshot.warning, /Design aid only/);
    assert.equal(buildCalculationSnapshot(kind, {}), null);
  });
}

test("snapshots retain unrounded results, zero inputs and failed entered checks", () => {
  assert.equal(value(buildCalculationSnapshot("load", examples.load), "Design current"), 20);
  const drop = buildCalculationSnapshot("voltage-drop", examples["voltage-drop"]);
  assert.equal(drop.assessment, "Review required");
  assert.equal(value(drop, "Voltage drop"), 7.2);
  assert.equal(drop.outputs.find((row) => row.unit === "%").value, 7.2 / 230 * 100);
  assert.equal(buildCalculationSnapshot("earth-fault-loop", examples["earth-fault-loop"]).inputs.find((row) => row.label.endsWith("Ze")).value, "0");
  const zero = buildCalculationSnapshot("maximum-demand", { loads: [{ ...examples["maximum-demand"].loads[0], demandFactor: 0 }] });
  assert.equal(value(zero, "Highest phase demand"), 0);
});

test("snapshots cannot be changed by later form edits and exclude inactive method inputs", () => {
  const input = structuredClone(examples["cable-sizing"]);
  const snapshot = buildCalculationSnapshot("cable-sizing", input);
  input.cableOptions[0].sizeMm2 = "99";
  input.designCurrentAmps = "200";
  assert.equal(snapshot.inputs.find((row) => row.label === "Design current Ib").value, "20");
  assert.equal(snapshot.inputs.find((row) => row.label === "Option 1: Cable size").value, "2.5");
  const energy = buildCalculationSnapshot("adiabatic", { ...examples.adiabatic, method: "energy", letThroughEnergyA2s: "2000", faultCurrentAmps: "stale invalid value", disconnectionTimeSeconds: "0.02" });
  assert.equal(energy.inputs.some((row) => row.label === "Fault current"), false);
  assert.equal(energy.outputs.some((row) => row.label === "Thermal current limit at entered time"), false);
  assert.equal(value(energy, "Fault energy"), 2000);
});

test("record metadata is bounded and job/customer bindings come only from the selected job", () => {
  const record = createCalculationRecord({ ...options, job: { id: "job-a", title: "Workshop", customerId: "customer-a" }, input: { ...examples.load, jobId: "forged", customerId: "forged" } });
  assert.equal(record.jobId, "job-a"); assert.equal(record.customerId, "customer-a");
  assert.equal(createCalculationRecord(options).jobId, undefined);
  for (const patch of [{ title: " " }, { title: "a".repeat(121) }, { evidenceReference: "" }, { designNote: "x".repeat(4001) }, { job: { id: "", title: "Bad" } }, { createdAt: "not a date" }, { kind: "__proto__" }, { input: {} }]) assert.throws(() => createCalculationRecord({ ...options, ...patch }));
});

test("malformed or unsupported records are rejected without reinterpreting historical results", () => {
  const record = createCalculationRecord(options);
  for (const bad of [null, {}, { ...record, schemaVersion: 2 }, { ...record, snapshot: null }, { ...record, snapshot: { ...record.snapshot, outputs: [{ label: "Current", value: Infinity, unit: "A" }] } }, { ...record, snapshot: { ...record.snapshot, assumptions: [null] } }]) assert.equal(isCalculationRecord(bad), false);
  record.snapshot.outputs[0].value = 1234;
  assert.equal(isCalculationRecord(record), true, "format validation must not silently recalculate saved historical values");
});

test("saved records participate only in the exact account backup and are denied field mutation", () => {
  const identity = { organisationId: "org-a", userId: "owner-a", role: "owner" };
  const key = (org, user, role) => `${CALCULATION_RECORDS_STORAGE_KEY}:organisation:${JSON.stringify([org])}:account:${JSON.stringify([user, role, null])}`;
  const entries = new Map([[key("org-a", "owner-a", "owner"), JSON.stringify([createCalculationRecord(options)])], [key("org-b", "owner-a", "owner"), '[{"id":"other-org"}]'], [key("org-a", "owner-b", "owner"), '[{"id":"other-user"}]'], [key("org-a", "owner-a", "electrician"), '[{"id":"other-role"}]']]);
  const storage = { get length() { return entries.size; }, key: (index) => [...entries.keys()][index] ?? null, getItem: (name) => entries.get(name) ?? null };
  assert.equal(backupStorageScope(CALCULATION_RECORDS_STORAGE_KEY), "account");
  const backup = collectAccountBusinessData(storage, identity);
  assert.deepEqual(Object.keys(backup), [CALCULATION_RECORDS_STORAGE_KEY]);
  assert.equal(backup[CALCULATION_RECORDS_STORAGE_KEY][0].id, "calculation-a");
  assert.equal(collectionCloudMutationRoute("cloud_collections", "electrician", CALCULATION_RECORDS_STORAGE_KEY).kind, "deny");
});
