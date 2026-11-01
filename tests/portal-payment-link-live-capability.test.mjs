import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import * as creatorMetadata from "../lib/cloud/recordCreatorMetadata-core.mjs";
import {
  accountBackupStorageKeyAllowed,
  collectAccountBusinessData,
} from "../lib/cloud/migrationStoragePolicy-core.mjs";
import {
  livePortalPaymentLinkQuery,
  livePortalPaymentUrlFromRows,
  strictHttpsPaymentUrl,
} from "../lib/cloud/portalPaymentLinkCapability-core.mjs";
import * as paymentCapabilityCore from "../lib/cloud/portalPaymentLinkCapability-core.mjs";
import {
  purgeCustomerNetworkOnlyCollectionCaches,
  roleProjectionCacheGeneration,
  roleProjectionCachePolicy,
  roleProjectionCacheStorageKeys,
} from "../lib/cloud/roleProjectionCache-core.mjs";
import * as roleProjectionCache from "../lib/cloud/roleProjectionCache-core.mjs";

const adapterSource = await readFile(new URL("../lib/cloud/adapter.ts", import.meta.url), "utf8");
const storageSource = await readFile(new URL("../lib/storage.ts", import.meta.url), "utf8");
const portalSource = await readFile(new URL("../app/customer-portal/page.tsx", import.meta.url), "utf8");
const capabilitySource = await readFile(new URL("../lib/cloud/portalPaymentLinkCapability.ts", import.meta.url), "utf8");
const cloudClientSource = await readFile(new URL("../lib/cloud/client.ts", import.meta.url), "utf8");
const appDataSource = await readFile(new URL("../lib/appData.ts", import.meta.url), "utf8");

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

const customerOptions = {
  storageKey: "jr-os-portal-payment-links",
  table: "cloud_collections",
  collectionKey: "jr-os-portal-payment-links",
  organisationId: "organisation-a",
  userId: "user-a",
  cacheUserId: "user-a",
  cacheRole: "customer",
  cacheCustomerSourceId: "customer-a",
};

const linkPayload = {
  id: "link-a",
  customerId: "customer-a",
  jobId: "job-a",
  invoiceId: "invoice-a",
  paymentUrl: "https://payments.example/invoice-a",
  providerConfigured: true,
  updatedAt: "2026-09-03T15:00:00.000Z",
};

const linkEnvelope = {
  source_id: "link-a",
  collection_key: "jr-os-portal-payment-links",
  customer_source_id: "customer-a",
  job_source_id: "job-a",
  version: 4,
  created_by: "office-user",
  payload: linkPayload,
};

function seedScopedCache(storage, scopedStorageKey, payload = linkPayload) {
  storage.setItem(scopedStorageKey, JSON.stringify([payload]));
  storage.setItem(`jr-os-cloud-versions:${scopedStorageKey}`, JSON.stringify({ [payload.id]: 4 }));
  storage.setItem(`jr-os-cloud-created-by:${scopedStorageKey}`, JSON.stringify({ [payload.id]: "office-user" }));
  storage.setItem(`jr-os-cloud-projection-generation:${scopedStorageKey}`, "old-generation");
}

function assertScopedCacheAbsent(storage, scopedStorageKey) {
  for (const key of roleProjectionCacheStorageKeys(scopedStorageKey)) assert.equal(storage.getItem(key), null, key);
}

test("customer payment-link caches are network-only outside local mode", () => {
  for (const mode of ["cloud", "migration"]) {
    assert.equal(roleProjectionCachePolicy({ storageKey: customerOptions.storageKey, role: "customer", mode }), "network-only");
    assert.equal(roleProjectionCachePolicy({ storageKey: customerOptions.storageKey, role: "customer", mode, generation: "future" }), "network-only");
  }
  assert.equal(roleProjectionCachePolicy({ storageKey: customerOptions.storageKey, role: "customer", mode: "local" }), "keep");
  assert.equal(roleProjectionCachePolicy({ storageKey: customerOptions.storageKey, role: "office", mode: "cloud" }), "keep");
  assert.equal(roleProjectionCacheGeneration({ storageKey: customerOptions.storageKey, role: "customer" }), undefined);
  assert.equal(roleProjectionCachePolicy({ storageKey: "jr-os-invoices", role: "customer", mode: "cloud", generation: "20260814091500" }), "keep");
});

