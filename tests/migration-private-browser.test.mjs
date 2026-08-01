import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

const adapter = fs.readFileSync(new URL("../lib/cloud/adapter.ts", import.meta.url), "utf8");

test("fresh browsers hydrate migrated records from cloud without enabling cloud mode", () => {
  assert.match(adapter, /if \(mode === "local" \|\| !navigator\.onLine\) return local/);
  assert.match(adapter, /if \(mode === "migration" && local\.length > 0\) return local/);
  assert.match(adapter, /const rows = await cloudSelect/);
  assert.match(adapter, /writeLocal\(storageKey, cloudRecords\)/);
});

test("existing migration browser keeps its local collection authoritative", () => {
  const migrationGuard = adapter.indexOf('if (mode === "migration" && local.length > 0) return local;');
  const cloudRead = adapter.indexOf("const rows = await cloudSelect");
  assert.ok(migrationGuard >= 0);
  assert.ok(cloudRead > migrationGuard);
});
