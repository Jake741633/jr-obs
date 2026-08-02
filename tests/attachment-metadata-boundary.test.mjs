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

test("attachment uploads and downloads validate object ownership before cloud access", () => {
  assert.match(privateFiles, /assertOrganisationPrivateObjectPath\(item\.organisationId, item\.objectPath\)/);
  assert.match(privateFiles, /export async function signedPrivateDownloadUrl\(objectPath: string, organisationId: string/);
  assert.match(privateFiles, /assertOrganisationPrivateObjectPath\(organisationId, objectPath\)/);
  assert.match(privateFiles, /createSignedDownload\(objectPath, expiresIn\)/);
});

test("signed attachment cache identity includes both organisation and source id", () => {
  assert.match(privateFiles, /privateSignedUrlCacheKey\(organisationId: string, sourceId: string\)/);
  assert.match(privateFiles, /encodeURIComponent\(organisationId\).*encodeURIComponent\(sourceId\)/s);
  assert.doesNotMatch(privateFiles, /setSignedUrls\(\(current\) => \(\{ \.\.\.current, \[queued\.sourceId\]/);
});