test("dormant customer payment-link caches are purged without touching office or local data", () => {
  const storage = new FakeStorage();
  const customerA = 'jr-os-portal-payment-links:organisation:["org-a"]:account:["user-a","customer","customer-a"]';
  const customerB = 'jr-os-portal-payment-links:organisation:["org-b"]:account:["user-b","customer","customer-b"]';
  const delimiterIds = 'jr-os-portal-payment-links:organisation:["org:account:embedded"]:account:["user:account:embedded","customer","customer-c"]';
  const orphanCompanion = 'jr-os-portal-payment-links:organisation:["org-c"]:account:["user-c","customer","customer-c"]';
  const legacyOneTuple = 'jr-os-portal-payment-links:organisation:["org-legacy"]:account:["user-legacy"]';
  const legacyRawScope = "jr-os-portal-payment-links:organisation:org-legacy:account:user-legacy%40example.com";
  const office = 'jr-os-portal-payment-links:organisation:["org-a"]:account:["office-a","office",null]';
  const organisationOnly = 'jr-os-portal-payment-links:organisation:["org-a"]';
  const unscoped = "jr-os-portal-payment-links";
  for (const key of [customerA, customerB, delimiterIds, legacyOneTuple, legacyRawScope, office, organisationOnly, unscoped]) seedScopedCache(storage, key);
  storage.setItem(`jr-os-cloud-created-by:${orphanCompanion}`, JSON.stringify({ "link-c": "office-user" }));

  purgeCustomerNetworkOnlyCollectionCaches(storage, "jr-os-portal-payment-links");

  assertScopedCacheAbsent(storage, customerA);
  assertScopedCacheAbsent(storage, customerB);
  assertScopedCacheAbsent(storage, delimiterIds);
  assertScopedCacheAbsent(storage, orphanCompanion);
  assertScopedCacheAbsent(storage, legacyOneTuple);
  assertScopedCacheAbsent(storage, legacyRawScope);
  assertScopedCacheAbsent(storage, organisationOnly);
  for (const key of [office, unscoped]) assert.notEqual(storage.getItem(key), null, key);
});

test("customer backups cannot export or restore a dormant payment capability", () => {
  const context = {
    organisationId: "organisation-a",
    userId: "user-a",
    role: "customer",
    customerSourceId: "customer-a",
  };
  const paymentKey = `jr-os-portal-payment-links:organisation:${JSON.stringify([context.organisationId])}:account:${JSON.stringify([
    context.userId,
    context.role,
    context.customerSourceId,
  ])}`;
  const invoiceKey = `jr-os-invoices:organisation:${JSON.stringify([context.organisationId])}:account:${JSON.stringify([
    context.userId,
    context.role,
    context.customerSourceId,
  ])}`;
  const storage = new FakeStorage([
    [paymentKey, JSON.stringify([linkPayload])],
    [invoiceKey, JSON.stringify([{ id: "invoice-a" }])],
  ]);

  assert.equal(accountBackupStorageKeyAllowed("jr-os-portal-payment-links", "customer"), false);
  assert.equal(accountBackupStorageKeyAllowed("jr-os-portal-payment-links", "office"), true);
  assert.deepEqual(collectAccountBusinessData(storage, context), {
    "jr-os-invoices": [{ id: "invoice-a" }],
  });
  assert.match(appDataSource, /if \(!accountBackupStorageKeyAllowed\(key, context\.role\)\) return;[\s\S]*const scope = backupStorageScope\(key\)/);
});

test("network-only adapter returns fresh rows in memory without persisting any capability state", async () => {
  const { adapter, calls, storage } = loadAdapter({ rows: [linkEnvelope] });
  const scoped = adapter.accountStorageKey(
    customerOptions.storageKey,
    customerOptions.organisationId,
    customerOptions.cacheUserId,
    customerOptions.cacheRole,
    customerOptions.cacheCustomerSourceId,
  );
  seedScopedCache(storage, scoped, { ...linkPayload, paymentUrl: "https://stale.example/invoice-a" });
  const repository = adapter.createCollectionRepository(customerOptions);

  assert.deepEqual(plain(await repository.list()), [linkPayload]);
  assert.equal(calls.normal.length, 0);
  assert.equal(calls.fresh.length, 1);
  assertScopedCacheAbsent(storage, scoped);
  assert.deepEqual(plain(repository.recordCreators()), {});

  repository.save({ ...linkPayload, paymentUrl: "https://forged.example" }, 0);
  repository.remove(linkPayload.id);
  assertScopedCacheAbsent(storage, scoped);
  assert.deepEqual(calls.queue, []);
});

