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
