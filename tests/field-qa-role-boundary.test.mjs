import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { collectionCloudMutationRoute } from "../lib/cloud/fieldMutationPolicy-core.mjs";

const page = readFileSync(new URL("../app/field/qa/page.tsx", import.meta.url), "utf8");

test("QA write lock applies only to cloud electrician sessions", () => {
  assert.match(page, /identityState\.mode !== "local" && identityState\.identity\?\.role === "electrician"/);
  assert.doesNotMatch(page, /const cloudFieldMode = identityState\.mode !== "local";/);
});

test("QA collection stays denied for electricians while office roles keep the normal cloud route", () => {
  assert.deepEqual(
    collectionCloudMutationRoute("cloud_collections", "electrician", "jr-os-job-qa-inspections"),
    { kind: "deny" },
  );
  assert.deepEqual(
    collectionCloudMutationRoute("cloud_collections", "admin", "jr-os-job-qa-inspections"),
    { kind: "direct" },
  );
});
