import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const dockSource = await readFile(new URL("../components/mobile/MobileActionDock.tsx", import.meta.url), "utf8");
const lineSource = await readFile(new URL("../components/quotes/MobilePricingLineCard.tsx", import.meta.url), "utf8");

test("mobile action dock stays above the bottom navigation and iPhone safe area", () => {
  assert.match(dockSource, /bottom-\[calc\(4\.75rem\+env\(safe-area-inset-bottom\)\)\]/);
  assert.match(dockSource, /lg:hidden/);
  assert.match(dockSource, /backdrop-blur/);
  assert.match(dockSource, /min-h-12/);
});

test("mobile pricing lines use stacked touch-friendly controls", () => {
  assert.match(lineSource, /md:hidden/);
  assert.match(lineSource, /Customer price \(£\)/);
  assert.match(lineSource, /grid grid-cols-2 gap-3/);
  assert.match(lineSource, /size-11/);
  assert.match(lineSource, /aria-label=\{`Remove/);
});

test("mobile pricing line editor preserves every quote cost field", () => {
  assert.match(lineSource, /description: event\.target\.value/);
  assert.match(lineSource, /category: event\.target\.value as PricingLineItem/);
  assert.match(lineSource, /quantity: Number\(event\.target\.value\)/);
  assert.match(lineSource, /unitCost: Number\(event\.target\.value\)/);
  assert.match(lineSource, /unitPrice: Number\(event\.target\.value\)/);
});
