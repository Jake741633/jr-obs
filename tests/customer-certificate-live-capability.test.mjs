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
  liveCustomerCertificateQuery,
  liveCustomerCertificateUrlFromRows,
  strictHttpsCertificateUrl,
} from "../lib/cloud/customerCertificateCapability-core.mjs";
import * as certificateCapabilityCore from "../lib/cloud/customerCertificateCapability-core.mjs";
import * as creatorMetadata from "../lib/cloud/recordCreatorMetadata-core.mjs";
import {
  purgeCustomerNetworkOnlyCollectionCaches,
  roleProjectionCacheGeneration,
  roleProjectionCachePolicy,
  roleProjectionCacheStorageKeys,
} from "../lib/cloud/roleProjectionCache-core.mjs";
import * as roleProjectionCache from "../lib/cloud/roleProjectionCache-core.mjs";

const adapterSource = await readFile(new URL("../lib/cloud/adapter.ts", import.meta.url), "utf8");
const storageSource = await readFile(new URL("../lib/storage.ts", import.meta.url), "utf8");
const identitySource = await readFile(new URL("../lib/cloud/useCloudIdentity.ts", import.meta.url), "utf8");
const portalSource = await readFile(new URL("../app/customer-portal/page.tsx", import.meta.url), "utf8");
const capabilitySource = await readFile(new URL("../lib/cloud/customerCertificateCapability.ts", import.meta.url), "utf8");
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
      if (specifier === "./collections") return {
        collectionCloudReadTable: (table, role) => role === "customer" && table === "certificates"
          ? "customer_certificates"
          : table,
      };
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
  storageKey: "jr-os-certificates",
  table: "certificates",
  organisationId: "organisation-a",
  userId: "user-a",
  cacheUserId: "user-a",
  cacheRole: "customer",
  cacheCustomerSourceId: "customer-a",
};

const certificatePayload = {
  id: "certificate-a",
  number: "EIC-001",
  type: "Electrical Installation Certificate",
  status: "Issued",
  customerId: "customer-a",
  jobId: "job-a",
  installationAddress: "1 Test Street",
  externalPdfUrl: "https://certificates.example/certificate-a.pdf",
  createdAt: "2026-09-03T15:00:00.000Z",
  updatedAt: "2026-09-03T15:00:00.000Z",
};

const certificateEnvelope = {
  organisation_id: "organisation-a",
  source_id: "certificate-a",
  customer_source_id: "customer-a",
  job_source_id: "job-a",
  version: 4,
  created_by: "office-user",
  payload: certificatePayload,
  deleted_at: null,
};

function seedScopedCache(storage, scopedStorageKey, payload = certificatePayload) {
  storage.setItem(scopedStorageKey, JSON.stringify([payload]));
  storage.setItem(`jr-os-cloud-versions:${scopedStorageKey}`, JSON.stringify({ [payload.id]: 4 }));
  storage.setItem(`jr-os-cloud-created-by:${scopedStorageKey}`, JSON.stringify({ [payload.id]: "office-user" }));
  storage.setItem(`jr-os-cloud-projection-generation:${scopedStorageKey}`, "old-generation");
}

function assertScopedCacheAbsent(storage, scopedStorageKey) {
  for (const key of roleProjectionCacheStorageKeys(scopedStorageKey)) assert.equal(storage.getItem(key), null, key);
}

function assertScopedCachePresent(storage, scopedStorageKey) {
  for (const key of roleProjectionCacheStorageKeys(scopedStorageKey)) assert.notEqual(storage.getItem(key), null, key);
}

test("customer certificate caches are network-only outside local mode", () => {
  for (const mode of ["cloud", "migration"]) {
    assert.equal(roleProjectionCachePolicy({ storageKey: customerOptions.storageKey, role: "customer", mode }), "network-only");
    assert.equal(roleProjectionCachePolicy({ storageKey: customerOptions.storageKey, role: "customer", mode, generation: "future" }), "network-only");
  }
  assert.equal(roleProjectionCachePolicy({ storageKey: customerOptions.storageKey, role: "customer", mode: "local" }), "keep");
  assert.equal(roleProjectionCachePolicy({ storageKey: customerOptions.storageKey, role: "office", mode: "cloud" }), "keep");
  assert.equal(roleProjectionCacheGeneration({ storageKey: customerOptions.storageKey, role: "customer" }), undefined);
  assert.equal(roleProjectionCachePolicy({ storageKey: "jr-os-invoices", role: "customer", mode: "cloud", generation: "20260814091500" }), "keep");
});

