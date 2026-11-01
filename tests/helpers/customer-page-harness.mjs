import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as contactLinks from "../../lib/contactLinks.ts";
import * as identities from "../../lib/assistantIdentity.ts";
import * as permissions from "../../lib/cloud/permissions.ts";
import * as contactImport from "../../lib/contactImport.ts";

export const nodes = tree => Array.isArray(tree) ? tree.flatMap(nodes) : tree && typeof tree === "object" ? [tree, ...nodes(tree.props?.children)] : [];
export const text = tree => Array.isArray(tree) ? tree.map(text).join("") : tree == null || typeof tree === "boolean" ? "" : typeof tree === "object" ? text(tree.props?.children) : String(tree);
export const customer = (patch = {}) => ({ id: "customer-1", name: "Example customer", phone: "07700 900123", email: "customer@example.test", address: "1 High Street", notes: "Private note", createdAt: "2026-10-01T09:00:00Z", updatedAt: "2026-10-01T09:00:00Z", ...patch });
const jsx = (type, props) => ({ type, props });
const source = ts.transpileModule(readFileSync(new URL("../../app/customers/page.tsx", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;

export function harness(initial = [], readOnly = false) {
  const slots = [], layouts = [], attempts = [], writes = [], confirmations = [], failures = new Set();
  let cursor = 0, blurred = 0, sequence = 0, confirmEffect, confirmResult = true;
  let mode = "cloud", identityReady = true, identity = { organisationId: "org-1", userId: "user-1", role: "owner" };
  const data = { customers: initial, jobs: [], ready: true, jobsReady: true };
  const useState = value => { const i = cursor++; if (!(i in slots)) slots[i] = typeof value === "function" ? value() : value; return [slots[i], next => { slots[i] = typeof next === "function" ? next(slots[i]) : next; }]; };
  const changed = (previous, deps) => !previous || deps.some((value, index) => !Object.is(value, previous.deps[index]));
  const useMemo = (fn, deps) => { const i = cursor++; if (changed(slots[i], deps)) slots[i] = { deps, value: fn() }; return slots[i].value; };
  function useLayoutEffect(fn, deps) { const i = cursor++, previous = slots[i]; if (changed(previous, deps)) { const current = { deps, cleanup: previous?.cleanup }; slots[i] = current; layouts.push(() => { current.cleanup?.(); current.cleanup = fn(); }); } }
  const failWrite = () => { throw new Error("Browsing must not write records or create identities"); };
  function commit(kind, item, next) {
    if (readOnly) failWrite();
    attempts.push({ kind, item });
    if (failures.has(kind)) throw new Error("Device storage or sync queue is full");
    data.customers = next; writes.push({ kind, item }); return item;
  }
  const dependencies = {
    "react/jsx-runtime": { jsx, jsxs: jsx }, react: { useState, useMemo, useRef: value => useState({ current: value })[0], useLayoutEffect },
    "next/link": { default: "Link" }, "lucide-react": {},
    "../../components/ui/Button": { Button: "Button" }, "../../components/ui/Card": { Card: "Card" }, "../../components/ui/FormField": { InputField: "InputField", TextareaField: "TextareaField" }, "../../components/ui/PageHeader": { PageHeader: "PageHeader" }, "../../components/crm/EntityEmptyState": { EntityEmptyState: "Empty" },
    "../../components/crm/ContactImportPanel": { ContactImportPanel: "ContactImportPanel" }, "../../lib/contactImport": contactImport,
    "../../lib/cloud/coreBusinessCollections": { useCustomersCollection: () => ({ items: data.customers, isReady: data.ready, setItems: failWrite, remove: failWrite,
      createItem(item) { if (data.customers.some(record => record.id === item.id)) throw new Error("Customer identity already exists"); return commit("create", item, [item, ...data.customers]); },
      updateItem(id, update) { const index = data.customers.findIndex(item => item.id === id); assert.ok(index >= 0); const item = update(data.customers[index]); return commit("update", item, data.customers.map((record, i) => i === index ? item : record)); },
      removeItem(id, validate) { const item = data.customers.find(record => record.id === id); assert.ok(item); validate(item); return commit("delete", item, data.customers.filter(record => record.id !== id)); },
    }) },
    "../../lib/storage": { makeId: prefix => { if (readOnly) failWrite(); return `${prefix}_${++sequence}`; }, useCloudLocalCollection: () => ({ items: data.jobs, isReady: data.jobsReady }) },
    "../../lib/contactLinks": contactLinks, "../../lib/assistantIdentity": identities, "../../lib/cloud/permissions": permissions,
    "../../lib/cloud/useCloudIdentity": { useCloudIdentity: () => ({ mode, identity, isReady: identityReady }) },
  };
  const mod = { exports: {} };
  vm.runInNewContext(source, { module: mod, exports: mod.exports, Error, Date, window: { confirm(message) { confirmations.push(message); confirmEffect?.(); return confirmResult; } }, require(name) { assert.ok(name in dependencies, name); return dependencies[name]; } });
  const render = () => { cursor = 0; const view = mod.exports.default(); layouts.splice(0).forEach(fn => fn()); return view; };
  const form = () => nodes(render()).find(n => n.type === "form");
  const field = label => nodes(form()).find(n => n.props.label === label);
  const button = label => nodes(render()).find(n => ["button", "Button"].includes(n.type) && (text(n).startsWith(label) || n.props["aria-label"] === label));
  const search = () => nodes(render()).find(n => n.type === "input" && n.props.type === "search");
  return { data, render, form, button, attempts, writes, failures, confirmations, blurred: () => blurred,
    search(value) { search().props.onChange({ target: { value } }); },
    enter() { search().props.onKeyDown({ key: "Enter", preventDefault() {}, currentTarget: { blur() { blurred++; } } }); },
    click(label) { const control = button(label); assert.ok(control, label); control.props.onClick(); },
    openForm() { nodes(render()).find(n => n.type === "PageHeader").props.action.props.onClick(); },
    field(label, value) { const control = field(label); assert.ok(control, label); if (value !== undefined) control.props.onChange({ target: { value } }); return control; },
    fill(name = "New customer") { this.field("Customer name", name); this.field("Phone", "07700 900456"); },
    submitHandler() { return form().props.onSubmit; }, submit() { this.submitHandler()({ preventDefault() {} }); },
    account(patch) { identity = { ...identity, ...patch }; render(); }, mode(value) { mode = value; render(); }, signedOut() { identity = null; render(); }, identityLoading() { identityReady = false; render(); },
    confirm(value, effect) { confirmResult = value; confirmEffect = effect; }, unmount() { slots.forEach(slot => slot?.cleanup?.()); },
  };
}
