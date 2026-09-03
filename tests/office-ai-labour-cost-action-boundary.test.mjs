import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const pricingPage = readFileSync(new URL("../app/ai/pricing/page.tsx", import.meta.url), "utf8");

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

test("office AI pricing does not advertise the denied labour-cost route", () => {
  const { canAccessPath } = loadPermissions();

  assert.equal(canAccessPath("office", "/ai/pricing"), true);
  assert.equal(canAccessPath("office", "/labour-costs"), false);
  assert.equal(canAccessPath("owner", "/labour-costs"), true);
  assert.equal(canAccessPath("admin", "/labour-costs"), true);
});

test("labour-cost editing follows identity permissions while pricing remains usable", () => {
  assert.match(pricingPage, /const \{ identity, mode \} = useCloudIdentity\(\)/);
  assert.match(pricingPage, /const unrestricted = mode === "local" \|\| \(mode === "migration" && !identity\)/);
  assert.match(pricingPage, /const canOpenLabourCosts = unrestricted \|\| canAccessPath\(identity\?\.role, "\/labour-costs", identity\?\.email\)/);
  assert.match(pricingPage, /\{canOpenLabourCosts \? <Link href="\/labour-costs"[^>]*>Edit Labour & Costs/);
  assert.equal((pricingPage.match(/href="\/labour-costs"/g) ?? []).length, 1);
  for (const copy of ["AI Pricing Assistant", "Pricing context", "Draft quote (optional)", "Job type", "Scope and risk notes", "Recommend pricing", "No pricing recommendation yet"]) {
    assert.match(pricingPage, new RegExp(copy.replace(/[&()]/g, "\\$&")));
  }
});
