import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { collectionCloudMutationRoute } from "../lib/cloud/fieldMutationPolicy-core.mjs";

const page = readFileSync(new URL("../app/field/snags/page.tsx", import.meta.url), "utf8");

test("snag field identity binding applies only to cloud electrician sessions", () => {
  assert.match(page, /identityState\.mode !== "local" && identityState\.identity\?\.role === "electrician"/);
  assert.doesNotMatch(page, /const cloudFieldMode = identityState\.mode !== "local";/);
});

test("snag task and timeline routes stay field-RPC bound for electricians and direct for office roles", () => {
  assert.deepEqual(collectionCloudMutationRoute("cloud_collections", "electrician", "jr-os-job-tasks"), {
    kind: "rpc",
    functionName: "jr_field_save_collection",
    resource: "cloud_collections",
    allowedIntents: ["create", "update"],
  });
  assert.deepEqual(collectionCloudMutationRoute("cloud_collections", "electrician", "jr-os-job-timeline"), {
    kind: "rpc",
    functionName: "jr_field_save_collection",
    resource: "cloud_collections",
    allowedIntents: ["create"],
  });
  assert.deepEqual(collectionCloudMutationRoute("cloud_collections", "admin", "jr-os-job-tasks"), { kind: "direct" });
  assert.deepEqual(collectionCloudMutationRoute("cloud_collections", "admin", "jr-os-job-timeline"), { kind: "direct" });
});
