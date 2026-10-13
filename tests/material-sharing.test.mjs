import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";

const path = new URL("../lib/materialSharing.ts", import.meta.url);
const helpers = existsSync(path) ? await import(path) : {};
const material = { name: " Twin socket ", supplier: " Screwfix ", stockCode: " 123AB ", supplierUrl: " https://www.screwfix.com/p/socket/123ab ", tradeCost: 7, sellPrice: 12, margin: 5, customer: "Private customer", notes: "Private notes" };

test("material sharing exposes only visible product identity and exact trimmed code/link", () => {
  assert.equal(typeof helpers.materialShareDetails, "function", "The safe material-sharing helper exists");
  const result = helpers.materialShareDetails(material);
  assert.deepEqual(result, { name: "Twin socket", supplier: "Screwfix", stockCode: "123AB", supplierUrl: "https://www.screwfix.com/p/socket/123ab", text: "Twin socket\nSupplier: Screwfix\nCode: 123AB\nhttps://www.screwfix.com/p/socket/123ab" });
  assert.doesNotMatch(JSON.stringify(result), /tradeCost|sellPrice|margin|customer|notes|Private/);
});

test("product URL validation fails closed for unsafe, malformed and credential-bearing links", () => {
  assert.equal(typeof helpers.safeMaterialProductUrl, "function", "The product URL validator exists");
  for (const value of ["", undefined, null, 7, "/product/12", "javascript:alert(1)", "data:text/plain,hello", "ftp://example.com/p", "https:example.com/p", "https:///example.com/p", "https://", "https://[broken", "https://user:pass@example.com/p", "https://@example.com/p", "https://example.com\n/p", "https://example.com/%0aheader", "https://example.com\\other", "https://exa mple.com/p"]) {
    assert.equal(helpers.safeMaterialProductUrl(value), "", String(value));
  }
  assert.equal(helpers.safeMaterialProductUrl(" https://example.com/p?a=1#item "), "https://example.com/p?a=1#item");
  assert.equal(helpers.safeMaterialProductUrl("http://example.com/p"), "http://example.com/p");
});

test("control characters cannot create extra share fields and unsafe URLs are omitted", () => {
  assert.equal(typeof helpers.materialShareDetails, "function");
  const result = helpers.materialShareDetails({ name: "Socket\nprivate", supplier: "Supplier\tname", stockCode: " AB\u0000CD ", supplierUrl: "javascript:alert(1)" });
  assert.equal(result.stockCode, "ABCD");
  assert.equal(result.text, "Socketprivate\nSupplier: Suppliername\nCode: ABCD");
  assert.equal(result.supplierUrl, "");
});
