import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import * as pageIdentity from "../lib/cloud/cloudPageIdentity-core.mjs";

const output = ts.transpileModule(readFileSync(new URL("../app/cloud/page.tsx", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

function elements(node) {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node || typeof node !== "object") return [];
  return [node, ...elements(node.props?.children)];
}

function textContent(node) {
  if (Array.isArray(node)) return node.map(textContent).join("");
  if (typeof node === "string" || typeof node === "number") return String(node);
  return node && typeof node === "object" ? textContent(node.props?.children) : "";
}

function accountHarness({ signInResult = async () => undefined, getCurrentUser = async () => null, runEffects = false, initialSession = null } = {}) {
  const states = [], effects = [], listeners = new Map();
  let cursor = 0;
  let session = initialSession, identity = null, identityReady = true, accountReads = 0;
  const requests = [];
  function hasChanged(previous, deps) {
    return !previous || !deps || deps.some((value, index) => !Object.is(value, previous.deps[index]));
  }
  function memo(calculate, deps) {
    const index = cursor++;
    if (hasChanged(states[index], deps)) states[index] = { deps, value: calculate() };
    return states[index].value;
  }
  function notify(type, event) {
    for (const listener of listeners.get(type) ?? []) listener(event);
  }
  const jsx = (type, props) => ({ type, props });
  const dependencies = {
    react: {
      useState(initial) {
        const index = cursor++;
        if (!(index in states)) states[index] = typeof initial === "function" ? initial() : initial;
        return [states[index], (value) => { states[index] = typeof value === "function" ? value(states[index]) : value; }];
      },
      useRef(initial) {
        const index = cursor++;
        if (!(index in states)) states[index] = { current: initial };
        return states[index];
      },
      useMemo: memo,
      useCallback: (callback, deps) => memo(() => callback, deps),
      useEffect(effect, deps) {
        const index = cursor++;
        const previous = states[index];
        if (!runEffects || !hasChanged(previous, deps)) return;
        const next = { deps, cleanup: previous?.cleanup };
        states[index] = next;
        effects.push(() => { next.cleanup?.(); next.cleanup = effect(); });
      },
    },
    "react/jsx-runtime": { jsx, jsxs: jsx },
    "next/link": { default: "Link" },
    "lucide-react": {},
    "../../components/ui/Button": { Button: "Button" },
    "../../components/ui/Card": { Card: "Card" },
    "../../components/mobile/InstallAppGuide": { InstallAppGuide: "InstallAppGuide" },
    "../../lib/cloud/cloudPageIdentity-core.mjs": pageIdentity,
    "../../lib/cloud/config": { effectiveCloudMode: () => "cloud" },
    "../../lib/cloud/repository": {
      activeSyncAuthorizationMatches: () => Boolean(identity),
      syncStatus: { get: () => "Synced" },
    },
    "../../lib/cloud/useCloudIdentity": { useCloudIdentity: () => ({ identity, isReady: identityReady }) },
    "../../lib/supabase/client": { isSupabaseConfigured: () => true, readSupabaseSession: () => session },
    "../../lib/cloudSync": {
      canManageCloudMigration: () => true,
      completeEmailVerificationFromUrl: async () => null,
      getCurrentCloudUser: () => { accountReads += 1; return getCurrentUser(); },
      readLastCloudSync: () => null,
      signInWithEmail: async (email, password) => { requests.push({ action: "sign-in", email, password }); return signInResult(); },
      signUpWithEmail: async (email, password) => { requests.push({ action: "create-account", email, password }); },
    },
  };
  const commonJsModule = { exports: {} };
  vm.runInNewContext(output, {
    Error,
    module: commonJsModule,
    exports: commonJsModule.exports,
    window: {
      addEventListener(type, listener) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(listener); },
      removeEventListener(type, listener) { listeners.get(type)?.delete(listener); },
    },
    require(name) {
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected module: ${name}`);
      return dependencies[name];
    },
  });
  function render() {
    cursor = 0;
    const view = commonJsModule.exports.default();
    for (const effect of effects.splice(0)) effect();
    return view;
  }
  function input(type) {
    return elements(render()).find((element) => element.type === "input" && element.props.type === type);
  }
  function fill(email, password) {
    input("email").props.onChange({ target: { value: email } });
    input("password").props.onChange({ target: { value: password } });
  }
  return {
    render, requests, fill, input,
    publishIdentity(next, ready = true) { identity = next; identityReady = ready; render(); },
    replaceSession(next) { session = next; notify("storage", { key: "jr-os-supabase-session" }); },
    accountReads: () => accountReads,
    async settle() { await new Promise(resolve => setImmediate(resolve)); return render(); },
    password: () => elements(render()).find((element) => element.props?.id === "account-password"),
    togglePassword: () => elements(render()).find((element) => element.props?.["aria-controls"] === "account-password").props.onClick(),
    signIn: () => elements(render()).find((element) => element.type === "form").props.onSubmit({ preventDefault() {} }),
    createAccount: () => elements(render()).find((element) => element.type === "Button" && textContent(element) === "Create account").props.onClick(),
  };
}

test("sign-in submits existing short passwords unchanged to Supabase", async () => {
  for (const password of ["abcdef", "1234567", " a b c "]) {
    const account = accountHarness();
    account.fill(" owner@example.com ", password);
    assert.equal(account.input("password").props.minLength, undefined, "the browser must not enforce new-password policy on sign-in");
    await account.signIn();
    assert.deepEqual(account.requests, [{ action: "sign-in", email: "owner@example.com", password }]);
    assert.equal(account.input("password").props.value, "", "submitted secrets still clear");
  }
});

test("showing a password preserves its value and submitting hides it immediately", async () => {
  let finishSignIn;
  const pending = new Promise((resolve) => { finishSignIn = resolve; });
  const account = accountHarness({ signInResult: () => pending });
  account.fill("owner@example.com", " exact password ");
  account.togglePassword();
  assert.equal(account.password().props.type, "text");
  assert.equal(account.password().props.value, " exact password ");
  const submission = account.signIn();
  assert.equal(account.password().props.type, "password");
  assert.equal(account.password().props.value, "");
  assert.equal(elements(account.render()).find((element) => element.type === "form").props["aria-busy"], true);
  assert.ok(textContent(account.render()).includes("Signing in…"));
  finishSignIn();
  await submission;
  assert.equal(elements(account.render()).find((element) => element.type === "form").props["aria-busy"], false);
  assert.deepEqual(account.requests, [{ action: "sign-in", email: "owner@example.com", password: " exact password " }]);
});

test("failed phone sign-in announces the real error and permits another attempt", async () => {
  const account = accountHarness({ signInResult: async () => { throw new Error("Cloud service is unavailable."); } });
  account.fill("owner@example.com", "password");
  await account.signIn();
  const status = elements(account.render()).find((element) => element.props?.role === "status");
  assert.ok(status, "account feedback must have a live status region");
  assert.equal(status.props["aria-live"], "polite");
  assert.equal(textContent(status), "Cloud service is unavailable.");
  const form = elements(account.render()).find((element) => element.type === "form");
  assert.equal(form.props["aria-describedby"], status.props.id);
  assert.equal(form.props["aria-busy"], false);
  assert.equal(account.input("email").props.value, "owner@example.com");
  assert.equal(account.password().props.value, "");
  account.fill("owner@example.com", "second-password");
  await account.signIn();
  assert.equal(account.requests.length, 2);
});

test("sign-in rejects missing credentials without contacting Supabase", async () => {
  for (const [email, password, message] of [
    ["   ", "password", "Enter your email address."],
    ["owner@example.com", "", "Enter your password."],
  ]) {
    const account = accountHarness();
    account.fill(email, password);
    await account.signIn();
    assert.deepEqual(account.requests, []);
    assert.ok(textContent(account.render()).includes(message));
    assert.equal(account.input("password").props.required, true);
  }
});

test("new accounts retain the eight-character password minimum", () => {
  for (const password of ["", "abcdef", "1234567"]) {
    const account = accountHarness();
    account.fill("owner@example.com", password);
    account.createAccount();
    assert.deepEqual(account.requests, []);
    assert.ok(textContent(account.render()).includes(password ? "at least 8 characters" : "Enter your password."));
  }
  const account = accountHarness();
  account.fill("owner@example.com", "long-password");
  account.createAccount();
  assert.deepEqual(account.requests, [{ action: "create-account", email: "owner@example.com", password: "long-password" }]);
});

const cloudAccount = { id: "owner-a", email: "owner@example.com" };
const cloudSession = { access_token: "session-a", user: cloudAccount };
const workspaceIdentity = { userId: cloudAccount.id, organisationId: "business-a", role: "owner", email: cloudAccount.email };

function canOpenWorkspace(view) {
  return elements(view).some(element => element.type === "Link" && element.props.href === "/app");
}

test("the account page resumes the workspace handoff after a transient user lookup failure", async () => {
  let user = null;
  const account = accountHarness({ initialSession: cloudSession, getCurrentUser: async () => user, runEffects: true });
  account.render();
  assert.equal(canOpenWorkspace(await account.settle()), false);
  assert.equal(account.accountReads(), 1);

  user = cloudAccount;
  account.publishIdentity(workspaceIdentity);
  assert.equal(canOpenWorkspace(await account.settle()), true);
  assert.equal(account.accountReads(), 2);
  assert.deepEqual(account.requests, [], "recover the verified session without another password submission");
});

test("a failed recheck waits for another verified identity update and ignores a different user", async () => {
  const account = accountHarness({ initialSession: cloudSession, runEffects: true });
  account.render();
  await account.settle();

  account.publishIdentity({ ...workspaceIdentity, userId: "owner-b" });
  await account.settle();
  assert.equal(account.accountReads(), 1);

  account.publishIdentity(workspaceIdentity, false);
  await account.settle();
  assert.equal(account.accountReads(), 1);

  account.publishIdentity(workspaceIdentity);
  assert.equal(canOpenWorkspace(await account.settle()), false);
  account.render();
  await account.settle();
  assert.equal(account.accountReads(), 2, "rendering must not loop a failed request");

  account.publishIdentity({ ...workspaceIdentity });
  await account.settle();
  assert.equal(account.accountReads(), 3);
});

test("a pending account lookup cannot reopen the workspace after sign-out", async () => {
  let getUser = async () => null;
  const account = accountHarness({ initialSession: cloudSession, getCurrentUser: () => getUser(), runEffects: true });
  account.render();
  await account.settle();

  let finish;
  getUser = () => new Promise(resolve => { finish = resolve; });
  account.publishIdentity(workspaceIdentity);
  assert.equal(typeof finish, "function");
  getUser = async () => null;
  account.replaceSession(null);
  finish(cloudAccount);

  const view = await account.settle();
  assert.equal(canOpenWorkspace(view), false);
  assert.ok(textContent(view).includes("Sign in to JR OS"));
  assert.ok(!textContent(view).includes(cloudAccount.email));
});
