import assert from "node:assert/strict";
import test from "node:test";

const config = {
  url: process.env.SUPABASE_TEST_URL?.replace(/\/$/, ""),
  anonKey: process.env.SUPABASE_TEST_ANON_KEY,
  serviceRoleKey: process.env.SUPABASE_TEST_SERVICE_ROLE_KEY,
  confirmation: process.env.SUPABASE_TEST_CONFIRM,
};

const enabled = Boolean(config.url && config.anonKey && config.serviceRoleKey && config.confirmation === "JR_OS_RLS_TEST");
const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
const password = `JrOs-Test-${runId}!`;
const bucket = "jr-os-private";
const legacyBucket = "jr-os-files";

const typedTables = [
  "customers", "jobs", "pricing_documents", "invoices", "payments", "expenses", "materials",
  "stock_items", "stock_movements", "purchase_lists", "planner_entries", "team_members", "timesheets",
  "certificates", "electrical_testing_records", "job_documents", "portal_approvals", "portal_requests",
  "ai_recommendation_evidence",
];
const cleanupTables = ["private_files", "app_records", "cloud_collections", ...typedTables, "audit_log"];

function authHeaders(key, accessToken, extra = {}) {
  return {
    apikey: key,
    Authorization: `Bearer ${accessToken || key}`,
    ...extra,
  };
}

async function request(path, { method = "GET", key = config.anonKey, accessToken, body, extraHeaders, rawBody } = {}) {
  const headers = authHeaders(key, accessToken, extraHeaders);
  let requestBody;
  if (rawBody !== undefined) requestBody = rawBody;
  else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    requestBody = JSON.stringify(body);
  }
  const response = await fetch(`${config.url}${path}`, { method, headers, body: requestBody });
  const text = await response.text();
  let payload = null;
  if (text) {
    try { payload = JSON.parse(text); } catch { payload = text; }
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
    body: { email, password, email_confirm: true, user_metadata: { jr_os_test_run: runId } },
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
  return { accessToken: result.payload.access_token, refreshToken: result.payload.refresh_token };
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
    body: { id: user.id, organisation_id: organisationId, role, active: true, customer_source_id: customerSourceId || null },
    extraHeaders: { Prefer: "resolution=merge-duplicates,return=representation" },
  });
  assert.equal(result.response.ok, true, `Unable to create ${role} profile: ${JSON.stringify(result.payload)}`);
}

async function authenticated(account, path, options = {}) {
  return request(path, { ...options, accessToken: account.accessToken });
}

async function insertRecord(account, table, body) {
  return authenticated(account, `/rest/v1/${table}`, {
    method: "POST",
    body,
    extraHeaders: { Prefer: "return=representation" },
  });
}

async function listRecords(account, table, query = "select=*") {
  return authenticated(account, `/rest/v1/${table}?${query}`);
}

async function patchRecords(account, table, query, body) {
  return authenticated(account, `/rest/v1/${table}?${query}`, {
    method: "PATCH",
    body,
    extraHeaders: { Prefer: "return=representation" },
  });
}

async function deleteRecords(account, table, query) {
  return authenticated(account, `/rest/v1/${table}?${query}`, {
    method: "DELETE",
    extraHeaders: { Prefer: "return=representation" },
  });
}

function source(prefix) { return `${prefix}-${runId}`; }
function typedRecord(organisationId, sourceId, customerSourceId, jobSourceId, extra = {}) {
  return {
    organisation_id: organisationId,
    source_id: sourceId,
    customer_source_id: customerSourceId || null,
    job_source_id: jobSourceId || null,
    payload: { id: sourceId, customerId: customerSourceId, jobId: jobSourceId, testRun: runId, ...extra },
  };
}
function genericRecord(organisationId, collectionKey, sourceId, account, customerSourceId, jobSourceId, extra = {}) {
  return {
    organisation_id: organisationId,
    collection_key: collectionKey,
    source_id: sourceId,
    customer_source_id: customerSourceId || null,
    job_source_id: jobSourceId || null,
    payload: { id: sourceId, customerId: customerSourceId, jobId: jobSourceId, testRun: runId, ...extra },
    created_by: account.id,
    updated_by: account.id,
  };
}

