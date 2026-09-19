import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import * as permissions from "../lib/cloud/permissions.ts";

function loadComponent(path, dependencies, window = {}) {
  const output = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const commonJsModule = { exports: {} };
  const jsx = (type, props) => ({ type, props });
  vm.runInNewContext(output, {
    module: commonJsModule,
    exports: commonJsModule.exports,
    window,
    require(name) {
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
      if (name === "next/link") return { default: "Link" };
      if (name === "lucide-react") return {};
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected module: ${name}`);
      return dependencies[name];
    },
  });
  return commonJsModule.exports;
}

function navigation(identity, mode = "cloud", pathname = "/cloud") {
  const { MobileNav } = loadComponent("../components/MobileNav.tsx", {
    "next/navigation": { usePathname: () => pathname },
    "../lib/cloud/useCloudIdentity": { useCloudIdentity: () => ({ identity, mode }) },
    "../lib/cloud/permissions": permissions,
  });
  return MobileNav();
}

function links(nav) {
  return Array.from(nav.props.children, (link) => link.props.href);
}

test("signed-out cloud navigation exposes one full-width Account tab", () => {
  const nav = navigation(null);
  assert.deepEqual(links(nav), ["/cloud"]);
  assert.equal(nav.props.children[0].props["aria-current"], "page");
  assert.ok(nav.props.className.split(" ").includes("grid-cols-1"));
});

test("local and migration workspaces retain all five daily tabs before sign-in", () => {
  for (const mode of ["local", "migration"]) {
    const nav = navigation(null, mode, "/");
    assert.deepEqual(links(nav), ["/", "/jobs", "/quotes/mobile", "/customers", "/menu"]);
    assert.ok(nav.props.className.split(" ").includes("grid-cols-5"));
  }
});

test("field and customer navigation keep only their permitted destinations", () => {
  for (const [role, paths] of [
    ["electrician", ["/field", "/field/jobs", "/menu"]],
    ["customer", ["/customer-portal", "/cloud"]],
  ]) {
    const nav = navigation({ role });
    assert.deepEqual(links(nav), paths);
    assert.ok(paths.every((path) => permissions.canAccessPath(role, path)));
    assert.ok(nav.props.className.split(" ").includes(`grid-cols-${paths.length}`));
  }
  const fieldJob = navigation({ role: "electrician" }, "cloud", "/jobs/job-1/workspace");
  assert.deepEqual(Array.from(fieldJob.props.children).filter((link) => link.props["aria-current"] === "page").map((link) => link.props.href), ["/field/jobs"]);
});

function indicatorHarness(snapshot, initialStatus = "Synced") {
  let status = initialStatus;
  const listeners = new Map();
  const cleanup = [];
  const { CloudSyncIndicator } = loadComponent("../components/CloudSyncIndicator.tsx", {
    react: {
      useState: () => [status, (value) => { status = value; }],
      useEffect: (effect) => cleanup.push(effect()),
    },
    "../lib/cloud/useCloudIdentity": { useCloudIdentity: () => snapshot },
    "../lib/cloud/repository": { syncStatus: { get: () => status } },
  }, {
    addEventListener: (name, listener) => listeners.set(name, listener),
    removeEventListener: (name) => listeners.delete(name),
  });
  return {
    render: () => CloudSyncIndicator(),
    update: (value) => listeners.get("jr-os-sync-status")({ detail: value }),
    dispose: () => cleanup.forEach((run) => run()),
    listeners,
  };
}

test("an empty sync queue never tells a signed-out user they are synced", () => {
  for (const mode of ["cloud", "migration"]) {
    const indicator = indicatorHarness({ identity: null, isReady: true, mode });
    assert.equal(indicator.render().props["aria-label"], "Sign in");
    assert.equal(indicator.render().props.href, "/cloud");
  }
  const checking = indicatorHarness({ identity: { role: "owner" }, isReady: false, mode: "cloud" });
  assert.equal(checking.render().props["aria-label"], "Checking…");
  const local = indicatorHarness({ identity: null, isReady: true, mode: "local" });
  assert.equal(local.render(), null);
});

test("authenticated sync failures and conflicts remain visible and subscriptions clean up", () => {
  const indicator = indicatorHarness({ identity: { role: "owner" }, isReady: true, mode: "cloud" });
  assert.equal(indicator.render().props["aria-label"], "Cloud sync: Synced");
  for (const status of ["Failed", "Conflict", "Offline", "Pending", "Synced"]) {
    indicator.update(status);
    assert.equal(indicator.render().props["aria-label"], `Cloud sync: ${status}`);
  }
  indicator.dispose();
  assert.equal(indicator.listeners.size, 0);
});
