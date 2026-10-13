import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import * as priceBook from "../lib/priceBook-core.mjs";

function loadModule(path, dependencies) {
  const output = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const commonJsModule = { exports: {} };
  vm.runInNewContext(output, {
    module: commonJsModule,
    exports: commonJsModule.exports,
    require(name) {
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected module: ${name}`);
      return dependencies[name];
    },
  });
  return commonJsModule.exports;
}

const workflow = loadModule("../lib/workflow.ts", {
  "./businessSettings": {},
  "./jobManagement-core.mjs": {},
});

function elements(node) {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node || typeof node !== "object") return [];
  return [node, ...elements(node.props?.children), ...elements(node.props?.action)];
}

function textContent(node) {
  if (Array.isArray(node)) return node.map(textContent).join("");
  if (typeof node === "string" || typeof node === "number") return String(node);
  return node && typeof node === "object" ? textContent(node.props?.children) : "";
}

function quickQuotesHarness() {
  const states = [];
  let cursor = 0;
  let nextId = 0;
  let failure = null;
  const durableRecords = new Map();
  const creations = [];
  const documents = {
    items: [],
    isReady: true,
    setItems(update) {
      // A React setter changes the render; its persistence effect has not run.
      documents.items = typeof update === "function" ? update(documents.items) : update;
    },
    createItem(document) {
      creations.push(document);
      if (!documents.isReady) throw new Error("Collection not ready");
      if (failure?.afterWrite) durableRecords.set(document.id, document);
      if (failure) throw failure.error;
      durableRecords.set(document.id, document);
      documents.items = [document, ...documents.items];
      return document;
    },
  };
  const stores = {
    "jr-os-customers": { isReady: true, items: [{ id: "customer-1", name: "Customer One", address: "Site address" }] },
    "jr-os-builders": { isReady: true, items: [{ id: "builder-1", companyName: "Builder One" }] },
    "jr-os-price-book": { isReady: true, items: [priceBook.normalisePriceBookItem({ id: "point-1", name: "Double socket", fixedSellingPrice: 80, materialCost: 10 })] },
  };
  const jsx = (type, props) => ({ type, props });
  const page = loadModule("../app/quotes/mobile/page.tsx", {
    react: {
      useState(initial) {
        const index = cursor++;
        if (!(index in states)) states[index] = typeof initial === "function" ? initial() : initial;
        return [states[index], (update) => { states[index] = typeof update === "function" ? update(states[index]) : update; }];
      },
      useRef(initial) {
        const index = cursor++;
        if (!(index in states)) states[index] = { current: initial };
        return states[index];
      },
      useMemo: (calculate) => calculate(),
    },
    "react/jsx-runtime": { jsx, jsxs: jsx },
    "next/link": { default: "Link" },
    "lucide-react": Object.fromEntries(["ArrowRight", "BookOpen", "FileText", "Plus", "Save", "Search", "Smartphone", "Trash2"].map((name) => [name, name])),
    "../../../components/mobile/MobileActionDock": { MobileActionDock: "MobileActionDock", MobileDockAction: "MobileDockAction" },
    "../../../components/ui/Button": { Button: "Button" },
    "../../../components/ui/Card": { Card: "Card" },
    "../../../components/ui/FormField": { InputField: "InputField", TextareaField: "TextareaField" },
    "../../../components/ui/PageHeader": { PageHeader: "PageHeader" },
    "../../../lib/cloud/coreBusinessCollections": { usePricingDocumentsCollection: () => documents },
    "../../../lib/priceBook-core.mjs": priceBook,
    "../../../lib/storage": {
      makeId: (prefix) => `${prefix}-${++nextId}`,
      useCloudLocalCollection: (key) => {
        assert.ok(stores[key], `Unexpected collection: ${key}`);
        return stores[key];
      },
    },
    "../../../lib/workflow": workflow,
  });
  const render = () => { cursor = 0; return page.default(); };
  const find = (predicate) => elements(render()).find(predicate);
  const field = (label) => find((element) => element.props?.label === label);
  const change = (label, value) => {
    const control = field(label);
    assert.ok(control, `Missing field: ${label}`);
    control.props.onChange({ target: { value } });
  };
  const select = (option) => {
    const control = find((element) => element.type === "select" && elements(element.props.children).some((child) => child.type === "option" && child.props.value === option));
    assert.ok(control, `Missing option: ${option}`);
    control.props.onChange({ target: { value: option } });
  };
  const open = () => {
    const button = find((element) => element.type === "Button" && textContent(element).includes("New quick draft"));
    assert.ok(button, "Missing new draft action");
    button.props.onClick();
  };
  const fill = () => {
    open();
    change("Title / scope", "Garage rewire");
    select("customer-1");
    change("Customer fixed price (£)", "1500");
    change("Scope notes", "First and second fix");
  };
  const submit = (mobile = false) => {
    const control = find((element) => mobile ? element.type === "MobileDockAction" && element.props.label === "Save" : element.type === "form");
    assert.ok(control, "Missing save action");
    if (mobile) control.props.onClick();
    else control.props.onSubmit({ preventDefault() {} });
  };
  return { documents, stores, durableRecords, creations, render, find, field, change, select, open, fill, submit, fail: (error, afterWrite = false) => { failure = { error, afterWrite }; }, recover: () => { failure = null; } };
}

test("quick quote creation is unavailable until its collections have loaded", () => {
  for (const key of ["documents", "jr-os-customers", "jr-os-builders", "jr-os-price-book"]) {
    const harness = quickQuotesHarness();
    (key === "documents" ? harness.documents : harness.stores[key]).isReady = false;
    assert.match(textContent(harness.render()), /loading quick quotes/i, key);
    assert.equal(harness.find((element) => element.type === "form" || element.type === "MobileDockAction"), undefined);
    assert.equal(harness.creations.length, 0);
  }
});

test("both quick quote save controls persist the full document before clearing the draft", () => {
  for (const mobile of [false, true]) {
    const harness = quickQuotesHarness();
    harness.fill();
    harness.submit(mobile);
    assert.equal(harness.durableRecords.size, 1);
    const [document] = harness.durableRecords.values();
    assert.equal(document.number, "Q-0001");
    assert.equal(document.customerId, "customer-1");
    assert.equal(document.title, "Garage rewire");
    assert.equal(document.notes, "First and second fix");
    assert.equal(document.items[0].unitPrice, 1500);
    assert.equal(document.status, "Draft");
    assert.equal(harness.find((element) => element.type === "form"), undefined);
    assert.match(textContent(harness.render()), /saved on this device/i);
  }
});

test("a persistence failure keeps the quick quote open with its original inputs", () => {
  for (const mobile of [false, true]) {
    const harness = quickQuotesHarness();
    harness.fill();
    harness.fail(new Error("Storage full: internal-sensitive-detail"));
    assert.doesNotThrow(() => harness.submit(mobile));
    assert.ok(harness.find((element) => element.type === "form"));
    assert.equal(harness.field("Title / scope").props.value, "Garage rewire");
    assert.equal(harness.field("Customer fixed price (£)").props.value, "1500");
    assert.equal(harness.field("Scope notes").props.value, "First and second fix");
    const alert = harness.find((element) => element.props?.role === "alert");
    assert.match(textContent(alert), /could not be saved/i);
    assert.doesNotMatch(textContent(harness.render()), /saved on this device|internal-sensitive-detail/i);
    assert.equal(harness.durableRecords.size, 0);
  }
});

test("the next successful quick quote gets a new identity and document number", () => {
  const harness = quickQuotesHarness();
  harness.fill();
  harness.submit();
  harness.fill();
  harness.submit(true);
  assert.equal(harness.durableRecords.size, 2);
  assert.deepEqual([...harness.durableRecords.values()].map((document) => document.number), ["Q-0001", "Q-0002"]);
});

test("a queue failure after the local write retries the same quote without duplicating it", () => {
  const harness = quickQuotesHarness();
  harness.fill();
  harness.fail(new Error("Queue storage full"), true);
  harness.submit();
  assert.equal(harness.durableRecords.size, 1);
  harness.recover();
  harness.submit();
  assert.equal(harness.durableRecords.size, 1);
  assert.equal(harness.documents.items.length, 1);
  assert.equal(harness.creations.length, 2);
  assert.match(textContent(harness.render()), /saved on this device/i);
});

test("failed price-book quote creation retains its selected lines for retry", () => {
  const harness = quickQuotesHarness();
  harness.fill();
  harness.select("point-1");
  harness.change("Quantity", "4");
  harness.find((element) => element.type === "Button" && textContent(element).trim() === "Add").props.onClick();
  harness.fail(new Error("Storage unavailable"));
  harness.submit(true);
  assert.match(textContent(harness.render()), /4 × Double socket/);
  harness.recover();
  harness.submit(true);
  const [document] = harness.durableRecords.values();
  assert.equal(document.items.length, 1);
  assert.equal(document.items[0].quantity, 4);
  assert.equal(document.items[0].unitPrice, 80);
});
