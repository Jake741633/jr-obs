import assert from "node:assert/strict";
import test from "node:test";
import {
  CABLE_SIZING_HISTORY_STORAGE_KEY,
  accountBackupStorageKeys,
  backupStorageScope,
  cloudCollectionStorageKeys,
  collectAccountBusinessData,
  isCompleteAccountStorageContext,
  organisationBackupStorageKeys,
  sameAccountStorageContext,
  scopedBackupStorageKey,
  scopedBusinessStorageKey,
} from "../lib/cloud/migrationStoragePolicy-core.mjs";

class FakeStorage {
  constructor(entries = []) { this.values = new Map(entries); }
  get length() { return this.values.size; }
  key(index) { return [...this.values.keys()][index] ?? null; }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
}

function organisationKey(storageKey, organisationId) {
  return `${storageKey}:organisation:${JSON.stringify([organisationId])}`;
}

function accountKey(storageKey, context) {
  return `${organisationKey(storageKey, context.organisationId)}:account:${JSON.stringify([
    context.userId,
    context.role,
    context.customerSourceId ?? null,
  ])}`;
}

test("authenticated backup exports recognise encoded organisation and account suffixes", () => {
  const organisationOnly = organisationKey("jr-os-customers", "org-b");
  const accountScoped = accountKey("jr-os-customers", { organisationId: "org-b", userId: "user-b", role: "owner" });
  assert.deepEqual(scopedBusinessStorageKey(organisationOnly), { baseStorageKey: "jr-os-customers", organisationId: "org-b", accountScoped: false });
  assert.deepEqual(scopedBusinessStorageKey(accountScoped), { baseStorageKey: "jr-os-customers", organisationId: "org-b", accountScoped: true });
  assert.equal(scopedBusinessStorageKey("jr-os-customers:organisation:org-b"), null);
  assert.equal(scopedBusinessStorageKey(organisationKey("jr-os-unknown", "org-b")), null);

  assert.deepEqual(scopedBackupStorageKey(accountScoped), {
    baseStorageKey: "jr-os-customers",
    organisationId: "org-b",
    scope: "account",
    userId: "user-b",
    role: "owner",
    customerSourceId: undefined,
  });
  assert.deepEqual(scopedBackupStorageKey(organisationKey("jr-os-ai-profile", "org-b")), {
    baseStorageKey: "jr-os-ai-profile",
    organisationId: "org-b",
    scope: "organisation",
  });
  assert.equal(scopedBackupStorageKey(organisationOnly), null, "collection caches must not fall back to organisation-only scope");
  assert.equal(scopedBackupStorageKey(accountKey("jr-os-ai-profile", { organisationId: "org-b", userId: "user-b", role: "owner" })), null);
});

test("runtime backup registry separates active-account data from organisation settings", () => {
  assert.equal(accountBackupStorageKeys.length, 68);
  assert.equal(organisationBackupStorageKeys.length, 1);
  assert.deepEqual(accountBackupStorageKeys, cloudCollectionStorageKeys);
  assert.deepEqual(accountBackupStorageKeys.filter((key) => organisationBackupStorageKeys.includes(key)), []);
  assert.equal(accountBackupStorageKeys.includes(CABLE_SIZING_HISTORY_STORAGE_KEY), false);
  assert.equal(backupStorageScope("jr-os-customers"), "account");
  assert.equal(backupStorageScope(CABLE_SIZING_HISTORY_STORAGE_KEY), null);
  assert.equal(backupStorageScope("jr-os-ai-profile"), "organisation");
  assert.equal(backupStorageScope("jr-os-cloud-sync-queue"), null);
  assert.equal(backupStorageScope("jr-os-unknown"), null);
});

