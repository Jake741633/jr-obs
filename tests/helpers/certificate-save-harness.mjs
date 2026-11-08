import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { loadLocalTs } from "./load-local-ts.mjs";

export const compliance = loadLocalTs(new URL("../../lib/complianceCertificates.ts", import.meta.url));
export const certificate = () => compliance.saveCertificateRevision(compliance.createCertificateDraft({ id: "certificate-1", number: "CERT-0001", type: "Electrical Installation Certificate", inspectorName: "Inspector", notes: "Original inspection" }), "Inspector");
export const nodes = tree => Array.isArray(tree) ? tree.flatMap(nodes) : tree && typeof tree === "object" ? [tree, ...nodes(tree.props?.children)] : [];
export const text = tree => Array.isArray(tree) ? tree.map(text).join("") : tree == null || typeof tree === "boolean" ? "" : typeof tree === "object" ? text(tree.props?.children) : String(tree);

export function certificateSaveHarness(initial = [certificate()]) {
  const slots = [], effects = [], attempts = [], writes = [];
  let cursor = 0, sequence = 0, failure = "", beforeUpdate;
  const data = { records: structuredClone(initial), durable: structuredClone(initial), ready: true };
  const changed = (old, deps) => !old || deps.some((value, index) => !Object.is(value, old.deps[index]));
  const useState = initialValue => { const i = cursor++; if (!(i in slots)) slots[i] = typeof initialValue === "function" ? initialValue() : initialValue; return [slots[i], value => { slots[i] = typeof value === "function" ? value(slots[i]) : value; }]; };
  const useLayoutEffect = (fn, deps) => { const i = cursor++, old = slots[i]; if (changed(old, deps)) { const next = { deps, cleanup: old?.cleanup }; slots[i] = next; effects.push(() => { next.cleanup?.(); next.cleanup = fn(); }); } };
  function commit(kind, record, next) {
    attempts.push({ kind, record });
    if (failure === "before") throw new Error("private-storage-secret: queue unavailable");
    data.records = next; data.durable = structuredClone(next); writes.push({ kind, record });
    if (failure === "after") throw new Error("private-storage-secret: acknowledgement unavailable");
    return record;
  }
  const collection = () => ({
    get items() { return data.records; }, get isReady() { return data.ready; },
    setItems(value) { data.records = typeof value === "function" ? value(data.records) : value; },
    createItem(record) { if (data.records.some(item => item.id === record.id)) throw new Error("Identity exists"); return commit("create", record, [record, ...data.records]); },
    updateItem(id, update) {
      const callback = beforeUpdate; beforeUpdate = undefined; callback?.();
      const current = data.records.find(item => item.id === id); if (!current) throw new Error("Record unavailable");
      const record = update(current); if (record === current) return record;
      return commit("update", record, data.records.map(item => item.id === id ? record : item));
    },
  });
  let store = collection();
  const jsx = (type, props) => ({ type, props });
  const dependencies = {
    react: { useState, useRef: value => useState({ current: value })[0], useMemo(fn, deps) { const i = cursor++; if (changed(slots[i], deps)) slots[i] = { deps, value: fn() }; return slots[i].value; }, useLayoutEffect },
    "react/jsx-runtime": { jsx, jsxs: jsx }, "lucide-react": {},
    "../../components/ui/Button": { Button: "Button" }, "../../components/ui/Card": { Card: "Card" },
    "../../lib/businessSettings": { businessStorageKeys: { certificates: "defaults" }, defaultCertificateDefaults: { defaultType: "Electrical Installation Certificate", certificatePrefix: "CERT", inspectorName: "Inspector" } },
    "../../lib/certificate-code-suggestions": { suggestCertificateObservations: () => [] },
    "../../lib/cloud/coreBusinessCollections": { useCertificatesCollection: () => store },
    "../../lib/complianceCertificates": compliance,
    "../../lib/storage": { makeId: prefix => `${prefix}-${++sequence}`, useCloudLocalCollection: () => ({ items: [], isReady: true }) },
  };
  const mod = { exports: {} };
  const source = ts.transpileModule(readFileSync(new URL("../../app/certificates/page.tsx", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(source, { module: mod, exports: mod.exports, require(name) { assert.ok(name in dependencies, name); return dependencies[name]; }, window: { scrollTo() {} }, Date, Error });
  function render() { cursor = 0; const tree = mod.exports.default(); effects.splice(0).forEach(fn => fn()); return tree; }
  const button = label => nodes(render()).find(node => node.type === "Button" && text(node) === label);
  return { data, writes, attempts, render,
    button,
    click(label) { const control = button(label); assert.ok(control, label); control.props.onClick(); },
    open() { this.click("Open"); },
    field(label, value) {
      const container = nodes(render()).find(node => node.type === "label" && text(node).startsWith(label)); assert.ok(container, label);
      const control = nodes(container).find(node => ["input", "select", "textarea"].includes(node.type));
      if (value !== undefined) control.props.onChange({ target: { value } }); return control;
    },
    saveHandler() { const form = nodes(render()).find(node => node.type === "form"); assert.ok(form, "Certificate editor is open"); return form.props.onSubmit; },
    save() { this.saveHandler()({ preventDefault() {} }); },
    fail(value) { failure = value; },
    refresh(records) { data.records = structuredClone(records); data.durable = structuredClone(records); render(); },
    beforeUpdate(fn) { beforeUpdate = fn; },
    retireApi() { store = collection(); render(); },
    reloadApi() { data.ready = false; render(); store = collection(); data.ready = true; render(); },
    unmount() { slots.forEach(slot => slot?.cleanup?.()); },
  };
}
