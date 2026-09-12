import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import manifest from "../app/manifest.ts";
import * as permissions from "../lib/cloud/permissions.ts";

function loadComponent(path, dependencies) {
  const output = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const commonJsModule = { exports: {} };
  const jsx = (type, props) => ({ type, props });
  vm.runInNewContext(output, {
    module: commonJsModule,
    exports: commonJsModule.exports,
    require(name) {
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected module: ${name}`);
      return dependencies[name];
    },
  });
  return commonJsModule.exports;
}

test("the app has a stable standalone manifest and real installable PNG icons", () => {
  const app = manifest();
  assert.equal(app.name, "JR OS");
  assert.equal(app.short_name, "JR OS");
  assert.equal(app.id, "/");
  assert.equal(app.display, "standalone");
  assert.equal(app.scope, "/");
  assert.equal(app.start_url, "/app");
  assert.notEqual(app.prefer_related_applications, true);
  for (const size of [192, 512]) {
    const icon = app.icons.find((candidate) => candidate.sizes === `${size}x${size}`);
    assert.ok(icon, `${size}px installation icon is required`);
    assert.equal(icon.type, "image/png");
    const png = readFileSync(new URL(`../public${icon.src}`, import.meta.url));
    assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
    assert.equal(png.readUInt32BE(16), size);
    assert.equal(png.readUInt32BE(20), size);
  }
  assert.ok(app.icons.some((icon) => icon.purpose?.split(" ").includes("maskable")));
  const appleIcon = readFileSync(new URL("../public/icons/jr-os-180.png", import.meta.url));
  assert.equal(appleIcon.readUInt32BE(16), 180);
  assert.equal(appleIcon.readUInt32BE(20), 180);
});

function launch(snapshot) {
  const redirects = [];
  const effects = [];
  const { default: Page } = loadComponent("../app/app/page.tsx", {
    react: { useEffect: (effect) => effects.push(effect) },
    "next/navigation": { useRouter: () => ({ replace: (path) => redirects.push(path) }) },
    "../../lib/cloud/permissions": permissions,
    "../../lib/cloud/useCloudIdentity": { useCloudIdentity: () => snapshot },
  });
  const view = Page();
  effects.forEach((effect) => effect());
  return { redirects, view };
}

test("home-screen launch waits for identity before choosing a workspace", () => {
  for (const mode of ["cloud", "migration", "local"]) {
    const result = launch({ identity: null, isReady: false, mode });
    assert.deepEqual(result.redirects, []);
    assert.equal(result.view.props.role, "status");
  }
});

test("home-screen launch sends each role to its permitted workspace", () => {
  for (const [role, path] of [["owner", "/"], ["admin", "/"], ["office", "/"], ["electrician", "/field"], ["customer", "/customer-portal"]]) {
    assert.deepEqual(launch({ identity: { role }, isReady: true, mode: "cloud" }).redirects, [path]);
    assert.equal(permissions.canAccessPath(role, path), true);
  }
});

test("signed-out launches respect the configured cloud and local modes", () => {
  assert.deepEqual(launch({ identity: null, isReady: true, mode: "cloud" }).redirects, ["/cloud"]);
  for (const mode of ["local", "migration"]) {
    assert.deepEqual(launch({ identity: null, isReady: true, mode }).redirects, ["/"]);
  }
});

test("the neutral app launcher does not open a route-prefix authorization bypass", () => {
  let pathname = "/app";
  const { CloudAccessGuard } = loadComponent("../components/CloudAccessGuard.tsx", {
    react: { Fragment: "Fragment" },
    "next/link": { default: "Link" },
    "next/navigation": { usePathname: () => pathname },
    "lucide-react": {},
    "../lib/cloud/permissions": permissions,
    "../lib/cloud/useCloudIdentity": { useCloudIdentity: () => ({ identity: null, isReady: true, mode: "cloud" }) },
  });
  const child = { type: "business-records" };
  assert.equal(CloudAccessGuard({ children: child }), child);
  for (const path of ["/app/jobs", "/application", "/jobs", "/", "/cloud/queue"]) {
    pathname = path;
    assert.notEqual(CloudAccessGuard({ children: child }), child, `${path} still requires account access`);
  }
});
