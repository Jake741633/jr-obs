import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

const helper = fs.readFileSync(new URL("../lib/quotePresentation.ts", import.meta.url), "utf8");
const preview = fs.readFileSync(new URL("../components/quotes/QuotePreview.tsx", import.meta.url), "utf8");

test("customer quote presentation defaults to fixed price and hidden internal sections", () => {
  assert.match(helper, /mode: "Fixed price"/);
  assert.match(helper, /showLabour: false/);
  assert.match(helper, /showMaterials: false/);
  assert.match(helper, /showTravel: false/);
  assert.match(helper, /showParking: false/);
  assert.match(helper, /showPlantHire: false/);
  assert.match(helper, /showContingency: false/);
  assert.match(helper, /showSubtotal: false/);
});

test("fixed-price preview exposes one customer total without item rows", () => {
  assert.match(preview, /Fixed price for the described works/);
  assert.match(preview, /visibleQuoteItems\(items, presentation\)/);
  assert.match(preview, /presentation\.mode === "Fixed price"/);
  assert.match(preview, /subtotal \+ vat/);
});

test("itemised presentation supports independent category and VAT visibility", () => {
  assert.match(helper, /Labour: "showLabour"/);
  assert.match(helper, /Materials: "showMaterials"/);
  assert.match(helper, /Travel: "showTravel"/);
  assert.match(preview, /presentation\.showVatLine/);
  assert.match(preview, /presentation\.showQuantities/);
  assert.match(preview, /presentation\.showUnitPrices/);
});
