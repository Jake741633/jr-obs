import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as contacts from "../../lib/contactLinks.ts";
import * as identities from "../../lib/assistantIdentity.ts";
import * as crmCore from "../../lib/crmPro-core.mjs";
import * as jobCore from "../../lib/jobManagement-core.mjs";
import * as signals from "../../lib/assistantSignals-core.mjs";

export { nodes, text } from "./customer-page-harness.mjs";
export { contacts, identities };
export class FixedDate extends Date { constructor(...args) { super(...(args.length ? args : ["2026-10-11T12:00:00Z"])); } static now() { return Date.parse("2026-10-11T12:00:00Z"); } }
export const jsx = (type, props, key) => ({ type, props, key });
export function load(path, dependencies, globals = {}) {
  const mod = { exports: {} };
  const source = ts.transpileModule(readFileSync(new URL(`../../${path}`, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(source, { module: mod, exports: mod.exports, Date: FixedDate, Intl, Error, ...globals, require(name) { assert.ok(name in dependencies, `${path}: ${name}`); return dependencies[name]; } });
  return mod.exports;
}
export const pipeline = load("lib/leadPipeline.ts", { "./assistantIdentity": identities, "./crmPro-core.mjs": crmCore, "./scheduling": load("lib/scheduling.ts", {}) });
export const crm = load("lib/crmPro.ts", { "./leadPipeline": pipeline, "./contactLinks": contacts, "./assistantSignals-core.mjs": signals, "./crmPro-core.mjs": crmCore, "./jobManagement-core.mjs": jobCore, "./payments": { paymentEffect() { assert.fail("Follow-up queue must not access payment calculations"); } } });
export const rules = load("lib/crmFollowUpSettings.ts", { "./crmPro": crm, "./assistantIdentity": identities });

export function hookRuntime() {
  let slots = [], layouts = [], cursor = 0, key;
  const changed = (previous, deps) => !previous || deps.some((value, index) => !Object.is(value, previous.deps[index]));
  const useState = value => { const i = cursor++; if (!(i in slots)) slots[i] = typeof value === "function" ? value() : value; const current = slots; return [current[i], next => { current[i] = typeof next === "function" ? next(current[i]) : next; }]; };
  const useLayoutEffect = (fn, deps) => { const i = cursor++, previous = slots[i]; if (changed(previous, deps)) { const current = { deps, cleanup: previous?.cleanup }; slots[i] = current; layouts.push(() => { current.cleanup?.(); current.cleanup = fn(); }); } };
  const hooks = { useState, useMemo(fn, deps) { const i = cursor++; if (changed(slots[i], deps)) slots[i] = { deps, value: fn() }; return slots[i].value; }, useRef: value => useState({ current: value })[0], useLayoutEffect, useEffect: useLayoutEffect };
  const unmount = () => slots.forEach(slot => slot?.cleanup?.());
  return { hooks, unmount, render(component, props = {}) { const element = component(props); if (key !== element.key) { unmount(); slots = []; layouts = []; key = element.key; } cursor = 0; const view = element.type(element.props); layouts.splice(0).forEach(fn => fn()); return view; } };
}
