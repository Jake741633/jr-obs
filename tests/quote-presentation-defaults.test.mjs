import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const presentationSource = await readFile(new URL("../lib/quotePresentation.ts", import.meta.url), "utf8");
const hookSource = await readFile(new URL("../lib/useQuotePresentationDefaults.ts", import.meta.url), "utf8");
const previewSource = await readFile(new URL("../components/quotes/QuotePreview.tsx", import.meta.url), "utf8");
const pageSource = await readFile(new URL("../app/quotes/presentation/page.tsx", import.meta.url), "utf8");
const navigationSource = await readFile(new URL("../components/navigation.ts", import.meta.url), "utf8");

test("fixed-price presentation remains the safe default", () => {
  assert.match(presentationSource, /mode: "Fixed price"/);
  assert.match(presentationSource, /showLabour: false/);
  assert.match(presentationSource, /showMaterials: false/);
  assert.match(presentationSource, /showSubtotal: false/);
});

test("quote presentation defaults use the cloud/local collection adapter", () => {
  assert.match(hookSource, /useCloudLocalCollection<QuotePresentationDefaultsRecord>/);
  assert.match(hookSource, /jr-os-quote-presentation-defaults/);
  assert.match(hookSource, /updatedAt: new Date\(\)\.toISOString\(\)/);
});

test("quote previews apply saved defaults when no per-document override is supplied", () => {
  assert.match(previewSource, /useQuotePresentationDefaults\(\)/);
  assert.match(previewSource, /presentation \?\? savedOverride \?\? defaults\.settings \?\? defaultQuotePresentationSettings/);
  assert.match(previewSource, /Fixed price for the described works/);
});

test("presentation page exposes fixed and itemised presets", () => {
  assert.match(pageSource, /Fixed price/);
  assert.match(pageSource, /Labour only/);
  assert.match(pageSource, /Labour and materials/);
  assert.match(pageSource, /Full breakdown/);
  assert.match(pageSource, /Save presentation defaults/);
});

test("quote presentation settings are reachable from navigation", () => {
  assert.match(navigationSource, /\["Quote Presentation", "\/quotes\/presentation"\]/);
});
