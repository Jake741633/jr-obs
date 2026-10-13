import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const assistant = readFileSync(new URL("../components/ai/TodaysAssistant.tsx", import.meta.url), "utf8");
const coach = readFileSync(new URL("../app/ai/business-coach/page.tsx", import.meta.url), "utf8");

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

test("office business summaries do not advertise a destination the role cannot open", () => {
  const { canAccessPath } = loadPermissions();

  assert.equal(canAccessPath("office", "/"), true);
  assert.equal(canAccessPath("office", "/ai"), true);
  assert.equal(canAccessPath("office", "/ai/business-coach"), true);
  assert.equal(canAccessPath("office", "/business"), false);
  assert.equal(canAccessPath("owner", "/business"), true);
  assert.equal(canAccessPath("admin", "/business"), true);
});

test("business actions follow identity permissions while summaries remain visible", () => {
  for (const source of [assistant, coach]) {
    assert.match(source, /const \{ identity, mode \} = useCloudIdentity\(\)/);
    assert.match(source, /const unrestricted = mode === "local" \|\| \(mode === "migration" && !identity\)/);
    assert.match(source, /const canOpenBusiness = unrestricted \|\| canAccessPath\(identity\?\.role, "\/business", identity\?\.email\)/);
    assert.equal((source.match(/href="\/business"/g) ?? []).length, 1);
    assert.match(source, /\{canOpenBusiness \?/);
  }

  assert.match(assistant, /Business health score/);
  assert.match(coach, /Revenue and expected profit/);
  assert.match(coach, /coach\.months\.map/);
});
