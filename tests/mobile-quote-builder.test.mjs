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
  assert.match(lineSource, /<details/);
  assert.match(lineSource, /<summary/);
  assert.match(lineSource, /group-open:rotate-180/);
  assert.match(lineSource, /Customer price \(£\)/);
  assert.match(lineSource, /grid grid-cols-2 gap-3/);
  assert.match(lineSource, /Remove pricing line/);
});

test("mobile pricing line editor preserves every quote cost field", () => {
  assert.match(lineSource, /description: event\.target\.value/);
  assert.match(lineSource, /category: event\.target\.value as PricingLineItem/);
  assert.match(lineSource, /quantity: Number\(event\.target\.value\)/);
  assert.match(lineSource, /unitCost: Number\(event\.target\.value\)/);
  assert.match(lineSource, /unitPrice: Number\(event\.target\.value\)/);
});

test("full quote builder exposes one-handed sticky actions and floating add", async () => {
  const pageSource = await readFile(new URL("../app/quotes/page.tsx", import.meta.url), "utf8");
  assert.match(pageSource, /id="quote-builder-form"/);
  assert.match(pageSource, /aria-label="Add pricing line"/);
  assert.match(pageSource, /MobilePricingLineCard/);
  assert.match(pageSource, /MobileDockAction icon=\{<Save/);
  assert.match(pageSource, /label="Preview"/);
  assert.match(pageSource, /label="AI"/);
  assert.match(pageSource, /label="Convert"/);
  assert.match(pageSource, /env\(safe-area-inset-bottom\)/);
});
