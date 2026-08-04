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

test("private upload replay stops when the active organisation changes", () => {
  assert.match(privateFiles, /for \(const \[index, item\] of activeQueue\.entries\(\)\) \{\s*if \(activeOrganisationId\(\) !== organisationId\) \{\s*remaining\.push\(\.\.\.activeQueue\.slice\(index\)\);\s*break;/s);
  assert.match(privateFiles, /const result = await uploadQueuedPrivateFile[\s\S]*if \(activeOrganisationId\(\) !== organisationId\) \{[\s\S]*remaining\.push\(\.\.\.activeQueue\.slice\(index \+ 1\)\);[\s\S]*break;/);
  assert.match(privateFiles, /if \(result\.state === "Synced"\) onSynced\?\.\(item, result\)/);
});

test("private upload queue identities cannot collide across tuple boundaries", () => {
  assert.match(privateFiles, /privateUploadQueueItemId\(organisationId: string, storageKey: string, sourceId: string\)/);
  assert.match(privateFiles, /return JSON\.stringify\(\[organisationId, storageKey, sourceId\]\)/);
  assert.match(privateFiles, /id: privateUploadQueueItemId\(item\.organisationId, item\.storageKey, item\.sourceId\)/);
  assert.doesNotMatch(privateFiles, /id: `\$\{item\.organisationId\}:\$\{item\.storageKey\}:\$\{item\.sourceId\}`/);
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
  assert.match(privateFiles, /return `\$\{encodeURIComponent\(organisationId\)\}:\$\{encodeURIComponent\(sourceId\)\}`/);
  assert.match(privateFiles, /const boundedExpiry = Math\.min\(300, Math\.max\(60, Math\.floor\(expiresIn\)\)\)/);
  assert.match(privateFiles, /createSignedDownload\(objectPath, boundedExpiry\)/);
});

test("signed download cache identities cannot collide across organisations", () => {
  assert.match(privateFiles, /encodeURIComponent\(organisationId\)\}:\$\{encodeURIComponent\(sourceId\)/);
  assert.doesNotMatch(privateFiles, /encodeURIComponent\(organisationId\)\}\$\{encodeURIComponent\(sourceId\)/);
});

test("cloud payloads cannot leak embedded private bytes or stale signed links", () => {
  assert.match(privateFiles, /delete safe\.dataUrl;/);
  assert.match(privateFiles, /delete safe\.receiptDataUrl;/);
  assert.match(privateFiles, /delete safe\.signedDownloadUrl;/);
  assert.match(privateFiles, /record\.photos = record\.photos\.map\(\(photo\) => stripPrivateBytes\(photo\)\)/);
});
