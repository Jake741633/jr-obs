import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const storage = readFileSync(new URL("../lib/storage.ts", import.meta.url), "utf8");
const privateFiles = readFileSync(new URL("../lib/cloud/privateFiles.ts", import.meta.url), "utf8");

test("private file bridge receives the base allowlisted collection key", () => {
  assert.match(storage, /usePrivateFileCollectionBridge\(\{ storageKey: key, items, setItems, isReady, identity, mode \}\)/);
  assert.doesNotMatch(storage, /usePrivateFileCollectionBridge\(\{ storageKey: activeStorageKey/);
  assert.match(privateFiles, /\["jr-os-job-documents", "jr-os-expenses", "jr-os-surveys"\]\.includes\(storageKey\)/);
});

test("private file queues remain authorisation scoped when using base collection keys", () => {
  assert.match(privateFiles, /readPrivateUploadQueue\(identity\)/);
  assert.match(privateFiles, /\.filter\(\(item\) => item\.storageKey === storageKey\)/);
  assert.match(privateFiles, /flushPrivateFileUploadQueue\(identity, storageKey,/);
  assert.match(privateFiles, /queued\.storageKey !== storageKey/);
});

test("authenticated download cache remains authorisation scoped independently of collection keys", () => {
  assert.match(privateFiles, /privateDownloadCacheKey\(identity, photo\.id\)/);
  assert.match(privateFiles, /privateDownloadCacheKey\(identity, record\.id\)/);
  assert.match(privateFiles, /URL\.revokeObjectURL\(url\)/);
});
