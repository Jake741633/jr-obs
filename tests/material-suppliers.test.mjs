import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import { loadLocalTs } from "./helpers/load-local-ts.mjs";

const url = new URL("../lib/materialSuppliers.ts", import.meta.url);
const helpers = existsSync(url) ? loadLocalTs(url) : {};
const primary = { supplier: "CEF", stockCode: "CEF-1", supplierUrl: "https://www.cef.co.uk/item/one" };
const alternative = { id: "supplier-1", supplier: "TLC Direct", stockCode: "AB/12", supplierUrl: "https://www.tlc-direct.co.uk/Products/AB12.html" };

test("legacy materials retain their preferred code and need no additional supplier records", () => {
  assert.equal(typeof helpers.materialSupplierReferences, "function");
  const refs = helpers.materialSupplierReferences(primary);
  assert.deepEqual(JSON.parse(JSON.stringify(refs)), [{ id: "preferred", ...primary }]);
  assert.deepEqual(JSON.parse(JSON.stringify(helpers.normaliseMaterialSupplierOptions(undefined, primary))), []);
});

test("supplier options trim exact entered codes and allow a code or a product link without inventing either", () => {
  assert.equal(typeof helpers.normaliseMaterialSupplierOptions, "function");
  const result = helpers.normaliseMaterialSupplierOptions([
    { ...alternative, supplier: " TLC Direct ", stockCode: " AB/12 ", privateCost: 90, notes: "Private" },
    { id: "supplier-2", supplier: "Local wholesaler", stockCode: "", supplierUrl: "https://example.com/product?id=A" },
    { id: "supplier-3", supplier: "Edmundson", stockCode: "ED 001", supplierUrl: "" },
    { id: "empty", supplier: "", stockCode: "", supplierUrl: "" },
  ], primary);
  assert.equal(result.length, 3);
  assert.equal(result[0].stockCode, "AB/12");
  assert.equal(result[1].stockCode, "");
  assert.equal(result[2].supplierUrl, "");
  assert.doesNotMatch(JSON.stringify(result), /privateCost|notes|Private/);
});

test("unsafe links, malformed options, duplicate identities and duplicate supplier codes require review", () => {
  assert.equal(typeof helpers.normaliseMaterialSupplierOptions, "function");
  for (const options of [
    {}, [null], [{ ...alternative, supplierUrl: "javascript:alert(1)" }],
    [{ ...alternative, supplierUrl: "https://user:password@example.com/p" }],
    [{ ...alternative, supplier: "" }], [{ ...alternative, stockCode: "", supplierUrl: "" }],
    [{ ...alternative, stockCode: "ABC\n123" }], [alternative, { ...alternative, stockCode: "DIFFERENT" }],
    [alternative, { ...alternative, id: "different", supplier: "tlc direct", stockCode: "ab/12" }],
    [{ id: "duplicate-primary", ...primary }],
    Array.from({ length: 11 }, (_, i) => ({ ...alternative, id: `ref-${i}`, stockCode: `CODE-${i}` })),
  ]) assert.throws(() => helpers.normaliseMaterialSupplierOptions(options, primary), undefined, JSON.stringify(options));
});

test("public reference projection cannot leak prices or notes and omits unsafe saved product links", () => {
  assert.equal(typeof helpers.materialSupplierReferences, "function");
  const refs = helpers.materialSupplierReferences({ ...primary, supplierOptions: [{ ...alternative, tradeCost: 15, notes: "Private" }, { id: "bad-url", supplier: "Other", stockCode: "B1", supplierUrl: "javascript:alert(1)" }], tradeCost: 20, notes: "Secret" });
  assert.equal(refs.length, 3);
  assert.equal(refs[1].stockCode, "AB/12");
  assert.equal(refs[2].supplierUrl, "");
  assert.doesNotMatch(JSON.stringify(refs), /tradeCost|notes|Private|Secret|javascript/);
});

test("oversized saved stock codes are withheld rather than shortened into another product code", () => {
  const refs = helpers.materialSupplierReferences({ ...primary, supplierOptions: [{ ...alternative, stockCode: "X".repeat(129) }] });
  assert.equal(refs[1].stockCode, "");
  assert.equal(refs[1].supplierUrl, alternative.supplierUrl);
});

test("promoting a supplier swaps exact product references without losing the previous preferred source", () => {
  assert.equal(typeof helpers.promoteMaterialSupplier, "function");
  const original = structuredClone({ ...primary, supplierOptions: [alternative], tradeCost: 7, sellPrice: 12 });
  const result = helpers.promoteMaterialSupplier(original, original.supplierOptions, alternative.id);
  assert.equal(result.supplier, "TLC Direct");
  assert.equal(result.stockCode, "AB/12");
  assert.deepEqual(JSON.parse(JSON.stringify(result.supplierOptions)), [{ id: alternative.id, ...primary }]);
  assert.equal(original.supplier, "CEF");
  assert.equal(original.supplierOptions[0].stockCode, "AB/12");
  assert.doesNotMatch(JSON.stringify(result), /tradeCost|sellPrice/);
  assert.throws(() => helpers.promoteMaterialSupplier(primary, [alternative], "missing"));
});
