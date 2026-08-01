import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../app/cloud/page.tsx", import.meta.url), "utf8");
const cloudSync = readFileSync(new URL("../lib/cloudSync.ts", import.meta.url), "utf8");

function functionBody(source, name, nextMarker) {
  const start = source.indexOf(`function ${name}`);
  assert.notEqual(start, -1, `${name} must exist`);
  const end = nextMarker ? source.indexOf(nextMarker, start) : source.length;
  assert.notEqual(end, -1, `${nextMarker} must exist after ${name}`);
  return source.slice(start, end);
}

test("typed import and legacy copy use distinct handlers", () => {
  const typed = functionBody(page, "importTypedRecords", "function copyLegacyBackup");
  const legacy = functionBody(page, "copyLegacyBackup", "function restoreLegacyBackup");
  assert.match(typed, /migrateTypedLocalDataToCloud\(setImportProgress\)/);
  assert.doesNotMatch(typed, /migrateLocalDataToCloud\(/);
  assert.match(legacy, /migrateLocalDataToCloud\(\)/);
  assert.doesNotMatch(legacy, /migrateTypedLocalDataToCloud\(/);
});

test("migration controls are non-submit actions and prevent reloads", () => {
  const boundaries = {
    importTypedRecords: "function copyLegacyBackup",
    copyLegacyBackup: "function restoreLegacyBackup",
    restoreLegacyBackup: "function retryPendingChanges",
    retryPendingChanges: "const unavailable",
  };
  for (const [handler, boundary] of Object.entries(boundaries)) {
    const body = functionBody(page, handler, boundary);
    assert.match(body, /event\.preventDefault\(\)/, `${handler} must prevent default browser submission`);
  }
  assert.match(page, /type="button"[^>]*onClick=\{importTypedRecords\}/);
  assert.match(page, /type="button"[^>]*onClick=\{copyLegacyBackup\}/);
  assert.match(page, /type="button"[^>]*onClick=\{restoreLegacyBackup\}/);
  assert.match(page, /type="button"[^>]*onClick=\{retryPendingChanges\}/);
});

test("each migration action has its own success result", () => {
  assert.match(page, /Typed cloud import complete\./);
  assert.match(page, /Legacy backup copy complete\./);
  assert.match(page, /Legacy backup restore complete\./);
  assert.match(page, /Pending-change retry complete\./);
  assert.match(page, /actionResults\["typed-import"\]/);
  assert.match(page, /actionResults\["legacy-copy"\]/);
  assert.match(page, /actionResults\["legacy-restore"\]/);
  assert.match(page, /actionResults\["retry-queue"\]/);
});

test("typed import displays live collection progress and counts", () => {
  assert.match(page, /Current collection:/);
  assert.match(page, /completedCollections/);
  assert.match(page, /importProgress\.imported/);
  assert.match(page, /importProgress\.skipped/);
  assert.match(page, /importProgress\.failed/);
  assert.match(cloudSync, /report\(storageKey, index\)/);
  assert.match(cloudSync, /failed: result\.errors\.length/);
});

test("typed import preserves table and PostgREST errors", () => {
  assert.match(cloudSync, /const detail = `\$\{storageKey\}: \$\{error instanceof Error \? error\.message/);
  assert.match(page, /result\.errors\.join\("\\n"\)/);
  assert.match(page, /throw new Error\(`\$\{summary\}\\n\$\{result\.errors\.join/);
});
