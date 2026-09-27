import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { randomUUID } from "node:crypto";
import vm from "node:vm";
import ts from "typescript";
import * as adiabatic from "../lib/adiabaticCalculator-core.mjs";
import * as earthFault from "../lib/earthFaultLoopCalculator-core.mjs";
import * as maximumDemand from "../lib/maximumDemandCalculator-core.mjs";
import * as protectiveDevice from "../lib/protectiveDeviceCalculator-core.mjs";
import * as numbers from "../lib/electricalCalculatorNumbers-core.mjs";

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
function harness(route) {
  const state = [];
  let cursor = 0;
  const commonJsModule = { exports: {} };
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
    },
    "next/link": { default: "Link" },
    "lucide-react": {},
    "../../../components/ui/Card": { Card: "Card" },
    "../../../components/ui/PageHeader": { PageHeader: "PageHeader" },
    "../../../components/ui/FormField": { InputField: "InputField" },
    "../../../lib/adiabaticCalculator-core.mjs": adiabatic,
    "../../../lib/protectiveDeviceCalculator-core.mjs": protectiveDevice,
    "../../../lib/maximumDemandCalculator-core.mjs": maximumDemand,
    "../../../lib/earthFaultLoopCalculator-core.mjs": earthFault,
    "../../../lib/electricalCalculatorNumbers-core.mjs": numbers,
  };
  const source = readFileSync(new URL(`../app/electrical-calculators/${route}/page.tsx`, import.meta.url), "utf8");
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    exports: commonJsModule.exports, module: commonJsModule, crypto: { randomUUID },
    require(name) { assert.ok(name in dependencies, `Unexpected page dependency: ${name}`); return dependencies[name]; },
  });
  function render() { cursor = 0; return commonJsModule.exports.default(); }
  return {
    render,
    status: () => text(nodes(render()).find((node) => node.props?.role === "status")),
    fill(label, value, index = 0) {
      const field = nodes(render()).filter((node) => node.type === "InputField" && node.props.label === label)[index];
      assert.ok(field, label);
      field.props.onChange({ target: { value } });
    },
    selectPhase(value, index = 0) {
      const select = nodes(render()).filter((node) => node.type === "select")[index];
      assert.ok(select);
      select.props.onChange({ target: { value } });
    },
    click(label) {
      const button = nodes(render()).find((node) => node.type === "button" && (text(node).trim() === label || node.props["aria-label"] === label));
      assert.ok(button, label);
      button.props.onClick();
    },
  };
}
const fillCpc = (h) => {
  for (const [label, value] of [["Fault current (A)", "1000"], ["Device disconnection time (s)", "0.4"], ["Verified k-factor (A√s/mm²)", "115"], ["Proposed CPC size (mm²)", "6"]]) h.fill(label, value);
};
const fillLoop = (h) => {
  for (const [label, value] of [["External earth fault loop Ze (Ω)", "0.35"], ["Line conductor resistance R1 (Ω)", "0.18"], ["CPC resistance R2 (Ω)", "0.3"], ["Verified tabulated maximum Zs (Ω)", "1.37"]]) h.fill(label, value);
};

test("CPC page starts unassessed with no assumed k-factor or circuit values", () => {
  const h = harness("adiabatic");
  assert.equal(h.status(), "Assessment unavailable");
  assert.ok(nodes(h.render()).filter((node) => node.type === "InputField").every((node) => node.props.value === ""));
  assert.match(text(h.render()), /Design aid only/);
  assert.match(text(h.render()), /manufacturer data/);
  assert.match(text(h.render()), /— mm²/);
});

test("CPC page recomputes adequate, undersized and cleared inputs through real event handlers", () => {
  const h = harness("adiabatic");
  fillCpc(h);
  assert.equal(h.status(), "Meets entered thermal check");
  assert.match(text(h.render()), /400,000 A²s/);
  assert.match(text(h.render()), /476,100 A²s/);
  h.fill("Proposed CPC size (mm²)", "4");
  assert.equal(h.status(), "Below required thermal size");
  h.fill("Verified k-factor (A√s/mm²)", "");
  assert.equal(h.status(), "Assessment unavailable");
  assert.doesNotMatch(text(h.render()), /400,000 A²s/);
});

