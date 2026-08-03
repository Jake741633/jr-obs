import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const adapter = readFileSync(new URL("../lib/cloud/adapter.ts", import.meta.url), "utf8");

test("organisation and account storage keys retain explicit scope markers", () => {
  assert.match(adapter, /return `\$\{storageKey\}:organisation:\$\{JSON\.stringify\(\[organisationId\]\)\}`/);
  assert.match(adapter, /return userId \? `\$\{organisationKey\}:account:\$\{JSON\.stringify\(\[userId\]\)\}` : organisationKey/);
});

test("storage key identities cannot collide when identifiers contain scope markers", () => {
  assert.doesNotMatch(adapter, /return `\$\{storageKey\}:organisation:\$\{organisationId\}`/);
  assert.doesNotMatch(adapter, /encodeURIComponent\(userId\)/);
  assert.match(adapter, /JSON\.stringify\(\[organisationId\]\)/);
  assert.match(adapter, /JSON\.stringify\(\[userId\]\)/);
});
