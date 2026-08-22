import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sidebar = readFileSync(new URL("../components/Sidebar.tsx", import.meta.url), "utf8");

test("desktop sidebar keeps parent workspaces active on nested routes", () => {
  assert.match(sidebar, /function navigationItemIsActive\(pathname: string, href: string\)/);
  assert.match(sidebar, /href === "\/"/);
  assert.match(sidebar, /pathname === href \|\| pathname\.startsWith\(`\$\{href\}\/`\)/);
  assert.equal((sidebar.match(/navigationItemIsActive\(pathname, href\)/g) ?? []).length, 2);
  assert.doesNotMatch(sidebar, /const active = pathname === href;/);
});

test("desktop electrician jobs use field control and stay active in assigned workspaces", () => {
  assert.ok(sidebar.includes("const fieldJobWorkspacePath = /^\\/jobs\\/[^/]+\\/workspace(?:\\/|$)/;"));
  assert.match(sidebar, /identity\?\.role === "electrician"/);
  assert.match(sidebar, /item\.href === "\/jobs" \? \{ \.\.\.item, href: "\/field\/jobs" \} : item/);
  assert.match(sidebar, /href === "\/field\/jobs"/);
  assert.match(sidebar, /fieldJobWorkspacePath\.test\(pathname\)/);
  assert.match(sidebar, /: primaryNavigation;/);
});

test("desktop field job control is not repeated in the electrician workspace list", () => {
  assert.ok(sidebar.includes("identity?.role === \"electrician\" && href === \"/field/jobs\""));
});

test("desktop cloud account navigation stays in the identity footer only", () => {
  assert.ok(sidebar.includes("href !== \"/cloud\""));
  assert.equal((sidebar.match(/href="\/cloud"/g) ?? []).length, 1);
});
