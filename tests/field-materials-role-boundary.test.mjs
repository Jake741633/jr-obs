import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { collectionCloudMutationRoute } from "../lib/cloud/fieldMutationPolicy-core.mjs";

const page = readFileSync(new URL("../app/field/materials/page.tsx", import.meta.url), "utf8");

test("materials write lock applies only to cloud electrician sessions", () => {
  assert.match(page, /identityState\.mode !== "local" && identityState\.identity\?\.role === "electrician"/);
  assert.doesNotMatch(page, /const cloudFieldMode = identityState\.mode !== "local";/);
});

test("materials collections stay denied for electricians while office roles retain direct writes", () => {
  for (const collectionKey of ["jr-os-stock-items", "jr-os-stock-movements", "jr-os-purchase-lists", "jr-os-job-material-usage"]) {
    assert.deepEqual(collectionCloudMutationRoute("cloud_collections", "electrician", collectionKey), { kind: "deny" });
    assert.deepEqual(collectionCloudMutationRoute("cloud_collections", "admin", collectionKey), { kind: "direct" });
  }
});
