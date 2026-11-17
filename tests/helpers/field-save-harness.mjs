import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { roleProjectionCacheGeneration } from "../../lib/cloud/roleProjectionCache-core.mjs";
import { loadLocalTs } from "./load-local-ts.mjs";

export const diaryKey = "jr-os-site-diaries";
export const timelineKey = "jr-os-job-timeline";
export const queueKey = "jr-os-cloud-sync-queue";
export const jobKey = "jr-os-jobs";
const teamKey = "jr-os-team";
const date = "2026-11-17";
const owner = {
  organisationId: "fixture-organisation", userId: "fixture-user", role: "electrician", email: "engineer@example.test",
};
const member = { id: "engineer-a", name: "Site Engineer", email: owner.email, status: "Active", role: "Electrician" };
export const job = {
  id: "job-a", title: "Workshop", siteAddress: "1 Example Road", status: "First fix", startDate: date,
  assignedTo: [member.id], value: 0, notes: "", createdAt: date, updatedAt: date,
};

export function nodes(view) {
  if (Array.isArray(view)) return view.flatMap(nodes);
  return view && typeof view === "object" ? [view, ...nodes(view.props?.children)] : [];
}

export function content(view) {
  if (Array.isArray(view)) return view.map(content).join("");
  if (view && typeof view === "object") return content(view.props?.children);
  return typeof view === "string" || typeof view === "number" ? String(view) : "";
}

