import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import { loadLocalTs } from "./helpers/load-local-ts.mjs";
const file = new URL("../lib/quoteDraftAdditions.ts", import.meta.url);
const api = existsSync(file) ? loadLocalTs(file) : {};
const { reviewQuoteDraftLines } = loadLocalTs(new URL("../lib/quoteDraftLines.ts", import.meta.url));
const rate = { id: "rate-1", name: "Electrician", description: "Private rate description", unit: "Hour", active: true, costRate: 21.123, chargeRate: 76.875 };
const material = { id: "mat-1", name: "Socket", unit: "Each", tradeCost: 4.123, sellPrice: 99, supplier: "CEF", stockCode: "001234", notes: "Private material note" };
const pack = { id: "pack-1", name: "Socket addition", category: "Domestic", description: "Fit one socket", labourDescription: "Socket installation", labourHours: 1.5, labourRate: 55.555, materials: [{ id: "pm-1", materialId: "mat-1", description: "Double socket", quantity: 2.333, unitPrice: 9.875 }], otherAllowances: [{ id: "other-1", category: "Parking", description: "Parking allowance", quantity: 2, unitPrice: 7.125, unitCost: 4.125 }], testingRequirements: "Test affected circuit", certificatesRequired: "Minor Works", notes: "Making good excluded", internalNotes: "Private historical benchmark" };
const ids = () => { let i = 0; return () => `new-${++i}`; };

