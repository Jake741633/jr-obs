import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import {
  accountBackupStorageKeyAllowed,
  collectAccountBusinessData,
} from "../lib/cloud/migrationStoragePolicy-core.mjs";
import {
  liveFieldJobDocumentQuery,
  liveFieldJobDocumentUrlFromRows,
  strictHttpsJobDocumentUrl,
} from "../lib/cloud/fieldJobDocumentCapability-core.mjs";
import * as fieldJobDocumentCapabilityCore from "../lib/cloud/fieldJobDocumentCapability-core.mjs";
import * as creatorMetadata from "../lib/cloud/recordCreatorMetadata-core.mjs";
import { sanitizeQueuedFieldMutationProjection } from "../lib/cloud/repository-core.mjs";
import * as repositoryCore from "../lib/cloud/repository-core.mjs";
import {
  purgeCustomerNetworkOnlyCollectionCaches,
  purgeElectricianNetworkOnlyCollectionCaches,
  roleProjectionCacheGeneration,
  roleProjectionCachePolicy,
  roleProjectionCacheStorageKeys,
  sanitizeRoleProjectionCache,
} from "../lib/cloud/roleProjectionCache-core.mjs";
import * as roleProjectionCache from "../lib/cloud/roleProjectionCache-core.mjs";

const adapterSource = await readFile(new URL("../lib/cloud/adapter.ts", import.meta.url), "utf8");
const storageSource = await readFile(new URL("../lib/storage.ts", import.meta.url), "utf8");
const identitySource = await readFile(new URL("../lib/cloud/useCloudIdentity.ts", import.meta.url), "utf8");
const jobPageSource = await readFile(new URL("../app/jobs/[id]/page.tsx", import.meta.url), "utf8");
const quotesPageSource = await readFile(new URL("../app/quotes/page.tsx", import.meta.url), "utf8");
const capabilitySource = await readFile(new URL("../lib/cloud/fieldJobDocumentCapability.ts", import.meta.url), "utf8");
const cloudClientSource = await readFile(new URL("../lib/cloud/client.ts", import.meta.url), "utf8");
const appDataSource = await readFile(new URL("../lib/appData.ts", import.meta.url), "utf8");
const repositorySource = await readFile(new URL("../lib/cloud/repository.ts", import.meta.url), "utf8");
const liveRlsSource = await readFile(new URL("./run-supabase-rls.integration.mjs", import.meta.url), "utf8");