test("network-only adapter never replays a stale URL offline, during migration, or after failure", async () => {
  for (const options of [
    { mode: "cloud", online: false },
    { mode: "cloud", online: true, error: new Error("network unavailable") },
    { mode: "migration", online: true, error: new Error("RLS unavailable") },
  ]) {
    const { adapter, calls, storage } = loadAdapter(options);
    const scoped = adapter.accountStorageKey(
      customerOptions.storageKey,
      customerOptions.organisationId,
      customerOptions.cacheUserId,
      customerOptions.cacheRole,
      customerOptions.cacheCustomerSourceId,
    );
    seedScopedCache(storage, scoped, { ...linkPayload, paymentUrl: "https://stale.example/replay" });
    const repository = adapter.createCollectionRepository(customerOptions);
    assert.deepEqual(plain(await repository.list()), []);
    assertScopedCacheAbsent(storage, scoped);
    assert.equal(calls.normal.length, 0);
    assert.equal(calls.fresh.length, options.online ? 1 : 0);
  }
});

test("local and office collection repositories retain their existing persistence behavior", async () => {
  const local = loadAdapter({ mode: "local", online: false });
  const localScoped = local.adapter.accountStorageKey(customerOptions.storageKey, "organisation-a", "user-a", "customer", "customer-a");
  seedScopedCache(local.storage, localScoped);
  assert.deepEqual(plain(await local.adapter.createCollectionRepository(customerOptions).list()), [linkPayload]);
  assert.notEqual(local.storage.getItem(localScoped), null);

  const officeOptions = { ...customerOptions, cacheRole: "office", cacheCustomerSourceId: undefined };
  const office = loadAdapter({ rows: [linkEnvelope] });
  const officeScoped = office.adapter.accountStorageKey(officeOptions.storageKey, "organisation-a", "user-a", "office", undefined);
  const dormantCustomerScoped = office.adapter.accountStorageKey(customerOptions.storageKey, "organisation-a", "customer-user", "customer", "customer-a");
  seedScopedCache(office.storage, dormantCustomerScoped, { ...linkPayload, paymentUrl: "https://stale.example/invoice-a" });
  assert.deepEqual(plain(await office.adapter.createCollectionRepository(officeOptions).list()), [linkPayload]);
  assert.equal(office.calls.normal.length, 1);
  assert.equal(office.calls.fresh.length, 0);
  assertScopedCacheAbsent(office.storage, dormantCustomerScoped);
  assert.notEqual(office.storage.getItem(officeScoped), null);
});

test("the collection hook cannot re-persist or diff-sync a network-only capability", () => {
  const persistenceStart = storageSource.indexOf("useEffect(() => {\n    if (!isReady) return;");
  const persistenceEnd = storageSource.indexOf("useEffect(() => {", persistenceStart + 1);
  const persistence = storageSource.slice(persistenceStart, persistenceEnd);
  const authenticatedPurge = persistence.indexOf('if (mode !== "local" && userId && cacheRole)');
  const guard = persistence.indexOf("if (networkOnly)");
  const write = persistence.indexOf("window.localStorage.setItem(activeStorageKey");
  const repository = persistence.indexOf("createCollectionRepository<RepositoryRecord>");
  assert.ok(authenticatedPurge >= 0 && authenticatedPurge < guard && guard < write && write < repository);
  assert.match(persistence.slice(authenticatedPurge, write), /purgeCustomerNetworkOnlyCollectionCaches[\s\S]*purgeRoleProjectionCacheStorage[\s\S]*previousRef\.current = items;[\s\S]*return;/);
  assert.match(storageSource, /if \(networkOnly\) throw new Error\("This live capability collection is read-only and cannot be stored on this device\."\)/);
});

const expected = {
  organisationId: "organisation / a",
  customerId: "customer & a",
  jobId: "job ? a",
  invoiceId: "invoice # a",
  sourceId: "link + a",
};

function exactRow(target = expected, overrides = {}) {
  return {
    organisation_id: target.organisationId,
    source_id: target.sourceId,
    collection_key: "jr-os-portal-payment-links",
    customer_source_id: target.customerId,
    job_source_id: target.jobId ?? null,
    deleted_at: null,
    payload: {
      id: target.sourceId,
      customerId: target.customerId,
      jobId: target.jobId ?? undefined,
      invoiceId: target.invoiceId,
      paymentUrl: "https://payments.example/current?invoice=1",
      providerConfigured: true,
    },
    ...overrides,
  };
}

