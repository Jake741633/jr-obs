import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { collectionCloudMutationRoute } from "../lib/cloud/fieldMutationPolicy-core.mjs";

const page = readFileSync(new URL("../app/field/testing/page.tsx", import.meta.url), "utf8");
const migrationPolicy = readFileSync(new URL("../lib/cloud/migrationStoragePolicy-core.mjs", import.meta.url), "utf8");

test("cloud electricians keep testing drafts out of canonical cloud mutation", () => {
  assert.match(page, /const fieldTestingDraftStorageKey = "jr-os-field-electrical-testing-drafts";/);
  assert.match(page, /identityState\.mode !== "local" && identityState\.identity\?\.role === "electrician"/);
  assert.match(page, /const localTestingMode = fieldMode \|\| identityState\.mode === "local";/);
  assert.match(page, /const records = fieldMode \? fieldDraftRecords : canonicalRecords;/);
  assert.doesNotMatch(migrationPolicy, /jr-os-field-electrical-testing-drafts/);

  const canonicalTestingRoute = collectionCloudMutationRoute("cloud_collections", "electrician", "jr-os-electrical-testing");
  assert.deepEqual(canonicalTestingRoute, { kind: "deny" });
});

test("local and office testing still use the canonical testing collection", () => {
  assert.match(page, /const canonicalRecords = useElectricalTestingCollection\(\);/);
  assert.match(page, /const fieldMode = identityState\.mode !== "local"/);
});

test("testing storage copy distinguishes device-local drafts from canonical cloud records", () => {
  assert.match(page, /localTestingMode \? "Testing draft saved locally\. You can leave and resume it later\." : "Testing record saved and queued for secure cloud sync\."/);
  assert.match(page, /localTestingMode \? "Saved testing drafts" : "Saved testing records"/);
  assert.match(page, /localTestingMode \? "Resume records stored on this device\." : "Resume canonical testing records available through secure cloud sync\."/);
  assert.match(page, /localTestingMode \? "Save testing draft" : "Save testing record"/);
});
