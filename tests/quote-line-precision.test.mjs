import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const pageSource = readFileSync(new URL("../app/quotes/page.tsx", import.meta.url), "utf8");
const pageAst = ts.createSourceFile("page.tsx", pageSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const item = { id: "precision", category: "Other", description: "Metered allowance", quantity: 0.004, unitPrice: 0.004, unitCost: 0.002 };
const jsx = (type, props) => ({ type, props });
function evaluate(source, context = {}) {
  const mod = { exports: {} };
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(compiled, { module: mod, exports: mod.exports, require: name => {
    if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
    if (name === "lucide-react") return { ChevronDown: "ChevronDown", Trash2: "Trash2" };
    if (name === "../ui/FormField") return { InputField: "InputField" };
    throw new Error(`Unexpected dependency ${name}`);
  }, ...context });
  return mod.exports;
}
function nodes(node) {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node || typeof node !== "object") return [];
  return [node, ...nodes(node.props?.children)];
}
function desktopAndEntryInputs() {
  const inputs = [];
  function visit(node) {
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(pageAst) === "InputField") {
      const value = node.attributes.properties.find(prop => prop.name?.getText(pageAst) === "value");
      if (value && /^(?:\{(?:String\(item\.(?:quantity|unitCost[^)]*|unitPrice)\)|line\.(?:quantity|unitCost|unitPrice)|materialQuantity)\})$/.test(value.initializer?.getText(pageAst) ?? "")) {
        inputs.push(evaluate(`exports.input = (${node.getText(pageAst)});`, { InputField: "InputField", item, line: { quantity: "0.004", unitPrice: "0.004", unitCost: "0.002" }, materialQuantity: "0.004" }).input);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(pageAst); return inputs;
}

test("actual mobile, desktop and entry controls accept positive sub-cent quantities and prices", () => {
  const mobile = evaluate(readFileSync(new URL("../components/quotes/MobilePricingLineCard.tsx", import.meta.url), "utf8")).MobilePricingLineCard({ item, formattedTotal: "£0.00", onChange() {}, onRemove() {} });
  const mobileInputs = nodes(mobile).filter(node => node.type === "InputField" && node.props.type === "number");
  const desktopAndEntry = desktopAndEntryInputs();
  assert.equal(mobileInputs.length, 3); assert.equal(desktopAndEntry.length, 7);
  for (const input of [...mobileInputs, ...desktopAndEntry]) {
    assert.equal(input.props.step, "any", input.props.label);
    assert.equal(input.props.min, "0", input.props.label);
    assert.ok(Number(input.props.value) >= Number(input.props.min));
  }
});

function saveDraft(rows) {
  let submitNode;
  function visit(node) { if (ts.isFunctionDeclaration(node) && node.name?.text === "submit") submitNode = node; ts.forEachChild(node, visit); }
  visit(pageAst);
  const state = { error: "", records: [], reset: false };
  const documents = { isReady: true, items: [], createItem(record) { state.records = [record, ...state.records]; } };
  const context = {
    form: { title: "Site quote", customerId: "customer", siteAddress: "", type: "Quote", vatRate: "0" }, items: rows, editingId: "", documents,
    latestDocuments: { current: { active: true, documents } }, creationVersion: 0, creationGeneration: { current: 0 }, creationAttempt: { current: null }, quoteSaveSnapshot: JSON.stringify,
    setError(value) { state.error = value; }, nextPricingDocumentNumber: () => "Q001", makeId: () => "doc1", pricing: {}, profitability: {}, attachments: [], fixedPriceWorkflow: {}, paymentTerms: {}, reset() { state.reset = true; },
  };
  const { submit } = evaluate(`${submitNode.getText(pageAst)}\nexports.submit = submit;`, context);
  submit({ preventDefault() {} }); return state;
}

test("normal Save draft preserves legitimate row precision and zero or unknown costs", () => {
  for (const unitCost of [0.002, 0, undefined]) {
    const saved = saveDraft([{ ...item, unitCost }]);
    assert.equal(saved.error, ""); assert.equal(saved.records.length, 1); assert.equal(saved.records[0].status, "Draft");
    assert.equal(saved.records[0].items[0].quantity, 0.004); assert.equal(saved.records[0].items[0].unitPrice, 0.004); assert.equal(saved.records[0].items[0].unitCost, unitCost);
  }
});

test("normal Save draft rejects nonpositive quantities and invalid prices or costs before persistence", () => {
  for (const patch of [{ quantity: 0 }, { quantity: -0.004 }, { quantity: NaN }, { quantity: Infinity }, { unitPrice: -0.004 }, { unitPrice: NaN }, { unitPrice: Infinity }, { unitCost: -0.004 }, { unitCost: NaN }, { unitCost: Infinity }]) {
    const saved = saveDraft([{ ...item, ...patch }]);
    assert.equal(saved.records.length, 0, JSON.stringify(patch)); assert.equal(saved.reset, false); assert.match(saved.error, /quantity|amount|cost|price/i);
  }
});
