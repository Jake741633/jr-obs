import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { privateBridgeHarness } from "./helpers/private-file-bridge-harness.mjs";

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
  assert.match(privateFiles, /privateAttachmentDownloadCacheKey\(identity, photo\)/);
  assert.match(privateFiles, /privateAttachmentDownloadCacheKey\(identity, record\)/);
  assert.match(privateFiles, /privateDownloadCacheKey\(identity, record\.id\)/);
  assert.match(privateFiles, /URL\.revokeObjectURL\(url\)/);
});

test("replacement attachment IDs cannot reuse cached bytes for documents, receipts or survey photos", async () => {
  for (const storageKey of ["jr-os-job-documents", "jr-os-expenses", "jr-os-surveys"]) {
    const original = { id: "photo-1", privateStoragePath: "org-1/job-1/photo.jpg", privateFileId: "file-a" };
    const collection = record => storageKey === "jr-os-surveys" ? [{ id: "survey-1", photos: [record] }] : [record];
    const attachment = records => storageKey === "jr-os-surveys" ? records[0].photos[0] : records[0];
    const h = privateBridgeHarness(collection(original), storageKey); h.render();
    const oldUrl = attachment(await h.settled()).signedDownloadUrl; assert.ok(oldUrl);
    h.props.items = collection({ ...original, privateFileId: "file-b" });
    assert.equal(attachment(h.render()).signedDownloadUrl, undefined, storageKey);
    const newUrl = attachment(await h.settled()).signedDownloadUrl;
    assert.ok(newUrl); assert.notEqual(newUrl, oldUrl); assert.equal(h.downloads.length, 2);
    h.unmount(); assert.ok(h.revoked.includes(oldUrl)); assert.ok(h.revoked.includes(newUrl));
  }
});

test("a replaced attachment's pending download cannot hydrate the new record", async () => {
  const original = { id: "photo-1", privateStoragePath: "org-1/job-1/photo-a.jpg", privateFileId: "file-a" };
  const h = privateBridgeHarness([original]); let finishOld;
  h.download(path => path === original.privateStoragePath ? new Promise(resolve => { finishOld = resolve; }) : Promise.resolve(new Blob(["new photo"], { type: "image/jpeg" })));
  h.render(); h.props.items = [{ ...original, privateStoragePath: "org-1/job-1/photo-b.jpg", privateFileId: "file-b" }];
  assert.equal(h.render()[0].signedDownloadUrl, undefined);
  const currentUrl = (await h.settled())[0].signedDownloadUrl;
  assert.equal(await h.blobs.get(currentUrl).text(), "new photo");
  finishOld(new Blob(["old photo"], { type: "image/jpeg" }));
  assert.equal((await h.settled())[0].signedDownloadUrl, currentUrl);
  assert.equal(h.revoked.length, 1); assert.equal(h.blobs.size, 1);
  h.unmount(); assert.equal(h.blobs.size, 0);
});
