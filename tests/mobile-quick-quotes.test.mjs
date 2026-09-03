import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const pageSource = await readFile(new URL("../app/quotes/mobile/page.tsx", import.meta.url), "utf8");
const navigationSource = await readFile(new URL("../components/navigation.ts", import.meta.url), "utf8");

test("mobile quick quotes creates a fixed-price draft through the cloud-backed pricing collection", () => {
  assert.match(pageSource, /usePricingDocumentsCollection\(\)/);
  assert.match(pageSource, /nextPricingDocumentNumber\(documents\.items, "Quote"\)/);
  assert.match(pageSource, /status: "Draft"/);
  assert.match(pageSource, /category: "Other"/);
  assert.match(pageSource, /quantity: 1/);
  assert.match(pageSource, /unitPrice: fixedPrice/);
  assert.match(pageSource, /documents\.setItems\(\(current\) => \[document, \.\.\.current\]\)/);
});

test("mobile quick quote workflow requires a recipient and positive fixed price", () => {
  assert.match(pageSource, /Choose a customer or builder/);
  assert.match(pageSource, /Number\.isFinite\(fixedPrice\)/);
  assert.match(pageSource, /fixedPrice <= 0/);
  assert.match(pageSource, /Customer fixed price \(£\)/);
});

test("mobile quick quotes exposes one-handed save controls and recent quote cards", () => {
  assert.match(pageSource, /MobileActionDock/);
  assert.match(pageSource, /MobileDockAction/);
  assert.match(pageSource, /Save fixed-price draft/);
  assert.match(pageSource, /Recent quotes and estimates/);
  assert.match(pageSource, /pricingDocumentTotal\(document\)/);
});

test("mobile quick quotes is reachable from navigation", () => {
  assert.match(navigationSource, /\["Mobile Quick Quotes", "\/quotes\/mobile"\]/);
});