function encodedPath(path) { return path.split("/").map(encodeURIComponent).join("/"); }
function absoluteSignedUrl(value) {
  if (/^https?:\/\//i.test(value)) return value;
  return `${config.url}/storage/v1${value.startsWith("/") ? value : `/${value}`}`;
}

async function createSignedUpload(account, path, storageBucket = bucket) {
  return authenticated(account, `/storage/v1/object/upload/sign/${storageBucket}/${encodedPath(path)}`, {
    method: "POST",
    body: { expiresIn: 120 },
  });
}

async function uploadSigned(signedPayload, bytes, mimeType) {
  const value = signedPayload.signedURL || signedPayload.signedUrl || signedPayload.url;
  assert.ok(value, "Signed upload response did not contain a URL");
  return fetch(absoluteSignedUrl(value), {
    method: "PUT",
    headers: { "Content-Type": mimeType, "x-upsert": "false" },
    body: bytes,
  });
}

async function createSignedDownload(account, path, expiresIn = 60) {
  return authenticated(account, `/storage/v1/object/sign/${bucket}/${encodedPath(path)}`, {
    method: "POST",
    body: { expiresIn },
  });
}

async function deleteStorageObject(account, path) {
  return authenticated(account, `/storage/v1/object/${bucket}/${encodedPath(path)}`, { method: "DELETE" });
}

async function cleanup(context) {
  if (!context) return;
  for (const path of context.objectPaths) {
    await service(`/storage/v1/object/${bucket}/${encodedPath(path)}`, { method: "DELETE" }).catch(() => undefined);
  }
  for (const path of context.legacyObjectPaths) {
    await service(`/storage/v1/object/${legacyBucket}/${encodedPath(path)}`, { method: "DELETE" }).catch(() => undefined);
  }
  for (const table of cleanupTables) {
    for (const organisationId of context.organisations) {
      await service(`/rest/v1/${table}?organisation_id=eq.${organisationId}`, { method: "DELETE" }).catch(() => undefined);
    }
  }
  for (const user of context.users) {
    await service(`/auth/v1/admin/users/${user.id}`, { method: "DELETE" }).catch(() => undefined);
  }
  for (const organisationId of context.organisations) {
    await service(`/rest/v1/organisations?id=eq.${organisationId}`, { method: "DELETE" }).catch(() => undefined);
  }
}

async function expectAllowed(result, message) {
  assert.equal(result.response.ok, true, `${message}: ${JSON.stringify(result.payload)}`);
}
async function expectDenied(result, message) {
  assert.equal(result.response.ok, false, `${message}: unexpectedly allowed`);
}

const integrationTest = enabled ? test : test.skip;

integrationTest("Supabase RLS and private Storage enforce JR OS tenant and role boundaries", { timeout: 180_000 }, async () => {
  const context = { users: [], organisations: [], objectPaths: [], legacyObjectPaths: [] };
  try {
    await expectDenied(
      await request("/rest/v1/jobs?select=id"),
      "Anonymous Data API access must fail at the grant boundary",
    );

    const organisationA = await createOrganisation(`JR OS Security A ${runId}`);
    const organisationB = await createOrganisation(`JR OS Security B ${runId}`);
    context.organisations.push(organisationA, organisationB);

    const roles = ["owner", "admin", "office", "electrician", "customer"];
    const accounts = { A: {}, B: {} };
    for (const tenant of ["A", "B"]) {
      const organisationId = tenant === "A" ? organisationA : organisationB;
      for (const role of roles) {
        const user = await createUser(`${tenant.toLowerCase()}-${role}`);
        context.users.push(user);
        const customerSourceId = role === "customer" ? source(`customer-${tenant.toLowerCase()}`) : undefined;
        await createProfile(user, organisationId, role, customerSourceId);
        const session = await signIn(user);
        accounts[tenant][role] = { ...user, ...session, customerSourceId, organisationId };
      }
    }

    const customerA = accounts.A.customer.customerSourceId;
    const customerB = accounts.B.customer.customerSourceId;
    const otherCustomerA = source("customer-a-other");
    const jobA = source("job-a");
    const jobB = source("job-b");
    const otherCustomerJobA = source("job-a-other-customer");

    // SECURITY DEFINER authorization helpers are policy internals, not public
    // PostgREST RPC endpoints. RLS keeps EXECUTE through the private schema.
    const helperRpcCases = [
      ["current_jr_role", {}],
      ["current_customer_source_id", {}],
      ["is_organisation_member", { target_organisation_id: organisationA }],
      ["current_organisation_id", {}],
      ["current_role", {}],
      ["can_manage_business", {}],
      ["can_manage_office_data", {}],
      ["can_manage_field_data", {}],
      ["can_write_cloud_collection", { collection_key_value: "jr-os-job-tasks" }],
    ];
    for (const [helper, body] of helperRpcCases) {
      await expectDenied(
        await authenticated(accounts.A.owner, `/rest/v1/rpc/${helper}`, { method: "POST", body }),
        `Authorization helper RPC must not be exposed: ${helper}`,
      );
    }

    // Legacy aggregate backups contain the complete organisation and remain office-only.
    const legacyBackupId = JSON.stringify([organisationA, source("legacy-backup")]);
    await expectAllowed(await insertRecord(accounts.A.owner, "app_records", {
      id: legacyBackupId,
      organisation_id: organisationA,
      collection: "legacy-backup",
      payload: { storageKey: "jr-os-customers", value: [{ id: customerA, name: "Private legacy customer" }] },
      created_by: accounts.A.owner.id,
      updated_by: accounts.A.owner.id,
    }), "Owner should create a tenant-bound legacy backup");
    for (const role of ["owner", "admin", "office"]) {
      const result = await listRecords(accounts.A[role], "app_records", `select=id&id=eq.${encodeURIComponent(legacyBackupId)}`);
      await expectAllowed(result, `${role} legacy backup query should execute`);
      assert.equal(result.payload.length, 1, `${role} should read its organisation legacy backup`);
    }
    for (const role of ["electrician", "customer"]) {
      const result = await listRecords(accounts.A[role], "app_records", `select=id&id=eq.${encodeURIComponent(legacyBackupId)}`);
      await expectAllowed(result, `${role} legacy backup query should fail closed`);
      assert.deepEqual(result.payload, [], `${role} must not read full organisation backups`);
    }
    const crossTenantLegacyRead = await listRecords(accounts.B.owner, "app_records", `select=id&id=eq.${encodeURIComponent(legacyBackupId)}`);
    await expectAllowed(crossTenantLegacyRead, "Cross-tenant legacy backup query should execute safely");
    assert.deepEqual(crossTenantLegacyRead.payload, [], "Another organisation must not read the legacy backup");

    // Seed customer/job relationship roots before dependent records. The
    // binding guard rejects aliases and orphaned references by design.
    await expectAllowed(
      await insertRecord(accounts.A.office, "customers", typedRecord(organisationA, customerA, customerA, null, { name: "Tenant A customer" })),
      "Office should create its tenant customer",
    );
    await expectDenied(
      await insertRecord(accounts.A.electrician, "customers", typedRecord(organisationA, source("customer-field-blocked"), source("customer-field-blocked"), null)),
      "Electrician must not create office-only customers",
    );
    await expectDenied(
      await insertRecord(accounts.A.office, "customers", typedRecord(organisationB, customerB, customerB, null)),
      "Office must not create a customer in another tenant",
    );
    await expectAllowed(
      await insertRecord(accounts.A.office, "customers", typedRecord(organisationA, otherCustomerA, otherCustomerA, null, { name: "Other customer" })),
      "Office should create a second same-tenant customer",
    );
    await expectAllowed(
      await insertRecord(accounts.B.office, "customers", typedRecord(organisationB, customerB, customerB, null, { name: "Tenant B customer" })),
      "Tenant B office should create its customer",
    );
    await expectAllowed(
      await insertRecord(accounts.A.electrician, "jobs", typedRecord(organisationA, jobA, customerA, null, { title: "Tenant A job" })),
      "Electrician should create a same-tenant job",
    );
    await expectDenied(
      await insertRecord(accounts.A.electrician, "jobs", typedRecord(organisationB, source("job-cross"), customerB, null)),
      "Electrician must not create a job in another tenant",
    );
    await expectAllowed(
      await insertRecord(accounts.A.electrician, "jobs", typedRecord(organisationA, otherCustomerJobA, otherCustomerA, null, { title: "Other customer job" })),
      "Electrician should create a same-tenant job for the other customer",
    );
    await expectAllowed(
      await insertRecord(accounts.B.electrician, "jobs", typedRecord(organisationB, jobB, customerB, null, { title: "Tenant B job" })),
      "Tenant B electrician should create its own job",
    );

    // Office-only tables and typed entity tenant isolation.
    const officeCases = [
      ["pricing_documents", source("quote-a"), { type: "Quote", status: "Draft" }],
      ["invoices", source("invoice-a"), { status: "Draft", total: 1200 }],
      ["payments", source("payment-a"), { amount: 200, method: "Bank transfer" }],
      ["expenses", source("expense-a"), { grossAmount: 50 }],
      ["team_members", source("team-a"), { role: "Electrician" }],
      ["ai_recommendation_evidence", source("evidence-a"), { confidence: 82 }],
    ];
    for (const [table, sourceId, payload] of officeCases) {
      await expectAllowed(await insertRecord(accounts.A.office, table, typedRecord(organisationA, sourceId, customerA, jobA, payload)), `Office should write ${table}`);
      await expectDenied(await insertRecord(accounts.A.electrician, table, typedRecord(organisationA, `${sourceId}-blocked`, customerA, jobA, payload)), `Electrician must not write office-only ${table}`);
      await expectDenied(await insertRecord(accounts.A.office, table, typedRecord(organisationB, `${sourceId}-cross`, customerB, jobB, payload)), `Office must not write ${table} into another tenant`);
      const tenantBRead = await listRecords(accounts.B.owner, table, `select=source_id&source_id=eq.${encodeURIComponent(sourceId)}`);
      await expectAllowed(tenantBRead, `Tenant B query should execute for ${table}`);
      assert.deepEqual(tenantBRead.payload, [], `Tenant B must not read Tenant A ${table}`);
    }

    // Field-write tables.
    const fieldCases = [
      ["materials", source("material-a"), { name: "Cable" }],
      ["stock_items", source("stock-a"), { quantity: 4 }],
      ["stock_movements", source("movement-a"), { type: "Used", quantity: 1 }],
      ["purchase_lists", source("purchase-a"), { status: "Draft" }],
      ["planner_entries", source("planner-a"), { startDate: "2026-08-01" }],
      ["timesheets", source("timesheet-a"), { hours: 8 }],
      ["certificates", source("certificate-a"), { status: "Draft" }],
      ["electrical_testing_records", source("testing-a"), { status: "Draft" }],
      ["job_documents", source("document-a"), { category: "Photo" }],
    ];
    for (const [table, sourceId, payload] of fieldCases) {
      await expectAllowed(await insertRecord(accounts.A.electrician, table, typedRecord(organisationA, sourceId, customerA, jobA, payload)), `Electrician should write ${table}`);
      await expectDenied(await insertRecord(accounts.A.electrician, table, typedRecord(organisationB, `${sourceId}-cross`, customerB, jobB, payload)), `Electrician must not write cross-tenant ${table}`);
    }

    // Customer scoping for typed tables and portal writes.
    const customerJobs = await listRecords(accounts.A.customer, "jobs", "select=source_id,customer_source_id");
    await expectAllowed(customerJobs, "Customer jobs read should execute");
    assert.deepEqual(customerJobs.payload.map((row) => row.source_id), [jobA]);
    await expectDenied(await insertRecord(accounts.A.customer, "jobs", typedRecord(organisationA, source("customer-job-write"), customerA, null)), "Customer must not create jobs");

    const approvalA = source("approval-a");
    const requestA = source("request-a");
    await expectAllowed(await insertRecord(accounts.A.customer, "portal_approvals", typedRecord(organisationA, approvalA, customerA, jobA, { decision: "Accepted" })), "Customer should create own approval");
    await expectAllowed(await insertRecord(accounts.A.customer, "portal_requests", typedRecord(organisationA, requestA, customerA, jobA, { type: "Question" })), "Customer should create own request");
    await expectAllowed(
      await insertRecord(accounts.A.office, "portal_requests", typedRecord(organisationA, source("request-staff-valid"), customerA, jobA, { type: "Question" })),
      "Staff should create a portal request for a matching tenant job",
    );
    await expectDenied(
      await insertRecord(accounts.A.office, "portal_requests", typedRecord(organisationA, source("request-staff-cross-job"), customerA, jobB, { type: "Question" })),
      "Staff must not bind a portal request to another tenant's job",
    );
    await expectDenied(await insertRecord(accounts.A.customer, "portal_requests", typedRecord(organisationA, source("request-other"), otherCustomerA, jobA)), "Customer must not create another customer request");
    await expectDenied(
      await insertRecord(accounts.A.customer, "portal_approvals", typedRecord(organisationA, source("approval-cross-tenant-job"), customerA, jobB)),
      "Customer must not attach an approval to another tenant's job while keeping their own customer ID",
    );
    await expectDenied(
      await insertRecord(accounts.A.customer, "portal_requests", typedRecord(organisationA, source("request-other-customer-job"), customerA, otherCustomerJobA)),
      "Customer must not attach a request to another customer's job while keeping their own customer ID",
    );
    await expectAllowed(
      await patchRecords(accounts.A.office, "portal_requests", `source_id=eq.${requestA}`, {
        payload: { id: requestA, customerId: customerA, jobId: jobA, status: "In review", testRun: runId },
      }),
      "Staff should update portal request workflow data without changing its binding",
    );
    await expectDenied(
      await patchRecords(accounts.A.office, "portal_requests", `source_id=eq.${requestA}`, {
        customer_source_id: otherCustomerA,
        job_source_id: otherCustomerJobA,
      }),
      "Staff must not rebind a customer portal submission",
    );
    await expectDenied(
      await patchRecords(accounts.A.office, "portal_approvals", `source_id=eq.${approvalA}`, {
        customer_source_id: otherCustomerA,
        job_source_id: otherCustomerJobA,
      }),
      "Staff must not rebind a customer portal submission approval",
    );
    assert.deepEqual((await listRecords(accounts.B.owner, "portal_requests", `select=source_id&source_id=eq.${requestA}`)).payload, []);

    // Generic cloud_collections: electricians retain field-operational writes,
    // while office-only AI learning state remains protected.
    const genericCases = [
      ["jr-os-surveys", source("survey-a"), { circuits: [{ id: "c1" }] }],
      ["jr-os-rams", source("rams-a"), { risks: [{ id: "r1" }] }],
      ["jr-os-job-packs", source("pack-a"), { materials: [{ id: "m1" }] }],
    ];
    for (const [collectionKey, sourceId, payload] of genericCases) {
      await expectAllowed(await insertRecord(accounts.A.electrician, "cloud_collections", genericRecord(organisationA, collectionKey, sourceId, accounts.A.electrician, customerA, jobA, payload)), `Field staff should write ${collectionKey}`);
      await expectDenied(await insertRecord(accounts.A.electrician, "cloud_collections", genericRecord(organisationB, collectionKey, `${sourceId}-cross`, accounts.A.electrician, customerB, jobB, payload)), `Cross-tenant generic write must fail for ${collectionKey}`);
      assert.deepEqual((await listRecords(accounts.B.owner, "cloud_collections", `select=source_id&collection_key=eq.${encodeURIComponent(collectionKey)}&source_id=eq.${sourceId}`)).payload, []);
    }
    await expectDenied(
      await patchRecords(
        accounts.A.electrician,
        "cloud_collections",
        `collection_key=eq.${encodeURIComponent("jr-os-surveys")}&source_id=eq.${source("survey-a")}`,
        { customer_source_id: otherCustomerA, job_source_id: otherCustomerJobA },
      ),
      "RLS metadata must match the stored business payload",
    );
    await expectDenied(
      await insertRecord(
        accounts.A.office,
        "pricing_documents",
        typedRecord(organisationA, source("cross-organisation-binding"), customerB, jobB, { type: "Quote" }),
      ),
      "Cloud records must not bind another organisation's customer or job",
    );
    await expectDenied(
      await insertRecord(
        accounts.A.electrician,
        "planner_entries",
        typedRecord(organisationA, source("mismatched-job-customer"), customerA, otherCustomerJobA),
      ),
      "Cloud records must not bind a job to a different customer",
    );
    await expectDenied(
      await insertRecord(
        accounts.A.electrician,
        "cloud_collections",
        genericRecord(
          organisationA,
          "jr-os-rams",
          source("stable-envelope-id"),
          accounts.A.electrician,
          customerA,
          jobA,
          { id: source("forged-payload-id") },
        ),
      ),
      "Cloud payload ids must match stable source ids",
    );
    await expectDenied(await insertRecord(
      accounts.A.electrician,
      "cloud_collections",
      genericRecord(organisationA, "jr-os-ai-learning-memory", source("memory-a"), accounts.A.electrician, customerA, jobA, { confidence: { overall: 75 } }),
    ), "Electrician must not write office-only AI learning memory");

    // Soft delete/tombstone and conflict-safe versioning assumptions.
    await expectDenied(
      await patchRecords(accounts.A.electrician, "jobs", `source_id=eq.${jobA}`, { deleted_at: new Date().toISOString() }),
      "Electrician must not create a soft-delete tombstone",
    );
    const tombstone = await patchRecords(accounts.A.owner, "jobs", `source_id=eq.${jobA}`, { deleted_at: new Date().toISOString() });
    await expectAllowed(tombstone, "Owner should create a soft-delete tombstone");
    assert.equal(tombstone.payload[0].version >= 2, true);
    const activeJobs = await listRecords(accounts.A.owner, "jobs", `select=source_id&source_id=eq.${jobA}&deleted_at=is.null`);
    assert.deepEqual(activeJobs.payload, [], "Tombstoned rows must be excluded by active-record queries");
    const tombstones = await listRecords(accounts.A.owner, "jobs", `select=source_id,deleted_at&source_id=eq.${jobA}&deleted_at=not.is.null`);
    assert.equal(tombstones.payload.length, 1, "Tombstone must remain available for sync conflict detection");
    await expectAllowed(
      await patchRecords(accounts.A.owner, "jobs", `source_id=eq.${jobA}`, { deleted_at: null }),
      "Owner should restore the job before adding new private files",
    );

    // Role-change protection and deactivation.
    await expectDenied(await patchRecords(accounts.A.office, "profiles", `id=eq.${accounts.A.office.id}`, { role: "owner" }), "Office user must not self-promote");
    await expectDenied(
      await patchRecords(accounts.A.admin, "profiles", `id=eq.${accounts.A.admin.id}`, { role: "owner" }),
      "Admins must not promote themselves to owner",
    );
    await expectAllowed(await patchRecords(accounts.A.owner, "profiles", `id=eq.${accounts.A.office.id}`, { role: "admin" }), "Owner should change staff role");
    await expectDenied(
      await patchRecords(accounts.A.admin, "profiles", `id=eq.${accounts.A.office.id}`, { role: "office" }),
      "Admins must not manage another admin",
    );
    await expectAllowed(await patchRecords(accounts.A.owner, "profiles", `id=eq.${accounts.A.office.id}`, { role: "office" }), "Owner should restore staff role");
    await expectDenied(
      await patchRecords(accounts.A.admin, "profiles", `id=eq.${accounts.A.owner.id}`, { active: false }),
      "Staff must not change the owner membership",
    );
    await expectDenied(
      await patchRecords(accounts.A.owner, "profiles", `id=eq.${accounts.A.office.id}`, { role: "owner" }),
      "Staff management must not assign a second owner",
    );
    await expectDenied(
      await patchRecords(accounts.A.owner, "profiles", `id=eq.${accounts.A.owner.id}`, { active: false }),
      "Owners must not deactivate their own protected membership",
    );
    await expectAllowed(
      await service(`/rest/v1/profiles?id=eq.${accounts.B.customer.id}`, { method: "DELETE" }),
      "Service role should temporarily remove the alias target profile",
    );
    await expectDenied(
      await patchRecords(accounts.A.owner, "profiles", `id=eq.${accounts.A.office.id}`, { id: accounts.B.customer.id }),
      "Profile user identities must not be rebound",
    );
    await createProfile(accounts.B.customer, organisationB, "customer", customerB);
    await expectDenied(
      await patchRecords(accounts.A.customer, "profiles", `id=eq.${accounts.A.customer.id}`, { customer_source_id: otherCustomerA }),
      "Customers must not rebind their portal scope",
    );
    await expectDenied(
      await patchRecords(accounts.A.owner, "profiles", `id=eq.${accounts.A.office.id}`, {
        role: "customer",
        customer_source_id: source("missing-customer-profile-scope"),
      }),
      "Active customer profiles must use a live same-tenant customer scope",
    );
    await expectAllowed(
      await patchRecords(accounts.A.owner, "profiles", `id=eq.${accounts.A.admin.id}`, { role: "office" }),
      "Owner should demote an admin",
    );
    const staleAdminManagement = await patchRecords(
      accounts.A.admin,
      "profiles",
      `id=eq.${accounts.A.electrician.id}`,
      { role: "office" },
    );
    await expectAllowed(staleAdminManagement, "Demoted profile update should fail closed without leaking a row");
    assert.deepEqual(staleAdminManagement.payload, [], "Demoted sessions must lose staff management authority");
    await expectAllowed(
      await patchRecords(accounts.A.owner, "profiles", `id=eq.${accounts.A.admin.id}`, { role: "admin" }),
      "Owner should restore the admin for remaining checks",
    );
    await expectAllowed(await patchRecords(accounts.A.owner, "profiles", `id=eq.${accounts.A.electrician.id}`, { active: false }), "Owner should deactivate user");
    const deactivatedRead = await listRecords(accounts.A.electrician, "materials", "select=source_id");
    await expectAllowed(deactivatedRead, "Deactivated token query should be safely scoped");
    assert.deepEqual(deactivatedRead.payload, [], "Deactivated user must not see tenant data");
    await expectDenied(await insertRecord(accounts.A.electrician, "materials", typedRecord(organisationA, source("deactivated-write"), customerA, jobA)), "Deactivated user must not write");
    await expectAllowed(await patchRecords(accounts.A.owner, "profiles", `id=eq.${accounts.A.electrician.id}`, { active: true }), "Owner should reactivate user for remaining tests");

    // Recovery/OTP sessions may update credentials through Auth, but they must
    // not become an alternate route into JR OS business data.
    const recoveryLink = await service("/auth/v1/admin/generate_link", {
      method: "POST",
      body: { type: "recovery", email: accounts.B.electrician.email },
    });
    await expectAllowed(recoveryLink, "Service role should generate a recovery test link");
    const recoverySession = await request("/auth/v1/verify", {
      method: "POST",
      body: { type: "recovery", token_hash: recoveryLink.payload.hashed_token },
    });
    await expectAllowed(recoverySession, "Recovery token should create an Auth-only session");
    const recoveryAccount = { ...accounts.B.electrician, accessToken: recoverySession.payload.access_token };
    const recoveryRead = await listRecords(recoveryAccount, "jobs", `select=source_id&source_id=eq.${jobB}`);
    await expectAllowed(recoveryRead, "Recovery-only tenant query should fail closed");
    assert.deepEqual(recoveryRead.payload, [], "Recovery-only sessions must not read tenant data");
    await expectDenied(
      await insertRecord(recoveryAccount, "jobs", typedRecord(organisationB, source("recovery-session-write"), customerB, jobB)),
      "Recovery-only sessions must not write tenant data",
    );
    await expectAllowed(
      await request("/auth/v1/logout?scope=local", { method: "POST", accessToken: recoverySession.payload.access_token }),
      "Recovery-only test session should be revoked locally",
    );

    // Session revocation: active access works, then stale access and refresh
    // tokens both lose tenant authorization immediately after admin logout.
    const activeSessionRead = await listRecords(accounts.B.electrician, "jobs", `select=source_id&source_id=eq.${jobB}`);
    await expectAllowed(activeSessionRead, "Active same-tenant session should read its job");
    assert.deepEqual(activeSessionRead.payload.map((row) => row.source_id), [jobB]);
    const revokeResult = await service(`/auth/v1/admin/users/${accounts.B.electrician.id}/logout`, { method: "POST", body: { scope: "global" } });
    await expectAllowed(revokeResult, "Admin should revoke a user session");
    const revokedSessionRead = await listRecords(accounts.B.electrician, "jobs", `select=source_id&source_id=eq.${jobB}`);
    await expectAllowed(revokedSessionRead, "Revoked access token query should fail closed");
    assert.deepEqual(revokedSessionRead.payload, [], "Revoked access tokens must not retain tenant reads");
    await expectDenied(
      await insertRecord(accounts.B.electrician, "jobs", typedRecord(organisationB, source("revoked-session-write"), customerB, jobB)),
      "Revoked access tokens must not retain tenant writes",
    );
    const refreshAfterRevoke = await request("/auth/v1/token?grant_type=refresh_token", { method: "POST", body: { refresh_token: accounts.B.electrician.refreshToken } });
    await expectDenied(refreshAfterRevoke, "Revoked refresh token must not create a new session");

    // Audit log is trigger-written and direct writes/updates/deletes are blocked.
    await expectDenied(await insertRecord(accounts.A.owner, "audit_log", { organisation_id: organisationA, action: "forged", entity_table: "payments", source_id: source("forged-audit") }), "Authenticated users must not forge audit rows");
    const auditRows = await listRecords(accounts.A.office, "audit_log", `select=action,entity_table,source_id&source_id=eq.${officeCases[3][1]}`);
    await expectAllowed(auditRows, "Office should read tenant audit rows");
    assert.equal(auditRows.payload.some((row) => row.action === "payment_changed"), true, "Payment trigger should write an audit row");
    await expectDenied(await patchRecords(accounts.A.owner, "audit_log", `source_id=eq.${officeCases[3][1]}`, { action: "tampered" }), "Audit rows must be immutable");
    await expectDenied(await deleteRecords(accounts.A.owner, "audit_log", `source_id=eq.${officeCases[3][1]}`), "Audit rows must not be deleted through authenticated REST");

    // Private Storage: signed upload/download, path enforcement, content controls and customer scope.
    const ownPath = `${organisationA}/jobs/${jobA}/${source("file-own")}/photo.png`;
    const otherCustomerPath = `${organisationA}/jobs/${otherCustomerJobA}/${source("file-other")}/other.png`;
    const tenantBPath = `${organisationB}/jobs/${jobB}/${source("file-cross")}/cross.png`;
    context.objectPaths.push(ownPath, otherCustomerPath, tenantBPath);
    const pngBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

    await expectDenied(await insertRecord(accounts.A.electrician, "private_files", {
      organisation_id: organisationA, source_id: source("file-forged-actor"), job_source_id: jobA, customer_source_id: customerA,
      bucket, object_path: `${organisationA}/jobs/${jobA}/${source("file-forged-actor-path")}/evidence.pdf`,
      file_name: "evidence.pdf", mime_type: "application/pdf", created_by: accounts.A.office.id, updated_by: accounts.A.office.id,
    }), "Electrician must not forge another user's private-file attribution");
    await expectDenied(await insertRecord(accounts.A.electrician, "private_files", {
      organisation_id: organisationA, source_id: source("file-cross-path-metadata"), job_source_id: jobA, customer_source_id: customerA,
      bucket, object_path: tenantBPath, file_name: "cross.png", mime_type: "image/png",
    }), "Staff must not register private-file metadata for another tenant path");
    await expectDenied(await insertRecord(accounts.A.electrician, "private_files", {
      organisation_id: organisationA, source_id: source("file-bad-mime-metadata"), job_source_id: jobA, customer_source_id: customerA,
      bucket, object_path: `${organisationA}/jobs/${jobA}/${source("file-bad-mime-path")}/payload.exe`,
      file_name: "payload.exe", mime_type: "application/x-msdownload",
    }), "Staff must not bypass the private-file metadata MIME allowlist");
    await expectDenied(await insertRecord(accounts.A.office, "private_files", {
      organisation_id: organisationA, source_id: source("file-cross-customer-binding"), job_source_id: jobA, customer_source_id: otherCustomerA,
      bucket, object_path: `${organisationA}/jobs/${jobA}/${source("file-cross-customer-path")}/other.png`,
      file_name: "other.png", mime_type: "image/png",
    }), "Staff must not bind private-file metadata to another customer's job");
    await expectDenied(await insertRecord(accounts.A.office, "private_files", {
      organisation_id: organisationA, source_id: source("file-cross-tenant-binding"), job_source_id: jobB, customer_source_id: customerA,
      bucket, object_path: `${organisationA}/jobs/${jobB}/${source("file-cross-tenant-path")}/other.png`,
      file_name: "other.png", mime_type: "image/png",
    }), "Staff must not bind private-file metadata to another tenant's job");

    const signedUpload = await createSignedUpload(accounts.A.electrician, ownPath);
    await expectAllowed(signedUpload, "Electrician should create signed upload URL");
    assert.equal((await uploadSigned(signedUpload.payload, pngBytes, "image/png")).ok, true, "Signed upload should succeed");
    await expectAllowed(await insertRecord(accounts.A.electrician, "private_files", {
      organisation_id: organisationA, source_id: source("file-own"), job_source_id: jobA, customer_source_id: customerA,
      bucket, object_path: ownPath, file_name: "photo.png", mime_type: "image/png",
    }), "Staff should write private file metadata");

    const otherUpload = await createSignedUpload(accounts.A.office, otherCustomerPath);
    await expectAllowed(otherUpload, "Office should create signed upload URL");
    assert.equal((await uploadSigned(otherUpload.payload, pngBytes, "image/png")).ok, true);
    await expectAllowed(await insertRecord(accounts.A.office, "private_files", {
      organisation_id: organisationA, source_id: source("file-other"), job_source_id: otherCustomerJobA, customer_source_id: otherCustomerA,
      bucket, object_path: otherCustomerPath, file_name: "other.png", mime_type: "image/png",
    }), "Office should write other-customer file metadata");
    await expectDenied(await insertRecord(accounts.A.electrician, "private_files", {
      organisation_id: organisationA, source_id: source("file-other-alias"), job_source_id: otherCustomerJobA, customer_source_id: otherCustomerA,
      bucket, object_path: otherCustomerPath, file_name: "other.png", mime_type: "image/png",
    }), "Staff must not alias an existing private object to a second metadata row");

    await expectDenied(await createSignedUpload(accounts.A.electrician, tenantBPath), "Staff must not create signed upload URLs for another tenant path");
    await expectDenied(await createSignedUpload(accounts.A.customer, `${organisationA}/jobs/${jobA}/${source("customer-upload")}/x.png`), "Customer must not upload files");

    const badMimePath = `${organisationA}/jobs/${jobA}/${source("bad-mime")}/payload.exe`;
    context.objectPaths.push(badMimePath);
    const badMimeSign = await createSignedUpload(accounts.A.electrician, badMimePath);
    if (badMimeSign.response.ok) {
      assert.equal((await uploadSigned(badMimeSign.payload, new Uint8Array([1, 2, 3]), "application/x-msdownload")).ok, false, "Disallowed MIME upload must fail");
    }

    const oversizedPath = `${organisationA}/jobs/${jobA}/${source("oversized")}/large.bin`;
    context.objectPaths.push(oversizedPath);
    const oversizedSign = await createSignedUpload(accounts.A.electrician, oversizedPath);
    if (oversizedSign.response.ok) {
      const oversized = new Uint8Array((10 * 1024 * 1024) + 1);
      assert.equal((await uploadSigned(oversizedSign.payload, oversized, "application/pdf")).ok, false, "File larger than 10 MB must fail");
    }

    const legacyPath = `${organisationA}/legacy/${source("legacy-file")}/photo.png`;
    context.legacyObjectPaths.push(legacyPath);
    const legacyUpload = await createSignedUpload(accounts.A.electrician, legacyPath, legacyBucket);
    await expectAllowed(legacyUpload, "Electrician should retain bounded legacy upload compatibility");
    assert.equal((await uploadSigned(legacyUpload.payload, pngBytes, "image/png")).ok, true);

    const legacyBadMimePath = `${organisationA}/legacy/${source("legacy-bad-mime")}/payload.exe`;
    context.legacyObjectPaths.push(legacyBadMimePath);
    const legacyBadMimeSign = await createSignedUpload(accounts.A.electrician, legacyBadMimePath, legacyBucket);
    if (legacyBadMimeSign.response.ok) {
      assert.equal(
        (await uploadSigned(legacyBadMimeSign.payload, new Uint8Array([1, 2, 3]), "application/x-msdownload")).ok,
        false,
        "Legacy storage must reject disallowed MIME types",
      );
    }
    await expectDenied(
      await createSignedUpload(accounts.A.electrician, tenantBPath, legacyBucket),
      "Legacy storage must reject another tenant path",
    );
    await expectDenied(
      await createSignedUpload(accounts.A.customer, `${organisationA}/legacy/${source("legacy-customer")}/x.png`, legacyBucket),
      "Customer must not upload to legacy storage",
    );

    await expectAllowed(await createSignedDownload(accounts.A.owner, ownPath, 60), "Owner should create signed download URL");
    await expectAllowed(await createSignedDownload(accounts.A.customer, ownPath, 60), "Customer should sign own scoped file");
    await expectDenied(await createSignedDownload(accounts.A.customer, otherCustomerPath, 60), "Customer must not sign another customer's file");
    await expectDenied(await createSignedDownload(accounts.B.owner, ownPath, 60), "Another tenant must not sign Tenant A file");

    const expiring = await createSignedDownload(accounts.A.owner, ownPath, 1);
    await expectAllowed(expiring, "Owner should create expiring signed URL");
    const expiringUrl = expiring.payload.signedURL || expiring.payload.signedUrl || expiring.payload.url;
    await new Promise((resolve) => setTimeout(resolve, 2200));
    assert.equal((await fetch(absoluteSignedUrl(expiringUrl))).ok, false, "Expired signed URL must stop working");

    await expectDenied(await deleteStorageObject(accounts.A.office, ownPath), "Office must not delete private objects");
    await expectAllowed(await deleteStorageObject(accounts.A.admin, ownPath), "Admin should delete private objects");
    context.objectPaths = context.objectPaths.filter((path) => path !== ownPath);

    const crossTenantMetadataDelete = await deleteRecords(
      accounts.B.owner,
      "private_files",
      `source_id=eq.${source("file-own")}`,
    );
    await expectAllowed(crossTenantMetadataDelete, "Cross-tenant metadata deletion should fail closed");
    assert.deepEqual(crossTenantMetadataDelete.payload, [], "Another tenant must not delete private file metadata");

    await expectAllowed(
      await deleteRecords(accounts.A.owner, "private_files", `source_id=eq.${source("file-own")}`),
      "Owner should delete private file metadata",
    );
    const privateFileDeleteAudit = await listRecords(
      accounts.A.owner,
      "audit_log",
      `select=action,entity_table,source_id,actor_user_id&entity_table=eq.private_files&source_id=eq.${source("file-own")}`,
    );
    await expectAllowed(privateFileDeleteAudit, "Private file deletion audit query should execute");
    assert.equal(
      privateFileDeleteAudit.payload.some((row) => (
        row.action === "record_deleted"
        && row.actor_user_id === accounts.A.owner.id
      )),
      true,
      "Private file metadata deletion must create an immutable tenant audit row",
    );
    const crossTenantDeleteAudit = await listRecords(
      accounts.B.owner,
      "audit_log",
      `select=source_id&entity_table=eq.private_files&source_id=eq.${source("file-own")}`,
    );
    await expectAllowed(crossTenantDeleteAudit, "Cross-tenant deletion audit query should fail closed");
    assert.deepEqual(crossTenantDeleteAudit.payload, [], "Another tenant must not read deletion audit evidence");
  } finally {
    await cleanup(context);
  }
});