test("dormant customer certificate caches purge without touching office or local data", () => {
  const storage = new FakeStorage();
  const customerA = 'jr-os-certificates:organisation:["org-a"]:account:["user-a","customer","customer-a"]';
  const customerB = 'jr-os-certificates:organisation:["org-b"]:account:["user-b","customer","customer-b"]';
  const delimiterIds = 'jr-os-certificates:organisation:["org:account:embedded"]:account:["user:account:embedded","customer","customer-c"]';
  const orphanCompanion = 'jr-os-certificates:organisation:["org-c"]:account:["user-c","customer","customer-c"]';
  const legacyOneTuple = 'jr-os-certificates:organisation:["org-legacy"]:account:["user-legacy"]';
  const legacyRawOrganisation = "jr-os-certificates:organisation:org-legacy";
  const legacyRawScope = "jr-os-certificates:organisation:org-legacy:account:user-legacy%40example.com";
  const office = 'jr-os-certificates:organisation:["org-a"]:account:["office-a","office",null]';
  const admin = 'jr-os-certificates:organisation:["org-a"]:account:["admin-a","admin",null]';
  const owner = 'jr-os-certificates:organisation:["org-a"]:account:["owner-a","owner",null]';
  const organisationOnly = 'jr-os-certificates:organisation:["org-a"]';
  const unscoped = "jr-os-certificates";
  const unrelated = 'jr-os-invoices:organisation:["org-a"]:account:["user-a","customer","customer-a"]';
  for (const key of [
    customerA, customerB, delimiterIds, legacyOneTuple, legacyRawOrganisation, legacyRawScope,
    office, admin, owner, organisationOnly, unscoped, unrelated,
  ]) seedScopedCache(storage, key);
  storage.setItem(`jr-os-cloud-created-by:${orphanCompanion}`, JSON.stringify({ "certificate-c": "office-user" }));

  purgeCustomerNetworkOnlyCollectionCaches(storage, "jr-os-certificates");

  for (const key of [
    customerA, customerB, delimiterIds, orphanCompanion, legacyOneTuple,
    legacyRawOrganisation, legacyRawScope, organisationOnly,
  ]) assertScopedCacheAbsent(storage, key);
  for (const key of [office, admin, owner, unscoped, unrelated]) assertScopedCachePresent(storage, key);
});

