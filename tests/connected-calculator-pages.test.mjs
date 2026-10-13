import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import * as load from "../lib/electricalCalculators-core.mjs";
import * as cable from "../lib/cableSizingCalculator-core.mjs";
import * as drop from "../lib/voltageDropCalculator-core.mjs";
import * as numbers from "../lib/electricalCalculatorNumbers-core.mjs";
import { buildCalculationSnapshot } from "../lib/calculationRecords-core.mjs";

function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!tree || typeof tree !== "object") return [];
  return [tree, ...nodes(tree.props?.children)];
}
function text(tree) {
  if (Array.isArray(tree)) return tree.map(text).join("");
  if (tree == null || typeof tree === "boolean") return "";
  return typeof tree === "object" ? text(tree.props?.children) : String(tree);
}
function harness(route = "", initialRows = []) {
  const state = [], effects = [], deps = [];
  let cursor = 0, effectCursor = 0;
  let failStorage = false;
  const storage = new Map();
  const historyKey = "test:org:user:owner";
  storage.set(historyKey, JSON.stringify(initialRows));
  const mod = { exports: {} };
  const jsx = (type, props) => ({ type, props });
  const dependencies = {
    "react/jsx-runtime": { jsx, jsxs: jsx },
    react: {
      useMemo: (fn) => fn(),
      useState(initial) {
        const index = cursor++;
        if (!(index in state)) state[index] = initial;
        return [state[index], (value) => { state[index] = typeof value === "function" ? value(state[index]) : value; }];
      },
      useEffect(fn, nextDeps) {
        const index = effectCursor++;
        if (!deps[index] || nextDeps.some((value, i) => value !== deps[index][i])) { deps[index] = nextDeps; effects.push(fn); }
      },
    },
    "next/link": { default: "Link" }, "lucide-react": {},
    "components/calculators/CalculationRecords": { SaveCalculation: "SaveCalculation" },
    "components/ui/Card": { Card: "Card" }, "components/ui/PageHeader": { PageHeader: "PageHeader" }, "components/ui/FormField": { InputField: "InputField" },
    "lib/electricalCalculators-core.mjs": load, "lib/voltageDropCalculator-core.mjs": drop, "lib/cableSizingCalculator-core.mjs": cable, "lib/electricalCalculatorNumbers-core.mjs": numbers,
    "lib/cloud/adapter": { accountStorageKey: () => historyKey },
    "lib/cloud/useCloudIdentity": { useCloudIdentity: () => ({ identity: { organisationId: "org", userId: "user", role: "owner" }, isReady: true }) },
  };
  const source = readFileSync(new URL(`../app/electrical-calculators/${route ? `${route}/` : ""}page.tsx`, import.meta.url), "utf8");
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    exports: mod.exports, module: mod, queueMicrotask: (fn) => fn(),
    window: { localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => { if (failStorage) throw new Error("quota"); storage.set(key, value); },
      removeItem: (key) => { if (failStorage) throw new Error("blocked"); storage.delete(key); },
    } },
    require(path) { const name = path.replace(/^(\.\.\/)+/, ""); assert.ok(name in dependencies, name); return dependencies[name]; },
  });
  function render() {
    cursor = effectCursor = 0;
    const tree = mod.exports.default();
    if (effects.length) { effects.splice(0).forEach((fn) => fn()); return render(); }
    return tree;
  }
  const button = (label) => nodes(render()).find((node) => node.type === "button" && text(node) === label);
  return {
    render, button, text: () => text(render()),
    snapshots: () => nodes(render()).filter((node) => node.type === "SaveCalculation").map((node) => buildCalculationSnapshot(node.props.kind, node.props.input)),
    statuses: () => nodes(render()).filter((node) => node.props?.role === "status").map(text),
    fill(label, value) {
      const field = nodes(render()).find((node) => node.type === "InputField" && node.props.label === label);
      assert.ok(field, label); field.props.onChange({ target: { value } });
    },
    click(label) { const node = button(label); assert.ok(node, label); node.props.onClick(); },
    saved: () => JSON.parse(storage.get(historyKey) ?? "[]"),
    failStorage: () => { failStorage = true; },
  };
}
function fillCable(h) {
  for (const [label, value] of [["Design current Ib (A)", "20"], ["Cable length (m)", "20"], ["Verified mV/A/m", "18"], ["Verified cable size (mm²)", "2.5"], ["Verified tabulated rating (A)", "27"], ["Protective device rating (A)", "20"]]) h.fill(label, value);
}
function fillHub(h) {
  for (const [label, value] of [["Load power (kW)", "4.6"], ["Route length (m)", "20"], ["Conductor value (mV/A/m)", "18"], ["Verified cable size (mm²)", "2.5"], ["Verified tabulated rating (A)", "27"], ["Selected maximum drop (%)", "5"]]) h.fill(label, value);
}

test("hub passes current form values and units into all three saved snapshots", () => {
  const h = harness(); fillHub(h);
  const [load, drop, cable] = h.snapshots();
  assert.equal(load.outputs.find((row) => row.label === "Design current").value, 20);
  assert.equal(drop.outputs.find((row) => row.label === "Voltage drop" && row.unit === "V").value, 7.2);
  assert.equal(cable.outputs.find((row) => row.label === "Required tabulated capacity").value, 20);
  h.fill("Load power (kW)", "");
  assert.ok(h.snapshots().every((snapshot) => snapshot === null));
});

