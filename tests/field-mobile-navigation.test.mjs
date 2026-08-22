import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { canAccessPath } from "../lib/cloud/permissions.ts";

const navigation = readFileSync(new URL("../components/MobileNav.tsx", import.meta.url), "utf8");

test("electrician mobile jobs open the dedicated field job control route", () => {
  assert.equal(canAccessPath("electrician", "/field/jobs"), true);
  assert.match(navigation, /if \(item\.href === "\/jobs"\) return \{ \.\.\.item, href: "\/field\/jobs" \};/);
  assert.doesNotMatch(navigation, /if \(item\.href === "\/jobs"\) return \{ \.\.\.item, href: "\/jobs" \};/);
});

test("field jobs stay active while an assigned job workspace is open", () => {
  assert.ok(navigation.includes("const fieldJobWorkspacePath = /^\\/jobs\\/[^/]+\\/workspace(?:\\/|$)/;"));
  assert.match(navigation, /itemHref === "\/field\/jobs" && identity\?\.role === "electrician"/);
  assert.match(navigation, /fieldJobWorkspacePath\.test\(pathname\)/);
});