test("CPC method switch requires manufacturer energy and supports short clearing times", () => {
  const h = harness("adiabatic");
  fillCpc(h);
  h.fill("Device disconnection time (s)", "0.01");
  assert.equal(h.status(), "Assessment unavailable");
  h.click("Manufacturer I²t");
  assert.equal(h.status(), "Assessment unavailable");
  h.fill("Verified let-through I²t (A²s)", "400000");
  assert.equal(h.status(), "Meets entered thermal check");
  assert.doesNotMatch(text(h.render()), /Thermal current limit at entered time/);
  h.fill("Device disconnection time (s)", "6");
  assert.equal(h.status(), "Assessment unavailable");
  h.fill("Device disconnection time (s)", "0.01");
  h.click("Fault current and time");
  assert.equal(h.status(), "Assessment unavailable");
});

test("CPC clear inputs resets both methods and removes the previous assessment", () => {
  const h = harness("adiabatic");
  fillCpc(h);
  h.click("Manufacturer I²t");
  h.fill("Verified let-through I²t (A²s)", "400000");
  h.click("Clear inputs");
  assert.equal(h.status(), "Assessment unavailable");
  assert.ok(nodes(h.render()).filter((node) => node.type === "InputField").every((node) => node.props.value === ""));
  h.click("Manufacturer I²t");
  assert.ok(nodes(h.render()).filter((node) => node.type === "InputField").every((node) => node.props.value === ""));
});

test("earth fault page starts without a prefilled positive assessment", () => {
  const h = harness("earth-fault-loop");
  assert.equal(h.status(), "Assessment unavailable");
  assert.match(text(h.render()), /— Ω/);
});

test("clearing R2 removes the earth fault pass and derived current instead of substituting zero", () => {
  const h = harness("earth-fault-loop");
  fillLoop(h);
  assert.equal(h.status(), "Within selected limit");
  assert.match(text(h.render()), /0.83 Ω/);
  h.fill("CPC resistance R2 (Ω)", "");
  assert.equal(h.status(), "Assessment unavailable");
  assert.match(text(h.render()), /blank is not zero/);
  assert.match(text(h.render()), /— A/);
  assert.doesNotMatch(text(h.render()), /0.53 Ω/);
  h.fill("CPC resistance R2 (Ω)", "0");
  assert.equal(h.status(), "Within selected limit");
  h.fill("Permitted percentage (%)", "101");
  assert.equal(h.status(), "Assessment unavailable");
});

test("calculator hub links the new CPC route", () => {
  const source = readFileSync(new URL("../app/electrical-calculators/page.tsx", import.meta.url), "utf8");
  assert.match(source, /href="\/electrical-calculators\/adiabatic"/);
  assert.match(source, /Open Adiabatic CPC Sizing/);
});

function fillDevice(h) {
  for (const [label, value] of [
    ["Device identification and standard", "Example device / verified standard"],
    ["Manufacturer and circuit evidence references", "Data sheet / 230 V circuit evidence"],
    ["Design current Ib (A)", "20"], ["Device rating or overload setting In/Ir (A)", "25"],
    ["Verified corrected cable capacity Iz (A)", "32"], ["Conventional overload operating current I2 (A)", "36.25"],
    ["Verified device breaking capacity (kA)", "6"], ["Maximum prospective fault current (kA)", "5"],
  ]) h.fill(label, value);
}

test("protective device page starts blank without invented device data", () => {
  const h = harness("protective-device");
  assert.equal(h.status(), "Assessment unavailable");
  assert.ok(nodes(h.render()).filter((node) => node.type === "InputField").every((node) => node.props.value === ""));
  assert.match(text(h.render()), /Design aid only/);
  assert.match(text(h.render()), /Overload: — A/);
  assert.doesNotMatch(text(h.render()), /Meets entered check/);
});

test("protective device page recomputes individual overload and fault-capacity failures", () => {
  const h = harness("protective-device"); fillDevice(h);
  assert.equal(h.status(), "Meets entered checks");
  assert.match(text(h.render()), /36.25 A ≤ 46.4 A/);
  assert.match(text(h.render()), /Breaking capacity: 1 kA/);
  h.fill("Maximum prospective fault current (kA)", "7");
  assert.equal(h.status(), "Review required");
  assert.match(text(h.render()), /stand-alone breaking capacity is below/);
  assert.match(text(h.render()), /Breaking capacity: -1 kA/);
  h.fill("Maximum prospective fault current (kA)", "5");
  h.fill("Conventional overload operating current I2 (A)", "50");
  assert.equal(h.status(), "Review required");
  assert.match(text(h.render()), /overload operating current exceeds/);
});

