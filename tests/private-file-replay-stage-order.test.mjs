import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { replayPrivateUploadStages } from "../lib/cloud/privateUploadReplay-core.mjs";

function replayHarness(options = {}) {
  const stages = [];
  let authorizationCurrent = options.authorizationCurrent ?? true;
  let authorizationAttempt = 0;
  const run = () => replayPrivateUploadStages({
    authorizationIsCurrent: () => authorizationCurrent,
    revalidateAuthorization: async () => {
      stages.push("authorization");
      const result = options.revalidationResults?.[authorizationAttempt]
        ?? options.revalidationResult
        ?? true;
      authorizationAttempt += 1;
      return result;
    },
    upsertMetadata: async () => {
      stages.push("metadata");
      if (options.metadataError) throw options.metadataError;
      if (options.switchAfterMetadata) authorizationCurrent = false;
      return { id: "private-file-id" };
    },
    uploadObject: async () => {
      stages.push("object");
      if (options.objectError) throw options.objectError;
      if (options.switchDuringObject) authorizationCurrent = false;
    },
  });
  return { run, stages };
}

test("private replay registers metadata before the idempotent object transfer", async () => {
  const replay = replayHarness();
  assert.deepEqual(await replay.run(), { id: "private-file-id" });
  assert.deepEqual(replay.stages, ["authorization", "metadata", "authorization", "object", "authorization"]);
});

test("metadata failure never attempts a private object write", async () => {
  const replay = replayHarness({ metadataError: new Error("metadata rejected") });
  await assert.rejects(replay.run(), /metadata rejected/);
  assert.deepEqual(replay.stages, ["authorization", "metadata"]);
});

test("authorization replacement between metadata and object stages fails closed", async () => {
  const replay = replayHarness({ switchAfterMetadata: true });
  await assert.rejects(replay.run(), /authorisation changed before object upload/i);
  assert.deepEqual(replay.stages, ["authorization", "metadata"]);
});

test("authorization replacement during object upload cannot confirm replay", async () => {
  const replay = replayHarness({ switchDuringObject: true });
  await assert.rejects(replay.run(), /authorisation changed before upload confirmation/i);
  assert.deepEqual(replay.stages, ["authorization", "metadata", "authorization", "object"]);
});

test("live authorization is revalidated again after metadata completes", async () => {
  const replay = replayHarness({ revalidationResults: [true, false] });
  await assert.rejects(replay.run(), /authorisation changed before object upload/i);
  assert.deepEqual(replay.stages, ["authorization", "metadata", "authorization"]);
});

test("live authorization is revalidated before a completed upload is confirmed", async () => {
  const replay = replayHarness({ revalidationResults: [true, true, false] });
  await assert.rejects(replay.run(), /authorisation changed before upload confirmation/i);
  assert.deepEqual(replay.stages, ["authorization", "metadata", "authorization", "object", "authorization"]);
});

test("inactive or stale authorization reaches neither write stage", async () => {
  const inactive = replayHarness({ authorizationCurrent: false });
  await assert.rejects(inactive.run(), /authorisation changed before replay/i);
  assert.deepEqual(inactive.stages, []);

  const stale = replayHarness({ revalidationResult: false });
  await assert.rejects(stale.run(), /authorisation changed before replay/i);
  assert.deepEqual(stale.stages, ["authorization"]);
});

test("production retry ordering is protected by metadata-bound Storage RLS", () => {
  const privateFiles = readFileSync(new URL("../lib/cloud/privateFiles.ts", import.meta.url), "utf8");
  const client = readFileSync(new URL("../lib/cloud/client.ts", import.meta.url), "utf8");
  const policy = readFileSync(
    new URL("../supabase/migrations/20260809_056_private_file_role_scope.sql", import.meta.url),
    "utf8",
  );

  assert.match(privateFiles, /replayPrivateUploadStages\(\{[\s\S]*cloudUpsert<PrivateFileMetadata>[\s\S]*uploadPrivateObject/);
  assert.match(client, /uploadPrivateObject[\s\S]*"x-upsert": "true"/);
  assert.match(
    policy,
    /create policy jr_private_update[\s\S]*exists \([\s\S]*from public\.private_files file[\s\S]*file\.object_path = name[\s\S]*private\.jr_can_write_private_file\(file\.storage_key\)/i,
  );
});
