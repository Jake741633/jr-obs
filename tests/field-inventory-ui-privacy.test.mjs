import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const materials = readFileSync(new URL("../app/materials/page.tsx", import.meta.url), "utf8");
const stock = readFileSync(new URL("../app/stock/page.tsx", import.meta.url), "utf8");
const purchases = readFileSync(new URL("../app/purchases/page.tsx", import.meta.url), "utf8");

for (const [name, source] of [["materials", materials], ["stock", stock], ["purchases", purchases]]) {
  test(`${name} page derives field price visibility from cloud identity`, () => {
    assert.match(source, /useCloudIdentity/);
    assert.match(source, /const priceRestricted = identity\?\.role === "electrician"/);
  });
}

test("materials page hides every internal pricing control and history surface from electricians", () => {
  assert.match(materials, /!priceRestricted \? <InputField label="Trade cost \(£\)"/);
  assert.match(materials, /!priceRestricted \? <InputField label="Selling price \(£\)"/);
  assert.match(materials, /!priceRestricted \? <Card><p className="text-sm text-slate-400">Prices over 30 days old/);
  assert.match(materials, /!priceRestricted \? <>[\s\S]*Trade cost[\s\S]*Selling price[\s\S]*Quick update[\s\S]*Recent price history/);
  assert.match(materials, /!priceRestricted \? <button onClick=\{\(\) => remove\(item\)\}/);
  assert.match(materials, /priceRestricted \? "Supplier product details imported for field use\."/);
});

test("stock page keeps field quantity controls but hides unit cost, stock value and deletion", () => {
  assert.match(stock, /!priceRestricted \? <InputField label="Unit cost \(£\)"/);
  assert.match(stock, /!priceRestricted \? <Card><p className="text-sm text-slate-400">Stock value/);
  assert.match(stock, /!priceRestricted \? <div><p className="text-xs text-slate-500">Value/);
  assert.match(stock, /!priceRestricted \? <button onClick=\{\(\) => stock\.remove/);
  assert.match(stock, /item\.quantity \* \(item\.unitCost \?\? 0\)/);
  assert.match(stock, /priceRestricted \? current\.unitCost : material \? String\(material\.tradeCost \?\? 0\)/);
});

test("purchase page hides quote-derived creation and all cost totals from electricians", () => {
  assert.match(purchases, /!priceRestricted \? <Card className="border-cyan-400\/30"><h2 className="font-semibold">Create from quote or estimate/);
  assert.match(purchases, /!priceRestricted \? <Card><p className="text-sm text-slate-400">Committed spend/);
  assert.match(purchases, /!priceRestricted \? <label className="text-xs text-slate-500">Unit cost/);
  assert.match(purchases, /!priceRestricted \? <strong>\{money\.format\(totalCost\)\}<\/strong>/);
  assert.match(purchases, /!priceRestricted \? <strong>\{money\.format\(subtotal\)\}<\/strong>/);
  assert.match(purchases, /!priceRestricted \? <button onClick=\{\(\) => purchaseLists\.remove/);
  assert.match(purchases, /item\.quantity \* \(item\.unitCost \?\? 0\)/);
});