test("missing device evidence or numeric values remove all positive assessments", () => {
  const h = harness("protective-device"); fillDevice(h);
  h.fill("Manufacturer and circuit evidence references", "");
  assert.equal(h.status(), "Assessment unavailable");
  assert.doesNotMatch(text(h.render()), /Meets entered check/);
  h.fill("Manufacturer and circuit evidence references", "Verified data");
  h.fill("Verified device breaking capacity (kA)", "");
  assert.equal(h.status(), "Assessment unavailable");
  assert.match(text(h.render()), /Breaking capacity: — kA/);
});

test("clearing device checks removes all entered evidence and computed results", () => {
  const h = harness("protective-device"); fillDevice(h); h.click("Clear inputs");
  assert.equal(h.status(), "Assessment unavailable");
  assert.ok(nodes(h.render()).filter((node) => node.type === "InputField").every((node) => node.props.value === ""));
  assert.doesNotMatch(text(h.render()), /46.4 A/);
  const hub = readFileSync(new URL("../app/electrical-calculators/page.tsx", import.meta.url), "utf8");
  assert.match(hub, /href="\/electrical-calculators\/protective-device"/);
});

function fillDemand(h, index, current, percent, phase = "L1") {
  h.fill("Connected current per item (A)", current, index);
  h.fill("Demand factor (%)", percent, index);
  h.selectPhase(phase, index);
}

test("maximum-demand page starts with a blank design and no example diversity", () => {
  const h = harness("maximum-demand");
  assert.equal(h.status(), "Assessment unavailable");
  const fields = nodes(h.render()).filter((node) => node.type === "InputField");
  assert.equal(fields.filter((node) => node.props.label === "Demand factor (%)").length, 1);
  assert.equal(fields.find((node) => node.props.label === "Demand factor (%)").props.value, "");
  assert.equal(fields.find((node) => node.props.label === "Connected current per item (A)").props.value, "");
  assert.match(text(h.render()), /— A/);
});

test("clearing a three-phase diversity factor removes schedule totals instead of understating demand", () => {
  const h = harness("maximum-demand");
  fillDemand(h, 0, "16", "100", "Three phase");
  h.click("Add load");
  assert.equal(h.status(), "Assessment unavailable");
  fillDemand(h, 1, "32", "40", "L2");
  assert.equal(h.status(), "Demand calculated");
  assert.match(text(h.render()), /Maximum phase demand28.8 A/);
  h.fill("Demand factor (%)", "", 0);
  assert.equal(h.status(), "Assessment unavailable");
  assert.match(text(h.render()), /Maximum phase demand— A/);
  assert.match(text(h.render()), /L2 \/ L3 demand— A \/ — A/);
  h.fill("Demand factor (%)", "0", 0);
  assert.equal(h.status(), "Demand calculated");
  assert.match(text(h.render()), /Maximum phase demand12.8 A/);
});

test("fractional quantities and invalid demand percentages never become smaller valid loads", () => {
  const h = harness("maximum-demand"); fillDemand(h, 0, "20", "50");
  h.fill("Quantity", "2.9");
  assert.equal(h.status(), "Assessment unavailable");
  assert.match(text(h.render()), /whole-number quantity/);
  h.fill("Quantity", "2");
  assert.equal(h.status(), "Demand calculated");
  assert.match(text(h.render()), /Maximum phase demand20 A/);
  h.fill("Demand factor (%)", "101");
  assert.equal(h.status(), "Assessment unavailable");
  h.fill("Demand factor (%)", "5e-324");
  assert.equal(h.status(), "Assessment unavailable");
});

test("removing invalid rows restores complete totals and removing all rows is unassessed", () => {
  const h = harness("maximum-demand"); fillDemand(h, 0, "20", "100");
  h.click("Add load");
  assert.equal(h.status(), "Assessment unavailable");
  h.click("Remove Load 2");
  assert.equal(h.status(), "Demand calculated");
  h.click("Remove Load 1");
  assert.equal(h.status(), "Assessment unavailable");
  assert.match(text(h.render()), /No loads added/);
  assert.match(text(h.render()), /Maximum phase demand— A/);
  h.click("Add load");
  assert.equal(h.status(), "Assessment unavailable");
});
