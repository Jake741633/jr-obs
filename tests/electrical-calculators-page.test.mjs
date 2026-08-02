import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const pagePath = new URL("../app/electrical-calculators/page.tsx", import.meta.url);
const cableSizingPagePath = new URL("../app/electrical-calculators/cable-sizing/page.tsx", import.meta.url);
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
    "Conductor value (mV/A/m)",
    "Selected maximum drop (%)",
    "Calculated voltage drop",
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
  assert.match(page, /do not confirm compliance/i);
  assert.match(page, /manufacturer data/i);
});

test("electrical calculators remain reachable from workspace navigation", async () => {
  const navigation = await read(navigationPath);

  const matches = navigation.match(/\["Electrical Calculators", "\/electrical-calculators"\]/g) ?? [];
  assert.equal(matches.length, 1);
});

test("workspace links to the dedicated cable-sizing route", async () => {
  const page = await read(pagePath);

  assert.match(page, /href="\/electrical-calculators\/cable-sizing"/);
  assert.match(page, /Open Cable Sizing/);
});

test("dedicated cable-sizing route keeps deterministic calculations and local history", async () => {
  const page = await read(cableSizingPagePath);

  for (const text of [
    "Design current Ib (A)",
    "Installation method",
    "Cable material",
    "Insulation type",
    "Loaded conductors",
    "Ambient temperature (°C)",
    "Verified grouping factor",
    "Cable length (m)",
    "Corrected current",
    "Protective device",
    "Earth fault loop impedance guidance",
    "Recent calculations",
  ]) {
    assert.match(page, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.match(page, /cableSizingSummary/);
  assert.match(page, /voltageDropSummary/);
  assert.match(page, /window\.localStorage/);
  assert.match(page, /jr-os:electrical-calculators:cable-sizing:recent:v1/);
  assert.match(page, /BS 7671/);
  assert.match(page, /manufacturer data/i);
});
