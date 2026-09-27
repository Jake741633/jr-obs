import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const attentionPanel = readFileSync(new URL("../components/ai/SiteDiaryAttentionPanel.tsx", import.meta.url), "utf8");
const jobReview = readFileSync(new URL("../app/ai/job-review/page.tsx", import.meta.url), "utf8");
const attentionCore = readFileSync(new URL("../lib/siteDiaryAttention-core.mjs", import.meta.url), "utf8");

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

test("office AI safety surfaces do not advertise the denied RAMS route", () => {
  const { canAccessPath } = loadPermissions();

  assert.equal(canAccessPath("office", "/ai"), true);
  assert.equal(canAccessPath("office", "/ai/job-review"), true);
  assert.equal(canAccessPath("office", "/rams"), false);
  assert.equal(canAccessPath("owner", "/rams"), true);
  assert.equal(canAccessPath("admin", "/rams"), true);
});

test("RAMS actions follow identity permissions while safety findings remain visible", () => {
  for (const source of [attentionPanel, jobReview]) {
    assert.match(source, /const \{ identity, mode \} = useCloudIdentity\(\)/);
    assert.match(source, /const unrestricted = mode === "local" \|\| \(mode === "migration" && !identity\)/);
    assert.match(source, /canAccessPath\(identity\?\.role, "\/rams", identity\?\.email\)/);
  }

  assert.match(attentionPanel, /item\.href === "\/rams" && !canOpenRams/);
  assert.match(attentionPanel, /return <div key=\{item\.id\} className=\{className\}>\{content\}<\/div>/);
  assert.match(attentionPanel, /return <Link key=\{item\.id\} href=\{item\.href\}/);
  assert.equal((jobReview.match(/href: ramsHref/g) ?? []).length, 2);
  assert.doesNotMatch(jobReview, /href: "\/rams"/);
  assert.match(jobReview, /No RAMS linked/);
  assert.match(jobReview, /RAMS not approved/);
  assert.match(attentionCore, /kind: "Safety"[\s\S]*href: "\/rams"/);
});
