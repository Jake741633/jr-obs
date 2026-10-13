import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { nodes, text } from "./helpers/customer-page-harness.mjs";

const mod = { exports: {} };
vm.runInNewContext(ts.transpileModule(readFileSync(new URL("../components/ai/AiConnectionHelp.tsx", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
  module: mod, exports: mod.exports, require(name) { assert.equal(name, "react/jsx-runtime"); return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) }; },
});
const { AiConnectionHelp, AiRecoveryNotice, aiRecoveryCode } = mod.exports;
function expand(node) {
  if (Array.isArray(node)) return node.map(expand);
  if (!node || typeof node !== "object") return node;
  if (typeof node.type === "function") return expand(node.type(node.props));
  return { ...node, props: { ...node.props, children: expand(node.props?.children) } };
}
const anchors = tree => nodes(expand(tree)).filter(node => node.type === "a");

test("setup help separates funding, site setup and free configuration checks without collecting secrets or payments", () => {
  const tree = expand(AiConnectionHelp({ canManage: true })), content = text(tree);
  assert.match(content, /billed separately from your ChatGPT/); assert.match(content, /Funding and site activation are separate/); assert.match(content, /does not verify your credit balance or model access/); assert.match(content, /without requesting a paid AI review/); assert.match(content, /spend alert only notifies/); assert.match(content, /Create priced draft from notes/);
  const links = anchors(tree); assert.equal(links.length, 3);
  for (const node of links) { const url = new URL(node.props.href); assert.equal(url.origin, "https://platform.openai.com"); assert.equal(url.search, ""); assert.equal(node.props.target, "_blank"); assert.equal(node.props.rel, "noopener noreferrer"); assert.match(node.props.className, /min-h-12/); }
  assert.ok(!nodes(tree).some(node => ["input", "form", "button"].includes(node.type) || node.props?.onClick));
});

test("specific AI recovery explains the right action instead of encouraging every failure to buy credit", () => {
  const cases = [
    ["billing_required", /Add API credit/, ["Open API billing", "View API usage"]],
    ["spend_limit_reached", /Adding credit alone does not remove a spending limit/, ["Review API limits", "View API usage"]],
    ["usage_limit_reached", /Extra credit may not remove this limit/, ["Review API limits", "View API usage"]],
    ["quota_required", /does not identify an empty balance/, ["Open API billing", "Review API limits"]],
    ["not_configured", /Funding.*alone does not activate this site/, []],
    ["connection_failed", /key and model access/, []],
  ];
  for (const [code, explanation, labels] of cases) {
    const tree = expand(AiRecoveryNotice({ code, canManage: true })); assert.match(text(tree), explanation); assert.match(text(tree), /will not retry automatically/); assert.match(text(tree), /typed job notes are unchanged/); assert.deepEqual(anchors(tree).map(text), labels);
  }
});

test("office help refers to the business owner and unknown server codes cannot supply action links", () => {
  assert.equal(anchors(AiConnectionHelp({ canManage: false })).length, 0);
  for (const code of ["billing_required", "quota_required", "spend_limit_reached", "usage_limit_reached", "not_configured", "connection_failed"]) {
    const tree = expand(AiRecoveryNotice({ code, canManage: false })); assert.equal(anchors(tree).length, 0); assert.match(text(tree), /Ask your business owner/);
  }
  for (const code of [undefined, null, {}, "__proto__", "constructor", "https://evil.example/billing", "rate_limited"]) { assert.equal(aiRecoveryCode(code), undefined); assert.equal(AiRecoveryNotice({ code, canManage: true }), null); }
});