test("account context comparison includes every authorisation field", () => {
  const active = { organisationId: "org-b", userId: "user-b", role: "customer", customerSourceId: "customer-b" };
  assert.equal(isCompleteAccountStorageContext(active), true);
  assert.equal(isCompleteAccountStorageContext({ ...active, userId: "" }), false);
  assert.equal(sameAccountStorageContext(active, { ...active }), true);
  assert.equal(sameAccountStorageContext(active, { ...active, organisationId: "org-a" }), false);
  assert.equal(sameAccountStorageContext(active, { ...active, userId: "user-other" }), false);
  assert.equal(sameAccountStorageContext(active, { ...active, role: "owner" }), false);
  assert.equal(sameAccountStorageContext(active, { ...active, customerSourceId: "customer-other" }), false);
});

test("authenticated backup collects only the exact active authorisation tuple", () => {
  const active = {
    organisationId: "org-b",
    userId: "user-b",
    role: "customer",
    customerSourceId: "customer-b",
  };
  const storage = new FakeStorage([
    [accountKey("jr-os-customers", active), JSON.stringify([{ id: "active-customer" }])],
    [accountKey(CABLE_SIZING_HISTORY_STORAGE_KEY, active), JSON.stringify([{ id: "active-calculation" }])],
    [organisationKey("jr-os-ai-profile", "org-b"), JSON.stringify({ businessName: "Organisation B" })],
    [organisationKey("jr-os-customers", "org-b"), JSON.stringify([{ id: "stale-organisation-cache" }])],
    [accountKey("jr-os-customers", { ...active, userId: "user-other" }), JSON.stringify([{ id: "other-user" }])],
    [accountKey("jr-os-jobs", { ...active, role: "owner", customerSourceId: undefined }), JSON.stringify([{ id: "stale-owner-role" }])],
    [accountKey("jr-os-jobs", { ...active, customerSourceId: "customer-other" }), JSON.stringify([{ id: "other-customer" }])],
    [accountKey("jr-os-customers", { ...active, organisationId: "org-a" }), JSON.stringify([{ id: "other-organisation" }])],
    [accountKey("jr-os-ai-profile", active), JSON.stringify({ businessName: "Account alias" })],
    ["jr-os-customers", JSON.stringify([{ id: "raw-legacy" }])],
    ["jr-os-cloud-sync-queue", JSON.stringify([{ organisationId: "org-b", payload: "PRIVATE" }])],
    ["jr-os-supabase-session", JSON.stringify({ access_token: "secret" })],
    ["jr-os-supabase-session-epoch", "internal-epoch"],
    [accountKey("jr-os-unknown", active), JSON.stringify([{ id: "unknown" }])],
  ]);

  assert.deepEqual(collectAccountBusinessData(storage, active), {
    "jr-os-customers": [{ id: "active-customer" }],
    "jr-os-ai-profile": { businessName: "Organisation B" },
  });
  assert.equal(JSON.stringify(collectAccountBusinessData(storage, active)).includes("PRIVATE"), false);
  assert.equal(JSON.stringify(collectAccountBusinessData(storage, active)).includes("secret"), false);
  assert.equal(JSON.stringify(collectAccountBusinessData(storage, active)).includes("internal-epoch"), false);
});

test("missing active account caches never fall back to stale organisation or role caches", () => {
  const active = { organisationId: "org-b", userId: "user-b", role: "admin" };
  const storage = new FakeStorage([
    [organisationKey("jr-os-jobs", "org-b"), JSON.stringify([{ id: "stale-organisation-job" }])],
    [accountKey("jr-os-jobs", { ...active, role: "owner" }), JSON.stringify([{ id: "stale-owner-job" }])],
    [organisationKey("jr-os-ai-profile", "org-b"), JSON.stringify({ businessName: "Organisation B" })],
  ]);

  assert.deepEqual(collectAccountBusinessData(storage, active), {
    "jr-os-ai-profile": { businessName: "Organisation B" },
  });
  assert.throws(
    () => collectAccountBusinessData(storage, { organisationId: "org-b", userId: "user-b", role: "" }),
    /requires a complete account context/,
  );
});