export async function fieldSaveHarness(route, { mode = "cloud", signedIn = mode !== "local" } = {}) {
  const values = new Map(), blocked = new Set(), rejectedWrites = [], listeners = new Map();
  const slots = [], layouts = [], effects = [];
  let cursor = 0, identity = signedIn ? owner : null;
  let sessionUserId = identity?.userId;

  const localStorage = {
    get length() { return values.size; },
    key(index) { return [...values.keys()][index] ?? null; },
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) {
      if (blocked.has(key)) {
        rejectedWrites.push({ key, value });
        throw new Error("Synthetic device storage quota");
      }
      values.set(key, String(value));
    },
    removeItem(key) { values.delete(key); },
  };
  const window = {
    localStorage,
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(listener);
    },
    removeEventListener(type, listener) { listeners.get(type)?.delete(listener); },
    dispatchEvent(event) {
      for (const listener of listeners.get(event.type) ?? []) listener(event);
    },
  };
  function useState(initial) {
    const index = cursor++;
    if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
    return [slots[index], (next) => { slots[index] = typeof next === "function" ? next(slots[index]) : next; }];
  }
  const changed = (previous, deps) => !previous || !deps || deps.some((value, index) => !Object.is(value, previous.deps[index]));
  function memo(calculate, deps) {
    const index = cursor++;
    if (changed(slots[index], deps)) slots[index] = { deps, value: calculate() };
    return slots[index].value;
  }
  function schedule(queue, run, deps) {
    const index = cursor++, previous = slots[index];
    if (!changed(previous, deps)) return;
    const next = { deps, cleanup: previous?.cleanup };
    slots[index] = next;
    queue.push(() => { next.cleanup?.(); next.cleanup = run(); });
  }
  const react = {
    useState, useRef: (value) => useState({ current: value })[0], useMemo: memo,
    useCallback: (run, deps) => memo(() => run, deps),
    useEffect: (run, deps) => schedule(effects, run, deps),
    useLayoutEffect: (run, deps) => schedule(layouts, run, deps),
  };

  const noNetwork = async () => { throw new Error("The field save fixture must never use a live service"); };
  const navigator = { onLine: mode !== "local" };
  const fixtureRows = { [jobKey]: [job], [teamKey]: [member], [diaryKey]: [], [timelineKey]: [] };
  async function readCollection(table, query) {
    const key = table === "field_jobs" ? jobKey
      : table === "field_team_members" ? teamKey
      : new URLSearchParams(query).get("collection_key")?.slice(3);
    return (fixtureRows[key] ?? []).map(payload => ({
      organisation_id: identity?.organisationId, source_id: payload.id, version: 1, payload,
    }));
  }
  const useCloudIdentity = () => ({ identity, isReady: true, mode });
  const jsx = (type, props) => typeof type === "function" ? type(props) : { type, props };
  const auth = { readSupabaseSession: () => sessionUserId ? { user: { id: sessionUserId } } : null, supabaseFetch: noNetwork };
  const overrides = {
    react, "react/jsx-runtime": { jsx, jsxs: jsx }, "next/link": { default: "Link" }, "lucide-react": {},
    "./config": { effectiveCloudMode: () => mode, cloudStorageBucket: "fixture-private" },
    "./client": { cloudSelect: readCollection, cloudSelectFresh: readCollection, cloudPatch: noNetwork, cloudRpc: noNetwork, cloudUpsert: noNetwork },
    "./cloud/useCloudIdentity": { useCloudIdentity }, "./useCloudIdentity": { useCloudIdentity },
    "../supabase/client": auth, "./supabase/client": auth,
    "../ui/Button": { Button: "Button" },
    "../../components/MobileTestingProgress": { MobileTestingProgress: "MobileTestingProgress" },
  };
  for (const prefix of ["../..", "../../.."]) {
    overrides[prefix + "/lib/cloud/useCloudIdentity"] = { useCloudIdentity };
    overrides[prefix + "/lib/supabase/client"] = auth;
    for (const component of ["Button", "Card", "PageHeader", "StatusBadge"]) {
      overrides[prefix + "/components/ui/" + component] = { [component]: component };
    }
    overrides[prefix + "/components/ui/FormField"] = { InputField: "InputField", TextareaField: "TextareaField" };
  }
  const globals = {
    window, navigator, queueMicrotask, AbortController,
    crypto: { randomUUID },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
  };
  const { accountStorageKey } = loadLocalTs(new URL("../../lib/cloud/adapter.ts", import.meta.url), overrides, globals);
  function scoped(key) {
    return identity ? accountStorageKey(key, identity.organisationId, identity.userId, identity.role, identity.customerSourceId) : key;
  }
  const repository = loadLocalTs(new URL("../../lib/cloud/repository.ts", import.meta.url), overrides, globals);
  function seed() {
    repository.setActiveSyncIdentity(identity?.organisationId ?? null, identity?.userId ?? null, identity?.role ?? null, identity?.customerSourceId ?? null);
    for (const [key, rows] of Object.entries(fixtureRows)) {
      localStorage.setItem(scoped(key), JSON.stringify(rows));
      const generation = roleProjectionCacheGeneration({ storageKey: key, role: identity?.role });
      if (generation) localStorage.setItem("jr-os-cloud-projection-generation:" + scoped(key), generation);
    }
  }
  seed();
  const Page = loadLocalTs(new URL("../../app/field/" + route + "page.tsx", import.meta.url), overrides, globals).default;
  function paint() {
    cursor = 0;
    const view = Page();
    layouts.splice(0).forEach(run => run());
    return view;
  }
  function render() {
    const view = paint();
    effects.splice(0).forEach(run => run());
    return view;
  }
  async function settled() {
    render();
    await new Promise(resolve => setImmediate(resolve));
    return render();
  }
  await settled();
  navigator.onLine = false;
  const form = (view = render()) => nodes(view).find(node => node.type === "form");
  function field(label, view = render()) {
    const input = nodes(form(view)).find(node => node.props.label === label);
    assert.ok(input, label);
    return input;
  }
  function button(label, view = render()) {
    return nodes(view).find(node => ["Button", "button"].includes(node.type) && content(node) === label);
  }
  return {
    blocked, rejectedWrites, scoped, render, paint, field, button, settled,
    rows: (key) => JSON.parse(values.get(scoped(key)) ?? "[]"),
    queue: () => JSON.parse(values.get(queueKey) ?? "[]"),
    fill(notes = "First fix upstairs lighting") {
      const select = nodes(form()).find(node => node.type === "select");
      assert.ok(select, "job selection");
      select.props.onChange({ target: { value: job.id } });
      field("Started").props.onChange({ target: { value: "08:30" } });
      field("Work completed").props.onChange({ target: { value: notes } });
    },
    submitHandler() {
      const submit = form()?.props.onSubmit;
      assert.equal(typeof submit, "function", "field save form");
      return () => submit({ preventDefault() {} });
    },
    click(label, view) {
      const control = button(label, view);
      assert.ok(control, label);
      assert.ok(!control.props.disabled, label + " must be enabled");
      control.props.onClick();
    },
    reconcile(key, row) {
      const saved = JSON.parse(values.get(scoped(key)) ?? "[]");
      localStorage.setItem(scoped(key), JSON.stringify([row, ...saved.filter(entry => entry.id !== row.id)]));
      window.dispatchEvent(new globals.CustomEvent("jr-os-cloud-cache-reconciled", {
        detail: { storageKey: scoped(key), sourceId: row.id, payload: row },
      }));
      render();
    },
    retireSession() { sessionUserId = undefined; },
    async switchAccount() {
      identity = { ...owner, userId: "next-user", organisationId: "next-organisation" };
      sessionUserId = identity.userId;
      seed();
      return settled();
    },
  };
}
