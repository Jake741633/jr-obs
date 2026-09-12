import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const renderer = readFileSync(new URL("../components/ai/WhyRecommendation.tsx", import.meta.url), "utf8");
const commandCentre = readFileSync(new URL("../lib/aiCommandCentre.ts", import.meta.url), "utf8");

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
    URL,
  });
  return commonJsModule.exports;
}

test("office AI evidence does not advertise the denied job-pack route", () => {
  const { canAccessPath } = loadPermissions();

  assert.equal(canAccessPath("office", "/ai/materials"), true);
  assert.equal(canAccessPath("office", "/ai/learning"), true);
  assert.equal(canAccessPath("office", "/job-packs"), false);
  assert.equal(canAccessPath("owner", "/job-packs"), true);
  assert.equal(canAccessPath("admin", "/job-packs"), true);
  assert.match(commandCentre, /kind: "Job pack",[\s\S]*href: "\/job-packs"/);
});

test("evidence links follow identity permissions while their facts remain visible", () => {
  const { canUseLocalWorkspaceWithoutIdentity, internalPathForAccess } = loadPermissions();

  assert.equal(internalPathForAccess("/job-packs"), "/job-packs");
  assert.equal(internalPathForAccess("/ai#action-centre"), "/ai");
  assert.equal(internalPathForAccess("/leads?lead=lead-1"), "/leads");
  for (const deniedHref of ["https://example.com/job-packs", "//example.com/job-packs", "/\\example.com/job-packs", "/\t/example.com/job-packs"]) {
    assert.equal(internalPathForAccess(deniedHref), null, `${JSON.stringify(deniedHref)} must fail closed`);
  }
  assert.equal(canUseLocalWorkspaceWithoutIdentity("local", "/job-packs"), true);
  assert.equal(canUseLocalWorkspaceWithoutIdentity("local", "/release-readiness"), false);
  assert.equal(canUseLocalWorkspaceWithoutIdentity("migration", "/cloud/cutover"), false);

  assert.match(renderer, /^"use client";/);
  assert.match(renderer, /const \{ identity, mode \} = useCloudIdentity\(\)/);
  assert.match(renderer, /const unrestricted = mode === "local" \|\| \(mode === "migration" && !identity\)/);
  assert.match(renderer, /const evidencePath = internalPathForAccess\(item\.href\)/);
  assert.match(renderer, /unrestricted && canUseLocalWorkspaceWithoutIdentity\(mode, evidencePath\)/);
  assert.match(renderer, /\|\| canAccessPath\(identity\?\.role, evidencePath, identity\?\.email\)/);
  assert.match(renderer, /return canOpenEvidence \? \([\s\S]*<Link[\s\S]*href=\{item\.href\}[\s\S]*\) : \([\s\S]*<div/);
  assert.equal((renderer.match(/href=\{item\.href\}/g) ?? []).length, 1);
  for (const fact of ["item.kind", "item.relevance", "item.title", "item.detail"]) {
    assert.equal((renderer.match(new RegExp(fact.replace(".", "\\."), "g")) ?? []).length, 1);
  }
});
