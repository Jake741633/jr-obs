import assert from "node:assert/strict";
import test from "node:test";
import { scopedBusinessStorageKey } from "../lib/cloud/migrationStoragePolicy-core.mjs";

test("authenticated backup exports recognise encoded organisation storage suffixes", () => {
  const organisationOnly = `jr-os-customers:organisation:${JSON.stringify(["org-b"])}`;
  const accountScoped = `${organisationOnly}:account:${JSON.stringify(["user-b", "owner", null])}`;
  assert.deepEqual(scopedBusinessStorageKey(organisationOnly), { baseStorageKey: "jr-os-customers", organisationId: "org-b", accountScoped: false });
  assert.deepEqual(scopedBusinessStorageKey(accountScoped), { baseStorageKey: "jr-os-customers", organisationId: "org-b", accountScoped: true });
  assert.equal(scopedBusinessStorageKey("jr-os-customers:organisation:org-b"), null);
  assert.equal(scopedBusinessStorageKey(`jr-os-unknown:organisation:${JSON.stringify(["org-b"])}`), null);
});