class FakeStorage {
  constructor(entries = []) { this.values = new Map(entries); }
  get length() { return this.values.size; }
  key(index) { return [...this.values.keys()][index] ?? null; }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadAdapter({ mode = "cloud", online = true, rows = [], error } = {}) {
  const storage = new FakeStorage();
  const calls = { normal: [], fresh: [], queue: [] };
  const output = ts.transpileModule(adapterSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const commonJsModule = { exports: {} };
  const select = (kind) => async (table, query) => {
    calls[kind].push({ table, query });
    if (error) throw error;
    return rows;
  };

  vm.runInNewContext(output, {
    exports: commonJsModule.exports,
    module: commonJsModule,
    window: { localStorage: storage },
    navigator: { onLine: online },
    require(specifier) {
      if (specifier === "./client") return { cloudSelect: select("normal"), cloudSelectFresh: select("fresh") };
      if (specifier === "./collections") return { collectionCloudReadTable: (table) => table };
      if (specifier === "./config") return { effectiveCloudMode: () => mode };
      if (specifier === "./recordCreatorMetadata-core.mjs") return creatorMetadata;
      if (specifier === "./repository") return { queueChange: (item) => calls.queue.push(item) };
      if (specifier === "./roleProjectionCache-core.mjs") return roleProjectionCache;
      throw new Error(`Unexpected adapter dependency: ${specifier}`);
    },
  });
  return { adapter: commonJsModule.exports, calls, storage };
}

function loadRepositoryWithQueue(queue) {
  const storage = new FakeStorage([["jr-os-cloud-sync-queue", JSON.stringify(queue)]]);
  const output = ts.transpileModule(repositorySource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const commonJsModule = { exports: {} };
  vm.runInNewContext(output, {
    exports: commonJsModule.exports,
    module: commonJsModule,
    window: {
      localStorage: storage,
      addEventListener() {},
      dispatchEvent() {},
    },
    navigator: { onLine: false },
    crypto: { randomUUID: () => "test-mutation-id" },
    Event: class Event {},
    CustomEvent: class CustomEvent {},
    require(specifier) {
      if (specifier === "./repository-core.mjs") return repositoryCore;
      if (specifier === "./client") return {
        cloudPatch: async () => [],
        cloudRpc: async () => [],
        cloudSelect: async () => [],
        cloudUpsert: async () => [],
        isCloudConflictError: () => false,
      };
      if (specifier === "./collections") return {
        collectionCloudMutationRoute: () => ({ kind: "deny" }),
        collectionCloudReadTable: (table) => table,
        fieldMutationRouteAllows: () => false,
        isServerAuthoredFieldTimeline: () => false,
        normaliseFieldRequestedJobStatus: (status) => status,
      };
      if (specifier === "./config") return { effectiveCloudMode: () => "cloud" };
      if (specifier === "../supabase/client") return {
        readSupabaseSession: () => null,
        supabaseFetch: async () => [],
      };
      if (specifier === "./cloudPageIdentity-core.mjs") return {
        assertCloudPageOperationCurrent() {},
      };
      throw new Error(`Unexpected repository dependency: ${specifier}`);
    },
  });
  return { repository: commonJsModule.exports, storage };
}

const fieldOptions = {
  storageKey: "jr-os-job-documents",
  table: "job_documents",
  organisationId: "organisation-a",
  userId: "field-user-a",
  cacheUserId: "field-user-a",
  cacheRole: "electrician",
};

const documentPayload = {
  id: "document-a",
  jobId: "job-a",
  name: "Distribution board schedule",
  category: "Drawing",
  fileName: "",
  mimeType: "",
  externalUrl: "https://documents.example/current?token=one-use",
  notes: "Use the latest revision",
  uploadedBy: "JR OS Office",
  uploadedAt: "2026-09-03T16:00:00.000Z",
  createdAt: "2026-09-03T16:00:00.000Z",
};

const documentEnvelope = {
  organisation_id: fieldOptions.organisationId,
  source_id: documentPayload.id,
  customer_source_id: null,
  job_source_id: documentPayload.jobId,
  version: 4,
  created_by: "office-user",
  payload: documentPayload,
  deleted_at: null,
};

function seedScopedCache(storage, scopedStorageKey, payload = documentPayload) {
  storage.setItem(scopedStorageKey, JSON.stringify([payload]));
  storage.setItem(`jr-os-cloud-versions:${scopedStorageKey}`, JSON.stringify({ [payload.id]: 4 }));
  storage.setItem(`jr-os-cloud-created-by:${scopedStorageKey}`, JSON.stringify({ [payload.id]: "office-user" }));
  storage.setItem(`jr-os-cloud-projection-generation:${scopedStorageKey}`, "old-generation");
}

function assertScopedCacheAbsent(storage, scopedStorageKey) {
  for (const key of roleProjectionCacheStorageKeys(scopedStorageKey)) assert.equal(storage.getItem(key), null, key);
}

test("field job-document caches are network-only outside local mode", () => {
  for (const role of ["electrician", "customer"]) {
    for (const mode of ["cloud", "migration"]) {
      assert.equal(roleProjectionCachePolicy({ storageKey: fieldOptions.storageKey, role, mode }), "network-only");
      assert.equal(roleProjectionCachePolicy({ storageKey: fieldOptions.storageKey, role, mode, generation: "future" }), "network-only");
    }
    assert.equal(roleProjectionCacheGeneration({ storageKey: fieldOptions.storageKey, role }), undefined);
  }
  assert.equal(roleProjectionCachePolicy({ storageKey: fieldOptions.storageKey, role: "electrician", mode: "local" }), "keep");
  assert.equal(roleProjectionCachePolicy({ storageKey: fieldOptions.storageKey, role: "office", mode: "cloud" }), "keep");
  assert.deepEqual(sanitizeRoleProjectionCache({
    storageKey: fieldOptions.storageKey,
    role: "customer",
    mode: "cloud",
    records: [documentPayload],
  }), []);
});

test("dormant field and customer job-document caches purge without touching office data", () => {
  const storage = new FakeStorage();
  const electricianA = 'jr-os-job-documents:organisation:["org-a"]:account:["field-a","electrician",null]';
  const electricianB = 'jr-os-job-documents:organisation:["org-b"]:account:["field-b","electrician",null]';
  const customer = 'jr-os-job-documents:organisation:["org-a"]:account:["customer-a","customer","customer-source-a"]';
  const delimiterIds = 'jr-os-job-documents:organisation:["org:account:embedded"]:account:["field:account:embedded","electrician",null]';
  const orphanCompanion = 'jr-os-job-documents:organisation:["org-c"]:account:["field-c","electrician",null]';
  const legacyOrganisation = 'jr-os-job-documents:organisation:["org-legacy-organisation"]';
  const legacyOneTuple = 'jr-os-job-documents:organisation:["org-legacy"]:account:["legacy-user"]';
  const legacyRawScope = "jr-os-job-documents:organisation:org-legacy:account:legacy-user%40example.com";
  const office = 'jr-os-job-documents:organisation:["org-a"]:account:["office-a","office",null]';
  const unscoped = "jr-os-job-documents";
  for (const key of [electricianA, electricianB, customer, delimiterIds, legacyOrganisation, legacyOneTuple, legacyRawScope, office, unscoped]) {
    seedScopedCache(storage, key);
  }
  storage.setItem(`jr-os-cloud-created-by:${orphanCompanion}`, JSON.stringify({ "document-c": "office-user" }));

  purgeElectricianNetworkOnlyCollectionCaches(storage, fieldOptions.storageKey);
  for (const key of [electricianA, electricianB, delimiterIds, orphanCompanion, legacyOrganisation, legacyOneTuple, legacyRawScope]) {
    assertScopedCacheAbsent(storage, key);
  }
  assert.notEqual(storage.getItem(customer), null);
  assert.notEqual(storage.getItem(office), null);

  purgeCustomerNetworkOnlyCollectionCaches(storage, fieldOptions.storageKey);
  assertScopedCacheAbsent(storage, customer);
  assert.notEqual(storage.getItem(office), null);
  assert.notEqual(storage.getItem(unscoped), null);
});

test("field and customer backups cannot export or restore dormant job-document links", () => {
  for (const context of [
    { organisationId: "organisation-a", userId: "field-user-a", role: "electrician" },
    { organisationId: "organisation-a", userId: "customer-user-a", role: "customer", customerSourceId: "customer-a" },
  ]) {
    const documentKey = `jr-os-job-documents:organisation:${JSON.stringify([context.organisationId])}:account:${JSON.stringify([
      context.userId,
      context.role,
      context.customerSourceId ?? null,
    ])}`;
    const jobsKey = `jr-os-jobs:organisation:${JSON.stringify([context.organisationId])}:account:${JSON.stringify([
      context.userId,
      context.role,
      context.customerSourceId ?? null,
    ])}`;
    const storage = new FakeStorage([
      [documentKey, JSON.stringify([documentPayload])],
      [jobsKey, JSON.stringify([{ id: "job-a" }])],
    ]);

    assert.equal(accountBackupStorageKeyAllowed("jr-os-job-documents", context.role), false);
    assert.deepEqual(collectAccountBusinessData(storage, context), { "jr-os-jobs": [{ id: "job-a" }] });
  }
  assert.equal(accountBackupStorageKeyAllowed("jr-os-job-documents", "office"), true);
  assert.match(appDataSource, /if \(!accountBackupStorageKeyAllowed\(key, context\.role\)\) return;[\s\S]*const scope = backupStorageScope\(key\)/);
});

test("dormant non-office job-document mutations are removed from the persisted sync queue", () => {
  const queueStorageKey = (organisationId, userId, role) => `jr-os-job-documents:organisation:${JSON.stringify([
    organisationId,
  ])}:account:${JSON.stringify([userId, role, null])}`;
  const queuedDocument = {
    id: "queue-field-document",
    table: "job_documents",
    operation: "upsert",
    organisationId: "organisation-a",
    sourceId: "document-a",
    userId: "field-user-a",
    role: "electrician",
    storageKey: queueStorageKey("organisation-a", "field-user-a", "electrician"),
    payload: { ...documentPayload, externalUrl: "https://stale.example/queued-token" },
    queuedAt: "2026-08-01T00:00:00.000Z",
    attempts: 3,
    state: "Conflict",
  };
  for (const role of ["electrician", "customer", undefined, "malformed-role"]) {
    assert.equal(sanitizeQueuedFieldMutationProjection({ ...queuedDocument, role }), undefined);
  }
  for (const role of ["owner", "admin", "office"]) {
    const privileged = {
      ...queuedDocument,
      id: `queue-${role}`,
      userId: `${role}-user`,
      role,
      storageKey: queueStorageKey("organisation-a", `${role}-user`, role),
    };
    assert.strictEqual(sanitizeQueuedFieldMutationProjection(privileged), privileged);
  }

  const customerDocument = {
    ...queuedDocument,
    id: "queue-customer-document",
    userId: "customer-user-a",
    role: "customer",
    customerSourceId: "customer-a",
    storageKey: 'jr-os-job-documents:organisation:["organisation-a"]:account:["customer-user-a","customer","customer-a"]',
    payload: { ...queuedDocument.payload, externalUrl: "https://stale.example/customer-queued-token" },
  };
  const rolelessDocument = {
    ...queuedDocument,
    id: "queue-roleless-document",
    userId: undefined,
    role: undefined,
    storageKey: undefined,
    payload: { ...queuedDocument.payload, externalUrl: "https://stale.example/roleless-queued-token" },
  };
  const officeDocument = {
    ...queuedDocument,
    id: "queue-office-document",
    userId: "office-user-a",
    role: "office",
    storageKey: queueStorageKey("organisation-a", "office-user-a", "office"),
    payload: { ...queuedDocument.payload, externalUrl: "https://office.example/recoverable-token" },
  };
  for (const malformed of [
    { ...officeDocument, organisationId: "" },
    { ...officeDocument, userId: "" },
    { ...officeDocument, sourceId: "" },
    { ...officeDocument, collectionKey: "jr-os-job-documents" },
    { ...officeDocument, customerSourceId: "customer-a" },
    { ...officeDocument, storageKey: queuedDocument.storageKey },
  ]) assert.equal(sanitizeQueuedFieldMutationProjection(malformed), undefined);
  for (const validState of [
    { ...officeDocument, operation: "delete", payload: undefined },
    { ...officeDocument, sentAt: "2026-09-03T16:00:00.000Z", state: "Conflict" },
  ]) assert.strictEqual(sanitizeQueuedFieldMutationProjection(validState), validState);
  const unrelatedFieldChange = {
    ...queuedDocument,
    id: "queue-field-survey",
    table: "cloud_collections",
    collectionKey: "jr-os-surveys",
    payload: { id: "survey-a", jobId: "job-a" },
  };
  const foreignOfficeDocument = {
    ...officeDocument,
    id: "queue-foreign-office-document",
    organisationId: "organisation-b",
    storageKey: queueStorageKey("organisation-b", "office-user-a", "office"),
  };
  const { repository, storage } = loadRepositoryWithQueue([
    queuedDocument,
    customerDocument,
    rolelessDocument,
    officeDocument,
    unrelatedFieldChange,
    foreignOfficeDocument,
  ]);

  assert.deepEqual(plain(repository.getOrganisationSyncQueue("organisation-a")), [officeDocument, unrelatedFieldChange]);
  assert.deepEqual(plain(JSON.parse(storage.getItem("jr-os-cloud-sync-queue"))), [
    officeDocument,
    unrelatedFieldChange,
    foreignOfficeDocument,
  ]);
  assert.equal(storage.getItem("jr-os-cloud-sync-queue").includes("office.example/recoverable-token"), true, "valid office-authored capabilities must remain recoverable");
  assert.equal(storage.getItem("jr-os-cloud-sync-queue").includes("stale.example"), false);
  assert.equal(storage.getItem("jr-os-cloud-sync-queue").includes("queue-field-document"), false);
  assert.equal(storage.getItem("jr-os-cloud-sync-queue").includes("queue-customer-document"), false);
  assert.equal(storage.getItem("jr-os-cloud-sync-queue").includes("queue-roleless-document"), false);
});

test("network-only adapter returns fresh field rows in memory without persisting capability state", async () => {
  const { adapter, calls, storage } = loadAdapter({ rows: [documentEnvelope] });
  const scoped = adapter.accountStorageKey(
    fieldOptions.storageKey,
    fieldOptions.organisationId,
    fieldOptions.cacheUserId,
    fieldOptions.cacheRole,
    undefined,
  );
  seedScopedCache(storage, scoped, { ...documentPayload, externalUrl: "https://stale.example/document" });
  const repository = adapter.createCollectionRepository(fieldOptions);

  assert.deepEqual(plain(await repository.list()), [documentPayload]);
  assert.equal(calls.normal.length, 0);
  assert.equal(calls.fresh.length, 1);
  assert.equal(calls.fresh[0].table, "job_documents");
  assertScopedCacheAbsent(storage, scoped);
  assert.deepEqual(plain(repository.recordCreators()), {});

  repository.save({ ...documentPayload, externalUrl: "https://forged.example/document" }, 0);
  repository.remove(documentPayload.id);
  assertScopedCacheAbsent(storage, scoped);
  assert.deepEqual(calls.queue, []);
});

test("network-only adapter never replays a stale field document URL offline or after failure", async () => {
  for (const options of [
    { mode: "cloud", online: false },
    { mode: "cloud", online: true, error: new Error("network unavailable") },
    { mode: "migration", online: true, error: new Error("RLS unavailable") },
  ]) {
    const { adapter, calls, storage } = loadAdapter(options);
    const scoped = adapter.accountStorageKey(
      fieldOptions.storageKey,
      fieldOptions.organisationId,
      fieldOptions.cacheUserId,
      fieldOptions.cacheRole,
      undefined,
    );
    seedScopedCache(storage, scoped, { ...documentPayload, externalUrl: "https://stale.example/replay" });
    const repository = adapter.createCollectionRepository(fieldOptions);
    assert.deepEqual(plain(await repository.list()), []);
    assertScopedCacheAbsent(storage, scoped);
    assert.equal(calls.normal.length, 0);
    assert.equal(calls.fresh.length, options.online ? 1 : 0);
  }
});

test("customer reads remain fail-closed even if the canonical endpoint returns a row", async () => {
  const customerOptions = {
    ...fieldOptions,
    userId: "customer-user-a",
    cacheUserId: "customer-user-a",
    cacheRole: "customer",
    cacheCustomerSourceId: "customer-a",
  };
  const { adapter, calls, storage } = loadAdapter({ rows: [documentEnvelope] });
  const scoped = adapter.accountStorageKey(
    customerOptions.storageKey,
    customerOptions.organisationId,
    customerOptions.cacheUserId,
    customerOptions.cacheRole,
    customerOptions.cacheCustomerSourceId,
  );
  seedScopedCache(storage, scoped);
  assert.deepEqual(plain(await adapter.createCollectionRepository(customerOptions).list()), []);
  assert.equal(calls.fresh.length, 1);
  assertScopedCacheAbsent(storage, scoped);
});

test("local and office document repositories retain normal persistence", async () => {
  const local = loadAdapter({ mode: "local", online: false });
  const localScoped = local.adapter.accountStorageKey(fieldOptions.storageKey, "organisation-a", "field-user-a", "electrician", undefined);
  seedScopedCache(local.storage, localScoped);
  assert.deepEqual(plain(await local.adapter.createCollectionRepository(fieldOptions).list()), [documentPayload]);
  assert.notEqual(local.storage.getItem(localScoped), null);

  const officeOptions = { ...fieldOptions, userId: "office-user-a", cacheUserId: "office-user-a", cacheRole: "office" };
  const office = loadAdapter({ rows: [documentEnvelope] });
  const officeScoped = office.adapter.accountStorageKey(officeOptions.storageKey, "organisation-a", "office-user-a", "office", undefined);
  const dormantFieldScoped = office.adapter.accountStorageKey(fieldOptions.storageKey, "organisation-a", "field-user-a", "electrician", undefined);
  const dormantCustomerScoped = office.adapter.accountStorageKey(fieldOptions.storageKey, "organisation-a", "customer-user-a", "customer", "customer-a");
  seedScopedCache(office.storage, officeScoped);
  seedScopedCache(office.storage, dormantFieldScoped);
  seedScopedCache(office.storage, dormantCustomerScoped);
  assert.deepEqual(plain(await office.adapter.createCollectionRepository(officeOptions).list()), [documentPayload]);
  assert.equal(office.calls.normal.length, 1);
  assert.equal(office.calls.fresh.length, 0);
  assertScopedCacheAbsent(office.storage, dormantFieldScoped);
  assertScopedCacheAbsent(office.storage, dormantCustomerScoped);
  assert.notEqual(office.storage.getItem(officeScoped), null);
});

test("identity publication and the collection hook sweep dormant link caches", () => {
  const emitStart = identitySource.indexOf("function emit");
  const customerPurge = identitySource.indexOf('purgeCustomerNetworkOnlyCollectionCaches(window.localStorage, "jr-os-job-documents")', emitStart);
  const fieldPurge = identitySource.indexOf('purgeElectricianNetworkOnlyCollectionCaches(window.localStorage, "jr-os-job-documents")', emitStart);
  const publish = identitySource.indexOf("snapshot = next", emitStart);
  assert.ok(emitStart >= 0 && customerPurge > emitStart && fieldPurge > customerPurge && publish > fieldPurge);
  assert.match(identitySource.slice(emitStart, customerPurge), /effectiveCloudMode\(\) !== "local"/);
  assert.doesNotMatch(identitySource.slice(emitStart, publish), /next\.identity/);

  const persistenceStart = storageSource.indexOf("useEffect(() => {\n    if (!isReady) return;");
  const persistenceEnd = storageSource.indexOf("useEffect(() => {", persistenceStart + 1);
  const persistence = storageSource.slice(persistenceStart, persistenceEnd);
  const customerSweep = persistence.indexOf("purgeCustomerNetworkOnlyCollectionCaches");
  const fieldSweep = persistence.indexOf("purgeElectricianNetworkOnlyCollectionCaches");
  const guard = persistence.indexOf("if (networkOnly)");
  const write = persistence.indexOf("window.localStorage.setItem(activeStorageKey");
  assert.ok(customerSweep >= 0 && fieldSweep > customerSweep && guard > fieldSweep && write > guard);
  assert.match(persistence.slice(guard, write), /purgeRoleProjectionCacheStorage[\s\S]*previousRef\.current = items;[\s\S]*return;/);
  assert.match(storageSource, /if \(networkOnly\) throw new Error\("This live capability collection is read-only and cannot be stored on this device\."\)/);
});

const expected = {
  organisationId: "organisation / a",
  jobId: "job ? a",
  sourceId: "document + a",
};

function exactRow(target = expected, overrides = {}) {
  return {
    organisation_id: target.organisationId,
    source_id: target.sourceId,
    job_source_id: target.jobId,
    deleted_at: null,
    payload: {
      id: target.sourceId,
      jobId: target.jobId,
      externalUrl: "https://documents.example/current?download=1",
    },
    ...overrides,
  };
}

test("live field document query binds every capability coordinate and limits ambiguity", () => {
  const query = liveFieldJobDocumentQuery(expected);
  for (const fragment of [
    "select=organisation_id,source_id,job_source_id,payload,deleted_at",
    `organisation_id=eq.${encodeURIComponent(expected.organisationId)}`,
    `source_id=eq.${encodeURIComponent(expected.sourceId)}`,
    `job_source_id=eq.${encodeURIComponent(expected.jobId)}`,
    `payload->>jobId=eq.${encodeURIComponent(expected.jobId)}`,
    "deleted_at=is.null",
    "limit=2",
  ]) assert.ok(query.includes(fragment), fragment);
  for (const field of ["organisationId", "jobId", "sourceId"]) {
    assert.throws(() => liveFieldJobDocumentQuery({ ...expected, [field]: "" }), new RegExp(field));
  }
  const fixtureQueryStart = liveRlsSource.indexOf("const fieldDocumentCapabilityQuery = ");
  const fixtureQueryEnd = liveRlsSource.indexOf(";\n", fixtureQueryStart);
  const fixtureQuery = liveRlsSource.slice(fixtureQueryStart, fixtureQueryEnd);
  assert.ok(fixtureQueryStart >= 0 && fixtureQueryEnd > fixtureQueryStart);
  for (const fragment of [
    "select=organisation_id,source_id,job_source_id,payload,deleted_at",
    "organisation_id=eq.",
    "source_id=eq.",
    "job_source_id=eq.",
    "payload->>jobId=eq.",
    "deleted_at=is.null&limit=2",
  ]) assert.ok(fixtureQuery.includes(fragment), fragment);
  for (const [resultName, actor] of [
    ["assignedFieldDocument", "accounts.A.electrician"],
    ["coworkerAssignedFieldDocument", "accounts.A.coworker"],
    ["revokedFieldDocumentCapability", "accounts.A.electrician"],
    ["coworkerFieldDocumentCapability", "accounts.A.coworker"],
    ["restoredFieldDocumentCapability", "accounts.A.electrician"],
  ]) {
    assert.match(liveRlsSource, new RegExp(`${resultName} = await listRecords\\(${actor.replaceAll(".", "\\.")}, "job_documents", fieldDocumentCapabilityQuery\\)`));
  }
});

test("live field document response requires one exact envelope and a strict HTTPS URL", () => {
  assert.equal(liveFieldJobDocumentUrlFromRows([exactRow()], expected), "https://documents.example/current?download=1");
  assert.equal(liveFieldJobDocumentUrlFromRows([], expected), undefined);
  assert.equal(liveFieldJobDocumentUrlFromRows([exactRow(), exactRow()], expected), undefined);
  for (const row of [
    exactRow(expected, { organisation_id: "other-organisation" }),
    exactRow(expected, { source_id: "other-document" }),
    exactRow(expected, { job_source_id: "other-job" }),
    exactRow(expected, { deleted_at: "2026-09-03T16:00:00.000Z" }),
    exactRow(expected, { payload: { ...exactRow().payload, id: "other-document" } }),
    exactRow(expected, { payload: { ...exactRow().payload, jobId: "other-job" } }),
  ]) assert.equal(liveFieldJobDocumentUrlFromRows([row], expected), undefined);

  for (const unsafe of [
    "http://documents.example/insecure",
    "javascript:alert(1)",
    "data:text/html,unsafe",
    "https:documents.example/noncanonical",
    "https:/documents.example/noncanonical",
    "https:///documents.example/noncanonical",
    "https://user:password@documents.example/private",
    "https://documents.example/white space",
    "https://documents.example\\redirect",
    "https://documents.example/\nnext",
    "not a URL",
    "",
    42,
    null,
  ]) assert.equal(strictHttpsJobDocumentUrl(unsafe), undefined, String(unsafe));
});

function loadCapability({ online = true, active = true, ownership = true, revalidated = true, rows = [exactRow(expected)], selectError, duringSelect } = {}) {
  const output = ts.transpileModule(capabilitySource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const commonJsModule = { exports: {} };
  const calls = { revalidate: 0, select: [] };
  const state = { active, ownership };
  const session = { access_token: "token-a", user: { id: "field-user-a" } };
  vm.runInNewContext(output, {
    exports: commonJsModule.exports,
    module: commonJsModule,
    navigator: { onLine: online },
    require(specifier) {
      if (specifier === "./client") return {
        cloudSelectFresh: async (table, query) => {
          calls.select.push({ table, query });
          if (selectError) throw selectError;
          if (duringSelect) duringSelect(state);
          return rows;
        },
      };
      if (specifier === "./fieldJobDocumentCapability-core.mjs") return fieldJobDocumentCapabilityCore;
      if (specifier === "./repository") return {
        activeSyncAuthorizationMatches: () => state.active,
        revalidateSyncAuthorization: async () => { calls.revalidate += 1; return revalidated; },
      };
      if (specifier === "../supabase/client") return {
        captureSupabaseSessionOwnership: () => ({ session, epoch: "epoch-a" }),
        readSupabaseSession: () => state.ownership ? session : { access_token: "token-b", user: { id: "other-user" } },
        readSupabaseSessionOwnershipEpoch: () => state.ownership ? "epoch-a" : "epoch-b",
      };
      if (specifier === "../supabase/sessionOwnership-core.mjs") return {
        sameSupabaseSessionOwnership: (_currentSession, currentEpoch, _expectedSession, expectedEpoch) => state.ownership && currentEpoch === expectedEpoch,
      };
      throw new Error(`Unexpected capability dependency: ${specifier}`);
    },
  });
  return { capability: commonJsModule.exports, calls, state };
}

const authorization = {
  organisationId: expected.organisationId,
  userId: "field-user-a",
  role: "electrician",
};
const document = { id: expected.sourceId, jobId: expected.jobId };

test("field document click-time loader revalidates identity and performs one fresh exact read", async () => {
  const { capability, calls } = loadCapability();
  assert.equal(
    await capability.loadLiveFieldJobDocumentUrl({ authorization, document }),
    "https://documents.example/current?download=1",
  );
  assert.equal(calls.revalidate, 1);
  assert.deepEqual(plain(calls.select), [{ table: "job_documents", query: liveFieldJobDocumentQuery(expected) }]);
  assert.match(cloudClientSource, /cloudSelectFresh[\s\S]*cache: "no-store"/);
});

test("field document activation navigates only with a fresh result and current session", async () => {
  const live = loadCapability();
  const navigations = [];
  assert.equal(await live.capability.openLiveFieldJobDocumentUrl(
    {
      authorization,
      document: {
        ...document,
        externalUrl: "https://documents.example/stale-rendered-link",
      },
    },
    () => true,
    (documentUrl) => navigations.push(documentUrl),
  ), true);
  assert.deepEqual(plain(navigations), ["https://documents.example/current?download=1"]);

  for (const scenario of [
    { options: { rows: [] }, current: true },
    { options: {}, current: false },
    { options: { duringSelect: (state) => { state.active = false; } }, current: true },
  ]) {
    const guarded = loadCapability(scenario.options);
    const rejectedNavigations = [];
    assert.equal(await guarded.capability.openLiveFieldJobDocumentUrl(
      { authorization, document },
      () => scenario.current,
      (documentUrl) => rejectedNavigations.push(documentUrl),
    ), false);
    assert.deepEqual(rejectedNavigations, []);
  }

  const sessionRace = loadCapability();
  const sessionRaceNavigations = [];
  assert.equal(await sessionRace.capability.openLiveFieldJobDocumentUrl(
    { authorization, document },
    () => {
      sessionRace.state.ownership = false;
      return true;
    },
    (documentUrl) => sessionRaceNavigations.push(documentUrl),
  ), false);
  assert.deepEqual(sessionRaceNavigations, []);
});

test("field document loader fails closed offline, for wrong roles, and across identity changes", async () => {
  for (const options of [
    { online: false },
    { active: false },
    { revalidated: false },
    { duringSelect: (state) => { state.active = false; } },
    { duringSelect: (state) => { state.ownership = false; } },
  ]) {
    const { capability } = loadCapability(options);
    assert.equal(await capability.loadLiveFieldJobDocumentUrl({ authorization, document }), undefined);
  }

  for (const request of [
    { authorization: { ...authorization, role: "office" }, document },
    { authorization, document: { ...document, id: "" } },
    { authorization, document: { ...document, jobId: "" } },
  ]) {
    const rejected = loadCapability();
    assert.equal(await rejected.capability.loadLiveFieldJobDocumentUrl(request), undefined);
    assert.equal(rejected.calls.revalidate, 0);
    assert.equal(rejected.calls.select.length, 0);
  }

  const failed = loadCapability({ selectError: new Error("fresh lookup failed") });
  const navigations = [];
  await assert.rejects(
    () => failed.capability.openLiveFieldJobDocumentUrl(
      { authorization, document },
      () => true,
      (documentUrl) => navigations.push(documentUrl),
    ),
    /fresh lookup failed/,
  );
  assert.deepEqual(navigations, []);
});

test("field job UI activates a fresh capability without passing the rendered URL", () => {
  assert.match(jobPageSource, /const safeExternalUrl = externalUrl \? strictHttpsJobDocumentUrl\(externalUrl\) : undefined/);
  assert.match(jobPageSource, /externalUrl && !safeExternalUrl[\s\S]*valid HTTPS document link without embedded credentials/);
  assert.match(jobPageSource, /externalUrl: safeExternalUrl \?\? ""/);
  assert.match(
    jobPageSource,
    /openLiveFieldJobDocumentUrl\([\s\S]*\{ authorization, document \},[\s\S]*documentOperationIsCurrent\(authorization, generation\)/,
  );
  assert.match(jobPageSource, /\(documentUrl\) => window\.location\.assign\(documentUrl\)/);
  assert.match(
    jobPageSource,
    /fieldJobRecord[\s\S]*onClick=\{\(\) => openLiveDocument\(\{ id: document\.id, jobId: document\.jobId \}\)\}/,
  );
  assert.match(jobPageSource, /const safeDocumentUrl = strictHttpsJobDocumentUrl\(document\.externalUrl\)/);
  assert.match(jobPageSource, /href=\{safeDocumentUrl\} target="_blank" rel="noreferrer"/);
  assert.doesNotMatch(jobPageSource, /href=\{document\.externalUrl\}/);
  assert.doesNotMatch(jobPageSource, /openLiveDocument\(\{[^}]*externalUrl/);
  assert.match(quotesPageSource, /const safeExternalUrl = strictHttpsJobDocumentUrl\(externalUrl\)/);
  assert.match(quotesPageSource, /valid HTTPS URL without embedded credentials/);
  assert.match(quotesPageSource, /externalUrl: safeExternalUrl/);
});