test("live lookup query binds every capability coordinate and limits ambiguity", () => {
  const query = livePortalPaymentLinkQuery(expected);
  for (const fragment of [
    "select=organisation_id,source_id,collection_key,customer_source_id,job_source_id,payload,deleted_at",
    `organisation_id=eq.${encodeURIComponent(expected.organisationId)}`,
    "collection_key=eq.jr-os-portal-payment-links",
    `source_id=eq.${encodeURIComponent(expected.sourceId)}`,
    `customer_source_id=eq.${encodeURIComponent(expected.customerId)}`,
    `job_source_id=eq.${encodeURIComponent(expected.jobId)}`,
    `payload->>invoiceId=eq.${encodeURIComponent(expected.invoiceId)}`,
    "deleted_at=is.null",
    "limit=2",
  ]) assert.ok(query.includes(fragment), fragment);
  assert.match(livePortalPaymentLinkQuery({ ...expected, jobId: undefined }), /job_source_id=is\.null/);
  for (const field of ["organisationId", "customerId", "invoiceId", "sourceId"]) {
    assert.throws(() => livePortalPaymentLinkQuery({ ...expected, [field]: "" }), new RegExp(field));
  }
});

test("live response decoding requires one exact envelope and a strict HTTPS URL", () => {
  assert.equal(livePortalPaymentUrlFromRows([exactRow()], expected), "https://payments.example/current?invoice=1");
  assert.equal(livePortalPaymentUrlFromRows([], expected), undefined);
  assert.equal(livePortalPaymentUrlFromRows([exactRow(), exactRow()], expected), undefined);
  for (const row of [
    exactRow(expected, { organisation_id: "other-organisation" }),
    exactRow(expected, { source_id: "other-link" }),
    exactRow(expected, { collection_key: "other-collection" }),
    exactRow(expected, { customer_source_id: "other-customer" }),
    exactRow(expected, { job_source_id: "other-job" }),
    exactRow(expected, { deleted_at: "2026-09-03T16:00:00.000Z" }),
    exactRow(expected, { payload: { ...exactRow().payload, id: "other-link" } }),
    exactRow(expected, { payload: { ...exactRow().payload, customerId: "other-customer" } }),
    exactRow(expected, { payload: { ...exactRow().payload, jobId: "other-job" } }),
    exactRow(expected, { payload: { ...exactRow().payload, invoiceId: "other-invoice" } }),
    exactRow(expected, { payload: { ...exactRow().payload, providerConfigured: false } }),
  ]) assert.equal(livePortalPaymentUrlFromRows([row], expected), undefined);

  for (const unsafe of [
    "http://payments.example/insecure",
    "javascript:alert(1)",
    "https:payments.example/noncanonical",
    "https:/payments.example/noncanonical",
    "https:///payments.example/noncanonical",
    "https://user:password@payments.example/private",
    "https://payments.example/white space",
    "https://payments.example\\redirect",
    "https://payments.example/\nnext",
    "not a URL",
    "",
  ]) assert.equal(strictHttpsPaymentUrl(unsafe), undefined, unsafe);
});