test("customer backups cannot export or restore a dormant certificate capability", () => {
  const context = {
    organisationId: "organisation-a",
    userId: "user-a",
    role: "customer",
    customerSourceId: "customer-a",
  };
  const certificateKey = `jr-os-certificates:organisation:${JSON.stringify([context.organisationId])}:account:${JSON.stringify([
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
    [certificateKey, JSON.stringify([certificatePayload])],
    [invoiceKey, JSON.stringify([{ id: "invoice-a" }])],
  ]);

  assert.equal(accountBackupStorageKeyAllowed("jr-os-certificates", "customer"), false);
  assert.equal(accountBackupStorageKeyAllowed("jr-os-certificates", "office"), true);
  assert.deepEqual(collectAccountBusinessData(storage, context), {
    "jr-os-invoices": [{ id: "invoice-a" }],
  });
  assert.match(appDataSource, /if \(!accountBackupStorageKeyAllowed\(key, context\.role\)\) return;[\s\S]*const scope = backupStorageScope\(key\)/);
});

test("network-only adapter returns fresh certificates in memory without persisting capability state", async () => {
  const { adapter, calls, storage } = loadAdapter({ rows: [certificateEnvelope] });
  const scoped = adapter.accountStorageKey(
    customerOptions.storageKey,
    customerOptions.organisationId,
    customerOptions.cacheUserId,
    customerOptions.cacheRole,
    customerOptions.cacheCustomerSourceId,
  );
  seedScopedCache(storage, scoped, { ...certificatePayload, externalPdfUrl: "https://stale.example/certificate-a.pdf" });
  const repository = adapter.createCollectionRepository(customerOptions);

  assert.deepEqual(plain(await repository.list()), [certificatePayload]);
  assert.equal(calls.normal.length, 0);
  assert.equal(calls.fresh.length, 1);
  assert.equal(calls.fresh[0].table, "customer_certificates");
  assertScopedCacheAbsent(storage, scoped);
  assert.deepEqual(plain(repository.recordCreators()), {});

  repository.save({ ...certificatePayload, externalPdfUrl: "https://forged.example/certificate.pdf" }, 0);
  repository.remove(certificatePayload.id);
  assertScopedCacheAbsent(storage, scoped);
  assert.deepEqual(calls.queue, []);
});

test("network-only adapter never replays a stale certificate URL offline or after failure", async () => {
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
    seedScopedCache(storage, scoped, { ...certificatePayload, externalPdfUrl: "https://stale.example/replay.pdf" });
    const repository = adapter.createCollectionRepository(customerOptions);
    assert.deepEqual(plain(await repository.list()), []);
    assertScopedCacheAbsent(storage, scoped);
    assert.equal(calls.normal.length, 0);
    assert.equal(calls.fresh.length, options.online ? 1 : 0);
  }
});

test("local and office certificate repositories retain their persistence behavior", async () => {
  const local = loadAdapter({ mode: "local", online: false });
  const localScoped = local.adapter.accountStorageKey(customerOptions.storageKey, "organisation-a", "user-a", "customer", "customer-a");
  seedScopedCache(local.storage, localScoped);
  assert.deepEqual(plain(await local.adapter.createCollectionRepository(customerOptions).list()), [certificatePayload]);
  assertScopedCachePresent(local.storage, localScoped);

  const officeOptions = { ...customerOptions, cacheRole: "office", cacheCustomerSourceId: undefined };
  const office = loadAdapter({ rows: [certificateEnvelope] });
  const officeScoped = office.adapter.accountStorageKey(officeOptions.storageKey, "organisation-a", "user-a", "office", undefined);
  const dormantCustomerScoped = office.adapter.accountStorageKey(customerOptions.storageKey, "organisation-a", "customer-user", "customer", "customer-a");
  seedScopedCache(office.storage, dormantCustomerScoped, { ...certificatePayload, externalPdfUrl: "https://stale.example/certificate-a.pdf" });
  assert.deepEqual(plain(await office.adapter.createCollectionRepository(officeOptions).list()), [certificatePayload]);
  assert.equal(office.calls.normal.length, 1);
  assert.equal(office.calls.fresh.length, 0);
  assertScopedCacheAbsent(office.storage, dormantCustomerScoped);
  assert.notEqual(office.storage.getItem(officeScoped), null);
  assert.notEqual(office.storage.getItem(`jr-os-cloud-versions:${officeScoped}`), null);
  assert.notEqual(office.storage.getItem(`jr-os-cloud-created-by:${officeScoped}`), null);
  assert.equal(office.storage.getItem(`jr-os-cloud-projection-generation:${officeScoped}`), null);
});

test("certificate capability caches sweep before every non-local identity publication", () => {
  const emitStart = identitySource.indexOf("function emit");
  const certificatePurge = identitySource.indexOf('purgeCustomerNetworkOnlyCollectionCaches(window.localStorage, "jr-os-certificates")', emitStart);
  const paymentPurge = identitySource.indexOf('purgeCustomerNetworkOnlyCollectionCaches(window.localStorage, "jr-os-portal-payment-links")', emitStart);
  const fleetPurge = identitySource.indexOf("purgeElectricianFleetCollectionCaches(window.localStorage)", emitStart);
  const publish = identitySource.indexOf("snapshot = next", emitStart);
  assert.ok(emitStart >= 0 && certificatePurge > emitStart && paymentPurge > certificatePurge && fleetPurge > paymentPurge && publish > fleetPurge);
  assert.match(identitySource.slice(emitStart, certificatePurge), /effectiveCloudMode\(\) !== "local"/);
  assert.doesNotMatch(identitySource.slice(emitStart, publish), /next\.identity/);
  assert.match(identitySource.slice(emitStart, publish), /try[\s\S]*jr-os-certificates[\s\S]*catch/);
});

const expected = {
  organisationId: "organisation / a",
  customerId: "customer & a",
  jobId: "job ? a",
  sourceId: "certificate + a",
};

function exactRow(target = expected, overrides = {}) {
  return {
    organisation_id: target.organisationId,
    source_id: target.sourceId,
    customer_source_id: target.customerId,
    job_source_id: target.jobId ?? null,
    deleted_at: null,
    payload: {
      id: target.sourceId,
      customerId: target.customerId,
      jobId: target.jobId ?? undefined,
      status: "Issued",
      externalPdfUrl: "https://certificates.example/current.pdf?download=1",
    },
    ...overrides,
  };
}

test("live certificate lookup binds every capability coordinate and limits ambiguity", () => {
  const query = liveCustomerCertificateQuery(expected);
  for (const fragment of [
    "select=organisation_id,source_id,customer_source_id,job_source_id,payload,deleted_at",
    `organisation_id=eq.${encodeURIComponent(expected.organisationId)}`,
    `source_id=eq.${encodeURIComponent(expected.sourceId)}`,
    `customer_source_id=eq.${encodeURIComponent(expected.customerId)}`,
    `job_source_id=eq.${encodeURIComponent(expected.jobId)}`,
    "payload->>status=eq.Issued",
    "deleted_at=is.null",
    "limit=2",
  ]) assert.ok(query.includes(fragment), fragment);
  assert.match(liveCustomerCertificateQuery({ ...expected, jobId: undefined }), /job_source_id=is\.null/);
  for (const field of ["organisationId", "customerId", "sourceId"]) {
    assert.throws(() => liveCustomerCertificateQuery({ ...expected, [field]: "" }), new RegExp(field));
  }
  assert.throws(() => liveCustomerCertificateQuery({ ...expected, jobId: "" }), /jobId/);
});

test("live certificate response requires one exact issued envelope and a strict HTTPS URL", () => {
  assert.equal(liveCustomerCertificateUrlFromRows([exactRow()], expected), "https://certificates.example/current.pdf?download=1");
  assert.equal(liveCustomerCertificateUrlFromRows([], expected), undefined);
  assert.equal(liveCustomerCertificateUrlFromRows([exactRow(), exactRow()], expected), undefined);
  for (const row of [
    exactRow(expected, { organisation_id: "other-organisation" }),
    exactRow(expected, { source_id: "other-certificate" }),
    exactRow(expected, { customer_source_id: "other-customer" }),
    exactRow(expected, { job_source_id: "other-job" }),
    exactRow(expected, { deleted_at: "2026-09-03T16:00:00.000Z" }),
    exactRow(expected, { payload: { ...exactRow().payload, id: "other-certificate" } }),
    exactRow(expected, { payload: { ...exactRow().payload, customerId: "other-customer" } }),
    exactRow(expected, { payload: { ...exactRow().payload, jobId: "other-job" } }),
    exactRow(expected, { payload: { ...exactRow().payload, status: "Superseded" } }),
  ]) assert.equal(liveCustomerCertificateUrlFromRows([row], expected), undefined);

  for (const unsafe of [
    "http://certificates.example/insecure.pdf",
    "javascript:alert(1)",
    "data:text/html,unsafe",
    "https:certificates.example/noncanonical",
    "https:/certificates.example/noncanonical",
    "https:///certificates.example/noncanonical",
    "https://user:password@certificates.example/private.pdf",
    "https://certificates.example/white space.pdf",
    "https://certificates.example\\redirect.pdf",
    "https://certificates.example/\nnext.pdf",
    "not a URL",
    "",
    42,
    null,
  ]) assert.equal(strictHttpsCertificateUrl(unsafe), undefined, String(unsafe));
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
      if (specifier === "./customerCertificateCapability-core.mjs") return certificateCapabilityCore;
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
const certificate = {
  id: expected.sourceId,
  customerId: expected.customerId,
  jobId: expected.jobId,
  status: "Issued",
};

test("certificate click-time loader revalidates identity and performs only a fresh exact read", async () => {
  const { capability, calls } = loadCapability();
  assert.equal(
    await capability.loadLiveCustomerCertificateUrl({ authorization, certificate }),
    "https://certificates.example/current.pdf?download=1",
  );
  assert.equal(calls.revalidate, 1);
  assert.equal(calls.select.length, 1);
  assert.equal(calls.select[0].table, "customer_certificates");
  assert.equal(calls.select[0].query, liveCustomerCertificateQuery(expected));
});

test("certificate click activation navigates only with a fresh result and current session", async () => {
  const live = loadCapability();
  const navigations = [];
  assert.equal(await live.capability.openLiveCustomerCertificateUrl(
    { authorization, certificate },
    () => true,
    (certificateUrl) => navigations.push(certificateUrl),
  ), true);
  assert.deepEqual(plain(navigations), ["https://certificates.example/current.pdf?download=1"]);

  for (const scenario of [
    { options: { rows: [] }, current: true },
    { options: {}, current: false },
    { options: { duringSelect: (state) => { state.active = false; } }, current: true },
  ]) {
    const guarded = loadCapability(scenario.options);
    const rejectedNavigations = [];
    assert.equal(await guarded.capability.openLiveCustomerCertificateUrl(
      { authorization, certificate },
      () => scenario.current,
      (certificateUrl) => rejectedNavigations.push(certificateUrl),
    ), false);
    assert.deepEqual(rejectedNavigations, []);
  }

  const sessionRace = loadCapability();
  const sessionRaceNavigations = [];
  assert.equal(await sessionRace.capability.openLiveCustomerCertificateUrl(
    { authorization, certificate },
    () => {
      sessionRace.state.ownership = false;
      return true;
    },
    (certificateUrl) => sessionRaceNavigations.push(certificateUrl),
  ), false);
  assert.deepEqual(sessionRaceNavigations, []);

  const failed = loadCapability({ selectError: new Error("fresh lookup failed") });
  const failedNavigations = [];
  await assert.rejects(
    () => failed.capability.openLiveCustomerCertificateUrl(
      { authorization, certificate },
      () => true,
      (certificateUrl) => failedNavigations.push(certificateUrl),
    ),
    /fresh lookup failed/,
  );
  assert.deepEqual(failedNavigations, []);
});

test("certificate loader fails closed offline, on invalid scope, and across identity changes", async () => {
  for (const options of [
    { online: false },
    { active: false },
    { revalidated: false },
    { duringSelect: (state) => { state.active = false; } },
    { duringSelect: (state) => { state.ownership = false; } },
  ]) {
    const { capability } = loadCapability(options);
    assert.equal(await capability.loadLiveCustomerCertificateUrl({ authorization, certificate }), undefined);
  }

  for (const request of [
    { authorization: { ...authorization, role: "office" }, certificate },
    { authorization, certificate: { ...certificate, customerId: "other-customer" } },
    { authorization, certificate: { ...certificate, status: "Superseded" } },
    { authorization, certificate: { ...certificate, id: "" } },
  ]) {
    const rejected = loadCapability();
    assert.equal(await rejected.capability.loadLiveCustomerCertificateUrl(request), undefined);
    assert.equal(rejected.calls.revalidate, 0);
    assert.equal(rejected.calls.select.length, 0);
  }
});

test("customer portal activates live certificates without passing the rendered URL", () => {
  assert.match(cloudClientSource, /cloudSelectFresh[\s\S]*cache: "no-store"/);
  assert.match(adapterSource, /const select = networkOnly \? cloudSelectFresh : cloudSelect/);
  assert.match(storageSource, /if \(networkOnly\)[\s\S]*purgeRoleProjectionCacheStorage[\s\S]*return;/);
  assert.match(
    portalSource,
    /openLiveCustomerCertificateUrl\([\s\S]*\{ authorization, certificate \},[\s\S]*certificateOperationIsCurrent\(authorization, generation\)/,
  );
  assert.match(portalSource, /const liveCustomerCertificate = mode !== "local" && \(customerSession \|\| !identity\)/);
  assert.match(
    portalSource,
    /liveCustomerCertificate[\s\S]*<Button[^>]*onClick=\{\(\) => openLiveCertificate\(\{ id: certificate\.id, customerId: certificate\.customerId, jobId: certificate\.jobId, status: certificate\.status \}\)\}/,
  );
  assert.match(portalSource, /if \(certificateOpeningRef\.current\) return;[\s\S]*certificateOpeningRef\.current = true;/);
  assert.match(portalSource, /\(certificateUrl\) => window\.location\.assign\(certificateUrl\)/);
  assert.doesNotMatch(portalSource, /window\.location\.assign\(certificate\.externalPdfUrl\)/);
  assert.match(portalSource, /const safeCertificateUrl = strictHttpsCertificateUrl\(certificate\.externalPdfUrl\)/);
  assert.match(portalSource, /: <a href=\{safeCertificateUrl\} target="_blank" rel="noreferrer"/);
  assert.doesNotMatch(portalSource, /href=\{certificate\.externalPdfUrl\}/);
});
