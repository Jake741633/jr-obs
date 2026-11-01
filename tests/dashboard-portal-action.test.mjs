import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const dashboard = readFileSync(new URL("../components/PortalActivityDashboard.tsx", import.meta.url), "utf8");

function loadPermissions() {
  const source = readFileSync(new URL("../lib/cloud/permissions.ts", import.meta.url), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const commonJsModule = { exports: {} };
  vm.runInNewContext(output, {
    exports: commonJsModule.exports,
    module: commonJsModule,
    process: { env: {} },
  });
  return commonJsModule.exports;
}

test("office portal metrics do not advertise a destination the role cannot open", () => {
  const { canAccessPath } = loadPermissions();

  assert.equal(canAccessPath("office", "/"), true);
  assert.equal(canAccessPath("owner", "/customer-portal"), true);
  assert.equal(canAccessPath("admin", "/customer-portal"), true);
  assert.equal(canAccessPath("office", "/customer-portal"), false);
  assert.equal(canAccessPath("electrician", "/customer-portal"), false);
  assert.equal(canAccessPath("customer", "/customer-portal"), true);
});

test("portal action follows identity permissions while operational metrics remain visible", () => {
  assert.match(dashboard, /const \{ identity, mode \} = useCloudIdentity\(\)/);
  assert.match(dashboard, /const unrestricted = mode === "local" \|\| \(mode === "migration" && !identity\)/);
  assert.match(dashboard, /const canOpenPortal = unrestricted \|\| canAccessPath\(identity\?\.role, "\/customer-portal", identity\?\.email\)/);
  assert.match(dashboard, /\{canOpenPortal \? <Link href="\/customer-portal"[^>]*>Open portal<\/Link> : null\}/);
  assert.equal((dashboard.match(/href="\/customer-portal"/g) ?? []).length, 1);
  for (const metric of ["Approval history", "Open customer actions", "Appointment changes", "Additional work requests"]) {
    assert.match(dashboard, new RegExp(metric));
  }
});
