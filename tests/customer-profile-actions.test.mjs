import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import * as identities from "../lib/assistantIdentity.ts";
import * as contacts from "../lib/contactLinks.ts";
import * as permissions from "../lib/cloud/permissions.ts";
import * as jobCore from "../lib/jobManagement-core.mjs";
import { queueTargetSyncState } from "../lib/cloud/repository-core.mjs";
import { customer, nodes, text } from "./helpers/customer-page-harness.mjs";

const source = ts.transpileModule(readFileSync(new URL("../components/crm/CustomerWorkflowActions.tsx", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const job = (patch = {}) => ({ id: "job-1", customerId: "customer-1", title: "Workshop", siteAddress: "1 High Street", status: "Testing", createdAt: "2026-10-01T09:00:00Z", updatedAt: "2026-10-01T09:00:00Z", notes: "Keep these details", ...patch });
const profile = (patch = {}) => ({ id: "profile-1", customerId: "customer-1", tags: ["Repeat"], preferredContact: "Email", nextFollowUpDate: "2026-12-01", followUpReason: "Annual check", reviewStatus: "Not requested", portalEnabled: true, portalNote: "Retain", createdAt: "2026-10-01T09:00:00Z", updatedAt: "2026-10-01T09:00:00Z", ...patch });

function harness() {
  let cursor = 0, sequence = 0, key, customerId = "customer-1", slots = [], layouts = [];
  let mode = "cloud", identityReady = true, identity = { organisationId: "org-1", userId: "user-1", role: "owner" };
  let confirmResult = true, confirmEffect, composerError, beforeUpdate;
  let clock = Date.parse("2026-10-11T14:00:00Z");
  const attempts = [], writes = [], confirmations = [], composers = [], failures = new Set(), queue = [], navigator = { onLine: true };
  const data = { customers: [customer()], jobs: [job()], timeline: [], profiles: [], interactions: [] };
  const ready = Object.fromEntries(Object.keys(data).map(name => [name, true]));
  const changed = (previous, deps) => !previous || deps.some((value, index) => !Object.is(value, previous.deps[index]));
  const useState = value => { const i = cursor++; if (!(i in slots)) slots[i] = typeof value === "function" ? value() : value; const state = slots; return [state[i], next => { state[i] = typeof next === "function" ? next(state[i]) : next; }]; };
  const useMemo = (fn, deps) => { const i = cursor++; if (changed(slots[i], deps)) slots[i] = { deps, value: fn() }; return slots[i].value; };
  const useLayoutEffect = (fn, deps) => { const i = cursor++, previous = slots[i]; if (changed(previous, deps)) { const current = { deps, cleanup: previous?.cleanup }; slots[i] = current; layouts.push(() => { current.cleanup?.(); current.cleanup = fn(); }); } };
  const unmount = () => slots.forEach(slot => slot?.cleanup?.());
  function commit(kind, collection, item, next) {
    attempts.push({ kind, collection, item });
    if (failures.has(`${collection}:${kind}`)) throw new Error("Device storage or sync queue is full");
    data[collection] = next; writes.push({ kind, collection, item }); return item;
  }
  const store = collection => ({ items: data[collection], isReady: ready[collection], setItems() { assert.fail("Actions must use durable writes"); },
    createItem(item) { if (data[collection].some(record => record.id === item.id)) throw new Error("Identity already exists"); return commit("create", collection, item, [item, ...data[collection]]); },
    updateItem(id, update) { beforeUpdate?.(collection, id); const index = data[collection].findIndex(item => item.id === id); if (index < 0) throw new Error("Record no longer exists"); const current = data[collection][index], item = update(current); if (item === current) return item; return commit("update", collection, item, data[collection].map((record, i) => i === index ? item : record)); },
  });
  const jsx = (type, props, key) => ({ type, props, key });
  const dependencies = {
    "react/jsx-runtime": { jsx, jsxs: jsx }, react: { useState, useMemo, useRef: value => useState({ current: value })[0], useLayoutEffect, useEffect: useLayoutEffect },
    "./CustomerQuickActions": { CustomerQuickActions: "QuickActions" }, "../ui/Card": { Card: "Card" }, "../ui/Button": { Button: "Button" }, "../ui/FormField": { TextareaField: "TextareaField" },
    "../../lib/assistantIdentity": identities, "../../lib/contactLinks": contacts, "../../lib/cloud/permissions": permissions,
    "../../lib/cloud/useCloudIdentity": { useCloudIdentity: () => ({ mode, identity, isReady: identityReady }) }, "../../lib/cloud/repository": { getSyncQueue: () => queue },
    "../../lib/cloud/repository-core.mjs": { queueTargetSyncState }, "../../lib/jobManagement-core.mjs": jobCore,
    "../../lib/storage": { makeId: prefix => `${prefix}_${++sequence}` },
  };
  class TestDate extends Date { constructor(...args) { super(...(args.length ? args : [clock])); } static now() { return clock; } }
  const mod = { exports: {} };
  vm.runInNewContext(source, { module: mod, exports: mod.exports, Date: TestDate, Error, navigator, window: { confirm(message) { confirmations.push(message); confirmEffect?.(); return confirmResult; }, location: { assign(href) { if (composerError) throw new Error(composerError); composers.push(href); } } }, require(name) { assert.ok(name in dependencies, name); return dependencies[name]; } });
  const render = () => {
    const element = mod.exports.CustomerWorkflowActions({ customerId, ...Object.fromEntries(Object.keys(data).map(name => [name, store(name)])) });
    if (key !== element.key) { unmount(); slots = []; layouts = []; key = element.key; }
    cursor = 0; const view = element.type(element.props); layouts.splice(0).forEach(fn => fn()); return view;
  };
  const button = label => nodes(render()).find(n => ["button", "Button"].includes(n.type) && text(n) === label);
  const select = label => nodes(nodes(render()).find(n => n.type === "label" && text(n.props.children[0]) === label)).find(n => n.type === "select");
  const dock = () => nodes(render()).find(n => n.type === "QuickActions");
  const field = () => nodes(render()).find(n => n.type === "TextareaField");
  return { data, ready, attempts, writes, failures, confirmations, composers, queue, navigator, render, button, select, dock, field, unmount, identities: () => sequence,
    click(label) { const control = button(label); assert.ok(control, label); control.props.onClick(); },
    openCompletion() { dock().props.onMarkComplete(); }, choose(id = "job-1") { select("Job to complete").props.onChange({ target: { value: id } }); },
    openReview() { dock().props.onRequestReview(); }, channel(value) { select("Send using").props.onChange({ target: { value } }); }, message(value) { field().props.onChange({ target: { value } }); },
    prepareReview() { this.openReview(); this.click("Open text app"); },
    confirm(value, effect) { confirmResult = value; confirmEffect = effect; }, composerFails(value) { composerError = value; }, beforeUpdate(fn) { beforeUpdate = fn; },
    account(patch) { identity = { ...identity, ...patch }; render(); }, signedOut() { identity = null; render(); }, mode(value) { mode = value; render(); }, identityLoading() { identityReady = false; render(); },
    route(value) { customerId = value; render(); }, tick() { clock += 60_000; },
  };
}

test("customer completion requires an explicit reviewed job and does not infer the first of several jobs", () => {
  const h = harness(); h.data.jobs.push(job({ id: "job-2", title: "Annex", siteAddress: "Rear lane" }));
  assert.equal(h.dock().props.activeJob, undefined); assert.equal(h.dock().props.canComplete, true);
  h.openCompletion(); assert.equal(h.select("Job to complete").props.value, ""); assert.equal(h.button("Mark selected job complete").props.disabled, true);
  h.click("Mark selected job complete"); assert.equal(h.identities(), 0); assert.equal(h.writes.length, 0);
  h.choose("job-2"); h.confirm(false); h.click("Mark selected job complete"); assert.equal(h.writes.length, 0); assert.match(h.confirmations[0], /Annex at Rear lane/);
  h.confirm(true); const repeat = h.button("Mark selected job complete").props.onClick; repeat(); repeat();
  assert.equal(h.data.jobs[0].status, "Testing"); assert.equal(h.data.jobs[1].status, "Complete"); assert.equal(h.data.timeline.length, 1); assert.equal(h.data.timeline[0].jobId, "job-2");
  assert.match(text(h.render()), /completion saved on this device.*Check sync/);
});

test("completion candidates exclude inactive unknown duplicate blank and other-customer jobs", () => {
  const h = harness();
  const active = [...jobCore.canonicalJobStatuses.filter(status => !["Complete", "Invoiced", "Paid", "Cancelled", "On hold"].includes(status)), "Lead", "In progress"];
  h.data.jobs = [...jobCore.canonicalJobStatuses, "Lead", "In progress", "Unknown", "", " Testing "].map((status, i) => job({ id: `j-${i}`, status }));
  h.data.jobs.push(job({ id: " " }), job({ id: "duplicate" }), job({ id: "duplicate", customerId: "other" }), job({ id: "other", customerId: "other" }));
  h.openCompletion(); const options = nodes(h.select("Job to complete")).filter(n => n.type === "option" && n.props.value);
  assert.equal(options.length, active.length); for (const option of options) assert.ok(active.includes(h.data.jobs.find(j => j.id === option.props.value).status));
  for (const id of [" ", "duplicate", "other", "missing"]) { const bad = harness(); bad.data.jobs = h.data.jobs; bad.openCompletion(); bad.choose(id); assert.equal(bad.writes.length, 0); assert.equal(bad.select("Job to complete"), undefined); }
  const closed = harness(); closed.data.jobs = [job({ status: "Paid" })]; assert.equal(closed.dock().props.canComplete, false); assert.equal(closed.dock().props.activeJob, undefined);
});

test("failed completion retains the selection and preserves newer unrelated job details on retry", () => {
  const h = harness(); h.openCompletion(); h.choose(); h.failures.add("jobs:update"); h.click("Mark selected job complete");
  assert.equal(h.data.jobs[0].status, "Testing"); assert.equal(h.data.timeline.length, 0); assert.equal(h.select("Job to complete").props.value, "job-1"); assert.match(text(h.render()), /selection is retained/);
  h.data.jobs = [{ ...h.data.jobs[0], notes: "Newer notes", assignedTo: "Engineer 2" }]; h.failures.clear(); h.click("Mark selected job complete");
  assert.equal(h.data.jobs[0].notes, "Newer notes"); assert.equal(h.data.jobs[0].assignedTo, "Engineer 2"); assert.equal(h.data.timeline[0].fromStatus, "Testing"); assert.equal(h.data.timeline[0].toStatus, "Complete");
});

test("completion rejects changed identity details linkage and stage including changes during confirmation or just before storage", () => {
  const patches = [{ createdAt: "replacement" }, { title: "Other job" }, { siteAddress: "Other site" }, { status: "Paid" }, { status: "First fix" }, { customerId: "other" }];
  for (const patch of patches) for (const boundary of ["render", "confirm", "storage"]) {
    const h = harness(); h.openCompletion(); h.choose(); const save = h.button("Mark selected job complete").props.onClick;
    const change = () => { h.data.jobs = [{ ...h.data.jobs[0], ...patch }]; };
    if (boundary === "render") { change(); h.render(); } else if (boundary === "confirm") h.confirm(true, () => { change(); h.render(); }); else h.beforeUpdate(change);
    save(); assert.equal(h.writes.length, 0, `${boundary}: ${JSON.stringify(patch)}`); assert.ok(h.select("Job to complete"));
  }
  for (const jobs of [[], [job(), job()]]) { const h = harness(); h.openCompletion(); h.choose(); const save = h.button("Mark selected job complete").props.onClick; h.data.jobs = jobs; h.render(); save(); assert.equal(h.writes.length, 0); }
  const reselect = harness(); reselect.openCompletion(); reselect.choose(); reselect.data.jobs = [job({ status: "Snagging" })]; reselect.click("Mark selected job complete"); reselect.choose(); reselect.click("Mark selected job complete"); assert.equal(reselect.data.timeline[0].fromStatus, "Snagging");
});

test("completion checks fresh Failed and Conflict queue state but allows pending and offline durable writes", () => {
  for (const state of ["Failed", "Conflict", "Pending", "Offline"]) {
    const h = harness(); h.openCompletion(); h.choose(); const save = h.button("Mark selected job complete").props.onClick;
    h.queue.push({ table: "jobs", sourceId: "job-1", state }); save();
    assert.equal(h.writes.length, ["Failed", "Conflict"].includes(state) ? 0 : 2);
  }
  const h = harness(); h.openCompletion(); h.choose(); h.confirm(true, () => h.queue.push({ table: "jobs", sourceId: "job-1", state: "Conflict" })); h.click("Mark selected job complete"); assert.equal(h.writes.length, 0);
});

test("failed completion notes retry the original evidence without repeating the job update or regressing its later stage", () => {
  const h = harness(); h.failures.add("timeline:create"); h.openCompletion(); h.choose(); h.click("Mark selected job complete");
  assert.equal(h.data.jobs[0].status, "Complete"); assert.equal(h.data.timeline.length, 0); assert.match(text(h.render()), /timeline note needs retrying/);
  const first = h.attempts.find(a => a.collection === "timeline").item;
  h.data.jobs = [{ ...h.data.jobs[0], status: "Invoiced" }]; h.tick(); h.failures.clear(); const repeat = h.button("Retry completion note").props.onClick; repeat(); repeat();
  assert.equal(h.data.jobs[0].status, "Invoiced"); assert.equal(h.writes.filter(w => w.collection === "jobs").length, 1); assert.equal(h.data.timeline.length, 1); assert.equal(h.data.timeline[0], first);
  assert.equal(h.button("Retry completion note"), undefined);
});

test("completion note retries reject different evidence, duplicate identity and replaced linked jobs", () => {
  for (const change of [
    h => { h.data.timeline = [{ ...h.attempts.at(-1).item, note: "Different evidence" }]; },
    h => { h.data.timeline = [h.attempts.at(-1).item, h.attempts.at(-1).item]; },
    h => { h.data.jobs = [job({ createdAt: "replacement", status: "Complete" })]; },
    h => { h.data.jobs = [job({ customerId: "other", status: "Complete" })]; },
  ]) {
    const h = harness(); h.failures.add("timeline:create"); h.openCompletion(); h.choose(); h.click("Mark selected job complete"); change(h); h.failures.clear(); h.click("Retry completion note"); assert.equal(h.writes.length, 1); assert.ok(h.button("Retry completion note"));
  }
  const h = harness(); h.failures.add("timeline:create"); h.openCompletion(); h.choose(); h.click("Mark selected job complete"); h.data.timeline = [{ ...h.attempts.at(-1).item }]; h.failures.clear(); h.click("Retry completion note"); assert.equal(h.writes.length, 1); assert.equal(h.button("Retry completion note"), undefined);
});

test("review preparation and composer opening are editable zero-write actions with encoded recipients and message content", () => {
  const h = harness(); h.data.customers = [customer({ phone: "+44 7700 900123", email: "customer+work@example.test" })]; h.openReview();
  assert.equal(h.button("Record request as sent").props.disabled, true); h.click("Record request as sent"); assert.equal(h.identities(), 0);
  const message = "Hi & thank you!\nReview: https://example.test/review?a=1&b=2";
  h.message(message); h.click("Open text app"); assert.equal(h.composers[0], `sms:+447700900123?body=${encodeURIComponent(message)}`); assert.equal(h.writes.length, 0); assert.equal(h.identities(), 0);
  h.channel("Email"); assert.equal(h.button("Record request as sent").props.disabled, true); h.click("Open email app");
  assert.equal(h.composers[1], `mailto:customer%2Bwork@example.test?subject=${encodeURIComponent("JR Electrical Services review request")}&body=${encodeURIComponent(message)}`);
  assert.equal(h.writes.length, 0); h.click("Close review draft"); assert.equal(h.field(), undefined); assert.match(text(h.render()), /No new request was recorded/);
});

test("review composer validation and launch failures retain drafts without recording a sent request", () => {
  for (const patch of [{ phone: "07700 900123?body=Injected", email: "unsupported" }, { phone: "", email: "customer@example.test?bcc=other@example.test" }]) {
    const h = harness(); h.data.customers = [customer(patch)]; h.openReview(); assert.equal(h.field(), undefined); assert.equal(h.identities(), 0); assert.equal(h.composers.length, 0);
  }
  const h = harness(); h.openReview(); h.message(" "); h.click("Open text app"); assert.equal(h.composers.length, 0); h.message("Keep my message"); h.composerFails("App unavailable"); h.click("Open text app");
  assert.equal(h.field().props.value, "Keep my message"); assert.equal(h.button("Record request as sent").props.disabled, true); assert.equal(h.writes.length, 0); assert.match(text(h.render()), /has not been recorded as sent.*App unavailable/);
  h.composerFails(); h.click("Open text app"); assert.equal(h.composers.length, 1); assert.equal(h.writes.length, 0);
  const email = harness(); email.data.customers = [customer({ phone: "" })]; email.openReview(); assert.equal(email.select("Send using").props.value, "Email"); email.click("Open email app"); assert.match(email.composers[0], /^mailto:/);
});

test("review edits invalidate older callbacks and changing contact details requires a fresh draft", () => {
  const h = harness(); h.openReview(); const staleOpen = h.button("Open text app").props.onClick, staleClose = h.button("Close review draft").props.onClick;
  h.message("New message"); staleOpen(); staleClose(); assert.equal(h.composers.length, 0); assert.equal(h.field().props.value, "New message");
  h.click("Open text app"); const staleRecord = h.button("Record request as sent").props.onClick; h.message("Newer message"); staleRecord(); assert.equal(h.writes.length, 0); assert.equal(h.button("Record request as sent").props.disabled, true);
  for (const patch of [{ name: "Other name" }, { phone: "07700 900456" }, { email: "new@example.test" }, { createdAt: "replacement" }]) {
    const h = harness(); h.openReview(); const open = h.button("Open text app").props.onClick; h.data.customers = [customer(patch)]; h.render(); open(); assert.equal(h.composers.length, 0); assert.equal(h.writes.length, 0); assert.ok(h.field());
  }
});

test("only explicit sent confirmation writes an honest timeline and requested profile, once", () => {
  const h = harness(); h.prepareReview(); assert.equal(h.writes.length, 0); const repeat = h.button("Record request as sent").props.onClick; repeat(); repeat();
  assert.equal(h.data.interactions.length, 1); assert.equal(h.data.profiles.length, 1); assert.match(h.data.interactions[0].summary, /confirmed by user/); assert.match(h.data.interactions[0].outcome, /07700 900123.*Delivery has not been verified/);
  assert.equal(h.data.profiles[0].reviewStatus, "Requested"); assert.equal(h.data.profiles[0].reviewRequestedAt, h.data.interactions[0].interactionAt); assert.equal(h.composers.length, 1); assert.equal(h.field(), undefined); assert.match(text(h.render()), /confirmation.*saved on this device/);
});

test("failed review timeline saves freeze the sent evidence and retry one identity and confirmation time", () => {
  const h = harness(); h.prepareReview(); h.failures.add("interactions:create"); h.click("Record request as sent");
  const first = h.attempts[0].item; assert.equal(h.data.profiles.length, 0); assert.equal(h.field().props.disabled, true); assert.equal(h.button("Open text app"), undefined);
  h.message("Cannot rewrite what was confirmed"); h.tick(); h.failures.clear(); const repeat = h.button("Retry request record").props.onClick; repeat(); repeat();
  assert.equal(h.data.interactions[0], first); assert.equal(h.data.profiles[0].reviewRequestedAt, first.interactionAt); assert.equal(h.writes.length, 2); assert.equal(h.composers.length, 1);
});

test("partial review profile creation retries only its unsaved tail with a stable identity", () => {
  const h = harness(); h.prepareReview(); h.failures.add("profiles:create"); h.click("Record request as sent");
  const first = h.attempts.find(a => a.collection === "profiles").item; assert.equal(h.data.interactions.length, 1); assert.equal(h.data.profiles.length, 0); assert.match(text(h.render()), /saved in the timeline.*status needs retrying/);
  h.tick(); h.click("Retry request record"); h.failures.clear(); h.click("Retry request record");
  assert.equal(h.data.interactions.length, 1); assert.equal(h.data.profiles[0].id, first.id); assert.equal(h.data.profiles[0].createdAt, first.createdAt); assert.equal(h.data.profiles[0].reviewRequestedAt, first.reviewRequestedAt); assert.equal(h.composers.length, 1);
  assert.equal(h.writes.filter(w => w.collection === "interactions").length, 1);
});

test("review status retry preserves current profile metadata, received reviews and newer request dates", () => {
  for (const status of ["Not requested", "Received", "Requested"]) {
    const h = harness(); h.data.profiles = [profile()]; h.prepareReview(); h.failures.add("profiles:update"); h.click("Record request as sent");
    h.data.profiles = [profile({ reviewStatus: status, reviewRequestedAt: "2026-10-12T10:00:00Z", tags: ["Newer tag"], followUpReason: "Newer reason", portalNote: "Newer portal note" })]; h.failures.clear(); h.click("Retry request record");
    const saved = h.data.profiles[0]; assert.equal(saved.followUpReason, "Newer reason"); assert.equal(saved.tags[0], "Newer tag"); assert.equal(saved.portalNote, "Newer portal note");
    assert.equal(saved.reviewStatus, status === "Not requested" ? "Requested" : status);
    assert.equal(saved.reviewRequestedAt, status === "Not requested" ? h.data.interactions[0].interactionAt : "2026-10-12T10:00:00Z"); assert.equal(h.data.interactions.length, 1);
  }
});

test("review updates inspect the current stored profile even before it is rendered", () => {
  for (const patch of [{ reviewStatus: "Received" }, { reviewStatus: "Requested", reviewRequestedAt: "2026-10-12T10:00:00Z" }, { followUpReason: "Newest reason" }]) {
    const h = harness(); h.data.profiles = [profile()]; h.prepareReview(); h.beforeUpdate(() => { h.data.profiles = [profile(patch)]; }); h.click("Record request as sent");
    for (const [key, value] of Object.entries(patch)) assert.equal(h.data.profiles[0][key], value);
    assert.equal(h.field(), undefined);
  }
  for (const patch of [{ createdAt: "replacement" }, { customerId: "other" }, { reviewStatus: "Unknown" }, { reviewStatus: "Requested", reviewRequestedAt: "invalid" }]) {
    const h = harness(); h.data.profiles = [profile()]; h.prepareReview(); h.beforeUpdate(() => { h.data.profiles = [profile(patch)]; }); h.click("Record request as sent"); assert.equal(h.writes.length, 1); assert.ok(h.button("Retry request record"));
  }
});

test("ambiguous profile identities and unsupported review statuses block logging before any write", () => {
  for (const profiles of [[profile(), profile({ id: "profile-2" })], [profile(), profile({ customerId: "other" })], [profile({ id: " " })], [profile({ reviewStatus: "Unknown" })]]) {
    const h = harness(); h.data.profiles = profiles; h.prepareReview(); h.click("Record request as sent"); assert.equal(h.writes.length, 0); assert.equal(h.identities(), 0);
  }
});

test("partial request retries reject replaced profiles and missing or different timeline evidence", () => {
  for (const change of [
    h => { h.data.profiles = [profile({ createdAt: "replacement" })]; },
    h => { h.data.profiles = [profile({ id: "replacement" })]; },
    h => { h.data.profiles = []; },
    h => { h.data.interactions = []; },
    h => { h.data.interactions = [{ ...h.data.interactions[0], outcome: "Different evidence" }]; },
    h => { h.data.interactions = [h.data.interactions[0], h.data.interactions[0]]; },
  ]) {
    const h = harness(); h.data.profiles = [profile()]; h.prepareReview(); h.failures.add("profiles:update"); h.click("Record request as sent"); change(h); h.failures.clear(); h.click("Retry request record"); assert.equal(h.writes.length, 1); assert.ok(h.button("Retry request record"));
  }
});

test("review retries accept matching saved evidence but reject collisions and retain the original sent recipient", () => {
  for (const collision of [false, true]) {
    const h = harness(); h.prepareReview(); h.failures.add("interactions:create"); h.click("Record request as sent"); const attempted = h.attempts[0].item;
    h.data.interactions = [{ ...attempted, ...(collision ? { customerId: "other" } : {}) }]; h.failures.clear(); h.click("Retry request record");
    assert.equal(h.writes.length, collision ? 0 : 1); assert.equal(h.data.interactions.length, 1);
  }
  const h = harness(); h.prepareReview(); h.data.customers = [customer({ phone: "07700 900456" })]; h.click("Record request as sent");
  assert.match(h.data.interactions[0].outcome, /07700 900123/); assert.doesNotMatch(h.data.interactions[0].outcome, /07700 900456/);
  const close = harness(); close.prepareReview(); close.failures.add("profiles:create"); close.click("Record request as sent"); close.click("Keep saved timeline record"); assert.equal(close.data.interactions.length, 1); assert.equal(close.data.profiles.length, 0); assert.equal(close.field(), undefined);
});

test("review status waits for fresh failed or conflicting profile or interaction sync without sending again", () => {
  for (const collectionKey of ["jr-os-customer-profiles", "jr-os-customer-interactions"]) for (const state of ["Failed", "Conflict"]) {
    const h = harness(); h.data.profiles = [profile()]; h.prepareReview(); h.queue.push({ table: "cloud_collections", collectionKey, sourceId: collectionKey.endsWith("profiles") ? "profile-1" : "interaction_1", state }); h.click("Record request as sent");
    assert.equal(h.data.interactions.length, 1); assert.equal(h.data.profiles[0].reviewStatus, "Not requested"); assert.ok(h.button("Retry request record"));
    h.queue.length = 0; h.click("Retry request record"); assert.equal(h.data.profiles[0].reviewStatus, "Requested"); assert.equal(h.composers.length, 1);
  }
});

test("account role route readiness and unmount guards invalidate pending completion composer and sent-record callbacks", () => {
  const changes = [h => h.account({ role: "electrician" }), h => h.account({ role: "customer" }), h => h.account({ role: "unknown" }), h => h.account({ organisationId: "org-2" }), h => h.account({ userId: "user-2" }), h => h.account({ customerSourceId: "different" }), h => h.signedOut(), h => h.mode("local"), h => h.identityLoading(), h => h.route("customer-2"), h => h.unmount(), h => { h.ready.jobs = false; h.render(); }, h => { h.data.customers = [customer({ createdAt: "replacement" })]; h.render(); }, h => { h.data.customers = []; h.render(); }, h => { h.data.customers.push(customer()); h.render(); }, h => { h.account({ organisationId: "org-2" }); h.account({ organisationId: "org-1" }); }];
  for (const change of changes) for (const action of ["completion", "composer", "record"]) {
    const h = harness(); let callback;
    if (action === "completion") { h.openCompletion(); h.choose(); callback = h.button("Mark selected job complete").props.onClick; }
    else { h.openReview(); if (action === "record") h.click("Open text app"); callback = h.button(action === "record" ? "Record request as sent" : "Open text app").props.onClick; }
    const beforeComposers = h.composers.length; change(h); callback(); assert.equal(h.writes.length, 0, action); assert.equal(h.composers.length, beforeComposers); assert.equal(h.identities(), 0);
  }
});

test("loading retains drafts and retries while a new account can start clean actions without reviving old drafts", () => {
  const h = harness(); h.openReview(); h.message("Original draft"); h.ready.interactions = false; assert.equal(h.render(), null); h.ready.interactions = true; assert.equal(h.field().props.value, "Original draft");
  h.account({ organisationId: "org-2" }); assert.equal(h.field(), undefined); h.openCompletion(); h.choose(); h.click("Close completion"); h.openReview(); h.message("Account two"); h.account({ organisationId: "org-1" }); assert.equal(h.field(), undefined); h.openReview(); assert.notEqual(h.field().props.value, "Original draft");
  const pending = harness(); pending.failures.add("timeline:create"); pending.openCompletion(); pending.choose(); pending.click("Mark selected job complete"); pending.ready.timeline = false; assert.equal(pending.render(), null); pending.ready.timeline = true; pending.failures.clear(); pending.click("Retry completion note"); assert.equal(pending.data.timeline.length, 1);
});

test("only office-authorised or local users can run customer profile mutations", () => {
  for (const role of ["owner", "admin", "office"]) { const h = harness(); h.account({ role }); h.openCompletion(); h.choose(); h.click("Mark selected job complete"); assert.equal(h.writes.length, 2); h.prepareReview(); h.click("Record request as sent"); assert.equal(h.writes.length, 4); }
  for (const role of ["electrician", "customer", "unknown"]) { const h = harness(); h.account({ role }); assert.equal(h.dock().props.canComplete, false); assert.equal(h.dock().props.canRequestReview, false); h.openCompletion(); h.openReview(); assert.equal(h.select("Job to complete"), undefined); assert.equal(h.field(), undefined); assert.equal(h.writes.length, 0); }
  const local = harness(); local.mode("local"); local.signedOut(); local.openCompletion(); local.choose(); local.click("Mark selected job complete"); local.prepareReview(); local.click("Record request as sent"); assert.equal(local.writes.length, 4);
  for (const data of [[], [customer(), customer()], [customer({ id: " " })]]) { const h = harness(); h.data.customers = data; assert.equal(h.render(), null); }
});

test("one open action cannot be replaced and callbacks from closed drafts cannot save later actions", () => {
  const h = harness(); h.openCompletion(); h.choose(); const oldComplete = h.button("Mark selected job complete").props.onClick; h.openReview(); assert.equal(h.field(), undefined); assert.equal(h.select("Job to complete").props.value, "job-1"); h.click("Close completion"); h.prepareReview(); oldComplete(); assert.equal(h.writes.length, 0);
  const oldRecord = h.button("Record request as sent").props.onClick; h.openCompletion(); assert.equal(h.select("Job to complete"), undefined); h.click("Close review draft"); h.openReview(); oldRecord(); assert.equal(h.writes.length, 0); assert.equal(h.button("Record request as sent").props.disabled, true);
});
