import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const mobileNavigation = readFileSync(new URL("../components/MobileNav.tsx", import.meta.url), "utf8");
const sidebar = readFileSync(new URL("../components/Sidebar.tsx", import.meta.url), "utf8");

test("the field landing matches exactly so field jobs activate one destination", () => {
  assert.match(sidebar, /if \(href === "\/field"\) return pathname === href;/);
  assert.match(mobileNavigation, /itemHref === "\/field"\s*\? pathname === itemHref/);
});
