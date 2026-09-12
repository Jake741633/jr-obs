import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { canAccessPath, roleDeniedRouteHandoff } from "../lib/cloud/permissions.ts";

const accessGuard = readFileSync(new URL("../components/CloudAccessGuard.tsx", import.meta.url), "utf8");
const dayPlanner = readFileSync(new URL("../app/field/day-planner/page.tsx", import.meta.url), "utf8");
const fieldMaterials = readFileSync(new URL("../app/field/materials/page.tsx", import.meta.url), "utf8");
const fieldTesting = readFileSync(new URL("../app/field/testing/page.tsx", import.meta.url), "utf8");

const expectedHandoffs = [
  ["/planner", "/field/day-planner"],
  ["/materials", "/field/material-lookup"],
  ["/stock", "/field/materials"],
  ["/purchases", "/field/materials"],
  ["/certificates", "/field/testing"],
];

test("office shortcuts target routes that remain denied to electricians", () => {
  assert.match(dayPlanner, /href="\/planner"/);
  assert.match(fieldMaterials, /label: "Materials Library", href: "\/materials"/);
  assert.match(fieldMaterials, /label: "Stock Control", href: "\/stock"/);
  assert.match(fieldMaterials, /label: "Purchase Lists", href: "\/purchases"/);
  assert.match(fieldTesting, /href="\/certificates"/);

  for (const [deniedPath] of expectedHandoffs) {
    assert.equal(canAccessPath("electrician", deniedPath), false, `${deniedPath} must remain denied`);
  }
});

test("each denied office route hands electricians to a permitted field workflow", () => {
  for (const [deniedPath, permittedPath] of expectedHandoffs) {
    const handoff = roleDeniedRouteHandoff("electrician", deniedPath);
    assert.ok(handoff, `${deniedPath} should provide a field handoff`);
    assert.equal(handoff.href, permittedPath);
    assert.equal(canAccessPath("electrician", handoff.href), true, `${handoff.href} must be permitted`);
    assert.ok(handoff.title.trim());
    assert.ok(handoff.description.trim());
    assert.ok(handoff.actionLabel.trim());
  }
});

test("nested denied routes inherit the same safe field handoff", () => {
  assert.equal(roleDeniedRouteHandoff("electrician", "/certificates/cert-1")?.href, "/field/testing");
  assert.equal(roleDeniedRouteHandoff("electrician", "/materials/mat-1")?.href, "/field/material-lookup");
});

test("handoffs do not weaken access for other roles or unrelated routes", () => {
  assert.equal(roleDeniedRouteHandoff("office", "/planner"), null);
  assert.equal(roleDeniedRouteHandoff("owner", "/certificates"), null);
  assert.equal(roleDeniedRouteHandoff("electrician", "/quotes"), null);
  assert.equal(canAccessPath("electrician", "/planner"), false);
  assert.equal(canAccessPath("electrician", "/certificates"), false);
});

test("the access guard renders the handoff only after access is denied", () => {
  const deniedCheck = accessGuard.indexOf("if (!canAccessPath(identity.role, pathname, identity.email))");
  const handoffLookup = accessGuard.indexOf("roleDeniedRouteHandoff(identity.role, pathname)");
  assert.ok(deniedCheck >= 0 && handoffLookup > deniedCheck);
  assert.match(accessGuard, /href=\{handoff\?\.href \?\? roleLandingPath\(identity\.role\)\}/);
  assert.match(accessGuard, /handoff\?\.actionLabel \?\? "Return to permitted workspace"/);
});

