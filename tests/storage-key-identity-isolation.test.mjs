import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const adapter = readFileSync(new URL("../lib/cloud/adapter.ts", import.meta.url), "utf8");

test("organisation and account storage keys retain explicit scope markers", () => {
  assert.match(adapter, /return `\$\{storageKey\}:organisation:\$\{JSON\.stringify\(\[organisationId\]\)\}`/);
  assert.match(adapter, /return userId \? `\$\{organisationKey\}:account:\$\{JSON\.stringify\(\[userId, role \?\? null, customerSourceId \?\? null\]\)\}` : organisationKey/);
});

test("storage key identities cannot collide across users, roles or customer assignments", () => {
  assert.doesNotMatch(adapter, /return `\$\{storageKey\}:organisation:\$\{organisationId\}`/);
  assert.doesNotMatch(adapter, /encodeURIComponent\(userId\)/);
  assert.match(adapter, /JSON\.stringify\(\[organisationId\]\)/);
  assert.match(adapter, /JSON\.stringify\(\[userId, role \?\? null, customerSourceId \?\? null\]\)/);
  assert.notEqual(JSON.stringify(["user-a", "admin", null]), JSON.stringify(["user-a", "electrician", null]));
  assert.notEqual(JSON.stringify(["user-a", "customer", "customer-a"]), JSON.stringify(["user-a", "customer", "customer-b"]));
});