test("dedicated cable record snapshots use the entered correction factors and route", () => {
  const h = harness("cable-sizing"); fillCable(h); h.fill("Verified ambient factor", "0.8");
  const [cable, drop] = h.snapshots();
  assert.equal(cable.outputs.find((row) => row.label === "Required tabulated capacity").value, 25);
  assert.equal(drop.outputs.find((row) => row.label === "Voltage drop" && row.unit === "V").value, 7.2);
});

test("hub starts unassessed and clearing load inputs invalidates every connected result", () => {
  const h = harness();
  assert.deepEqual(h.statuses(), ["Assessment unavailable", "Assessment unavailable", "Assessment unavailable"]);
  fillHub(h);
  assert.deepEqual(h.statuses(), ["Current calculated", "Within selected limit", "Verified option meets current-capacity check"]);
  h.fill("Power factor", "");
  assert.ok(h.statuses().every((status) => status === "Assessment unavailable"));
  assert.match(h.text(), /— A/);
  assert.match(h.text(), /— V/);
  h.fill("Power factor", "1");
  h.fill("Load power (kW)", "");
  assert.ok(h.statuses().every((status) => status === "Assessment unavailable"));
});

test("cleared route length and correction factors remove positive statuses independently", () => {
  const h = harness(); fillHub(h);
  h.fill("Route length (m)", "");
  assert.equal(h.statuses()[1], "Assessment unavailable");
  h.fill("Grouping factor", "");
  assert.equal(h.statuses()[2], "Assessment unavailable");
  h.fill("Grouping factor", "-1");
  assert.equal(h.statuses()[2], "Assessment unavailable");
});

test("dedicated cable page guards both save button and handler against incomplete designs", () => {
  const h = harness("cable-sizing");
  assert.equal(h.button("Save recent calculation").props.disabled, true);
  fillCable(h);
  assert.equal(h.button("Save recent calculation").props.disabled, false);
  h.click("Save recent calculation");
  assert.equal(h.saved().length, 1);
  assert.equal(h.saved()[0].requiredTabulatedCurrentAmps, 20);
  assert.equal(h.saved()[0].insulationFactor, 1);
  h.fill("Verified grouping factor", "");
  assert.equal(h.button("Save recent calculation").props.disabled, true);
  assert.equal(h.statuses()[0], "Assessment unavailable");
  assert.ok(h.statuses().includes("Assessment unavailable"));
  h.click("Save recent calculation");
  assert.equal(h.saved().length, 1);
});

test("cable save requires metadata and device values while retaining review-needed calculations", () => {
  const h = harness("cable-sizing"); fillCable(h);
  h.fill("Ambient temperature (°C)", "");
  assert.equal(h.button("Save recent calculation").props.disabled, true);
  h.fill("Ambient temperature (°C)", "0");
  h.fill("Loaded conductors", "2.5");
  assert.equal(h.button("Save recent calculation").props.disabled, true);
  h.fill("Loaded conductors", "2");
  h.fill("Protective device rating (A)", "");
  assert.equal(h.button("Save recent calculation").props.disabled, true);
  h.fill("Protective device rating (A)", "32");
  assert.ok(h.statuses().includes("Review required"));
  assert.equal(h.button("Save recent calculation").props.disabled, false);
});

test("storage failure does not invent a saved calculation or erase displayed history", () => {
  const h = harness("cable-sizing"); fillCable(h); h.failStorage(); h.click("Save recent calculation");
  assert.equal(h.saved().length, 0);
  assert.match(h.text(), /Could not save/);
  assert.match(h.text(), /No locally saved calculations yet/);
  const h2 = harness("cable-sizing"); fillCable(h2); h2.click("Save recent calculation"); h2.failStorage(); h2.click("Clear history");
  assert.equal(h2.saved().length, 1);
  assert.ok(h2.button("Load into calculator"));
  assert.match(h2.text(), /Could not clear/);
});

test("old history loads missing evidence as blank and malformed rows cannot crash the page", () => {
  const legacy = { id: "old", savedAt: "2026-09-27T12:00:00Z", phase: "Single phase", designCurrentAmps: 20, cableSizeMm2: 2.5, requiredTabulatedCurrentAmps: 20, voltageDropVolts: 7.2 };
  const h = harness("cable-sizing", [null, {}, legacy]);
  h.click("Load into calculator");
  assert.equal(h.button("Save recent calculation").props.disabled, true);
  assert.equal(h.statuses()[0], "Assessment unavailable");
  assert.match(h.text(), /missing values in older records/);
  for (const label of ["Verified grouping factor", "Verified insulation factor", "Verified tabulated rating (A)", "Verified mV/A/m"]) {
    assert.equal(nodes(h.render()).find((node) => node.type === "InputField" && node.props.label === label).props.value, "");
  }
  h.click("Reset defaults");
  assert.equal(h.statuses()[0], "Assessment unavailable");
  assert.equal(h.saved().length, 3);
});
