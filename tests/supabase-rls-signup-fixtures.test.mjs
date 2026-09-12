import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("./supabase-rls.integration.mjs", import.meta.url), "utf8");
const targetOrganisation = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function fixture({ failInsert = false, failDelete = false } = {}) {
  const requests = [];
  const profiles = new Map();
  const organisations = new Map([[targetOrganisation, { id: targetOrganisation, name: "Target test business" }]]);
  let sequence = 0;
  const uuid = () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`;
  const response = (payload, ok = true) => ({ ok, text: async () => JSON.stringify(payload) });
  const fetch = async (url, options) => {
    const { pathname, searchParams } = new URL(url);
    const body = options.body ? JSON.parse(options.body) : undefined;
    const method = options.method;
    requests.push({ pathname, method, body, query: searchParams.toString(), headers: options.headers });
    const id = searchParams.get("id")?.replace(/^eq\./, "");
    const organisationId = searchParams.get("organisation_id")?.replace(/^eq\./, "");
    if (pathname === "/auth/v1/admin/users" && method === "POST") {
      const userId = uuid();
      const signupOrganisationId = uuid();
      organisations.set(signupOrganisationId, {
        id: signupOrganisationId,
        name: body.user_metadata?.business_name || "New JR OS Business",
      });
      profiles.set(userId, { id: userId, organisation_id: signupOrganisationId, role: "owner" });
      return response({ id: userId });
    }
    if (pathname === "/rest/v1/profiles") {
      const existing = profiles.get(id || body?.id);
      if (method === "GET") return response(existing ? [existing] : []);
      if (method === "DELETE") {
        if (failDelete) return response({ message: "Fixture deletion failed" }, false);
        const matches = existing && (!organisationId || existing.organisation_id === organisationId);
        if (matches) profiles.delete(id);
        return response(matches ? [existing] : []);
      }
      if (method === "POST") {
        if (existing && existing.organisation_id !== body.organisation_id) {
          return response({ code: "42501", message: "Profile user and organisation identities are immutable" }, false);
        }
        if (existing && !options.headers.Prefer?.includes("resolution=merge-duplicates")) {
          return response({ code: "23505", message: "Profile already exists" }, false);
        }
        if (failInsert) return response({ message: "Fixture insertion failed" }, false);
        profiles.set(body.id, body);
        return response([body]);
      }
    }
    if (pathname === "/rest/v1/organisations") {
      const existing = organisations.get(id);
      const name = searchParams.get("name")?.replace(/^eq\./, "");
      if (method === "GET") return response(existing ? [existing] : []);
      if (method === "DELETE") {
        const matches = existing && (!name || existing.name === name);
        if (matches) organisations.delete(id);
        return response(matches ? [existing] : []);
      }
    }
    if (pathname.startsWith("/auth/v1/admin/users/") && method === "DELETE") {
      profiles.delete(pathname.split("/").at(-1));
      return response({});
    }
    if (pathname.startsWith("/rest/v1/") && method === "DELETE") return response([]);
    throw new Error(`Unexpected fixture request: ${method} ${pathname}`);
  };
  const noTest = Object.assign(() => {}, { skip: () => {} });
  // Exercise the real HTTP helpers without registering the live integration test.
  const api = runInNewContext(`${source.replace(/^import .+;\n/gm, "")}\n({ createUser, createProfile, cleanup });`, {
    assert,
    test: noTest,
    process: { env: {
      SUPABASE_TEST_URL: "https://abcdefghijklmnopqrst.supabase.co",
      SUPABASE_TEST_ANON_KEY: "fixture-public-key",
      SUPABASE_TEST_SERVICE_ROLE_KEY: "fixture-service-key",
    } },
    fetch,
  }, { timeout: 1000 });
  return { ...api, requests, profiles, organisations };
}

test("RLS fixtures provision every role without moving an immutable signup profile", async () => {
  const state = fixture();
  for (const role of ["owner", "admin", "office", "electrician", "customer"]) {
    const user = await state.createUser(`a-${role}`);
    const signupOrganisation = state.profiles.get(user.id).organisation_id;
    await state.createProfile(user, targetOrganisation, role, role === "customer" ? "customer-a" : undefined);
    assert.equal(state.profiles.get(user.id).organisation_id, targetOrganisation);
    assert.equal(state.profiles.get(user.id).role, role);
    assert.equal(user.signupOrganisationId, signupOrganisation);
    const deletion = state.requests.findIndex((request) => request.method === "DELETE" && request.pathname === "/rest/v1/profiles" && request.query.includes(user.id));
    const insertion = state.requests.findIndex((request) => request.method === "POST" && request.pathname === "/rest/v1/profiles" && request.body.id === user.id);
    assert.ok(deletion >= 0 && insertion > deletion);
  }
  assert.equal(state.requests.some((request) => request.headers.Prefer?.includes("resolution=merge-duplicates")), false);
});

test("fixture setup rejects a mismatched signup business before deleting profiles", async () => {
  const state = fixture();
  const user = await state.createUser("a-owner");
  state.organisations.get(state.profiles.get(user.id).organisation_id).name = "Unrelated business";
  await assert.rejects(state.createProfile(user, targetOrganisation, "owner"), /signup business/i);
  assert.equal(state.requests.some((request) => request.method === "DELETE"), false);
  assert.equal(state.profiles.get(user.id).role, "owner");
});

test("fixture setup rejects an unexpected signup role before deleting profiles", async () => {
  const state = fixture();
  const user = await state.createUser("a-office");
  state.profiles.get(user.id).role = "office";
  await assert.rejects(state.createProfile(user, targetOrganisation, "office"), /signup profile/i);
  assert.equal(state.requests.some((request) => request.method === "DELETE"), false);
});

test("fixture setup stops when its exact signup-profile deletion fails", async () => {
  const state = fixture({ failDelete: true });
  const user = await state.createUser("a-admin");
  await assert.rejects(state.createProfile(user, targetOrganisation, "admin"), /signup profile/i);
  assert.equal(state.requests.some((request) => request.pathname === "/rest/v1/profiles" && request.method === "POST"), false);
  assert.equal(state.profiles.get(user.id).role, "owner");
});

test("cleanup retains the signup business identity after a failed fixture insert", async () => {
  const state = fixture({ failInsert: true });
  const user = await state.createUser("a-electrician");
  const signupOrganisation = state.profiles.get(user.id).organisation_id;
  await assert.rejects(state.createProfile(user, targetOrganisation, "electrician"), /Unable to create electrician profile/);
  await state.cleanup({ users: [user], organisations: [], objectPaths: [], legacyObjectPaths: [] });
  assert.equal(state.organisations.has(signupOrganisation), false);
  assert.equal(state.organisations.has(targetOrganisation), true);
  const deletion = state.requests.find((request) => request.pathname === "/rest/v1/organisations" && request.method === "DELETE");
  assert.equal(new URLSearchParams(deletion.query).get("id"), `eq.${signupOrganisation}`);
  assert.equal(new URLSearchParams(deletion.query).get("name"), `eq.${user.signupOrganisationName}`);
});

test("profile restoration inserts a missing row and rejects an established membership", async () => {
  const state = fixture();
  const user = { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" };
  await state.createProfile(user, targetOrganisation, "customer", "customer-a");
  assert.equal(state.profiles.get(user.id).customer_source_id, "customer-a");
  await assert.rejects(state.createProfile(user, targetOrganisation, "owner"), /Unable to create owner profile/);
  assert.equal(state.profiles.get(user.id).role, "customer");
  assert.equal(state.requests.some((request) => request.method === "DELETE"), false);
});
