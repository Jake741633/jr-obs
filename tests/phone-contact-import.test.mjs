import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import * as imports from "../lib/contactImport.ts";
import { harness as customerHarness, nodes, text, customer } from "./helpers/customer-page-harness.mjs";

const card = (name = "Alice Example", fields = "TEL:07700 900111") => `BEGIN:VCARD\r\nVERSION:3.0\r\nFN:${name}\r\n${fields}\r\nEND:VCARD\r\n`;
const source = ts.transpileModule(readFileSync(new URL("../components/crm/ContactImportPanel.tsx", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const tick = () => new Promise(resolve => setImmediate(resolve));
function harness(initial = [], manager) {
  const slots = [], effects = [], writes = [], attempts = []; let cursor = 0, sequence = 0, failAt = -1;
  const props = { customers: initial, ready: true, scopeKey: "owner:org:user", createCustomer(record, snapshot) {
    attempts.push(record); if (writes.length === failAt) throw new Error("Device storage is full");
    assert.equal(snapshot, imports.contactMatchSnapshot(imports.matchingContacts(record, props.customers)));
    assert.ok(!props.customers.some(saved => saved.id === record.id)); props.customers = [...props.customers, record]; writes.push(record);
  } };
  const changed = (prior, deps) => !prior || deps.some((item, index) => !Object.is(item, prior.deps[index]));
  const useState = value => { const index = cursor++; if (!(index in slots)) slots[index] = typeof value === "function" ? value() : value; return [slots[index], next => { slots[index] = typeof next === "function" ? next(slots[index]) : next; }]; };
  const deps = {
    "react/jsx-runtime": { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    react: { useState, useRef: value => useState({ current: value })[0], useMemo(fn, deps) { const index = cursor++; if (changed(slots[index], deps)) slots[index] = { deps, value: fn() }; return slots[index].value; }, useLayoutEffect(fn, deps) { const index = cursor++, old = slots[index]; if (changed(old, deps)) { const next = { deps, cleanup: old?.cleanup }; slots[index] = next; effects.push(() => { next.cleanup?.(); next.cleanup = fn(); }); } } },
    "../ui/Button": { Button: "Button" }, "../ui/FormField": { InputField: "InputField" }, "../../lib/contactImport": imports, "../../lib/storage": { makeId: () => `cus-import-${++sequence}` },
  };
  const mod = { exports: {} }; vm.runInNewContext(source, { module: mod, exports: mod.exports, Error, Date, navigator: { contacts: manager }, require: name => { assert.ok(name in deps, name); return deps[name]; } });
  function render() { cursor = 0; const tree = mod.exports.ContactImportPanel(props); effects.splice(0).forEach(fn => fn()); return tree; }
  const button = label => nodes(render()).find(node => ["Button", "button"].includes(node.type) && text(node).startsWith(label));
  const rows = () => nodes(render()).filter(node => node.type === "section");
  return { props, writes, attempts, render, button, rows,
    async file(contents, options = {}) { const input = nodes(render()).find(node => node.type === "input" && node.props.type === "file"); await input.props.onChange({ target: { value: "contact.vcf", files: [{ name: "contacts.vcf", size: 100, text: async () => contents, ...options }] } }); render(); },
    select(index, checked = true) { nodes(rows()[index]).find(node => node.type === "input" && node.props.type === "checkbox").props.onChange({ target: { checked } }); render(); },
    consent(index) { const checks = nodes(rows()[index]).filter(node => node.type === "input" && node.props.type === "checkbox"); checks[1].props.onChange({ target: { checked: true } }); render(); },
    field(index, label, value) { nodes(rows()[index]).find(node => node.props.label === label).props.onChange({ target: { value } }); render(); },
    click(label) { const found = button(label); assert.ok(found, label); found.props.onClick(); render(); },
    fail(value) { failAt = value; }, scope(value) { props.scopeKey = value; render(); }, ready(value) { props.ready = value; render(); }, unmount() { slots.forEach(slot => slot?.cleanup?.()); },
  };
}

test("vCard import reads Apple fields, Unicode, folded text and multiple choices without private notes or photos", () => {
  const input = card("Élodie Exa\r\n mple", "item1.TEL;TYPE=CELL:07700 900111\r\nTEL;TYPE=WORK:020 7946 0123\r\nEMAIL;TYPE=HOME:elodie@example.test\r\nADR;TYPE=HOME:;;Flat 2\\; Rear\\, 1 High Street;Epsom;Surrey;KT1 1AA;UK\r\nNOTE:Private personal note\r\nPHOTO;ENCODING=b:never import these bytes\r\nURL:https://example.test");
  assert.deepEqual(imports.parseContactFile(input), [{ name: "Élodie Example", phones: ["07700 900111", "020 7946 0123"], emails: ["elodie@example.test"], addresses: ["Flat 2; Rear, 1 High Street, Epsom, Surrey, KT1 1AA, UK"] }]);
});
test("vCard 4 URI values, structured names and business contacts are understood", () => {
  const input = "BEGIN:VCARD\nVERSION:4.0\nN:Smith;Jake;;Mr;\nTEL;TYPE=\"work:voice\":tel:%2B447700900111\nEMAIL:mailto:Jake%40example.test\nEND:VCARD\n";
  assert.deepEqual(imports.parseContactFile(input)[0], { name: "Mr Jake Smith", phones: ["+447700900111"], emails: ["Jake@example.test"], addresses: [] });
  assert.equal(imports.parseContactFile(card("", "ORG:Example\\; Ltd;Installations"))[0].name, "Example; Ltd · Installations");
});
test("invalid, unfinished, old-encoding and excessive contact files fail without returning a partial import", () => {
  for (const input of ["", "not a vcard", card() + "BEGIN:VCARD", card().replace("END:VCARD", ""), card().replace("3.0", "2.1"), card().replace("FN:", "FN;ENCODING=QUOTED-PRINTABLE:"), card().repeat(501), "x".repeat(imports.MAX_CONTACT_FILE_BYTES + 1)]) assert.throws(() => imports.parseContactFile(input));
  assert.match(imports.contactFileError({ name: "contacts.csv", size: 10 }), /\.vcf/);
  assert.match(imports.contactFileError({ name: "contacts.vcf", size: 0 }), /empty/);
  assert.match(imports.contactFileError({ name: "contacts.vcf", size: 3e6 }), /under 2 MB/);
});
test("native contact fields are bounded, omit personal extras and preserve address and number choices", () => {
  const input = [{ name: ["Jake"], tel: ["07700 900111", "020 7946 0123"], email: ["work@example.test"], address: [{ addressLine: ["1 High Street"], city: "Epsom", region: "Surrey", postalCode: "KT1 1AA", country: "GB" }], icon: ["private-photo"], note: "secret" }];
  const contact = imports.phoneContacts(input)[0]; assert.equal(contact.phones.length, 2); assert.equal(contact.addresses[0], "1 High Street, Epsom, Surrey, KT1 1AA, GB"); assert.ok(!JSON.stringify(contact).includes("secret")); assert.ok(!JSON.stringify(contact).includes("private-photo"));
  assert.throws(() => imports.phoneContacts([null])); assert.throws(() => imports.phoneContacts([{ name: ["x".repeat(257)] }]));
});
test("duplicate checks compare UK and international phones, case-insensitive emails and names without combining customers", () => {
  const saved = customer({ phone: "07700 900111" });
  for (const patch of [{ phone: "+44 7700 900111" }, { phone: "0044 7700 900111" }, { email: "CUSTOMER@EXAMPLE.TEST" }, { name: "EXAMPLE  CUSTOMER" }]) assert.equal(imports.matchingContacts({ name: "Other", phone: "", email: "", address: "", ...patch }, [saved]).length, 1);
  assert.equal(imports.matchingContacts({ name: "Other", phone: "garbage", email: "", address: "" }, [saved]).length, 0);
});
test("reading and browsing a contacts list creates no customer until selected records are saved", async () => {
  const h = harness(); await h.file(Array.from({ length: 10 }, (_, i) => card(`Customer ${i}`, `TEL:0770090${String(i).padStart(4, "0")}`)).join(""));
  assert.equal(h.rows().length, 8); assert.equal(h.writes.length, 0); h.click("Show more imported"); assert.equal(h.rows().length, 10);
  h.select(0); h.select(9); h.click("Save 2 selected"); assert.equal(h.writes.length, 2); assert.equal(h.writes[1].name, "Customer 9"); assert.equal(h.writes[0].notes, ""); assert.match(text(h.render()), /2 customers saved on this device/);
});
test("matching contacts require explicit review; changed match details invalidate consent", async () => {
  const h = harness([customer({ phone: "07700 900111" })]); await h.file(card()); h.select(0); h.click("Save 1"); assert.equal(h.writes.length, 0); assert.match(text(h.render()), /review the matching customer/);
  h.consent(0); h.props.customers = [customer({ phone: "07700 900111", name: "Changed customer" })]; h.click("Save 1"); assert.equal(h.writes.length, 0);
  h.consent(0); h.click("Save 1"); assert.equal(h.writes.length, 1); assert.equal(h.props.customers[0].name, "Changed customer");
});
test("bulk selection chooses only complete unmatched contacts across all results", async () => {
  const h = harness([customer({ phone: "07700 900111" })]);
  await h.file(card() + card("New customer", "TEL:07700 900222") + card("Repeated", "TEL:07700 900333") + card("Repeated again", "TEL:07700 900333") + card("No details", "NOTE:Ignored"));
  h.click("Select contacts without matches"); assert.ok(h.button("Save 1")); h.click("Save 1"); assert.equal(h.writes.length, 1); assert.equal(h.writes[0].name, "New customer");
});
test("contact save failure retains selections and stable identities, with no duplicate after partial success", async () => {
  const h = harness(); await h.file(card() + card("Bob", "TEL:07700 900222")); h.select(0); h.select(1); h.fail(1); h.click("Save 2");
  assert.equal(h.writes.length, 1); assert.match(text(h.render()), /1 saved.*Unsaved contacts remain/); const failed = h.attempts[1];
  h.fail(-1); const repeat = h.button("Save 1").props.onClick; repeat(); repeat(); assert.equal(h.writes.length, 2); assert.equal(h.writes[1].id, failed.id); assert.equal(h.writes[1].createdAt, failed.createdAt);
});
test("missing names and contacts are editable before save and multiple phone values can be selected", async () => {
  const h = harness(); await h.file(card("", "TEL:07700 900111\r\nTEL:020 7946 0123")); h.select(0); h.click("Save 1"); assert.equal(h.writes.length, 0); h.field(0, "Customer name", "Reviewed name");
  nodes(h.rows()[0]).find(node => node.type === "select").props.onChange({ target: { value: "020 7946 0123" } }); h.click("Save 1"); assert.equal(h.writes[0].phone, "020 7946 0123");
});
test("account readiness and unmount changes invalidate asynchronous file reads and saved callbacks", async () => {
  for (const change of [h => h.scope("other"), h => h.ready(false), h => h.unmount(), h => { h.ready(false); h.ready(true); }]) {
    const h = harness(); let resolve; const pending = new Promise(r => { resolve = r; }); const reading = h.file("", { text: () => pending }); change(h); resolve(card()); await reading; assert.equal(h.rows().length, 0); assert.equal(h.writes.length, 0);
    const saved = harness(); await saved.file(card()); saved.select(0); const stale = saved.button("Save 1").props.onClick; change(saved); stale(); assert.equal(saved.writes.length, 0);
  }
});
test("native picker requests only supported fields after a tap and safely handles cancellation", async () => {
  const calls = [], manager = { getProperties: async () => ["name", "tel", "email", "icon"], select: async (fields, options) => { calls.push([fields, options]); return [{ name: ["Picked"], tel: ["07700 900111"] }]; } };
  const h = harness([], manager); h.render(); await tick(); assert.equal(calls.length, 0); h.click("Choose phone"); await tick(); assert.equal(calls.length, 1); assert.deepEqual(JSON.parse(JSON.stringify(calls)), [[["name", "tel", "email"], { multiple: true }]]); assert.equal(h.rows().length, 1); assert.equal(h.writes.length, 0);
  const cancelled = harness([], { ...manager, select: async () => { const e = new Error("cancelled"); e.name = "AbortError"; throw e; } }); cancelled.render(); await tick(); cancelled.click("Choose phone"); await tick(); assert.match(text(cancelled.render()), /selection cancelled/); assert.equal(cancelled.writes.length, 0);
});
test("customer page gates the import with existing role, account, draft and duplicate checks", () => {
  const h = customerHarness(); const panel = () => nodes(h.render()).find(node => node.type === "ContactImportPanel");
  const create = panel().props.createCustomer, item = customer({ id: "imported" });
  h.openForm(); assert.throws(() => create(item, "[]"), /Close/); h.openForm();
  h.data.customers = [customer()]; h.render(); assert.throws(() => create(item, "[]"), /Matching/); h.account({ organisationId: "other" }); assert.throws(() => create(item, "[]"), /current account/);
  h.account({ role: "electrician" }); assert.equal(panel(), undefined);
});
