import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const adapter = readFileSync(new URL("../lib/cloud/adapter.ts", import.meta.url), "utf8");

test("collection list queries encode the organisation identity before PostgREST filtering", () => {
  assert.match(adapter, /organisation_id=eq\.\$\{encodeURIComponent\(organisationId\)\}/);
  assert.doesNotMatch(adapter, /organisation_id=eq\.\$\{organisationId\}\$\{collectionFilter\}/);
});
