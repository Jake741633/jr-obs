import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync(new URL("../lib/starterData.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { starterJobPacks, starterMaterials } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

const materialById = new Map(starterMaterials.map((item) => [item.id, item]));
const packById = new Map(starterJobPacks.map((item) => [item.id, item]));
const lines = (pack) => new Map(pack.materials.map((line) => [line.materialId, line.quantity]));

test("catalogue expands to 101 materials and 40 packs without retiring any original IDs", () => {
  assert.equal(starterMaterials.length, 101);
  assert.equal(starterJobPacks.length, 40);
  assert.equal(materialById.size, starterMaterials.length);
  assert.equal(packById.size, starterJobPacks.length);
  for (let i = 1; i <= 70; i++) assert.ok(materialById.has(`starter-mat-${String(i).padStart(3, "0")}`));
  for (let i = 1; i <= 20; i++) assert.ok(packById.has(`starter-pack-${String(i).padStart(3, "0")}`));
});

test("pack material links use exact catalogue products with separate buying-cost snapshots", () => {
  for (const pack of starterJobPacks) {
    assert.equal(new Set(pack.materials.map((line) => line.id)).size, pack.materials.length);
    for (const line of pack.materials) {
      const material = materialById.get(line.materialId);
      assert.ok(material, `${pack.id}: missing material ${line.materialId}`);
      assert.equal(line.description, material.name, `${pack.id}: ambiguous product link`);
      assert.equal(line.unitCost, material.tradeCost, `${pack.id}: missing buying-cost snapshot`);
      assert.equal(line.unitPrice, material.sellPrice, `${pack.id}: selling unit mismatch`);
      assert.ok(Number.isFinite(line.quantity) && line.quantity > 0);
    }
  }
});

test("all buying and selling prices are explicitly editable estimates without live-price claims", () => {
  for (const material of starterMaterials) {
    assert.match(material.notes, /estimate/i);
    assert.equal(material.supplier, "");
    assert.equal(material.stockCode, "");
    assert.equal(material.supplierUrl, "");
    assert.equal(material.lastPriceCheckedAt, undefined);
    assert.deepEqual(material.priceHistory, []);
    assert.ok(Number.isFinite(material.tradeCost) && material.tradeCost >= 0);
    assert.ok(Number.isFinite(material.sellPrice) && material.sellPrice >= material.tradeCost);
  }
  for (const pack of starterJobPacks) {
    assert.match(pack.internalNotes, /estimate/i);
    assert.equal(pack.labourRate, 50);
    assert.ok(Number.isFinite(pack.labourHours) && pack.labourHours > 0);
  }
});

test("catalogue covers supplies, ventilation, containment and kitchen work but excludes heating controls", () => {
  const names = starterJobPacks.map((pack) => pack.name).join(" ");
  for (const scope of [/boiler/i, /immersion/i, /shower pump/i, /strut/i, /copex/i, /kitchen/i, /fan/i]) assert.match(names, scope);
  assert.doesNotMatch(names, /heating controls|S-plan|Y-plan|thermostat wiring/i);
  for (const scope of [/flexible steel conduit/i, /slotted strut/i, /extractor fan/i, /ventilation duct/i, /cooker.*back box/i]) {
    assert.match(starterMaterials.map((item) => item.name).join(" "), scope);
  }
});

test("new circuit packs require an EIC instead of offering a Minor Works Certificate", () => {
  for (const id of ["010", "015", "022", "025", "029", "030"]) {
    const pack = packById.get(`starter-pack-${id}`);
    assert.ok(pack, id);
    assert.match(pack.certificatesRequired, /Electrical Installation Certificate/);
    assert.doesNotMatch(pack.certificatesRequired, /Minor Works/);
    assert.match(pack.notes, /survey|design/i);
  }
});

test("anonymised JR historical figures remain benchmarks not fabricated actual bills of materials", () => {
  const socket = packById.get("starter-pack-021");
  const kitchen = packById.get("starter-pack-017");
  const pump = packById.get("starter-pack-022");
  const boiler = packById.get("starter-pack-025");
  const smallEicr = packById.get("starter-pack-034");
  const eicr = packById.get("starter-pack-007");
  for (const pack of [socket, kitchen, pump, boiler, smallEicr, eicr]) {
    assert.ok(pack);
    assert.match(pack.internalNotes, /JR historical benchmark/);
    assert.match(pack.internalNotes, /independent.*estimate|estimate.*independent/i);
  }
  assert.match(socket.internalNotes, /£180.*all-in/);
  assert.match(kitchen.internalNotes, /£800.*labour.*2 days/);
  assert.match(pump.internalNotes, /£350.*labour.*£90/);
  assert.match(pump.internalNotes, /not confirmed.*buying cost/i);
  assert.match(boiler.internalNotes, /£1850.*invoiced/);
  assert.match(boiler.internalNotes, /actual material breakdown.*unknown/i);
  assert.match(smallEicr.internalNotes, /4 circuits.*£200/);
  assert.match(eicr.internalNotes, /£250/);
});

test("five rewire survey starters have explicit socket, lighting, board and protection quantities", () => {
  const expected = [
    ["018", 18, 8, "052", 2, 2, 1, 1],
    ["038", 24, 10, "052", 2, 2, 1, 1],
    ["039", 28, 12, "053", 2, 2, 2, 1],
    ["019", 36, 14, "053", 2, 3, 2, 1],
    ["040", 44, 18, "053", 3, 3, 2, 1],
  ];
  assert.equal(starterJobPacks.filter((pack) => pack.category === "Rewire").length, 5);
  for (const [id, sockets, lights, board, lightingProtection, socketProtection, applianceProtection, cookerProtection] of expected) {
    const pack = packById.get(`starter-pack-${id}`);
    assert.ok(pack);
    const quantities = lines(pack);
    for (const [material, quantity] of [["029", sockets], ["039", lights], [board, 1], ["046", lightingProtection], ["049", socketProtection], ["048", applianceProtection], ["050", cookerProtection]]) {
      assert.equal(quantities.get(`starter-mat-${material}`), quantity, `${id}: ${material}`);
    }
    assert.equal(quantities.get("starter-mat-026"), sockets);
    assert.ok(quantities.get("starter-mat-005") > 0);
    assert.ok(quantities.get("starter-mat-015") > 0);
    assert.ok(quantities.get("starter-mat-016") > 0);
    assert.match(pack.description, /\d+.*double sockets/i);
    assert.match(pack.internalNotes, /not.*historical.*rewire|no.*completed.*rewire/i);
    assert.match(pack.notes, /survey.*design|design.*survey/i);
    assert.match(pack.certificatesRequired, /Electrical Installation Certificate/);
  }
});

test("protective-device guide entries do not imply that buying a device proves circuit design", () => {
  for (const material of starterMaterials.filter((item) => /RCBO|consumer unit|distribution board/i.test(item.name))) {
    assert.match(material.notes, /compatibility/i);
    assert.match(material.notes, /design/i);
  }
});

test("defined accessory and garage scopes match the exact products in their BOMs", () => {
  const appliance = packById.get("starter-pack-028");
  assert.match(appliance.description, /single switched socket/);
  assert.equal(lines(appliance).get("starter-mat-030"), 1);
  assert.doesNotMatch(packById.get("starter-pack-003").name, /or switch/);
  assert.equal(lines(packById.get("starter-pack-010")).get("starter-mat-071"), 1);
  const garage = lines(packById.get("starter-pack-015"));
  for (const id of ["094", "049", "047", "046", "003", "002"]) assert.ok(garage.get(`starter-mat-${id}`) > 0);
});

test("high-load electric boiler starter includes independent boiler, immersion and pump circuits", () => {
  const pack = packById.get("starter-pack-025");
  assert.match(pack.name, /electric boiler.*immersion.*pump/i);
  assert.match(pack.description, /7kW.*3kW.*pump/i);
  const quantities = lines(pack);
  for (const [id, quantity] of [["006", 25], ["003", 20], ["094", 1], ["050", 1], ["047", 1], ["046", 1], ["051", 1], ["101", 1]]) {
    assert.equal(quantities.get(`starter-mat-${id}`), quantity, `High-load allowance ${id}`);
  }
  assert.match(pack.notes, /indicative.*not.*final design/i);
  assert.match(pack.notes, /manufacturer.*verif|verif.*manufacturer/i);
  assert.match(pack.notes, /heating-controls wiring excluded/);
  assert.match(pack.internalNotes, /not.*universal.*10mm²/i);
  assert.equal(materialById.get("starter-mat-101").name, "45A double-pole local isolator");
});

test("customer-copyable notes and labour descriptions never reveal historical benchmarks or internal pricing", () => {
  for (const pack of starterJobPacks) {
    assert.doesNotMatch(pack.notes, /JR historical benchmark|£\d|buying costs|payroll|actual.*historical|historical.*breakdown/i, pack.id);
    assert.doesNotMatch(pack.labourDescription, /£\d|payroll|guide allowance/i, pack.id);
    assert.match(pack.internalNotes, /£50\/hour.*guide/);
  }
  assert.match(packById.get("starter-pack-021").notes, /making good.*excluded/i);
  assert.match(packById.get("starter-pack-025").notes, /heating-controls wiring excluded/);
});
