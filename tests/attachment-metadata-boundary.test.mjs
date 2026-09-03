import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const privateFiles = readFileSync(new URL("../lib/cloud/privateFiles.ts", import.meta.url), "utf8");

test("private file metadata is always bound to the active organisation and uploader", () => {
  assert.match(privateFiles, /organisation_id: item\.organisationId/);
  assert.match(privateFiles, /object_path: item\.objectPath/);
  assert.match(privateFiles, /created_by: item\.userId/);
  assert.match(privateFiles, /updated_by: item\.userId/);
  assert.match(privateFiles, /cloudUpsert<PrivateFileMetadata>\("private_files", \[metadata\]\)/);
});

test("existing attachment metadata cannot register a cross-organisation path", () => {
  assert.match(privateFiles, /export async function registerExistingPrivateFile\(metadata: PrivateFileMetadata\)/);
  assert.match(privateFiles, /assertOrganisationPrivateObjectPath\(metadata\.organisation_id, metadata\.object_path\)/);
  assert.match(privateFiles, /cloudInsert<PrivateFileMetadata>\("private_files", \[metadata\]\)/);
});

test("authenticated attachment transfers validate object ownership before cloud access", () => {
  assert.match(privateFiles, /assertOrganisationPrivateObjectPath\(item\.organisationId, item\.objectPath\)/);
  assert.match(privateFiles, /uploadPrivateObject\(item\.objectPath, blob, item\.mimeType\)/);
  assert.match(privateFiles, /export async function authenticatedPrivateDownloadUrl\(objectPath: string, organisationId: string/);
  assert.match(privateFiles, /assertOrganisationPrivateObjectPath\(organisationId, objectPath\)/);
  assert.match(privateFiles, /downloadPrivateObject\(objectPath\)/);
});

test("authenticated attachment cache identity includes organisation, user, role, customer and source id", () => {
  assert.match(privateFiles, /privateDownloadCacheKey\(identity: CloudIdentity, sourceId: string\)/);
  assert.match(privateFiles, /return JSON\.stringify\(\[identity\.organisationId, identity\.userId, identity\.role, identity\.customerSourceId \?\? null, sourceId\]\)/);
  assert.doesNotMatch(privateFiles, /setDownloadUrls\(\(current\) => \(\{ \.\.\.current, \[queued\.sourceId\]/);
});
