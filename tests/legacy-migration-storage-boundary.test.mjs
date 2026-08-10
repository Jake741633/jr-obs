import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  LEGACY_MIGRATION_CLAIM_KEY,
  aggregateLegacyMigrationStorageKeys,
  claimLegacyMigrationStorage,
  cloudCollectionStorageKeys,
  collectLegacyAggregateData,
  collectOrganisationBusinessData,
  genericCloudCollectionStorageKeys,
  isCloudCollectionStorageKey,
  isLegacyAggregateStorageKey,
  legacyAggregateStorageKeys,
  migrateClaimedLegacyStorageValues,
  typedCollectionTables,
  typedLegacyMigrationStorageKeys,
} from "../lib/cloud/migrationStoragePolicy-core.mjs";

const cloudSync = readFileSync(new URL("../lib/cloudSync.ts", import.meta.url), "utf8");
const appData = readFileSync(new URL("../lib/appData.ts", import.meta.url), "utf8");
const collections = readFileSync(new URL("../lib/cloud/collections.ts", import.meta.url), "utf8");

class FakeStorage {
  constructor(entries = []) { this.values = new Map(entries); }
  get length() { return this.values.size; }
  key(index) { return [...this.values.keys()][index] ?? null; }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

function accountKey(storageKey, organisationId, userId) {
  return `${storageKey}:organisation:${JSON.stringify([organisationId])}:account:${JSON.stringify([userId, "owner", null])}`;
}

function organisationKey(storageKey, organisationId) {
  return `${storageKey}:organisation:${JSON.stringify([organisationId])}`;
}

test("migration registry is exact, complete and deny-by-default", () => {
  assert.equal(Object.keys(typedCollectionTables).length, 20);
  assert.equal(genericCloudCollectionStorageKeys.length, 48);
  assert.equal(cloudCollectionStorageKeys.length, 68);
  assert.equal(legacyAggregateStorageKeys.length, 69);
  assert.equal(isCloudCollectionStorageKey("jr-os-customers"), true);
  assert.equal(isCloudCollectionStorageKey("jr-os-site-diary"), true);
  assert.equal(isCloudCollectionStorageKey("jr-os-electrical-testing"), true);
  assert.equal(isCloudCollectionStorageKey("jr-os-electrical-testing-records"), true);
  assert.equal(isCloudCollectionStorageKey("jr-os-ai-profile"), false);
  assert.equal(isLegacyAggregateStorageKey("jr-os-ai-profile"), true);

  for (const rejected of [
    "jr-os-private-file-upload-queue",
    "jr-os-cloud-sync-queue",
    "jr-os-supabase-session",
    "jr-os-supabase-session-epoch",
    "jr-os-active-organisation",
    "jr-os-last-cloud-sync",
    "jr-os-cloud-versions:jr-os-customers",
    "jr-os-unknown-future-key",
    accountKey("jr-os-customers", "org-a", "user-a"),
  ]) {
    assert.equal(isLegacyAggregateStorageKey(rejected), false, rejected);
  }
});

test("legacy collectors never mix organisation caches or private queued bytes", () => {
  const orgAKey = accountKey("jr-os-customers", "org-a", "user-a");
  const orgBKey = organisationKey("jr-os-jobs", "org-b");
  const orgBAccountKey = accountKey("jr-os-jobs", "org-b", "user-b");
  const storage = new FakeStorage([
    ["jr-os-customers", JSON.stringify([{ id: "legacy-customer" }])],
    ["jr-os-ai-profile", JSON.stringify({ businessName: "Legacy Electrical" })],
    [orgAKey, JSON.stringify([{ id: "org-a-customer" }])],
    [orgBKey, JSON.stringify([{ id: "org-b-job" }])],
    [orgBAccountKey, JSON.stringify([{ id: "org-b-account-job" }])],
    ["jr-os-private-file-upload-queue", JSON.stringify([{ id: "file-a", organisationId: "org-a", dataUrl: "data:image/png;base64,PRIVATE_BYTES" }])],
    ["jr-os-supabase-session", JSON.stringify({ access_token: "secret" })],
    ["jr-os-supabase-session-epoch", "internal-epoch"],
    ["jr-os-unknown-future-key", JSON.stringify([{ id: "unknown" }])],
  ]);

  assert.deepEqual(typedLegacyMigrationStorageKeys(storage), ["jr-os-customers"]);
  assert.deepEqual(aggregateLegacyMigrationStorageKeys(storage), ["jr-os-ai-profile", "jr-os-customers"]);
  assert.deepEqual(collectLegacyAggregateData(storage), {
    "jr-os-ai-profile": { businessName: "Legacy Electrical" },
    "jr-os-customers": [{ id: "legacy-customer" }],
  });
  assert.deepEqual(collectOrganisationBusinessData(storage, "org-b"), {
    "jr-os-jobs": [{ id: "org-b-job" }],
  });
  assert.equal(JSON.stringify(collectLegacyAggregateData(storage)).includes("PRIVATE_BYTES"), false);
});

test("one organisation claims legacy data once and another organisation cannot replay it", () => {
  const storage = new FakeStorage([["jr-os-customers", JSON.stringify([{ id: "legacy" }])]]);
  assert.equal(claimLegacyMigrationStorage(storage, "org-b"), true);
  assert.equal(claimLegacyMigrationStorage(storage, "org-b"), false);
  assert.deepEqual(JSON.parse(storage.getItem(LEGACY_MIGRATION_CLAIM_KEY)), { organisationId: "org-b" });
  assert.throws(
    () => claimLegacyMigrationStorage(storage, "org-a"),
    /already claimed by a different organisation/,
  );
});

test("legacy claims fail closed when another tenant left caches or private uploads", () => {
  const storage = new FakeStorage([
    ["jr-os-customers", JSON.stringify([{ id: "legacy" }])],
    [accountKey("jr-os-jobs", "org-a", "user-a"), JSON.stringify([{ id: "job-a" }])],
    ["jr-os-private-file-upload-queue", JSON.stringify([{ id: "file-a", organisationId: "org-a", dataUrl: "data:application/pdf;base64,PRIVATE_BYTES" }])],
  ]);
  assert.throws(
    () => claimLegacyMigrationStorage(storage, "org-b"),
    /contains data for another organisation/,
  );
  assert.equal(storage.getItem(LEGACY_MIGRATION_CLAIM_KEY), null);
});

test("legacy upload markers migrate only through a matching organisation claim", () => {
  const storage = new FakeStorage([
    [LEGACY_MIGRATION_CLAIM_KEY, JSON.stringify({ organisationId: "org-a" })],
    ["jr-os-last-cloud-sync", "2026-08-09T10:00:00.000Z"],
    ["jr-os-last-typed-cloud-sync", "2026-08-09T11:00:00.000Z"],
  ]);
  const mappings = [
    { legacyKey: "jr-os-last-cloud-sync", scopedKey: organisationKey("jr-os-last-cloud-sync", "org-a") },
    { legacyKey: "jr-os-last-typed-cloud-sync", scopedKey: organisationKey("jr-os-last-typed-cloud-sync", "org-a") },
  ];

  assert.deepEqual(migrateClaimedLegacyStorageValues(storage, "org-a", mappings), {
    claimedByOrganisation: true,
    migrated: 2,
    removed: 2,
  });
  assert.equal(storage.getItem(mappings[0].scopedKey), "2026-08-09T10:00:00.000Z");
  assert.equal(storage.getItem(mappings[1].scopedKey), "2026-08-09T11:00:00.000Z");
  assert.equal(storage.getItem("jr-os-last-cloud-sync"), null);
  assert.equal(storage.getItem("jr-os-last-typed-cloud-sync"), null);
});

test("ambiguous legacy upload markers are removed without being assigned to a tenant", () => {
  for (const claim of [null, { organisationId: "org-b" }, "malformed"]) {
    const entries = [
      ["jr-os-last-cloud-sync", "2026-08-09T10:00:00.000Z"],
      ...(claim === null ? [] : [[LEGACY_MIGRATION_CLAIM_KEY, claim === "malformed" ? "{" : JSON.stringify(claim)]]),
    ];
    const storage = new FakeStorage(entries);
    const scopedKey = organisationKey("jr-os-last-cloud-sync", "org-a");
    const result = migrateClaimedLegacyStorageValues(storage, "org-a", [
      { legacyKey: "jr-os-last-cloud-sync", scopedKey },
    ]);

    assert.equal(result.claimedByOrganisation, false);
    assert.equal(result.migrated, 0);
    assert.equal(result.removed, 1);
    assert.equal(storage.getItem(scopedKey), null);
    assert.equal(storage.getItem("jr-os-last-cloud-sync"), null);
  }
});

test("both cloud migration paths claim exact legacy keys and restore only registered keys", () => {
  assert.match(cloudSync, /exportLegacyJrOsData\(organisationId\)/);
  assert.match(cloudSync, /typedLegacyMigrationStorageKeys\(window\.localStorage\)/);
  assert.match(cloudSync, /claimLegacyMigrationStorage\(window\.localStorage, organisationId\)/);
  assert.match(cloudSync, /migrateClaimedLegacyStorageValues\(window\.localStorage, organisationId/);
  assert.match(cloudSync, /isLegacyAggregateStorageKey\(payload\.storageKey\)/);
  assert.doesNotMatch(cloudSync, /cloudInternalKeys/);
  assert.match(appData, /claimLegacyMigrationStorage\(window\.localStorage, organisationId\)/);
  assert.match(appData, /collectLegacyAggregateData\(window\.localStorage\)/);
  assert.match(collections, /isGenericCloudCollectionStorageKey\(storageKey\)/);
  assert.doesNotMatch(collections, /storageKey\.startsWith\("jr-os-"\)/);
});
