import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { collectionCloudMutationRoute } from "../lib/cloud/fieldMutationPolicy-core.mjs";

const page = readFileSync(new URL("../app/field/site-diary/page.tsx", import.meta.url), "utf8");

test("site diary server-bound field mode applies only to cloud electricians", () => {
  assert.match(page, /identityState\.mode !== "local" && identityState\.identity\?\.role === "electrician"/);
  assert.match(page, /const serverBoundLabour = cloudFieldMode;/);
  assert.doesNotMatch(page, /const cloudFieldMode = identityState\.mode !== "local";/);
});

test("site diary writes remain field-RPC bound for electricians and direct for office roles", () => {
  assert.deepEqual(collectionCloudMutationRoute("cloud_collections", "electrician", "jr-os-site-diaries"), {
    kind: "rpc",
    functionName: "jr_field_save_collection",
    resource: "cloud_collections",
    allowedIntents: ["create"],
  });
  assert.deepEqual(collectionCloudMutationRoute("cloud_collections", "admin", "jr-os-site-diaries"), { kind: "direct" });
});
