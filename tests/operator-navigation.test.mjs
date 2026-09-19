import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const menuPage = readFileSync(new URL("../app/menu/page.tsx", import.meta.url), "utf8");
const dashboard = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const sidebar = readFileSync(new URL("../components/Sidebar.tsx", import.meta.url), "utf8");
const mobileNav = readFileSync(new URL("../components/MobileNav.tsx", import.meta.url), "utf8");
const aiToolNav = readFileSync(new URL("../components/ai/AiToolNav.tsx", import.meta.url), "utf8");

const operatorPaths = ["/release-readiness", "/cloud/cutover", "/cloud/queue"];

test("mobile workspace menu evaluates operator restrictions before unrestricted mode", () => {
  const operatorCheck = menuPage.indexOf("if (isOperatorOnlyPath(href))");
  const unrestrictedCheck = menuPage.indexOf("return unrestricted || canAccessPath");

  assert.ok(operatorCheck >= 0);
  assert.ok(unrestrictedCheck > operatorCheck);
  assert.match(menuPage, /canAccessPath\(identity\?\.role, href, identity\?\.email\)/);
});

test("desktop sidebar uses the same fail-closed operator navigation rule", () => {
  const operatorCheck = sidebar.indexOf("if (isOperatorOnlyPath(href))");
  const unrestrictedCheck = sidebar.indexOf("return unrestricted || canAccessPath");

  assert.ok(operatorCheck >= 0);
  assert.ok(unrestrictedCheck > operatorCheck);
  assert.match(sidebar, /canAccessPath\(identity\?\.role, href, identity\?\.email\)/);
});

test("operator routes are absent from mobile, dashboard quick-action and AI navigation lists", () => {
  for (const path of operatorPaths) {
    assert.doesNotMatch(mobileNav, new RegExp(path.replaceAll("/", "\\/")));
    assert.doesNotMatch(dashboard, new RegExp(path.replaceAll("/", "\\/")));
    assert.doesNotMatch(aiToolNav, new RegExp(path.replaceAll("/", "\\/")));
  }
});
