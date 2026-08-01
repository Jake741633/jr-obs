import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

const helper = fs.readFileSync(new URL("../lib/quotePresentation.ts", import.meta.url), "utf8");
const preview = fs.readFileSync(new URL("../components/quotes/QuotePreview.tsx", import.meta.url), "utf8");
const page = fs.readFileSync(new URL("../app/quotes/presentation/overrides/page.tsx", import.meta.url), "utf8");
const defaultsPage = fs.readFileSync(new URL("../app/quotes/presentation/page.tsx", import.meta.url), "utf8");

test("per-quote presentation overrides use a cloud/local collection", () => {
  assert.match(helper, /jr-os-quote-presentation-overrides/);
  assert.match(page, /useCloudLocalCollection<QuotePresentationOverrideRecord>/);
  assert.match(page, /usePricingDocumentsCollection/);
});

test("quote previews prefer an explicit or saved document override before defaults", () => {
  assert.match(preview, /presentationOverrideFor\(overrides\.items, number\)/);
  assert.match(preview, /presentation \?\? savedOverride \?\? defaults\.settings/);
});

test("override page supports fixed-price and requested-breakdown presets", () => {
  assert.match(page, /Fixed price/);
  assert.match(page, /Labour only/);
  assert.match(page, /Labour \+ materials/);
  assert.match(page, /Full breakdown/);
  assert.match(page, /Use business default/);
});

test("default presentation page links to per-quote controls", () => {
  assert.match(defaultsPage, /\/quotes\/presentation\/overrides/);
});
