import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const repositorySource = await readFile(new URL("../lib/cloud/repository.ts", import.meta.url), "utf8");

test("sync status is derived from the current queue instead of stale stored state", () => {
  assert.match(repositorySource, /function statusForQueue\(queue: SyncQueueItem\[\]\): SyncState/);
  assert.match(repositorySource, /if \(!queue\.length\) return "Synced";/);
  assert.match(repositorySource, /get\(\): SyncState \{\s*const derived = navigator\.onLine \? statusForQueue\(getSyncQueue\(\)\) : "Offline";/s);
  assert.match(repositorySource, /if \(stored !== derived\) write\(STATUS_KEY, derived\);/);
  assert.match(repositorySource, /return derived;/);
});

test("genuine unresolved conflicts still take priority over other queued states", () => {
  const conflictIndex = repositorySource.indexOf('item.state === "Conflict"');
  const failedIndex = repositorySource.indexOf('item.state === "Failed"');
  const offlineIndex = repositorySource.indexOf('item.state === "Offline"');

  assert.ok(conflictIndex >= 0, "Conflict handling must remain present");
  assert.ok(failedIndex > conflictIndex, "Conflict must take priority over failed state");
  assert.ok(offlineIndex > failedIndex, "Failed must take priority over offline state");
});

test("queue mutations continue recalculating and publishing sync state", () => {
  assert.match(repositorySource, /syncStatus\.set\(statusForQueue\(next\)\);/);
  assert.match(repositorySource, /syncStatus\.set\(statusForQueue\(remaining\)\);/);
  assert.match(repositorySource, /window\.dispatchEvent\(new CustomEvent\("jr-os-sync-status", \{ detail: value \}\)\);/);
});
