import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

const shell = fs.readFileSync(new URL("../components/AppShell.tsx", import.meta.url), "utf8");
const header = fs.readFileSync(new URL("../components/ui/PageHeader.tsx", import.meta.url), "utf8");
const navigation = fs.readFileSync(new URL("../components/MobileNav.tsx", import.meta.url), "utf8");
const globals = fs.readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

test("mobile shell respects bottom navigation and safe-area spacing", () => {
  assert.match(shell, /env\(safe-area-inset-bottom\)/);
  assert.match(shell, /overflow-x-hidden/);
  assert.match(shell, /px-3 py-4/);
});

test("page headers stack actions into full-width mobile controls", () => {
  assert.match(header, /grid w-full gap-2/);
  assert.match(header, /\[&>\*\]:w-full/);
  assert.match(header, /text-2xl/);
});

test("mobile navigation has accessible touch targets and current-page state", () => {
  assert.match(navigation, /aria-label="Primary mobile navigation"/);
  assert.match(navigation, /aria-current=/);
  assert.match(navigation, /min-h-14/);
  assert.match(navigation, /safe-area-inset-bottom/);
});

test("mobile form controls avoid iOS zoom and horizontal overflow", () => {
  assert.match(globals, /-webkit-text-size-adjust: 100%/);
  assert.match(globals, /font-size: 16px/);
  assert.match(globals, /overflow-x: hidden/);
  assert.match(globals, /-webkit-tap-highlight-color: transparent/);
});
