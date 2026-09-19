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

function accountHarness({ signInResult = async () => undefined } = {}) {
  const states = [];
  let cursor = 0;
  const requests = [];
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
      useMemo: (calculate) => calculate(),
      useCallback: (callback) => callback,
      useEffect() {},
    },
    "react/jsx-runtime": { jsx, jsxs: jsx },
    "next/link": { default: "Link" },
    "lucide-react": {},
    "../../components/ui/Button": { Button: "Button" },
    "../../components/ui/Card": { Card: "Card" },
    "../../components/mobile/InstallAppGuide": { InstallAppGuide: "InstallAppGuide" },
    "../../lib/cloud/cloudPageIdentity-core.mjs": pageIdentity,
    "../../lib/cloud/config": { effectiveCloudMode: () => "cloud" },
    "../../lib/cloud/repository": {},
    "../../lib/cloud/useCloudIdentity": { useCloudIdentity: () => ({ identity: null, isReady: true }) },
    "../../lib/supabase/client": { isSupabaseConfigured: () => true, readSupabaseSession: () => null },
    "../../lib/cloudSync": {
      getCurrentCloudUser: async () => null,
      signInWithEmail: async (email, password) => { requests.push({ action: "sign-in", email, password }); return signInResult(); },
      signUpWithEmail: async (email, password) => { requests.push({ action: "create-account", email, password }); },
    },
  };
  const commonJsModule = { exports: {} };
  vm.runInNewContext(output, {
    Error,
    module: commonJsModule,
    exports: commonJsModule.exports,
    require(name) {
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected module: ${name}`);
      return dependencies[name];
    },
  });
  function render() {
    cursor = 0;
    return commonJsModule.exports.default();
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
