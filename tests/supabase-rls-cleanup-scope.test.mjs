import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  cleanupSupabaseRlsTest,
  isTestUserForProfiles,
  objectPathBelongsToTestRun,
  testOrganisationIdentity,
  testUserIdentity,
} from "./supabase-rls.cleanup.mjs";

const runId = "1786381200000-abc12345";
const organisationA = {
  id: "11111111-1111-4111-8111-111111111111",
  name: `JR OS Security A ${runId}`,
};
const organisationB = {
  id: "22222222-2222-4222-8222-222222222222",
  name: `JR OS Security B ${runId}`,
};
const validUser = {
  id: "33333333-3333-4333-8333-333333333333",
  email: `jr-os-rls-a-owner-${runId}@example.com`,
};
const validProfile = {
  id: validUser.id,
  organisation_id: organisationA.id,
  role: "owner",
};

function response(payload, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    async text() {
      return payload === undefined ? "" : JSON.stringify(payload);
    },
  };
}

function cleanupIdentityMaps(profiles = [validProfile]) {
  const identities = [organisationA, organisationB].map(testOrganisationIdentity);
  return {
    organisationsByKey: new Map(
      identities.map((organisation) => [`${organisation.tenant}:${organisation.runId}`, organisation]),
    ),
    profilesByUserId: new Map(profiles.map((profile) => [profile.id, profile])),
  };
}

test("cleanup identities require exact generated names, UUIDs, emails and matching protected profiles", () => {
  const identity = testOrganisationIdentity(organisationA);
  assert.deepEqual(identity, { ...organisationA, tenant: "A", runId });
  assert.equal(testOrganisationIdentity({ ...organisationA, name: `JR OS Security Admin ${runId}` }), null);
  assert.equal(testOrganisationIdentity({ ...organisationA, id: "not-a-uuid" }), null);

  assert.deepEqual(testUserIdentity(validUser), {
    ...validUser,
    tenant: "A",
    role: "owner",
    runId,
  });
  assert.equal(testUserIdentity({ ...validUser, email: `customer-${runId}@example.com` }), null);
  assert.equal(testUserIdentity({ ...validUser, id: "not-a-uuid" }), null);

  const { organisationsByKey, profilesByUserId } = cleanupIdentityMaps();
  assert.equal(isTestUserForProfiles(validUser, organisationsByKey, profilesByUserId), true);
  assert.equal(
    isTestUserForProfiles(
      { ...validUser, id: "66666666-6666-4666-8666-666666666666", user_metadata: { jr_os_test_run: runId } },
      organisationsByKey,
      profilesByUserId,
    ),
    false,
    "User-editable metadata must not authorise deletion without a protected profile",
  );
  assert.equal(
    isTestUserForProfiles(
      validUser,
      organisationsByKey,
      cleanupIdentityMaps([{ ...validProfile, organisation_id: organisationB.id }]).profilesByUserId,
    ),
    false,
  );
  assert.equal(
    isTestUserForProfiles(
      validUser,
      organisationsByKey,
      cleanupIdentityMaps([{ ...validProfile, role: "admin" }]).profilesByUserId,
    ),
    false,
  );
});

test("Storage cleanup accepts only paths under the exact test organisation containing its run id", () => {
  const identity = testOrganisationIdentity(organisationA);
  assert.equal(
    objectPathBelongsToTestRun(`${organisationA.id}/jobs/job-a-${runId}/file-own-${runId}/photo.png`, identity),
    true,
  );
  assert.equal(objectPathBelongsToTestRun(`${organisationA.id}/jobs/real-job/photo.png`, identity), false);
  assert.equal(
    objectPathBelongsToTestRun(`${organisationB.id}/jobs/job-b-${runId}/file-${runId}/photo.png`, identity),
    false,
  );
});

