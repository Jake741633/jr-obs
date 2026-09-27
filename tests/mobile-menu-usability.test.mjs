import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const menuSource = await readFile(new URL("../app/menu/page.tsx", import.meta.url), "utf8");

test("mobile menu derives daily shortcuts only from permission-filtered navigation", () => {
  assert.match(menuSource, /const visibleNavigation = secondaryNavigation\.filter\(\(\[, href\]\) => permitted\(href\)\)/);
  assert.match(menuSource, /identity\?\.role === "electrician" \? electricianDailyHrefs : officeDailyHrefs/);
  assert.match(menuSource, /dailyHrefs[\s\S]*visibleNavigation\.find\(\(\[, itemHref\]\) => itemHref === href\)/);
  assert.match(menuSource, /Only workspaces permitted for the active account are shown/);
});

test("mobile menu provides an iPhone-safe workspace search with an empty result state", () => {
  assert.match(menuSource, /type="search"/);
  assert.match(menuSource, /aria-label="Search workspaces"/);
  assert.match(menuSource, /min-h-12 w-full/);
  assert.match(menuSource, /searchResults\.length === 1 \? "workspace" : "workspaces"/);
  assert.match(menuSource, /No permitted workspace matches/);
});

test("mobile menu groups the full permitted workspace list into day-to-day sections", () => {
  for (const heading of ["Customers & sales", "Quotes & pricing", "Jobs & field", "Money & business", "Materials & assets", "Testing & compliance", "JR AI", "Account & system"]) {
    assert.match(menuSource, new RegExp(heading.replace(/[&]/g, "\\&")));
  }
  assert.match(menuSource, /Day to day/);
  assert.match(menuSource, /Daily tools/);
  assert.match(menuSource, /min-h-14/);
  assert.match(menuSource, /sm:grid-cols-2/);
});
