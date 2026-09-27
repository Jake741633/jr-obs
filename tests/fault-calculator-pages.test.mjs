import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import * as adiabatic from "../lib/adiabaticCalculator-core.mjs";
import * as earthFault from "../lib/earthFaultLoopCalculator-core.mjs";
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
    "../../../lib/earthFaultLoopCalculator-core.mjs": earthFault,
    "../../../lib/electricalCalculatorNumbers-core.mjs": numbers,
  };
  const source = readFileSync(new URL(`../app/electrical-calculators/${route}/page.tsx`, import.meta.url), "utf8");
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    exports: commonJsModule.exports, module: commonJsModule,
    require(name) { assert.ok(name in dependencies, `Unexpected page dependency: ${name}`); return dependencies[name]; },
  });
  function render() { cursor = 0; return commonJsModule.exports.default(); }
  return {
    render,
    status: () => text(nodes(render()).find((node) => node.props?.role === "status")),
    fill(label, value) {
      const field = nodes(render()).find((node) => node.type === "InputField" && node.props.label === label);
      assert.ok(field, label);
      field.props.onChange({ target: { value } });
    },
    click(label) {
      const button = nodes(render()).find((node) => node.type === "button" && text(node) === label);
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