test("fallback cleanup verifies the schema first and deletes only exact test-run resources", async () => {
  const calls = [];
  const privateTestPath = `${organisationA.id}/jobs/job-a-${runId}/file-own-${runId}/photo.png`;
  const privateKeepPath = `${organisationA.id}/jobs/real-job/keep.png`;
  const legacyTestPath = `${organisationA.id}/legacy/legacy-file-${runId}/photo.png`;

  const metadataOnlyUser = {
    id: "66666666-6666-4666-8666-666666666666",
    email: `jr-os-rls-a-admin-${runId}@example.com`,
    user_metadata: { jr_os_test_run: runId },
  };
  const wrongRoleUser = {
    id: "77777777-7777-4777-8777-777777777777",
    email: `jr-os-rls-a-admin-${runId}@example.com`,
  };

  const folders = new Map([
    [`jr-os-private:${organisationA.id}`, [{ name: "jobs", id: null }]],
    [`jr-os-private:${organisationA.id}/jobs`, [
      { name: `job-a-${runId}`, id: null },
      { name: "real-job", id: null },
    ]],
    [`jr-os-private:${organisationA.id}/jobs/job-a-${runId}`, [{ name: `file-own-${runId}`, id: null }]],
    [`jr-os-private:${organisationA.id}/jobs/job-a-${runId}/file-own-${runId}`, [{ name: "photo.png", id: "object-a" }]],
    [`jr-os-private:${organisationA.id}/jobs/real-job`, [{ name: "keep.png", id: "object-keep" }]],
    [`jr-os-files:${organisationA.id}`, [{ name: "legacy", id: null }]],
    [`jr-os-files:${organisationA.id}/legacy`, [{ name: `legacy-file-${runId}`, id: null }]],
    [`jr-os-files:${organisationA.id}/legacy/legacy-file-${runId}`, [{ name: "photo.png", id: "legacy-a" }]],
    [`jr-os-private:${organisationB.id}`, []],
    [`jr-os-files:${organisationB.id}`, []],
  ]);

  const fetchImpl = async (url, init = {}) => {
    const parsed = new URL(url);
    const path = `${parsed.pathname}${parsed.search}`;
    calls.push({ type: "fetch", path, init });

    if (path.startsWith("/rest/v1/organisations?select=id,name")) {
      return response([
        organisationA,
        organisationB,
        { id: "44444444-4444-4444-8444-444444444444", name: "JR Electrical Services" },
        { id: "55555555-5555-4555-8555-555555555555", name: `JR OS Security Admin ${runId}` },
      ]);
    }
    if (path.startsWith("/rest/v1/profiles?select=id,organisation_id,role&organisation_id=in.(")) {
      return response([
        validProfile,
        { id: wrongRoleUser.id, organisation_id: organisationA.id, role: "office" },
        { id: "88888888-8888-4888-8888-888888888888", organisation_id: organisationB.id, role: "admin" },
      ]);
    }
    if (path.startsWith("/storage/v1/object/list/")) {
      const bucket = parsed.pathname.split("/").at(-1);
      const body = JSON.parse(init.body);
      return response(folders.get(`${bucket}:${body.prefix}`) ?? []);
    }
    if (init.method === "DELETE" && path.startsWith("/storage/v1/object/")) return response({});
    if (path === "/auth/v1/admin/users?page=1&per_page=1000") {
      return response({ users: [
        validUser,
        metadataOnlyUser,
        wrongRoleUser,
        { ...validUser, id: "99999999-9999-4999-8999-999999999999", email: "owner@example.com" },
      ] });
    }
    if (init.method === "DELETE" && path.startsWith("/auth/v1/admin/users/")) return response({});
    if (init.method === "DELETE" && path.startsWith("/rest/v1/organisations?id=eq.")) return response(undefined);
    throw new Error(`Unexpected request: ${init.method ?? "GET"} ${path}`);
  };

  const result = await cleanupSupabaseRlsTest({
    url: "https://disposable.example.supabase.co",
    projectRef: "abcdefghijklmnopqrst",
    serviceRoleKey: "test-service-role-key",
    confirmation: "JR_OS_RLS_TEST",
    fetchImpl,
    verifyMigration: async (options) => {
      calls.push({ type: "verify", options });
      return "20260810_065_publish_deployed_migration_version.sql";
    },
  });

  assert.equal(calls[0].type, "verify", "Migration verification must precede every cleanup request");
  assert.equal(calls[0].options.projectRef, "abcdefghijklmnopqrst");
  const profileRead = calls.find((call) => call.type === "fetch" && call.path.startsWith("/rest/v1/profiles?"));
  assert.ok(profileRead, "Cleanup must bind Auth deletion to protected profile rows");
  assert.match(profileRead.path, new RegExp(organisationA.id));
  assert.match(profileRead.path, new RegExp(organisationB.id));

  const storageLists = calls.filter((call) => call.type === "fetch" && call.path.startsWith("/storage/v1/object/list/"));
  assert.equal(storageLists.some((call) => JSON.parse(call.init.body).prefix === ""), false, "Cleanup must never list a bucket root");
  assert.equal(storageLists.every((call) => JSON.parse(call.init.body).limit === 100), true, "Storage listing must use bounded pages");

  const storageDeletes = calls.filter((call) => call.type === "fetch" && call.init.method === "DELETE" && call.path.startsWith("/storage/v1/object/"));
  const deletedPaths = storageDeletes.flatMap((call) => JSON.parse(call.init.body).prefixes).sort();
  assert.deepEqual(deletedPaths, [legacyTestPath, privateTestPath].sort());
  assert.equal(deletedPaths.includes(privateKeepPath), false);

  const deletedUsers = calls
    .filter((call) => call.type === "fetch" && call.init.method === "DELETE" && call.path.startsWith("/auth/v1/admin/users/"))
    .map((call) => call.path);
  assert.deepEqual(deletedUsers, [`/auth/v1/admin/users/${validUser.id}`]);

  const deletedOrganisations = calls
    .filter((call) => call.type === "fetch" && call.init.method === "DELETE" && call.path.startsWith("/rest/v1/organisations?id=eq."))
    .map((call) => call.path)
    .sort();
  assert.deepEqual(deletedOrganisations, [
    `/rest/v1/organisations?id=eq.${organisationA.id}`,
    `/rest/v1/organisations?id=eq.${organisationB.id}`,
  ].sort());
  assert.deepEqual(result, { deletedObjects: 2, deletedUsers: 1, deletedOrganisations: 2 });
});

