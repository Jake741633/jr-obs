import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const pagePath = new URL("../app/electrical-calculators/page.tsx", import.meta.url);
const navigationPath = new URL("../components/navigation.ts", import.meta.url);

async function read(path) {
  return readFile(path, "utf8");
}

test("electrical calculator page wires the deterministic load and voltage-drop cores", async () => {
  const page = await read(pagePath);

  assert.match(page, /electricalLoadSummary/);
  assert.match(page, /voltageDropSummary/);
  assert.match(page, /voltageDropCalculator-core\.mjs/);
  assert.match(page, /Calculated current/);
  assert.match(page, /Voltage drop/);
});

test("voltage-drop UI captures each required design input and result", async () => {
  const page = await read(pagePath);

  for (const text of [
    "Route length (m)",
    "Cable value (mV/A/m)",
    "Maximum voltage drop (%)",
    "Voltage drop result",
    "Maximum permitted",
    "Remaining allowance",
  ]) {
    assert.match(page, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.match(page, /withinSelectedLimit/);
  assert.match(page, /Within selected limit/);
  assert.match(page, /Exceeds selected limit/);
});

test("calculator page keeps the design-aid and BS 7671 warning visible", async () => {
  const page = await read(pagePath);

  assert.match(page, /Design aid only/);
  assert.match(page, /BS 7671/);
  assert.match(page, /does not select a cable, protective device or confirm compliance/i);
});

test("electrical calculators remain reachable from workspace navigation", async () => {
  const navigation = await read(navigationPath);

  const matches = navigation.match(/\["Electrical Calculators", "\/electrical-calculators"\]/g) ?? [];
  assert.equal(matches.length, 1);
});
