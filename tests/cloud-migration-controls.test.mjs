import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../app/cloud/page.tsx", import.meta.url), "utf8");
const cloudSync = readFileSync(new URL("../lib/cloudSync.ts", import.meta.url), "utf8");

function functionBody(source, name, nextName) {
  const start = source.indexOf(`function ${name}`);
  assert.notEqual(start, -1, `${name} must exist`);
  const end = nextName ? source.indexOf(`function ${nextName}`, start) : source.length;
  assert.notEqual(end, -1, `${nextName} must exist after ${name}`);
  return source.slice(start, end);
}

test("typed import and legacy copy use distinct handlers", () => {
  const typed = functionBody(page, "importTypedRecords", "copyLegacyBackup");
  const legacy = functionBody(page, "copyLegacyBackup", "restoreLegacyBackup");
  assert.match(typed, /migrateTypedLocalDataToCloud\(setImportProgress\)/);
  assert.doesNotMatch(typed, /migrateLocalDataToCloud\(/);
  assert.match(legacy, /migrateLocalDataToCloud\(\)/);
  assert.doesNotMatch(legacy, /migrateTypedLocalDataToCloud\(/);
});

test("migration controls are non-submit actions and prevent reloads", () => {
  for (const handler of ["importTypedRecords", "copyLegacyBackup", "restoreLegacyBackup", "retryPendingChanges"]) {
    const body = functionBody(page, handler, handler === "importTypedRecords" ? "copyLegacyBackup" : handler === "copyLegacyBackup" ? "restoreLegacyBackup" : handler === "restoreLegacyBackup" ? "retryPendingChanges" : "const unavailable");
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
  assert.match(cloudSync, /currentCollection: storageKey/);
  assert.match(cloudSync, /failed: result\.errors\.length/);
});

test("typed import preserves table and PostgREST errors", () => {
  assert.match(cloudSync, /const detail = `\$\{storageKey\}: \$\{error instanceof Error \? error\.message/);
  assert.match(page, /result\.errors\.join\("\\n"\)/);
  assert.match(page, /throw new Error\(`\$\{summary\}\\n\$\{result\.errors\.join/);
});
