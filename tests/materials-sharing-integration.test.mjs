import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { nodes, text } from "./helpers/customer-page-harness.mjs";
import * as sharing from "../lib/materialSharing.ts";
import * as identities from "../lib/assistantIdentity.ts";
import * as ownership from "../lib/supabase/sessionOwnership-core.mjs";
import * as repositoryCore from "../lib/cloud/repository-core.mjs";
import * as supplierLookup from "../lib/supplierLookup.ts";

const source = ts.transpileModule(readFileSync(new URL("../app/materials/page.tsx", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const item = { id: "mat-1", name: "Twin socket", category: "Accessories", manufacturer: "Example", supplier: "Screwfix", stockCode: "123AB", supplierUrl: "https://example.com/socket/123ab", unit: "Each", tradeCost: 7, sellPrice: 12, favourite: false, notes: "Private customer details", createdAt: "2026-10-01T09:00:00Z", updatedAt: "2026-10-01T09:00:00Z" };

function harness() {
  let cursor = 0, epoch = 1, sequence = 0, identityCalls = 0, collectionCalls = 0, sessionKey, failure = false, acknowledgement = false, beforeWrite;
  let session = { access_token: "token", user: { id: "user-1" } };
  const slots = [], rootSlots = [], effects = [], writes = [], attempts = [], legacyWrites = [], network = [], queue = [], confirmations = [], requests = [], timers = new Map();
  let timerId = 0;
  let hookSlots = slots;
  const identityState = { mode: "cloud", isReady: true, identity: { organisationId: "org-1", userId: "user-1", role: "owner" } };
  const data = { items: [{ ...item }], isReady: true };
  const useState = initial => { const current=hookSlots,i = cursor++; if (!(i in current)) current[i] = typeof initial === "function" ? initial() : initial; return [current[i], value => { current[i] = typeof value === "function" ? value(current[i]) : value; }]; };
  const changed = (old, deps) => !old || !deps || deps.some((value, index) => !Object.is(value, old.deps?.[index]));
  const dependencies = {
    react: { useState, useRef: value => useState({ current: value })[0], useMemo(fn, deps) { const i = cursor++; if (changed(hookSlots[i], deps)) hookSlots[i] = { value: fn(), deps }; return hookSlots[i].value; }, useLayoutEffect(fn, deps) { const i = cursor++, old = hookSlots[i]; if (changed(old, deps)) { const next = { deps, cleanup: old?.cleanup }; hookSlots[i] = next; effects.push(() => { next.cleanup?.(); next.cleanup = fn(); }); } } },
    "react/jsx-runtime": { jsx: (type, props, key) => ({ type, props, key }), jsxs: (type, props, key) => ({ type, props, key }) },
    "next/link": { default: "Link" }, "lucide-react": {},
    "../../components/ui/Button": { Button: "Button" }, "../../components/ui/Card": { Card: "Card" }, "../../components/ui/FormField": { InputField: "InputField", TextareaField: "TextareaField" }, "../../components/ui/PageHeader": { PageHeader: "PageHeader" }, "../../components/crm/EntityEmptyState": { EntityEmptyState: "Empty" },
    "../../components/materials/MaterialShareActions": { MaterialShareActions: "MaterialShareActions" },
    "../../lib/materialSharing": sharing, "../../lib/assistantIdentity": identities, "../../lib/supabase/sessionOwnership-core.mjs": ownership,
    "../../lib/supplierLookup": supplierLookup,
    "../../lib/cloud/useCloudIdentity": { useCloudIdentity: () => { identityCalls++; return identityState; } },
    "../../lib/cloud/coreBusinessCollections": { useMaterialsCollection: () => { collectionCalls++; return { ...data,
      setItems(updater) { legacyWrites.push("setItems"); if(failure)return; data.items = updater(data.items); writes.push(data.items); },
      remove(predicate) { legacyWrites.push("remove"); if(failure)return; data.items=data.items.filter(item=>!predicate(item));writes.push(data.items); },
      createItem(item) { attempts.push(item);beforeWrite?.();if(failure)throw new Error("Storage full");assert.ok(!data.items.some(old=>old.id===item.id),"Duplicate record");data.items=[item,...data.items];writes.push(data.items);if(acknowledgement)throw new Error("Acknowledgement lost");return item; },
      updateItem(id,update) { beforeWrite?.();const old=data.items.find(item=>item.id===id);if(!old)throw new Error("Record missing");const item=update(old);attempts.push(item);if(failure)throw new Error("Storage full");data.items=data.items.map(old=>old.id===id?item:old);writes.push(data.items);if(acknowledgement)throw new Error("Acknowledgement lost");return item; },
      removeItem(id,validate) { beforeWrite?.();const old=data.items.find(item=>item.id===id);if(!old)throw new Error("Record missing");validate?.(old);if(failure)throw new Error("Storage full");data.items=data.items.filter(item=>item.id!==id);writes.push(data.items);return old; },
    }; } },
    "../../lib/cloud/repository": { getSyncQueue:()=>queue }, "../../lib/cloud/repository-core.mjs": repositoryCore,
    "../../lib/supabase/client": { readSupabaseSession: () => session, readSupabaseSessionOwnershipEpoch: () => epoch, captureSupabaseSessionOwnership: () => ({ session, epoch }) },
    "../../lib/storage": { makeId: prefix => `${prefix}-created-${++sequence}` },
  };
  const mod = { exports: {} };
  vm.runInNewContext(source, { module: mod, exports: mod.exports, Date, Intl, Error, JSON, structuredClone, AbortController, setTimeout(fn, ms) { const id = ++timerId; timers.set(id, { fn, ms }); return id; }, clearTimeout(id) { timers.delete(id); }, navigator:{onLine:true}, window: { confirm(message) { confirmations.push(message);return true; } }, fetch: (...args) => { network.push(args); return new Promise((resolve, reject) => requests.push({ args, resolve, reject })); }, require: key => { assert.ok(key in dependencies, key); return dependencies[key]; } });
  function render() { hookSlots=rootSlots;cursor = 0; let tree = mod.exports.default();if(typeof tree.type==="function"){if(sessionKey!==tree.key){slots.forEach(slot=>slot?.cleanup?.());slots.length=0;effects.length=0;sessionKey=tree.key;}hookSlots=slots;cursor=0;tree=tree.type(tree.props);} effects.splice(0).forEach(fn => fn()); return tree; }
  function share() { const component = nodes(render()).find(node => node.type === "MaterialShareActions"); assert.ok(component, "Material product sharing is visible"); return component.props; }
  function field(label) { const node = nodes(render()).find(node => node.type === "InputField" && node.props.label === label); assert.ok(node, label); return node; }
  function button(label) {const found=nodes(render()).find(node=>node.type==="Button"&&text(node)===label);assert.ok(found,label);return found;}
  function action(label) {const found=nodes(render()).find(node=>node.props?.["aria-label"]===label);assert.ok(found,label);return found;}
  function form() {const found=nodes(render()).find(node=>node.type==="form"&&nodes(node).some(child=>child.type==="InputField"));assert.ok(found,"Material form");return found;}
  return { data, identityState, writes, attempts, legacyWrites, network, queue, confirmations, requests, timers, render, share, field, button, action, form, calls: () => ({ identityCalls, collectionCalls }),
    fail(value=true){failure=value;},acknowledgement(){acknowledgement=true;},beforeWrite(fn){beforeWrite=fn;},
    session(next, advance = true) { session = next; if (advance) epoch++; },
    epoch() { epoch++; }, unmount() { slots.forEach(slot => slot?.cleanup?.()); },
    openForm() { nodes(render()).find(node => node.type === "PageHeader").props.action.props.onClick(); render(); },
    fill(label, value) { field(label).props.onChange({ target: { value } }); render(); },
    submit() { form().props.onSubmit({ preventDefault() {} }); render(); },
  };
}

test("materials sharing uses one account snapshot and only product fields for office and field roles", () => {
  for (const role of ["owner", "admin", "office", "electrician"]) {
    const h = harness(); h.identityState.identity.role = role;
    const before = h.calls(); const tree = h.render(), after = h.calls(); assert.equal(after.identityCalls - before.identityCalls, 1); assert.equal(after.collectionCalls - before.collectionCalls, 1);
    const props = nodes(tree).find(node => node.type === "MaterialShareActions")?.props; assert.ok(props, "Sharing exists outside the office-price branch");
    assert.equal(props.enabled, true); assert.equal(props.canUse(), true);
    assert.deepEqual(JSON.parse(JSON.stringify(props.material)), { name: item.name, supplier: item.supplier, stockCode: item.stockCode, supplierUrl: item.supplierUrl });
    assert.doesNotMatch(JSON.stringify(props.material), /tradeCost|sellPrice|notes|Private/);
    if (role === "electrician") assert.doesNotMatch(text(tree), /Trade cost|Selling price|Markup|Quick update|Recent price history/);
    assert.equal(h.writes.length, 0); assert.equal(h.network.length, 0);
  }
});

test("retained material sharing guards reject account, session, source, readiness and unmount changes", () => {
  const changes = [
    h => { h.identityState.identity = { ...h.identityState.identity, organisationId: "org-2" }; h.render(); },
    h => { h.identityState.identity = { ...h.identityState.identity, userId: "user-2" }; h.render(); },
    h => { h.identityState.identity = { ...h.identityState.identity, role: "customer" }; h.render(); },
    h => { h.identityState.isReady = false; h.render(); },
    h => { h.data.isReady = false; h.render(); },
    h => { h.data.items = []; h.render(); },
    h => { h.data.items = [{ ...item, createdAt: "2026-10-02T09:00:00Z" }]; h.render(); },
    ...["name", "supplier", "stockCode", "supplierUrl"].map(key => h => { h.data.items = [{ ...item, [key]: "Changed" }]; h.render(); }),
    h => { h.data.items.push({ ...item, name: "Hidden duplicate" }); h.render(); },
    h => h.session(null),
    h => h.session({ access_token: "token", user: { id: "user-1" }, is_password_recovery: true }, false),
    h => h.session({ access_token: "replacement", user: { id: "user-1" } }, false),
    h => h.session({ access_token: "token", user: { id: "user-2" } }, false),
    h => h.epoch(), h => h.unmount(),
  ];
  for (const change of changes) { const h = harness(), canUse = h.share().canUse; assert.equal(canUse(), true); change(h); assert.equal(canUse(), false); assert.equal(h.writes.length, 0); assert.equal(h.network.length, 0); }
});

test("source readiness and account round trips cannot revive retained sharing guards", () => {
  for (const change of [h => { h.identityState.identity.organisationId = "other"; h.render(); h.identityState.identity.organisationId = "org-1"; h.render(); }, h => { h.data.isReady = false; h.render(); h.data.isReady = true; h.render(); }, h => { h.data.items = [{ ...item, stockCode: "OTHER" }]; h.render(); h.data.items = [{ ...item }]; h.render(); }]) {
    const h = harness(), canUse = h.share().canUse; change(h); assert.equal(canUse(), false); assert.equal(h.share().canUse(), true);
  }
});

test("sharing denies unknown/cloud customer accounts, missing or mismatched sessions, and ambiguous IDs", () => {
  for (const setup of [h => { h.identityState.identity.role = "customer"; }, h => { h.identityState.identity.role = "unknown"; }, h => { h.identityState.identity = null; }, h => h.session(null), h => h.session({ access_token: "token", user: { id: "user-2" } }), h => { h.data.items[0].id = " "; }, h => { h.data.items.push({ ...item, name: "Unrelated hidden duplicate" }); }]) {
    const h = harness(); setup(h); const props = h.share(); assert.equal(props.enabled, false); assert.equal(props.canUse(), false);
  }
  const local = harness(); local.identityState.mode = "local"; local.identityState.identity = null; local.session(null); assert.equal(local.share().enabled, true); assert.equal(local.share().canUse(), true);
});

test("sharing context changes with every account field, ownership epoch and material identity", () => {
  for (const change of [h => { h.identityState.identity.customerSourceId = "customer-source"; }, h => h.epoch(), h => { h.data.items = [{ ...item, id: "mat-2" }]; }]) {
    const h = harness(), key = h.share().contextKey; assert.equal(typeof key, "string"); change(h); assert.notEqual(h.share().contextKey, key);
  }
});

test("material supplier anchors never expose unsafe raw URLs for office or electrician roles", () => {
  for (const role of ["owner", "electrician"]) for (const url of ["javascript:alert(1)", "https://user:pass@example.com/p", "https://example.com\n/p", "https:///example.com/p"]) {
    const h = harness(); h.identityState.identity.role = role; h.data.items[0].supplierUrl = url;
    assert.ok(!nodes(h.render()).some(node => node.type === "a" && node.props.href === url), url);
  }
  const h = harness(); h.data.items[0].supplierUrl = " https://example.com/p "; assert.ok(nodes(h.render()).some(node => node.type === "a" && node.props.href === "https://example.com/p"));
});

test("material stock code and product link support native paste without clipboard access", () => {
  const h = harness(); h.openForm();
  for (const label of ["Stock code", "Supplier link"]) { const props = h.field(label).props; assert.ok(props.maxLength > 0); assert.equal(props.autoCapitalize, "none"); assert.equal(props.spellCheck, false); assert.match(props.placeholder, /paste/i); }
  const lookup = nodes(h.render()).find(node => node.type === "input" && node.props["aria-label"] === "Supplier stock code lookup"); assert.ok(lookup); assert.equal(lookup.props.maxLength, 80); assert.equal(lookup.props.autoCapitalize, "none");
  assert.equal(h.writes.length, 0); assert.equal(h.network.length, 0);
});

test("invalid pasted product URLs block saving while safe links save sanitized and prices remain unchanged", () => {
  for (const url of ["javascript:alert(1)", "https://user:pass@example.com/p", "https://example.com\n/p", "https:///example.com/p"]) {
    const h = harness(); h.openForm(); h.fill("Material name", "New item"); h.fill("Supplier link", url); h.submit(); assert.equal(h.writes.length, 0); assert.match(text(h.render()), /valid.*http|http.*valid/i);
  }
  const h = harness(); h.openForm(); h.fill("Material name", "New item"); h.fill("Supplier link", " https://example.com/p "); h.fill("Stock code", " CODE "); h.fill("Trade cost (£)", "4"); h.fill("Selling price (£)", "8"); h.submit();
  assert.equal(h.writes.length, 1); assert.equal(h.data.items[0].supplierUrl, "https://example.com/p"); assert.equal(h.data.items[0].stockCode, "CODE"); assert.equal(h.data.items[0].tradeCost, 4); assert.equal(h.data.items[0].sellPrice, 8);
});

test("starter catalogue navigation is explicit and browsing does not import material records", () => {
  const h = harness(); const link = nodes(h.render()).find(node => node.type === "Link" && node.props.href === "/starter-library"); assert.ok(link); assert.match(text(link), /starter materials/i); assert.equal(h.writes.length, 0); assert.equal(h.network.length, 0);
});

const json = value => JSON.parse(JSON.stringify(value));
function newMaterial(h) {h.openForm();h.fill("Material name","Test socket");h.fill("Trade cost (£)","4.123");h.fill("Selling price (£)","9.875");h.fill("Stock code","NEW-1");h.fill("Supplier link","https://example.com/new-1");}
test("a failed material creation retains product details and retries one exact durable record",()=>{
  const h=harness();newMaterial(h);h.fail();h.submit();assert.equal(h.writes.length,0);assert.equal(h.field("Stock code").props.value,"NEW-1");assert.equal(h.field("Trade cost (£)").props.value,"4.123");assert.match(text(h.render()),/Storage full/);
  const first=h.attempts[0];h.fail(false);const save=h.form().props.onSubmit;save({preventDefault(){}});save({preventDefault(){}});assert.equal(h.writes.length,1);assert.deepEqual(json(h.data.items[0]),json(first));assert.equal(h.legacyWrites.length,0);assert.match(text(h.render()),/saved on this device/i);
});
test("material edits retain failed drafts and preserve unrelated original fields",()=>{
  const h=harness();h.data.items[0].customEvidence="preserve";h.action("Edit Twin socket").props.onClick();h.fill("Stock code","UPDATED");h.fail();h.submit();assert.equal(h.data.items[0].stockCode,"123AB");assert.equal(h.field("Stock code").props.value,"UPDATED");h.fail(false);h.submit();assert.equal(h.data.items[0].stockCode,"UPDATED");assert.equal(h.data.items[0].customEvidence,"preserve");assert.equal(h.data.items[0].createdAt,item.createdAt);assert.equal(h.data.items[0].priceHistory.length,1);assert.equal(h.legacyWrites.length,0);
});
test("blank and invalid material prices cannot silently become zero, while explicit zero is accepted",()=>{
  for(const amount of [""," ","-1","Infinity","NaN"]){const h=harness();newMaterial(h);h.fill("Trade cost (£)",amount);h.submit();assert.equal(h.writes.length,0);assert.match(text(h.render()),/price|cost/i);}
  const h=harness();newMaterial(h);h.fill("Trade cost (£)","0");h.fill("Selling price (£)","0");h.submit();assert.equal(h.data.items[0].tradeCost,0);assert.equal(h.data.items[0].sellPrice,0);
});
test("old material save callbacks cannot overwrite a newer form render",()=>{
  const h=harness();newMaterial(h);const old=h.form().props.onSubmit;h.fill("Stock code","LATEST");old({preventDefault(){}});assert.equal(h.writes.length,0);h.submit();assert.equal(h.data.items[0].stockCode,"LATEST");
});
test("material edit conflicts retain the draft when a source changes or becomes ambiguous",()=>{
  for(const change of [h=>{h.data.items[0]={...h.data.items[0],stockCode:"OTHER"};},h=>{h.data.items=[];},h=>{h.data.items.push({...item});}]){const h=harness();h.action("Edit Twin socket").props.onClick();h.fill("Stock code","MINE");change(h);h.submit();assert.equal(h.writes.length,0);assert.equal(h.field("Stock code").props.value,"MINE");assert.match(text(h.render()),/changed|missing|ambiguous|duplicate/i);}
});
test("material update rechecks the persisted record inside the durable updater",()=>{
  const h=harness();h.action("Edit Twin socket").props.onClick();h.fill("Stock code","MINE");h.beforeWrite(()=>{h.data.items=[{...item,stockCode:"NEWER"}];});h.submit();assert.equal(h.writes.length,0);assert.equal(h.data.items[0].stockCode,"NEWER");assert.match(text(h.render()),/changed/i);
});
test("quick material price saves retain errors and do not duplicate price history",()=>{
  const h=harness();h.button("Quick update").props.onClick();h.fill("New trade cost (£)","8.123");h.fill("Markup (%)","25");h.fail();h.button("Save price").props.onClick();assert.equal(h.writes.length,0);assert.equal(h.field("New trade cost (£)").props.value,"8.123");assert.match(text(h.render()),/Storage full/);const first=h.attempts[0];h.fail(false);const save=h.button("Save price").props.onClick;save();save();assert.equal(h.writes.length,1);assert.deepEqual(json(h.data.items[0]),json(first));assert.equal(h.data.items[0].tradeCost,8.123);assert.equal(h.data.items[0].sellPrice,10.15);assert.equal(h.data.items[0].priceHistory.length,1);assert.equal(h.legacyWrites.length,0);
});
test("quick price validation reports blank, negative and overflowing prices",()=>{
  for(const [cost,markup] of [["","20"],["5",""],["-1","20"],["1e308","1e308"]]){const h=harness();h.button("Quick update").props.onClick();h.fill("New trade cost (£)",cost);h.fill("Markup (%)",markup);h.button("Save price").props.onClick();assert.equal(h.writes.length,0);assert.ok(nodes(h.render()).some(node=>node.props.role==="alert"));}
});
test("favourite and delete actions surface storage errors and retry durably",()=>{
  for(const label of ["Favourite Twin socket","Delete Twin socket"]){const h=harness();h.fail();h.action(label).props.onClick();assert.equal(h.writes.length,0);assert.equal(h.data.items.length,1);assert.equal(h.data.items[0].favourite,false);assert.match(text(h.render()),/Storage full/);h.fail(false);h.action(label).props.onClick();assert.equal(h.writes.length,1);assert.equal(h.legacyWrites.length,0);if(label.startsWith("Delete"))assert.equal(h.data.items.length,0);else assert.equal(h.data.items[0].favourite,true);}
});
test("retained material writes reject account, readiness, session and unmount changes",()=>{
  for(const change of [h=>{h.identityState.identity={...h.identityState.identity,organisationId:"other"};h.render();},h=>{h.identityState.isReady=false;h.render();},h=>{h.data.isReady=false;h.render();},h=>h.session(null),h=>h.unmount()]){
    const h=harness();newMaterial(h);const save=h.form().props.onSubmit;change(h);save({preventDefault(){}});assert.equal(h.writes.length,0);
  }
});
test("switching accounts clears material forms and does not resurrect them on return",()=>{
  const h=harness();newMaterial(h);h.identityState.identity={...h.identityState.identity,organisationId:"other"};h.render();assert.ok(!nodes(h.render()).some(node=>node.props.label==="Material name"));h.identityState.identity={...h.identityState.identity,organisationId:"org-1"};h.render();assert.ok(!nodes(h.render()).some(node=>node.props.label==="Material name"));
});
test("unauthorised cloud roles cannot begin or retain material mutation controls",()=>{
  for(const role of ["electrician","customer","unknown"]){const h=harness();h.identityState.identity.role=role;const tree=h.render();const add=nodes(tree).find(node=>node.type==="PageHeader").props.action;assert.equal(add.props.disabled,true);add.props.onClick();assert.ok(!nodes(h.render()).some(node=>node.props.label==="Material name"));assert.ok(!nodes(tree).some(node=>node.props?.["aria-label"]?.startsWith("Edit ")&&!node.props.disabled));assert.equal(h.writes.length,0);}
});
test("materials derives visible prices from the current office account",()=>{
  const h=harness();assert.match(text(h.render()),/Trade cost£7.00/);assert.match(text(h.render()),/Selling price£12.00/);h.identityState.identity.role="electrician";assert.doesNotMatch(text(h.render()),/Trade cost|Selling price|Prices over 30 days old|Quick update|Markup/);h.identityState.identity.role="office";assert.match(text(h.render()),/Trade cost£7.00/);
});
test("non-office accounts cannot expose material price inputs, history or deletion",()=>{
  for(const role of ["electrician","customer","unknown",null]){const h=harness();h.data.items[0].priceHistory=[{id:"history",tradeCost:7,sellPrice:12,source:"Manual",recordedAt:item.createdAt}];h.identityState.identity=role?{...h.identityState.identity,role}:null;h.openForm();const tree=h.render();assert.doesNotMatch(text(tree),/Recent price history|Prices over 30 days old|Trade cost|Selling price|Markup|Quick update/);assert.ok(!nodes(tree).some(node=>/cost|price|markup/i.test(node.props?.label??"")||node.props?.["aria-label"]==="Delete Twin socket"));assert.equal(h.writes.length,0);}
});

function prepareWrite(h,kind) {
  if(kind==="new"){newMaterial(h);const save=h.form().props.onSubmit;return ()=>save({preventDefault(){}});}
  if(kind==="edit"){h.action("Edit Twin socket").props.onClick();h.fill("Stock code","UPDATED");const save=h.form().props.onSubmit;return ()=>save({preventDefault(){}});}
  if(kind==="quick"){h.button("Quick update").props.onClick();h.fill("New trade cost (£)","8");return h.button("Save price").props.onClick;}
  return h.action(`${kind==="favourite"?"Favourite":"Delete"} Twin socket`).props.onClick;
}
test("all material writes reject a changed session user even when a token string is unchanged",()=>{
  for(const kind of ["new","edit","quick","favourite","delete"]){const h=harness(),save=prepareWrite(h,kind);h.session({access_token:"token",user:{id:"user-2"}},false);save();assert.equal(h.writes.length,0,kind);assert.equal(h.confirmations.length,0,kind);}
});
test("all material writes block failed or conflicting sync but allow pending offline changes",()=>{
  for(const state of ["Failed","Conflict","Pending","Offline"])for(const kind of ["edit","quick","favourite","delete"]){const h=harness(),save=prepareWrite(h,kind);h.queue.push({table:"materials",sourceId:"mat-1",state});save();assert.equal(h.writes.length,["Failed","Conflict"].includes(state)?0:1,`${kind} ${state}`);if(["Failed","Conflict"].includes(state))assert.match(text(h.render()),/failed or conflicting sync/i);}
});
test("sync conflicts arriving inside the durable updater still block material changes",()=>{
  for(const kind of ["edit","quick","favourite","delete"]){const h=harness(),save=prepareWrite(h,kind);h.beforeWrite(()=>h.queue.push({table:"materials",sourceId:"mat-1",state:"Conflict"}));save();assert.equal(h.writes.length,0,kind);assert.match(text(h.render()),/conflicting sync/i);}
});
const reorder = value => Array.isArray(value)?value.map(reorder):value&&typeof value==="object"?Object.fromEntries(Object.entries(value).reverse().map(([key,item])=>[key,reorder(item)])):value;
test("material creation and price updates recover exact saved versions without another history entry",()=>{
  for(const kind of ["new","edit","quick"]){const h=harness(),save=prepareWrite(h,kind);h.acknowledgement();save();assert.equal(h.writes.length,1);h.data.items=h.data.items.map(reorder);h.render();if(kind==="quick"){h.fill("New trade cost (£)","99");h.button("Save price").props.onClick();}else{h.fill("Stock code","NOT SAVED");h.submit();}assert.equal(h.writes.length,1);assert.equal(h.data.items[0].priceHistory.length,1);assert.match(text(h.render()),/recovered the previously saved version/i);assert.match(text(h.render()),/Later draft edits were not saved/);}
});
test("material retries after equivalent collection refreshes preserve the entire failed payload",()=>{
  for(const kind of ["new","edit","quick"]){const h=harness(),save=prepareWrite(h,kind);h.fail();save();const first=h.attempts[0];h.data.items=h.data.items.map(reorder);h.fail(false);h.render();if(kind==="quick")h.button("Save price").props.onClick();else h.submit();assert.equal(h.writes.length,1);assert.deepEqual(json(h.data.items[0]),json(first));}
});
test("genuinely failed material drafts can be edited before retrying with their original identity",()=>{
  const h=harness();newMaterial(h);h.fail();h.submit();const id=h.attempts[0].id;h.fill("Trade cost (£)","8.123");h.fail(false);h.submit();assert.equal(h.writes.length,1);assert.equal(h.data.items[0].id,id);assert.equal(h.data.items[0].tradeCost,8.123);assert.equal(h.data.items[0].priceHistory.length,1);
});
test("recovery rejects changed or duplicated material candidates",()=>{
  for(const duplicate of [false,true]){const h=harness();newMaterial(h);h.acknowledgement();h.submit();const saved=h.data.items[0];h.data.items=duplicate?[saved,saved,...h.data.items.slice(1)]:[{...saved,stockCode:"OTHER"},...h.data.items.slice(1)];h.submit();assert.equal(h.writes.length,1);assert.match(text(h.render()),/changed|duplicate/i);assert.equal(h.field("Stock code").props.value,"NEW-1");}
});
test("closing or replacing a material draft invalidates its retained save immediately",()=>{
  for(const replace of [false,true]){const h=harness();newMaterial(h);const old=h.form().props.onSubmit;if(replace)h.action("Edit Twin socket").props.onClick();else h.openForm();old({preventDefault(){}});assert.equal(h.writes.length,0);}
});
test("local mode permits durable material edits without a cloud session",()=>{
  const h=harness();h.identityState.mode="local";h.identityState.identity=null;h.session(null);newMaterial(h);h.submit();assert.equal(h.writes.length,1);assert.equal(h.data.items[0].tradeCost,4.123);assert.equal(h.data.items[0].sellPrice,9.875);
});
test("returning from a supplier tab preserves material drafts through same-account identity refresh",()=>{
  for(const kind of ["new","edit","quick"]){const h=harness(),old=prepareWrite(h,kind),owner=h.identityState.identity;h.fail();old();const first=h.attempts[0];h.identityState.identity=null;h.identityState.isReady=false;h.render();old();assert.equal(h.writes.length,0);h.identityState.identity={...owner};h.identityState.isReady=true;h.data.items=h.data.items.map(reorder);h.render();old();assert.equal(h.writes.length,0);h.fail(false);if(kind==="quick")h.button("Save price").props.onClick();else h.submit();assert.equal(h.writes.length,1);assert.deepEqual(json(h.data.items[0]),json(first));}
});

const change = (h, label, value) => { h.action(label).props.onChange({ target: { value } }); h.render(); };
const cards = h => nodes(h.render()).filter(node => node.type === "MaterialShareActions");
const manyMaterials = count => Array.from({ length: count }, (_, i) => ({ ...item, id: `m-${i}`, name: `Socket ${i}`, stockCode: `CODE-${i}`, category: i % 2 ? "Cable" : "Accessories", supplier: i % 2 ? "CEF" : "Screwfix", favourite: i % 3 === 0 }));

test("material browsing matches words in any order across product fields and combines filters", () => {
  const h = harness(); h.data.items = manyMaterials(26);
  assert.equal(cards(h).length, 12); assert.match(text(h.render()), /Showing 12 of 26/);
  h.button("Show more materials").props.onClick(); assert.equal(cards(h).length, 24);
  change(h, "Search materials", "CODE-1 socket CEF"); assert.deepEqual(cards(h).map(card => card.props.material.stockCode), ["CODE-1", "CODE-11", "CODE-13", "CODE-15", "CODE-17", "CODE-19"]);
  change(h, "Filter materials by category", "Accessories"); assert.equal(cards(h).length, 0);
  h.button("Clear filters").props.onClick(); assert.equal(cards(h).length, 12);
  change(h, "Filter materials by supplier", "CEF"); h.button("Favourites").props.onClick();
  assert.deepEqual(cards(h).map(card => card.props.material.stockCode), ["CODE-3", "CODE-9", "CODE-15", "CODE-21"]);
  h.button("Clear filters").props.onClick(); h.button("Show more materials").props.onClick(); change(h, "Search materials", "  socket   "); assert.equal(cards(h).length, 12);
  assert.equal(h.writes.length, 0); assert.equal(h.network.length, 0);
});

test("filtering and progressive cards leave an unfinished quick price edit available", () => {
  const h = harness(); h.data.items = manyMaterials(26); h.button("Quick update").props.onClick(); h.fill("New trade cost (£)", "17.25");
  change(h, "Search materials", "CODE-25"); assert.equal(cards(h).length, 1); assert.equal(h.field("New trade cost (£)").props.value, "17.25");
  assert.match(text(h.render()), /Update price: Socket 0/); h.button("Save price").props.onClick();
  assert.equal(h.data.items.find(item => item.id === "m-0").tradeCost, 17.25); assert.equal(h.data.items.find(item => item.id === "m-25").tradeCost, 7);
});

test("ambiguous material records remain visibly marked and cannot inflate usable summaries", () => {
  const h = harness(); h.data.items = [{ ...item, favourite: true }, { ...item, favourite: true, name: "Hidden duplicate" }];
  const tree = h.render(); assert.match(text(tree), /2 records need identity review/);
  assert.match(text(tree), /Supplier-linked items0/); assert.match(text(tree), /Favourite materials0/);
  for (const share of cards(h)) assert.equal(share.props.enabled, false);
});

const lookupPayload = (patch = {}) => ({ supplier: "CEF", stockCode: "C1", name: "Verified socket", manufacturer: "Maker", exactMatch: true, message: "Check the product and price.", productUrl: "https://www.cef.co.uk/product/socket", searchUrl: "https://www.cef.co.uk/search?q=C1", publicPrice: 12.34, ...patch });
const lookupForm = h => h.action("Supplier lookup");
const lookupSubmit = h => lookupForm(h).props.onSubmit({ preventDefault() {} });
const lookupFinish = (h, i, payload = lookupPayload(), ok = true) => h.requests[i].resolve({ ok, json: async () => payload });
const lookupResult = h => nodes(h.render()).find(node => node.props["aria-label"] === "Supplier lookup result");

test("office lookup validates code length, authenticates and prevents duplicate requests", async () => {
  const h = harness(); await lookupSubmit(h); assert.equal(h.requests.length, 0); assert.match(text(h.render()), /1–80 characters/);
  change(h, "Supplier stock code lookup", "x".repeat(81)); await lookupSubmit(h); assert.equal(h.requests.length, 0);
  change(h, "Supplier stock code lookup", " C1 "); const callback = lookupForm(h).props.onSubmit; const pending = callback({ preventDefault() {} }); await callback({ preventDefault() {} });
  assert.equal(h.requests.length, 1); assert.deepEqual(JSON.parse(h.requests[0].args[1].body), { supplier: "CEF", stockCode: "C1" }); assert.equal(h.requests[0].args[1].headers.Authorization, "Bearer token");
  assert.equal(lookupForm(h).props["aria-busy"], true); lookupFinish(h, 0); await pending; assert.equal(lookupForm(h).props["aria-busy"], false); assert.equal(h.timers.size, 0);
});

test("signed-out, recovery and mismatched-user sessions cannot start an office lookup", async () => {
  for (const session of [null, { access_token: "token", user: { id: "user-1" }, is_password_recovery: true }, { access_token: "token", user: { id: "user-2" } }]) {
    const h = harness(); h.session(session); change(h, "Supplier stock code lookup", "C1"); await lookupSubmit(h);
    assert.equal(h.requests.length, 0); assert.equal(h.action("Supplier stock code lookup").props.value, "C1"); assert.equal(lookupForm(h).props["aria-busy"], false); assert.match(text(h.render()), /Sign in and load your materials/);
  }
});

test("code and supplier changes abort requests and clear old results even on input round trips", async () => {
  const h = harness(); change(h, "Supplier stock code lookup", "C1"); const stale = lookupForm(h).props.onSubmit; const first = stale({ preventDefault() {} });
  change(h, "Supplier stock code lookup", "C2"); change(h, "Supplier stock code lookup", "C1"); await stale({ preventDefault() {} }); assert.equal(h.requests.length, 1); assert.equal(h.requests[0].args[1].signal.aborted, true);
  const current = lookupSubmit(h); lookupFinish(h, 0, lookupPayload({ name: "Old result" })); await first; assert.equal(lookupResult(h), undefined); assert.equal(lookupForm(h).props["aria-busy"], true);
  lookupFinish(h, 1); await current; assert.ok(lookupResult(h)); change(h, "Lookup supplier", "Screwfix"); assert.equal(lookupResult(h), undefined);
});

test("lookup cancel, clear and timeout allow retry without losing chosen supplier", async () => {
  for (const action of ["Cancel lookup", "Clear lookup", "timeout"]) {
    const h = harness(); change(h, "Supplier stock code lookup", "C1"); const pending = lookupSubmit(h);
    if (action === "timeout") { const timer = [...h.timers.values()][0]; assert.equal(timer.ms, 20000); timer.fn(); } else h.button(action).props.onClick();
    assert.equal(h.requests[0].args[1].signal.aborted, true); assert.equal(h.action("Supplier stock code lookup").props.value, action === "Clear lookup" ? "" : "C1"); assert.equal(h.action("Lookup supplier").props.value, "CEF"); assert.equal(lookupForm(h).props["aria-busy"], false); assert.equal(h.timers.size, 0);
    if (action === "Clear lookup") change(h, "Supplier stock code lookup", "C1"); const retry = lookupSubmit(h); lookupFinish(h, 0, lookupPayload({ name: "Late result" })); await pending; assert.equal(lookupResult(h), undefined);
    lookupFinish(h, 1); await retry; assert.match(text(lookupResult(h)), /Verified socket/);
  }
});

test("account, readiness, session and unmount changes prevent old supplier responses", async () => {
  for (const changed of [h => { h.identityState.identity = { ...h.identityState.identity, organisationId: "other" }; h.render(); }, h => { h.identityState.isReady = false; h.render(); }, h => h.session(null, false), h => h.session({ access_token: "token", user: { id: "user-2" } }, false), h => h.unmount()]) {
    const h = harness(); change(h, "Supplier stock code lookup", "C1"); const callback = lookupForm(h).props.onSubmit, pending = callback({ preventDefault() {} }); changed(h); lookupFinish(h, 0); await pending; await callback({ preventDefault() {} });
    assert.equal(h.requests.length, 1); assert.equal(lookupResult(h), undefined); assert.equal(h.writes.length, 0);
  }
});

test("exact supplier results create a reviewable draft without assuming buying or selling prices", async () => {
  const h = harness(); change(h, "Supplier stock code lookup", "C1"); const pending = lookupSubmit(h); lookupFinish(h, 0); await pending;
  assert.match(text(lookupResult(h)), /Supplier code match/); assert.match(text(lookupResult(h)), /£12.34/); assert.match(text(lookupResult(h)), /VAT|pack size/);
  h.button("Add to materials").props.onClick(); assert.equal(h.field("Material name").props.value, "Verified socket"); assert.equal(h.field("Stock code").props.value, "C1"); assert.equal(h.field("Trade cost (£)").props.value, ""); assert.equal(h.field("Selling price (£)").props.value, ""); assert.equal(h.writes.length, 0);
  h.fill("Trade cost (£)", "9"); h.fill("Selling price (£)", "15"); h.submit(); assert.equal(h.writes.length, 1); assert.equal(h.data.items[0].priceSource, "Manual");
});

test("supplier suggestions remain search-only and cannot import a mismatched product", async () => {
  const h = harness(); change(h, "Supplier stock code lookup", "C1"); const pending = lookupSubmit(h); lookupFinish(h, 0, lookupPayload({ exactMatch: false, name: "Wrong item" })); await pending;
  assert.match(text(lookupResult(h)), /Not an exact code match/); assert.doesNotMatch(text(lookupResult(h)), /Wrong item|£12.34/); assert.equal(nodes(lookupResult(h)).find(node => node.type === "a").props.href, lookupPayload().searchUrl); assert.ok(!nodes(h.render()).some(node => node.type === "Button" && text(node) === "Add to materials")); assert.equal(h.writes.length, 0);
});

test("lookup import never replaces unfinished material or quick price drafts", async () => {
  for (const kind of ["main", "quick"]) {
    const h = harness(); change(h, "Supplier stock code lookup", "C1"); const pending = lookupSubmit(h); lookupFinish(h, 0); await pending; const staleImport = h.button("Add to materials").props.onClick;
    if (kind === "main") { newMaterial(h); } else { h.button("Quick update").props.onClick(); h.fill("New trade cost (£)", "22"); }
    assert.equal(h.button("Add to materials").props.disabled, true); h.button("Add to materials").props.onClick(); staleImport(); assert.match(text(h.render()), /Finish or close/);
    if (kind === "main") assert.equal(h.field("Material name").props.value, "Test socket"); else assert.equal(h.field("New trade cost (£)").props.value, "22"); assert.equal(h.writes.length, 0);
  }
});

test("invalid supplier payloads remain errors and keep the stock code for retry", async () => {
  for (const payload of [null, lookupPayload({ stockCode: "OTHER" }), lookupPayload({ productUrl: "https://evil.example/p" }), lookupPayload({ publicPrice: -3 })]) {
    const h = harness(); change(h, "Supplier stock code lookup", "C1"); const pending = lookupSubmit(h); lookupFinish(h, 0, payload); await pending;
    assert.equal(lookupResult(h), undefined); assert.equal(lookupForm(h).props["aria-busy"], false); assert.equal(h.action("Supplier stock code lookup").props.value, "C1"); assert.equal(h.timers.size, 0); assert.match(text(h.render()), /response|price/i);
  }
});
