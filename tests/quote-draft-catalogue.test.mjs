import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import { loadLocalTs } from "./helpers/load-local-ts.mjs";
const file = new URL("../lib/quoteDraftCatalogue.ts", import.meta.url), api = existsSync(file) ? loadLocalTs(file) : {};
const { materialQuoteDraftLine } = loadLocalTs(new URL("../lib/quoteDraftLines.ts", import.meta.url));
const socket = { id: "socket-id", name: "Double socket", manufacturer: "BG", category: "Accessories", unit: "Each", supplier: "CEF", stockCode: "001234", supplierUrl: "https://www.cef.co.uk/product?item=one", tradeCost: 4.123, sellPrice: 9.875, notes: "secret buying discount", supplierOptions: [{ id: "second", supplier: "Screwfix", stockCode: "002-Z5", supplierUrl: "https://www.screwfix.com/product?id=100" }] };
const light = { ...socket, id: "light-id", name: "Garden light", manufacturer: "Aurora", category: "Lighting", supplierOptions: [], supplierUrl: "https://www.cef.co.uk/product?item=two" };
const pack = { id: "pack-id", name: "Extra point", category: "Domestic", description: "Add a switched socket", labourDescription: "Accessory installation", materials: [{ id: "line", description: "Metal back box" }], notes: "private scope not indexed", internalNotes: "secret historical benchmark", labourRate: 8765.4321 };
const ids = rows => Array.from(rows, row => row.id);

test("material search matches all words across public names, secondary supplier codes and saved links", () => {
 assert.equal(typeof api.quoteDraftMaterialChoices, "function");
 assert.deepEqual(ids(api.quoteDraftMaterialChoices([socket, light], "  SCREWFIX 002-z5 socket ")), ["socket-id"]);
 assert.deepEqual(ids(api.quoteDraftMaterialChoices([socket, light], "BG accessories each")), ["socket-id"]);
 assert.deepEqual(ids(api.quoteDraftMaterialChoices([socket, light], "https://www.screwfix.com/product?id=100")), ["socket-id"]);
 assert.deepEqual(ids(api.quoteDraftMaterialChoices([socket, light], "socket aurora")), []);
});
test("URL search keeps meaningful query identifiers and stock codes keep leading zeroes", () => {
 assert.deepEqual(ids(api.quoteDraftMaterialChoices([socket, light], "https://www.cef.co.uk/product?item=one")), ["socket-id"]);
 assert.deepEqual(ids(api.quoteDraftMaterialChoices([socket, light], "https://www.cef.co.uk/product?item=two")), ["light-id"]);
 assert.equal(api.quoteDraftMaterialProduct(socket, "preferred").stockCode, "001234");
 assert.equal(api.quoteDraftMaterialProduct(socket, "second").stockCode, "002-Z5");
});
test("catalogue filtering excludes private fields and globally ambiguous record identities", () => {
 assert.equal(typeof api.quoteDraftPackChoices, "function");
 for (const query of ["secret", "4.123", "9.875", "socket-id"]) assert.deepEqual(ids(api.quoteDraftMaterialChoices([socket], query)), []);
 const hiddenDuplicate = { ...socket, name: "Other name", manufacturer: "Other", category: "Other", unit: "Other", supplier: "Other", stockCode: "Other", supplierUrl: "", supplierOptions: [] };
 assert.deepEqual(ids(api.quoteDraftMaterialChoices([socket, hiddenDuplicate], "double socket")), []);
 assert.deepEqual(ids(api.quoteDraftMaterialChoices([{ ...socket, id: " " }], "")), []);
 assert.deepEqual(ids(api.quoteDraftPackChoices([pack, { ...pack, name: "Different", description: "Different", labourDescription: "Different", materials: [] }], "extra")), []);
 for (const query of ["secret", "8765.4321", "pack-id", "private scope"]) assert.deepEqual(ids(api.quoteDraftPackChoices([pack], query)), []);
});
test("job-pack public work descriptions and material descriptions are searchable without mutating source order", () => {
 const later = { ...pack, id: "other", name: "Zebra work", description: "Other work", materials: [] }, source = Object.freeze([later, pack]);
 assert.deepEqual(ids(api.quoteDraftPackChoices(source, "DOMESTIC back box")), ["pack-id"]);
 assert.deepEqual(ids(api.quoteDraftPackChoices(source, "accessory")), ["pack-id", "other"]);
 assert.deepEqual(ids(api.quoteDraftPackChoices(source, "   ")), ["pack-id", "other"]);
 assert.deepEqual(ids(source), ["other", "pack-id"]);
 const materials = Object.freeze([light, socket]); assert.deepEqual(ids(api.quoteDraftMaterialChoices(materials, "")), ["socket-id", "light-id"]); assert.deepEqual(ids(materials), ["light-id", "socket-id"]);
});
test("malformed and duplicate supplier references cannot be searched or chosen and unsafe URLs stay inert", () => {
 const bad = { ...socket, supplierUrl: "javascript:private-script", supplierOptions: [socket.supplierOptions[0], { ...socket.supplierOptions[0] }, { id: "invalid", supplier: "Toolstation", stockCode: { private: "bad" }, supplierUrl: "https://user:pass@example.com/private" }] };
 for (const query of ["002-z5", "screwfix", "private-script", "user:pass", "object Object"]) assert.deepEqual(ids(api.quoteDraftMaterialChoices([bad], query)), []);
 assert.throws(() => api.quoteDraftMaterialProduct(bad, "second"), /reference|wholesaler/i);
 assert.throws(() => api.quoteDraftMaterialProduct(bad, "invalid"), /reference|wholesaler/i);
 assert.equal(api.quoteDraftMaterialProduct(bad, "preferred").supplierUrl, "");
 assert.doesNotThrow(() => api.quoteDraftPackChoices([{ ...pack, materials: [null, { description: { private: "bad" } }] }], "extra"));
});
test("choosing an alternate wholesaler changes only public new-line references and keeps exact financial allowances", () => {
 const before = structuredClone(socket), product = api.quoteDraftMaterialProduct(socket, "second");
 assert.deepEqual({ ...product }, { name: "Double socket", supplier: "Screwfix", stockCode: "002-Z5", supplierUrl: "https://www.screwfix.com/product?id=100" });
 const result = materialQuoteDraftLine({ ...socket, ...product }, "new-line");
 assert.equal(result.line.materialId, "socket-id"); assert.equal(result.line.unitCost, 4.123); assert.equal(result.line.unitPrice, 9.875); assert.equal(result.line.supplier, "Screwfix"); assert.equal(result.line.stockCode, "002-Z5"); assert.equal(result.line.supplierUrl, undefined);
 assert.doesNotMatch(JSON.stringify(product), /secret|tradeCost|sellPrice|supplierOptions/); assert.deepEqual(socket, before);
});
test("preferred choice never silently substitutes another wholesaler when no preferred product is saved", () => {
 const noPreferred = { ...socket, supplier: "", stockCode: "", supplierUrl: "" };
 const product = api.quoteDraftMaterialProduct(noPreferred, "preferred"); assert.equal(product.supplier, ""); assert.equal(product.stockCode, ""); assert.equal(product.supplierUrl, "");
 assert.equal(api.quoteDraftMaterialProduct(noPreferred, "second").supplier, "Screwfix");
 for (const id of ["", "removed", "other"]) assert.throws(() => api.quoteDraftMaterialProduct(socket, id), /reference|wholesaler/i);
 for (const bad of [{ ...socket, id: "" }, { ...socket, name: " " }]) assert.throws(() => api.quoteDraftMaterialProduct(bad, "preferred"));
});
