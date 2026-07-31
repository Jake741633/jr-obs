import assert from "node:assert/strict";
import test from "node:test";

const config = {
  url: process.env.SUPABASE_TEST_URL?.replace(/\/$/, ""),
  anonKey: process.env.SUPABASE_TEST_ANON_KEY,
  serviceRoleKey: process.env.SUPABASE_TEST_SERVICE_ROLE_KEY,
  confirmation: process.env.SUPABASE_TEST_CONFIRM,
};

const enabled = Boolean(config.url && config.anonKey && config.serviceRoleKey && config.confirmation === "JR_OS_RLS_TEST");
const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const password = `JrOs-Test-${runId}!`;

function headers(key, accessToken, extra = {}) {
  return {
    apikey: key,
    Authorization: `Bearer ${accessToken || key}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

async function request(path, { method = "GET", key = config.anonKey, accessToken, body, extraHeaders } = {}) {
  const response = await fetch(`${config.url}${path}`, {
    method,
    headers: headers(key, accessToken, extraHeaders),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let payload = null;
  if (text) {
    try { payload = JSON.parse(text); }
    catch { payload = text; }
  }
  return { response, payload };
}

async function service(path, options = {}) {
  return request(path, { ...options, key: config.serviceRoleKey, accessToken: config.serviceRoleKey });
}

async function createUser(label) {
  const email = `jr-os-rls-${label}-${runId}@example.com`;
  const result = await service("/auth/v1/admin/users", {
    method: "POST",
    body: { email, password, email_confirm: true, user_metadata: { test_run: runId } },
  });
  assert.equal(result.response.ok, true, `Unable to create ${label}: ${JSON.stringify(result.payload)}`);
  return { id: result.payload.id, email, password };
}

async function signIn(user) {
  const result = await request("/auth/v1/token?grant_type=password", {
    method: "POST",
    body: { email: user.email, password: user.password },
  });
  assert.equal(result.response.ok, true, `Unable to sign in ${user.email}: ${JSON.stringify(result.payload)}`);
  return result.payload.access_token;
}

async function createOrganisation(name) {
  const result = await service("/rest/v1/organisations", {
    method: "POST",
    body: { name },
    extraHeaders: { Prefer: "return=representation" },
  });
  assert.equal(result.response.ok, true, `Unable to create organisation: ${JSON.stringify(result.payload)}`);
  return result.payload[0].id;
}

async function createProfile(user, organisationId, role, customerSourceId) {
  const result = await service("/rest/v1/profiles", {
    method: "POST",
    body: {
      id: user.id,
      organisation_id: organisationId,
      role,
      active: true,
      customer_source_id: customerSourceId || null,
    },
    extraHeaders: { Prefer: "resolution=merge-duplicates,return=representation" },
  });
  assert.equal(result.response.ok, true, `Unable to create ${role} profile: ${JSON.stringify(result.payload)}`);
}

async function authenticated(token, path, options = {}) {
  return request(path, { ...options, accessToken: token });
}

async function insertRecord(token, table, body) {
  return authenticated(token, `/rest/v1/${table}`, {
    method: "POST",
    body,
    extraHeaders: { Prefer: "return=representation" },
  });
}

async function listRecords(token, table, query = "select=source_id,customer_source_id,job_source_id,payload") {
  return authenticated(token, `/rest/v1/${table}?${query}`);
}

async function cleanup(context) {
  if (!context) return;
  for (const table of ["portal_requests", "jobs", "customers"]) {
    for (const organisationId of context.organisations) {
      await service(`/rest/v1/${table}?organisation_id=eq.${organisationId}`, { method: "DELETE" });
    }
  }
  for (const user of context.users) await service(`/auth/v1/admin/users/${user.id}`, { method: "DELETE" });
  for (const organisationId of context.organisations) await service(`/rest/v1/organisations?id=eq.${organisationId}`, { method: "DELETE" });
}

test("Supabase RLS isolates two organisations and enforces owner, office, electrician and customer roles", { skip: !enabled }, async () => {
  const context = { users: [], organisations: [] };
  try {
    const organisationA = await createOrganisation(`JR OS RLS A ${runId}`);
    const organisationB = await createOrganisation(`JR OS RLS B ${runId}`);
    context.organisations.push(organisationA, organisationB);

    const roles = ["owner", "office", "electrician", "customer"];
    const accounts = { A: {}, B: {} };
    for (const tenant of ["A", "B"]) {
      const organisationId = tenant === "A" ? organisationA : organisationB;
      for (const role of roles) {
        const user = await createUser(`${tenant.toLowerCase()}-${role}`);
        context.users.push(user);
        const customerSourceId = role === "customer" ? `customer-${tenant.toLowerCase()}` : undefined;
        await createProfile(user, organisationId, role, customerSourceId);
        accounts[tenant][role] = { ...user, token: await signIn(user), customerSourceId };
      }
    }

    const customerA = {
      organisation_id: organisationA,
      source_id: "customer-a",
      customer_source_id: "customer-a",
      payload: { id: "customer-a", name: "Tenant A customer" },
    };
    const customerAOther = {
      organisation_id: organisationA,
      source_id: "customer-a-other",
      customer_source_id: "customer-a-other",
      payload: { id: "customer-a-other", name: "Another tenant A customer" },
    };
    const customerB = {
      organisation_id: organisationB,
      source_id: "customer-b",
      customer_source_id: "customer-b",
      payload: { id: "customer-b", name: "Tenant B customer" },
    };

    assert.equal((await insertRecord(accounts.A.office.token, "customers", customerA)).response.ok, true, "Office A should create customers");
    assert.equal((await insertRecord(accounts.A.office.token, "customers", customerAOther)).response.ok, true, "Office A should create another customer");
    assert.equal((await insertRecord(accounts.B.office.token, "customers", customerB)).response.ok, true, "Office B should create customers");
    assert.equal((await insertRecord(accounts.A.electrician.token, "customers", { ...customerA, source_id: "electrician-blocked" })).response.ok, false, "Electrician must not create office customer records");

    const ownerAView = await listRecords(accounts.A.owner.token, "customers");
    assert.equal(ownerAView.response.ok, true);
    assert.deepEqual(ownerAView.payload.map((row) => row.source_id).sort(), ["customer-a", "customer-a-other"]);

    const ownerBView = await listRecords(accounts.B.owner.token, "customers");
    assert.equal(ownerBView.response.ok, true);
    assert.deepEqual(ownerBView.payload.map((row) => row.source_id), ["customer-b"]);

    const customerAView = await listRecords(accounts.A.customer.token, "customers");
    assert.equal(customerAView.response.ok, true);
    assert.deepEqual(customerAView.payload.map((row) => row.source_id), ["customer-a"], "Customer account must only see its own customer-scoped row");

    const jobA = {
      organisation_id: organisationA,
      source_id: "job-a",
      customer_source_id: "customer-a",
      job_source_id: "job-a",
      payload: { id: "job-a", customerId: "customer-a", title: "Tenant A job" },
    };
    const jobB = {
      organisation_id: organisationB,
      source_id: "job-b",
      customer_source_id: "customer-b",
      job_source_id: "job-b",
      payload: { id: "job-b", customerId: "customer-b", title: "Tenant B job" },
    };
    assert.equal((await insertRecord(accounts.A.electrician.token, "jobs", jobA)).response.ok, true, "Electrician A should create field job records");
    assert.equal((await insertRecord(accounts.B.electrician.token, "jobs", jobB)).response.ok, true, "Electrician B should create field job records");
    assert.deepEqual((await listRecords(accounts.A.owner.token, "jobs")).payload.map((row) => row.source_id), ["job-a"]);
    assert.deepEqual((await listRecords(accounts.B.owner.token, "jobs")).payload.map((row) => row.source_id), ["job-b"]);
    assert.deepEqual((await listRecords(accounts.A.customer.token, "jobs")).payload.map((row) => row.source_id), ["job-a"]);

    const forbiddenCustomerWrite = await insertRecord(accounts.A.customer.token, "jobs", { ...jobA, source_id: "customer-write-blocked" });
    assert.equal(forbiddenCustomerWrite.response.ok, false, "Customer must not create business job records");

    const portalRequest = {
      organisation_id: organisationA,
      source_id: "request-a",
      customer_source_id: "customer-a",
      job_source_id: "job-a",
      payload: { id: "request-a", customerId: "customer-a", jobId: "job-a", type: "Question", message: "Please confirm access", status: "Open" },
    };
    assert.equal((await insertRecord(accounts.A.customer.token, "portal_requests", portalRequest)).response.ok, true, "Customer should create its own portal request");
    assert.deepEqual((await listRecords(accounts.A.customer.token, "portal_requests")).payload.map((row) => row.source_id), ["request-a"]);
    assert.deepEqual((await listRecords(accounts.B.owner.token, "portal_requests")).payload, [], "Tenant B must not see Tenant A portal requests");
  } finally {
    await cleanup(context);
  }
});