test("saved hourly labour keeps exact per-unit prices, time and source identity without copying private fields", () => {
  assert.equal(typeof api.labourQuoteDraftAddition, "function");
  const before = structuredClone(rate), result = api.labourQuoteDraftAddition(rate, "new-hour");
  assert.equal(result.lines.length, 1);
  assert.deepEqual({ ...result.lines[0] }, { id: "new-hour", category: "Labour", description: "Electrician · per hour", quantity: 1, unitCost: 21.123, unitPrice: 76.875, labourRateId: "rate-1", labourMode: "Hours", labourHours: 1 });
  assert.equal(reviewQuoteDraftLines(result.lines).complete, true);
  assert.deepEqual(rate, before); assert.doesNotMatch(JSON.stringify(result), /Private rate/);
});
test("non-hour billing never guesses hours or converts a saved per-unit rate", () => {
  for (const [unit, mode] of [["Day", "Days"], ["Half day", "Fixed"], ["Call-out", "Fixed"], ["Minimum charge", "Fixed"]]) {
    const line = api.labourQuoteDraftAddition({ ...rate, unit }, "new").lines[0];
    assert.equal(line.labourMode, mode); assert.equal(line.quantity, 1); assert.equal(line.unitPrice, 76.875); assert.equal(line.unitCost, 21.123); assert.equal(line.labourHours, undefined);
    assert.match(line.description, new RegExp(unit.toLowerCase()));
    assert.equal(reviewQuoteDraftLines([line]).complete, false);
    assert.ok(reviewQuoteDraftLines([line]).lines[0].fields.includes("labourHours"));
    assert.equal(reviewQuoteDraftLines([{ ...line, labourHours: 3.5 }]).complete, true);
  }
});
test("blank and invalid labour allowances stay unpriced rather than becoming free", () => {
  const line = api.labourQuoteDraftAddition(null, "blank").lines[0];
  assert.equal(line.description, ""); assert.equal(line.labourMode, "Fixed"); assert.equal(line.labourHours, undefined); assert.equal(line.unitCost, undefined); assert.ok(Number.isNaN(line.unitPrice)); assert.equal(reviewQuoteDraftLines([line]).complete, false);
  for (const value of [undefined, NaN, -1, Infinity, "21"]) {
    const invalid = api.labourQuoteDraftAddition({ ...rate, costRate: value, chargeRate: value }, "invalid").lines[0];
    assert.equal(invalid.unitCost, undefined); assert.ok(Number.isNaN(invalid.unitPrice)); assert.equal(reviewQuoteDraftLines([invalid]).complete, false);
  }
  assert.equal(reviewQuoteDraftLines(api.labourQuoteDraftAddition({ ...rate, costRate: 0, chargeRate: 0 }, "zero").lines).complete, true);
});
test("inactive, unnamed, unidentified and unsupported labour cannot silently create a rate", () => {
  for (const patch of [{ active: false }, { active: "true" }, { name: " " }, { id: "" }, { unit: "Week" }]) assert.throws(() => api.labourQuoteDraftAddition({ ...rate, ...patch }, "new"));
  assert.throws(() => api.labourQuoteDraftAddition(rate, " "), /identity/i);
});
test("whole pack additions preserve saved quantities, fixed labour, other charges and unique library buying references", () => {
  const before = structuredClone({ pack, material }), result = api.jobPackQuoteDraftAddition(pack, [material], ids());
  assert.equal(result.lines.length, 3); const [labour, supply, parking] = result.lines;
  assert.equal(labour.unitPrice, 83.33); assert.equal(labour.quantity, 1); assert.equal(labour.labourHours, 1.5); assert.equal(labour.labourMode, "Fixed"); assert.equal(labour.unitCost, undefined);
  assert.equal(supply.quantity, 2.333); assert.equal(supply.unitPrice, 9.875); assert.equal(supply.unitCost, 4.123); assert.equal(supply.stockCode, "001234"); assert.equal(supply.supplier, "CEF"); assert.equal(supply.materialId, "mat-1");
  assert.equal(parking.category, "Parking"); assert.equal(parking.quantity, 2); assert.equal(parking.unitPrice, 7.125); assert.equal(parking.unitCost, 4.125);
  assert.equal(new Set(result.lines.map(l => l.id)).size, 3); assert.equal(result.costBasisByLineId[labour.id], "Not recorded"); assert.match(result.costBasisByLineId[supply.id], /library/i);
  assert.equal(reviewQuoteDraftLines(result.lines).complete, false); assert.deepEqual({ pack, material }, before);
});
test("pack explicit buying cost wins over library updates and missing or duplicate links stay unknown", () => {
  const own = api.jobPackQuoteDraftAddition({ ...pack, materials: [{ ...pack.materials[0], unitCost: 2.456 }] }, [material], ids());
  assert.equal(own.lines[1].unitCost, 2.456); assert.equal(own.lines[1].unitPrice, 9.875); assert.match(own.costBasisByLineId[own.lines[1].id], /pack/i);
  for (const library of [[], [material, { ...material, tradeCost: 1 }]]) {
    const line = api.jobPackQuoteDraftAddition(pack, library, ids()).lines[1]; assert.equal(line.unitCost, undefined); assert.equal(line.materialId, undefined); assert.equal(line.stockCode, undefined); assert.equal(line.unitPrice, 9.875);
  }
});
test("pack public assumptions survive in customer notes while private benchmarks never enter quote fields", () => {
  const result = api.jobPackQuoteDraftAddition(pack, [material], ids());
  for (const value of ["Socket addition", "Fit one socket", "Test affected circuit", "Minor Works", "Making good excluded"]) assert.ok(result.customerNotes.includes(value));
  assert.match(result.scopeItem, /Socket addition/); assert.doesNotMatch(JSON.stringify(result), /Private/);
});
test("empty, malformed and ambiguous pack lines are rejected as a whole before creating quote identities", () => {
  assert.equal(typeof api.jobPackQuoteDraftAddition, "function");
  for (const patch of [{ id: "" }, { name: " " }, { materials: null }, { materials: [null] }, { materials: [...pack.materials, pack.materials[0]] }, { materials: [{ ...pack.materials[0], id: " " }] }, { materials: [{ ...pack.materials[0], description: " " }] }, { labourHours: Infinity }, { labourRate: -1 }, { materials: [{ ...pack.materials[0], quantity: 0 }] }, { materials: [{ ...pack.materials[0], unitPrice: NaN }] }, { otherAllowances: [null] }, { notes: {} }, { labourHours: 0, materials: [], otherAllowances: [] }, { notes: "Other allowances from original quote:\nParking £30" }]) {
    let generated = 0; assert.throws(() => api.jobPackQuoteDraftAddition({ ...pack, ...patch }, [material], () => `id-${++generated}`)); assert.equal(generated, 0);
  }
});
test("invalid fresh line identities cannot be returned as a partial pack addition", () => {
  for (const nextId of [() => "same", () => " "]) assert.throws(() => api.jobPackQuoteDraftAddition(pack, [material], nextId), /identity|identities/i);
});
