import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const page = await readFile(new URL("../app/cloud/queue/page.tsx", import.meta.url), "utf8");
const navigation = await readFile(new URL("../components/navigation.ts", import.meta.url), "utf8");

test("sync queue diagnostics expose the exact failed operation", () => {
  assert.match(page, /getSyncQueue/);
  assert.match(page, /flushSyncQueue/);
  assert.match(page, /Exact error/);
  assert.match(page, /item\.table/);
  assert.match(page, /item\.sourceId/);
  assert.match(page, /item\.storageKey/);
  assert.match(page, /item\.operation/);
  assert.match(page, /item\.attempts/);
});

test("sync queue diagnostics are reachable from navigation", () => {
  assert.match(navigation, /Sync Queue Diagnostics/);
  assert.match(navigation, /\/cloud\/queue/);
});
