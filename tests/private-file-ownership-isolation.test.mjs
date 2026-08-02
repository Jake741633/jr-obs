import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const privateFiles = readFileSync(new URL("../lib/cloud/privateFiles.ts", import.meta.url), "utf8");

test("private uploads and metadata remain organisation scoped", () => {
  assert.match(privateFiles, /organisationId: identity\.organisationId/);
  assert.match(privateFiles, /organisation_id: item\.organisationId/);
  assert.match(privateFiles, /objectPath: privateObjectPath\(identity\.organisationId,/);
  assert.match(privateFiles, /assertOrganisationPrivateObjectPath\(item\.organisationId, item\.objectPath\)/);
});

test("private upload queues do not cross tenant boundaries", () => {
  assert.match(privateFiles, /readPrivateUploadQueue\(identity\.organisationId\)/);
  assert.match(privateFiles, /const preserved = allQueue\.filter\(\(item\) => item\.organisationId !== organisationId\)/);
  assert.match(privateFiles, /const activeQueue = allQueue\.filter\(\(item\) => item\.organisationId === organisationId\)/);
  assert.match(privateFiles, /writeQueue\(\[\.\.\.preserved, \.\.\.remaining\]\)/);
});

test("private object paths must belong to the active organisation", () => {
  assert.match(privateFiles, /return objectPath\.startsWith\(organisationObjectPrefix\(organisationId\)\)/);
  assert.match(privateFiles, /!objectPath\.includes\("\.\.\/"\)/);
  assert.match(privateFiles, /!objectPath\.startsWith\("\/"\)/);
  assert.match(privateFiles, /throw new Error\("The private file does not belong to the active organisation\."\)/);
  assert.match(privateFiles, /assertOrganisationPrivateObjectPath\(organisationId, objectPath\);\s*const boundedExpiry/s);
});

test("signed download URLs are tenant keyed and short lived", () => {
  assert.match(privateFiles, /privateSignedUrlCacheKey\(organisationId: string, sourceId: string\)/);
  assert.match(privateFiles, /encodeURIComponent\(organisationId\)/);
  assert.match(privateFiles, /const boundedExpiry = Math\.min\(300, Math\.max\(60, Math\.floor\(expiresIn\)\)\)/);
  assert.match(privateFiles, /createSignedDownload\(objectPath, boundedExpiry\)/);
});

test("cloud payloads cannot leak embedded private bytes or stale signed links", () => {
  assert.match(privateFiles, /delete safe\.dataUrl;/);
  assert.match(privateFiles, /delete safe\.receiptDataUrl;/);
  assert.match(privateFiles, /delete safe\.signedDownloadUrl;/);
  assert.match(privateFiles, /record\.photos = record\.photos\.map\(\(photo\) => stripPrivateBytes\(photo\)\)/);
});
