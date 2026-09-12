import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { canAccessPath } from "../lib/cloud/permissions.ts";

const fieldLookup = readFileSync(new URL("../app/field/material-lookup/page.tsx", import.meta.url), "utf8");
const materialsPage = readFileSync(new URL("../app/materials/page.tsx", import.meta.url), "utf8");
const navigation = readFileSync(new URL("../components/navigation.ts", import.meta.url), "utf8");
const lookupRoute = readFileSync(new URL("../app/api/materials/lookup/route.ts", import.meta.url), "utf8");

test("electricians use read-only field supplier lookup instead of materials authoring", () => {
  assert.equal(canAccessPath("electrician", "/materials"), false);
  assert.equal(canAccessPath("electrician", "/field/material-lookup"), true);
  assert.match(materialsPage, /materials\.setItems/);
  assert.doesNotMatch(fieldLookup, /materials\.setItems/);
  assert.doesNotMatch(fieldLookup, /useMaterialsCollection/);
});

test("field lookup reuses authenticated supplier endpoint without creating catalogue records", () => {
  assert.match(fieldLookup, /fetch\("\/api\/materials\/lookup"/);
  assert.match(fieldLookup, /Authorization: `Bearer \$\{session\.access_token\}`/);
  assert.match(fieldLookup, /Results are read-only in the field workspace/);
  assert.match(fieldLookup, /Field supplier lookup never creates or edits the canonical materials catalogue/);
  assert.match(lookupRoute, /"electrician"/);
});

test("field supplier lookup is discoverable and office roles keep materials authoring", () => {
  assert.match(navigation, /\["Supplier Material Lookup", "\/field\/material-lookup"\]/);
  assert.equal(canAccessPath("office", "/materials"), true);
  assert.equal(canAccessPath("owner", "/materials"), true);
  assert.equal(canAccessPath("admin", "/materials"), true);
});
