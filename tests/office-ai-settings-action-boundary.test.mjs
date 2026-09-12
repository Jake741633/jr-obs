import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const learningPage = readFileSync(new URL("../app/ai/learning/page.tsx", import.meta.url), "utf8");

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

test("office AI learning does not advertise the denied settings route", () => {
  const { canAccessPath } = loadPermissions();

  assert.equal(canAccessPath("office", "/ai/learning"), true);
  assert.equal(canAccessPath("office", "/settings"), false);
  assert.equal(canAccessPath("owner", "/settings"), true);
  assert.equal(canAccessPath("admin", "/settings"), true);
});

test("AI settings follows identity permissions while learning memory remains visible", () => {
  assert.match(learningPage, /const \{ identity, mode \} = useCloudIdentity\(\)/);
  assert.match(learningPage, /const unrestricted = mode === "local" \|\| \(mode === "migration" && !identity\)/);
  assert.match(learningPage, /const canOpenSettings = unrestricted \|\| canAccessPath\(identity\?\.role, "\/settings", identity\?\.email\)/);
  assert.match(learningPage, /\{canOpenSettings \? <Link href="\/settings"[^>]*>AI settings/);
  assert.equal((learningPage.match(/href="\/settings"/g) ?? []).length, 1);
  for (const copy of ["AI Memory is current", "Learning active", "Completed jobs", "Accepted quotes", "Paid invoices", "Material signals", "Customer histories", "Builder histories"]) {
    assert.match(learningPage, new RegExp(copy));
  }
});