function loadCapability({ online = true, active = true, ownership = true, revalidated = true, rows = [exactRow(expected)], selectError, duringSelect } = {}) {
  const output = ts.transpileModule(capabilitySource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const commonJsModule = { exports: {} };
  const calls = { revalidate: 0, select: [] };
  const state = { active, ownership };
  const session = { access_token: "token-a", user: { id: "user-a" } };
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
      if (specifier === "./portalPaymentLinkCapability-core.mjs") return paymentCapabilityCore;
      if (specifier === "./repository") return {
        activeSyncAuthorizationMatches: () => state.active,
        revalidateSyncAuthorization: async () => { calls.revalidate += 1; return revalidated; },
      };
      if (specifier === "../supabase/client") return {
        captureSupabaseSessionOwnership: () => ({ session, epoch: "epoch-a" }),
        readSupabaseSession: () => state.ownership ? session : { access_token: "token-b", user: { id: "user-b" } },
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
  userId: "user-a",
  role: "customer",
  customerSourceId: expected.customerId,
};
const invoice = { id: expected.invoiceId, customerId: expected.customerId, jobId: expected.jobId };

test("click-time loader revalidates live identity and uses only a fresh exact projection read", async () => {
  const { capability, calls } = loadCapability();
  assert.equal(await capability.loadLiveCustomerPaymentUrl({ authorization, invoice, sourceId: expected.sourceId }), "https://payments.example/current?invoice=1");
  assert.equal(calls.revalidate, 1);
  assert.equal(calls.select.length, 1);
  assert.equal(calls.select[0].table, "customer_portal_payment_links");
  assert.equal(calls.select[0].query, livePortalPaymentLinkQuery(expected));
});

test("click activation navigates only with a fresh result while the operation remains current", async () => {
  const live = loadCapability();
  const navigations = [];
  assert.equal(await live.capability.openLiveCustomerPaymentUrl(
    { authorization, invoice, sourceId: expected.sourceId },
    () => true,
    (paymentUrl) => navigations.push(paymentUrl),
  ), true);
  assert.deepEqual(plain(navigations), ["https://payments.example/current?invoice=1"]);

  for (const scenario of [
    { options: { rows: [] }, current: true },
    { options: {}, current: false },
    { options: { duringSelect: (state) => { state.active = false; } }, current: true },
  ]) {
    const guarded = loadCapability(scenario.options);
    const rejectedNavigations = [];
    assert.equal(await guarded.capability.openLiveCustomerPaymentUrl(
      { authorization, invoice, sourceId: expected.sourceId },
      () => scenario.current,
      (paymentUrl) => rejectedNavigations.push(paymentUrl),
    ), false);
    assert.deepEqual(rejectedNavigations, []);
  }

  const sessionRace = loadCapability();
  const sessionRaceNavigations = [];
  assert.equal(await sessionRace.capability.openLiveCustomerPaymentUrl(
    { authorization, invoice, sourceId: expected.sourceId },
    () => {
      sessionRace.state.ownership = false;
      return true;
    },
    (paymentUrl) => sessionRaceNavigations.push(paymentUrl),
  ), false);
  assert.deepEqual(sessionRaceNavigations, []);

  const failed = loadCapability({ selectError: new Error("fresh lookup failed") });
  const failedNavigations = [];
  await assert.rejects(
    () => failed.capability.openLiveCustomerPaymentUrl(
      { authorization, invoice, sourceId: expected.sourceId },
      () => true,
      (paymentUrl) => failedNavigations.push(paymentUrl),
    ),
    /fresh lookup failed/,
  );
  assert.deepEqual(failedNavigations, []);
});

test("click-time loader fails closed offline, on invalid scope, and across identity changes", async () => {
  for (const options of [
    { online: false },
    { active: false },
    { revalidated: false },
    { duringSelect: (state) => { state.active = false; } },
    { duringSelect: (state) => { state.ownership = false; } },
  ]) {
    const { capability } = loadCapability(options);
    assert.equal(await capability.loadLiveCustomerPaymentUrl({ authorization, invoice, sourceId: expected.sourceId }), undefined);
  }
  const wrongRole = loadCapability();
  assert.equal(await wrongRole.capability.loadLiveCustomerPaymentUrl({ authorization: { ...authorization, role: "office" }, invoice, sourceId: expected.sourceId }), undefined);
  assert.equal(wrongRole.calls.revalidate, 0);
  assert.equal(wrongRole.calls.select.length, 0);

  const failed = loadCapability({ selectError: new Error("live lookup failed") });
  await assert.rejects(
    () => failed.capability.loadLiveCustomerPaymentUrl({ authorization, invoice, sourceId: expected.sourceId }),
    /live lookup failed/,
  );
});

test("customer portal wires click activation without passing the rendered URL", () => {
  assert.match(cloudClientSource, /cloudSelectFresh[\s\S]*cache: "no-store"/);
  assert.doesNotMatch(cloudClientSource.slice(cloudClientSource.indexOf("export async function cloudSelectFresh"), cloudClientSource.indexOf("export async function cloudInsert")), /Cache-Control|Pragma/);
  assert.match(adapterSource, /const select = networkOnly \? cloudSelectFresh : cloudSelect/);
  assert.match(portalSource, /openLiveCustomerPaymentUrl\([\s\S]*\{ authorization, invoice, sourceId \},[\s\S]*paymentOperationIsCurrent\(authorization, generation\)/);
  assert.match(portalSource, /mode !== "local" && \(customerSession \|\| !identity\)/);
  assert.match(portalSource, /liveCustomerPayment \? <Button[^>]*onClick=\{\(\) => openLivePaymentLink\(invoice, link\.id\)\}/);
  assert.match(portalSource, /if \(paymentOpeningRef\.current\) return;[\s\S]*paymentOpeningRef\.current = true;/);
  assert.match(portalSource, /\(paymentUrl\) => window\.location\.assign\(paymentUrl\)/);
  assert.doesNotMatch(portalSource, /window\.location\.assign\(link\.paymentUrl\)/);
  assert.match(portalSource, /: <a href=\{link\.paymentUrl\} target="_blank" rel="noreferrer"/);
});
