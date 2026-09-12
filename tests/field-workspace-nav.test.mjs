import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { canAccessPath } from "../lib/cloud/permissions.ts";

const navigation = readFileSync(new URL("../components/FieldWorkspaceNav.tsx", import.meta.url), "utf8");
const layout = readFileSync(new URL("../app/field/layout.tsx", import.meta.url), "utf8");

const expectedRoutes = [
  "/field",
  "/field/day-planner",
  "/field/jobs",
  "/field/site-diary",
  "/field/materials",
  "/field/material-lookup",
  "/field/snags",
  "/field/qa",
  "/field/testing",
];

test("field layout exposes a shared quick navigation", () => {
  assert.match(layout, /FieldWorkspaceNav/);
  assert.match(layout, /<FieldWorkspaceNav \/>/);
});

test("field quick navigation links only to electrician-permitted field routes", () => {
  for (const route of expectedRoutes) {
    assert.equal(canAccessPath("electrician", route), true, `${route} should remain permitted`);
    assert.match(navigation, new RegExp(route.replaceAll("/", "\\/")));
  }
  for (const officeRoute of ["/planner", "/materials", "/stock", "/purchases", "/certificates", "/site-management"]) {
    assert.doesNotMatch(navigation, new RegExp(`\\[\\"[^\\"]+\\", \\"${officeRoute.replaceAll("/", "\\/")}\\"\\]`));
  }
});
