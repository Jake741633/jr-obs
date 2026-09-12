import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sidebar = readFileSync(new URL("../components/Sidebar.tsx", import.meta.url), "utf8");
const navigation = readFileSync(new URL("../components/navigation.ts", import.meta.url), "utf8");

test("desktop owners retain the configured Settings primary navigation", () => {
  assert.match(navigation, /\{ label: "Settings", href: "\/settings", icon: Settings \}/);
  assert.match(sidebar, /const primary = rolePrimaryNavigation\.filter\(\(item\) => permitted\(item\.href\)\);/);
  assert.doesNotMatch(sidebar, /rolePrimaryNavigation\.slice\(0, 4\)/);
});