test("failed migration verification aborts before cleanup can contact a destructive endpoint", async () => {
  let fetchCalled = false;
  await assert.rejects(
    cleanupSupabaseRlsTest({
      url: "https://abcdefghijklmnopqrst.supabase.co",
      projectRef: "abcdefghijklmnopqrst",
      serviceRoleKey: "test-service-role-key",
      confirmation: "JR_OS_RLS_TEST",
      fetchImpl: async () => {
        fetchCalled = true;
        return response({});
      },
      verifyMigration: async () => {
        throw new Error("stale schema");
      },
    }),
    /stale schema/i,
  );
  assert.equal(fetchCalled, false);
});

test("cleanup selectors stay coupled to the live fixture generator", () => {
  const integration = readFileSync(new URL("./supabase-rls.integration.mjs", import.meta.url), "utf8");
  assert.match(integration, /jr-os-rls-\$\{label\}-\$\{runId\}@example\.com/);
  assert.match(integration, /createProfile\s*\(/);
  assert.match(integration, /JR OS Security A \$\{runId\}/);
  assert.match(integration, /JR OS Security B \$\{runId\}/);
});

test("cleanup source contains no user-editable marker, production-name, or root-bucket deletion fallback", () => {
  const source = readFileSync(new URL("./supabase-rls.cleanup.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /user_metadata|raw_user_meta_data/i);
  assert.doesNotMatch(source, /name=eq\.JR%20Electrical%20Services/i);
  assert.doesNotMatch(source, /collectObjectPaths\(\s*\)/i);
  assert.match(source, /await verifyMigration\(\{[\s\S]*projectRef[\s\S]*organisationPayload/i);
  assert.match(source, /profiles\?select=id,organisation_id,role[\s\S]*isTestUserForProfiles/i);
  assert.match(source, /STORAGE_BUCKETS[\s\S]*jr-os-private[\s\S]*jr-os-files/i);
});
