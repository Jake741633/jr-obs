import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
const helper = existsSync(new URL("../lib/jobPackCatalogue.ts", import.meta.url)) ? await import("../lib/jobPackCatalogue.ts") : {};
const material = { id: "mat-1", name: "Cable", unit: "Metre", tradeCost: 1.25, sellPrice: 2 };
const pack = { id: "pack-1", labourHours: 3, labourRate: 50, materials: [{ id: "line-1", materialId: "mat-1", description: "Cable", quantity: 10, unitPrice: 2 }] };

test("pack totals separate buying costs, selling allowances and labour without changing saved records", () => {
  assert.equal(typeof helper.jobPackTotals, "function");
  const before = structuredClone(pack), totals = helper.jobPackTotals(pack, [material]);
  assert.equal(totals.materialsCost, 12.5); assert.equal(totals.materialsSell, 20); assert.equal(totals.labour, 150); assert.equal(totals.total, 170);
  assert.equal(totals.missingCosts, 0); assert.deepEqual(pack, before);
});

test("saved line allowances are independent of later library changes and unknown costs are not zero", () => {
  assert.equal(typeof helper.jobPackTotals, "function");
  const saved = { ...pack, materials: [{ ...pack.materials[0], unitCost: 1 }] };
  assert.equal(helper.jobPackTotals(saved, [material]).materialsCost, 10);
  for (const library of [[], [material, { ...material }], [{ ...material, tradeCost: NaN }]]) {
    const result = helper.jobPackTotals(pack, library); assert.equal(result.materialsCost, null); assert.equal(result.missingCosts, 1);
  }
  assert.equal(helper.jobPackTotals({ ...pack, materials: [{ ...pack.materials[0], unitCost: 0 }] }, []).materialsCost, 0);
});

test("invalid pack amounts cannot be displayed as a usable total and money rounds at line boundaries", () => {
  assert.equal(typeof helper.jobPackTotals, "function");
  for (const invalid of [{ ...pack, labourHours: -1 }, { ...pack, labourRate: Infinity }, { ...pack, materials: [{ ...pack.materials[0], quantity: -1 }] }, { ...pack, materials: [{ ...pack.materials[0], unitPrice: NaN }] }]) assert.equal(helper.jobPackTotals(invalid, [material]).total, null);
  const pennies = helper.jobPackTotals({ ...pack, labourHours: 0, materials: [{ ...pack.materials[0], quantity: 3, unitCost: 0.1, unitPrice: 0.1 }] }, []);
  assert.equal(pennies.materialsCost, 0.3); assert.equal(pennies.total, 0.3);
});

test("catalogue imports add only missing IDs, clone templates and preserve edited existing records", () => {
  assert.equal(typeof helper.catalogueImportPlan, "function");
  const existing = { ...material, tradeCost: 99 }, second = { ...material, id: "mat-2" };
  const result = helper.catalogueImportPlan([existing], [], [material, second], [pack], true);
  assert.deepEqual(result.materials, [second]); assert.deepEqual(result.packs, [pack]);
  result.packs[0].materials[0].quantity = 88; assert.equal(pack.materials[0].quantity, 10); assert.equal(existing.tradeCost, 99);
  assert.deepEqual(helper.catalogueImportPlan([material, second], [pack], [material, second], [pack], true), { materials: [], packs: [] });
  assert.equal(helper.catalogueImportPlan([], [], [material], [pack], false).packs.length, 0);
});

test("ambiguous IDs and unresolved material references stop imports before writes", () => {
  assert.equal(typeof helper.catalogueImportPlan, "function");
  assert.throws(() => helper.catalogueImportPlan([material, material], [], [material], [pack], true), /duplicate/i);
  assert.throws(() => helper.catalogueImportPlan([], [], [{ ...material, id: "" }], [], true), /identity/i);
  assert.throws(() => helper.catalogueImportPlan([], [], [], [pack], true), /material/i);
});

test("partial import failure keeps completed work and never starts packs before materials finish", async () => {
  assert.equal(typeof helper.importCataloguePlan, "function");
  const writes = [], plan = { materials: [material, { ...material, id: "mat-2" }], packs: [pack] };
  const result = await helper.importCataloguePlan(plan, { isCurrent: () => true, createMaterial: item => { if (item.id === "mat-2") throw new Error("Storage is full"); writes.push(item.id); }, createPack: item => writes.push(item.id) });
  assert.deepEqual(writes, ["mat-1"]); assert.equal(result.materials, 1); assert.equal(result.packs, 0); assert.match(result.error, /Storage is full/);
});

test("an account change during persistence stops all following writes", async () => {
  assert.equal(typeof helper.importCataloguePlan, "function");
  let active = true, finish; const writes = [];
  const pending = helper.importCataloguePlan({ materials: [material], packs: [pack] }, { isCurrent: () => active, createMaterial: item => { writes.push(item.id); return new Promise(resolve => { finish = resolve; }); }, createPack: item => writes.push(item.id) });
  active = false; finish(); const result = await pending; assert.deepEqual(writes, ["mat-1"]); assert.match(result.error, /changed/i);
});

test("quote import preserves edited pack prices and costs and presents labour as a fixed amount", () => {
  assert.equal(typeof helper.jobPackQuoteLines, "function"); let sequence = 0;
  const source = { ...pack, name: "Socket job", labourDescription: "Install and test", internalNotes: "PRIVATE BENCHMARK", materials: [{ ...pack.materials[0], unitCost: 0.75, unitPrice: 1.5 }] };
  const lines = helper.jobPackQuoteLines(source, [{ ...material, tradeCost: 99, sellPrice: 199 }], () => `line-${++sequence}`);
  assert.equal(lines[0].quantity, 1); assert.equal(lines[0].unitPrice, 150); assert.equal(lines[0].labourMode, "Fixed"); assert.equal(lines[0].labourHours, 3);
  assert.equal(lines[1].unitCost, 0.75); assert.equal(lines[1].unitPrice, 1.5); assert.equal(lines[1].quantity, 10);
  assert.doesNotMatch(JSON.stringify(lines), /PRIVATE BENCHMARK/); assert.equal(lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0), 165);
  assert.throws(() => helper.jobPackQuoteLines({ ...pack, labourRate: -1 }, [material], () => "bad"), /amounts/i);
  const unknown = helper.jobPackQuoteLines(pack, [], () => `line-${++sequence}`); assert.equal(unknown[1].unitCost, undefined);
});
