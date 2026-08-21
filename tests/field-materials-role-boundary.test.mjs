import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { collectionCloudMutationRoute } from "../lib/cloud/fieldMutationPolicy-core.mjs";

const page = readFileSync(new URL("../app/field/materials/page.tsx", import.meta.url), "utf8");

test("mobile materials locks unsupported cloud writes only for electricians", () => {
  assert.match(page, /const fieldMode = identityState\.mode !== "local" && identityState\.identity\?\.role === "electrician";/);
  assert.match(page, /if \(fieldMode\)/);
  assert.match(page, /\{!fieldMode \? <Card>/);

  for (const key of ["jr-os-stock-items", "jr-os-stock-movements", "jr-os-purchase-lists", "jr-os-job-material-usage"]) {
    assert.deepEqual(collectionCloudMutationRoute("cloud_collections", "electrician", key), { kind: "deny" });
    assert.deepEqual(collectionCloudMutationRoute("cloud_collections", "owner", key), { kind: "direct" });
    assert.deepEqual(collectionCloudMutationRoute("cloud_collections", "admin", key), { kind: "direct" });
  }
});
