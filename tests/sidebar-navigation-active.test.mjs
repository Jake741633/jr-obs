import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  activeSidebarHref,
  sidebarNavigationItemMatches,
} from "../lib/sidebarNavigationActive-core.mjs";

const sidebar = readFileSync(new URL("../components/Sidebar.tsx", import.meta.url), "utf8");
const activeCore = readFileSync(new URL("../lib/sidebarNavigationActive-core.mjs", import.meta.url), "utf8");

test("desktop sidebar selects one longest permitted destination on nested routes", () => {
  const cases = [
    ["CRM follow-up", "/crm/follow-ups/overdue", ["/crm", "/crm/follow-ups"], false, "/crm/follow-ups"],
    ["mobile quote", "/quotes/mobile/new", ["/quotes", "/quotes/mobile"], false, "/quotes/mobile"],
    ["AI quote builder", "/ai/quote-builder", ["/ai", "/ai/quote-builder"], false, "/ai/quote-builder"],
    ["office job workspace", "/jobs/job-1/workspace/tasks", ["/jobs", "/field/jobs"], false, "/jobs"],
    ["electrician job workspace", "/jobs/job-1/workspace/tasks", ["/field", "/field/jobs"], true, "/field/jobs"],
  ];

  for (const [label, pathname, hrefs, isElectrician, expected] of cases) {
    assert.equal(
      activeSidebarHref({ pathname, hrefs, isElectrician }),
      expected,
      label,
    );
  }

  assert.match(sidebar, /const activeHref = activeSidebarHref\(\{/);
  assert.match(sidebar, /hrefs: \[[\s\S]*\.\.\.primary\.map\(\(\{ href \}\) => href\)[\s\S]*\.\.\.secondary\.map\(\(\[, href\]\) => href\)/);
  assert.equal((sidebar.match(/const active = href === activeHref;/g) ?? []).length, 2);
});

test("desktop electrician jobs use field control and stay active in assigned workspaces", () => {
  assert.ok(activeCore.includes("const fieldJobWorkspacePath = /^\\/jobs\\/[^/]+\\/workspace(?:\\/|$)/;"));
  assert.equal(sidebarNavigationItemMatches({ pathname: "/jobs/job-1/workspace", href: "/field/jobs", isElectrician: true }), true);
  assert.equal(sidebarNavigationItemMatches({ pathname: "/jobs/job-1/workspace", href: "/field/jobs", isElectrician: false }), false);
  assert.equal(sidebarNavigationItemMatches({ pathname: "/field/jobs", href: "/field" }), false);
  assert.match(sidebar, /identity\?\.role === "electrician"/);
  assert.match(sidebar, /item\.href === "\/jobs" \? \{ \.\.\.item, href: "\/field\/jobs" \} : item/);
  assert.match(sidebar, /isElectrician: identity\?\.role === "electrician"/);
  assert.match(activeCore, /isElectrician && fieldJobWorkspacePath\.test\(pathname\)/);
  assert.match(sidebar, /: primaryNavigation;/);
});

test("desktop field job control is not repeated in the electrician workspace list", () => {
  assert.ok(sidebar.includes("identity?.role === \"electrician\" && href === \"/field/jobs\""));
});

test("desktop cloud account navigation stays in the identity footer only", () => {
  assert.ok(sidebar.includes("href !== \"/cloud\""));
  assert.equal((sidebar.match(/href="\/cloud"/g) ?? []).length, 1);
});
