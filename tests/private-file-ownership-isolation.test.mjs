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

test("private upload queues do not cross authorisation boundaries", () => {
  assert.match(privateFiles, /readPrivateUploadQueue\(identity\)/);
  assert.match(privateFiles, /const preserved = allQueue\.filter\(\(item\) => !privateUploadMatchesAuthorization\(item, authorization\)\)/);
  assert.match(privateFiles, /const activeQueue = allQueue\.filter\(\(item\) => privateUploadMatchesAuthorization\(item, authorization\)\)/);
  assert.match(privateFiles, /flushPrivateFileUploadQueue\(identity,/);
  assert.match(privateFiles, /writeQueue\(\[\.\.\.preserved, \.\.\.remaining\]\)/);
});

test("private upload replay stops when active or live authorisation changes", () => {
  assert.match(privateFiles, /function activeReplayOwnerMatches\(authorization: SyncAuthorizationContext\)/);
  assert.match(privateFiles, /readSupabaseSession\(\)\?\.user\?\.id === authorization\.userId/);
  assert.match(privateFiles, /activeSyncAuthorizationMatches\(authorization\)/);
  assert.match(privateFiles, /revalidateSyncAuthorization\(authorization\)/);
  assert.match(privateFiles, /for \(const \[index, item\] of activeQueue\.entries\(\)\) \{\s*if \(!activeReplayOwnerMatches\(authorization\)\) \{\s*remaining\.push\(\.\.\.activeQueue\.slice\(index\)\);\s*break;/s);
  assert.match(privateFiles, /const result = await uploadQueuedPrivateFile[\s\S]*if \(!activeReplayOwnerMatches\(authorization\)\) \{[\s\S]*remaining\.push\(\.\.\.activeQueue\.slice\(index \+ 1\)\);[\s\S]*break;/);
  assert.match(privateFiles, /if \(result\.state === "Synced"\) onSynced\?\.\(item, result\)/);
});

test("private upload queue identities cannot collide across tuple boundaries", () => {
  assert.match(privateFiles, /privateUploadQueueItemId\(organisationId: string, userId: string, role: string, customerSourceId: string \| undefined, storageKey: string, sourceId: string\)/);
  assert.match(privateFiles, /return JSON\.stringify\(\[organisationId, userId, role, customerSourceId \?\? null, storageKey, sourceId\]\)/);
  assert.match(privateFiles, /id: privateUploadQueueItemId\(item\.organisationId, item\.userId, item\.authorizationRole, item\.authorizationCustomerSourceId, item\.storageKey, item\.sourceId\)/);
  assert.notEqual(JSON.stringify(["org", "user", "admin", null, "files", "file"]), JSON.stringify(["org", "user", "electrician", null, "files", "file"]));
  assert.notEqual(JSON.stringify(["org", "user", "customer", "customer-a", "files", "file"]), JSON.stringify(["org", "user", "customer", "customer-b", "files", "file"]));
  assert.doesNotMatch(privateFiles, /id: `\$\{item\.organisationId\}:\$\{item\.userId\}:\$\{item\.storageKey\}:\$\{item\.sourceId\}`/);
});

test("private object paths must belong to the active organisation", () => {
  assert.match(privateFiles, /return objectPath\.startsWith\(organisationObjectPrefix\(organisationId\)\)/);
  assert.match(privateFiles, /!objectPath\.includes\("\.\.\/"\)/);
  assert.match(privateFiles, /!objectPath\.startsWith\("\/"\)/);
  assert.match(privateFiles, /throw new Error\("The private file does not belong to the active organisation\."\)/);
  assert.match(privateFiles, /assertOrganisationPrivateObjectPath\(organisationId, objectPath\);\s*const file = await downloadPrivateObject/s);
});

test("authenticated object URLs are authorisation-context keyed and revoked", () => {
  assert.match(privateFiles, /privateDownloadCacheKey\(identity: CloudIdentity, sourceId: string\)/);
  assert.match(privateFiles, /return JSON\.stringify\(\[identity\.organisationId, identity\.userId, identity\.role, identity\.customerSourceId \?\? null, sourceId\]\)/);
  assert.match(privateFiles, /URL\.createObjectURL\(file\)/);
  assert.match(privateFiles, /URL\.revokeObjectURL\(url\)/);
});

test("download cache identities cannot collide across authorisation or source boundaries", () => {
  assert.match(privateFiles, /return JSON\.stringify\(\[identity\.organisationId, identity\.userId, identity\.role, identity\.customerSourceId \?\? null, sourceId\]\)/);
  assert.notEqual(JSON.stringify(["org", "user", "admin", null, "file"]), JSON.stringify(["org", "user", "electrician", null, "file"]));
  assert.notEqual(JSON.stringify(["org", "user", "customer", "customer-a", "file"]), JSON.stringify(["org", "user", "customer", "customer-b", "file"]));
  assert.doesNotMatch(privateFiles, /return `\$\{encodeURIComponent\(organisationId\)\}:\$\{encodeURIComponent\(sourceId\)\}`/);
});

test("cloud payloads cannot leak embedded private bytes or stale signed links", () => {
  assert.match(privateFiles, /delete safe\.dataUrl;/);
  assert.match(privateFiles, /delete safe\.receiptDataUrl;/);
  assert.match(privateFiles, /delete safe\.signedDownloadUrl;/);
  assert.match(privateFiles, /record\.photos = record\.photos\.map\(\(photo\) => stripPrivateBytes\(photo\)\)/);
});
