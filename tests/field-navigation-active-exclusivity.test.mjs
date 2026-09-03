import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { sidebarNavigationItemMatches } from "../lib/sidebarNavigationActive-core.mjs";

const mobileNavigation = readFileSync(new URL("../components/MobileNav.tsx", import.meta.url), "utf8");

test("the field landing matches exactly so field jobs activate one destination", () => {
  assert.equal(sidebarNavigationItemMatches({ pathname: "/field", href: "/field" }), true);
  assert.equal(sidebarNavigationItemMatches({ pathname: "/field/jobs", href: "/field" }), false);
  assert.match(mobileNavigation, /itemHref === "\/field"\s*\? pathname === itemHref/);
});
