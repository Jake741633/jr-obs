import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { collectionCloudMutationRoute } from "../lib/cloud/fieldMutationPolicy-core.mjs";

const page = readFileSync(new URL("../app/field/page.tsx", import.meta.url), "utf8");
const privateFiles = readFileSync(new URL("../lib/cloud/privateFiles.ts", import.meta.url), "utf8");

test("main field workspace applies cloud field restrictions only to electricians", () => {
  assert.match(page, /identityState\.mode !== "local" && identityState\.identity\?\.role === "electrician"/);
  assert.doesNotMatch(page, /const cloudFieldMode = identityState\.mode !== "local";/);
  assert.match(page, /Completion uploads stay locked for cloud electrician sessions/);
});

test("unsupported completion writes remain denied for electricians and direct for office roles", () => {
  assert.deepEqual(collectionCloudMutationRoute("job_documents", "electrician"), { kind: "deny" });
  assert.deepEqual(collectionCloudMutationRoute("job_documents", "admin"), { kind: "direct" });
  assert.deepEqual(collectionCloudMutationRoute("cloud_collections", "electrician", "jr-os-job-timeline"), {
    kind: "rpc",
    functionName: "jr_field_save_collection",
    resource: "cloud_collections",
    allowedIntents: ["create"],
  });
  assert.deepEqual(collectionCloudMutationRoute("jobs", "electrician"), {
    kind: "rpc",
    functionName: "jr_field_update_job_status",
    resource: "jobs",
    allowedIntents: ["update"],
  });
});

test("office completion photos still pass through private-file byte stripping", () => {
  assert.match(privateFiles, /storageKey === "jr-os-job-documents" \|\| storageKey === "jr-os-expenses"/);
  assert.match(privateFiles, /delete safe\.dataUrl;/);
  assert.match(privateFiles, /supportedStorageKey\(storageKey\)/);
});
