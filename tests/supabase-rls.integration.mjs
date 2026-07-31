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

const typedTables = [
  "customers", "jobs", "pricing_documents", "invoices", "payments", "expenses", "materials",
  "stock_items", "stock_movements", "purchase_lists", "planner_entries", "team_members", "timesheets",
  "certificates", "electrical_testing_records", "job_documents", "portal_approvals", "portal_requests",
  "ai_recommendation_evidence",
];
const cleanupTables = ["private_files", "audit_log", "cloud_collections", ...typedTables];

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

async function createSignedUpload(account, path) {
  return authenticated(account, `/storage/v1/object/upload/sign/${bucket}/${encodedPath(path)}`, {
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
  const context = { users: [], organisations: [], objectPaths: [] };
  try {
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

    // Office-only tables and typed entity tenant isolation.
    const officeCases = [
      ["customers", customerA, { name: "Tenant A customer" }],
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
    await expectAllowed(await insertRecord(accounts.A.office, "customers", typedRecord(organisationA, otherCustomerA, otherCustomerA, null, { name: "Other customer" })), "Office should create second customer");

    // Field-write tables.
    const fieldCases = [
      ["jobs", jobA, { title: "Tenant A job" }],
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
    await expectDenied(await insertRecord(accounts.A.customer, "jobs", typedRecord(organisationA, source("customer-job-write"), customerA, jobA)), "Customer must not create jobs");

    const approvalA = source("approval-a");
    const requestA = source("request-a");
    await expectAllowed(await insertRecord(accounts.A.customer, "portal_approvals", typedRecord(organisationA, approvalA, customerA, jobA, { decision: "Accepted" })), "Customer should create own approval");
    await expectAllowed(await insertRecord(accounts.A.customer, "portal_requests", typedRecord(organisationA, requestA, customerA, jobA, { type: "Question" })), "Customer should create own request");
    await expectDenied(await insertRecord(accounts.A.customer, "portal_requests", typedRecord(organisationA, source("request-other"), otherCustomerA, jobA)), "Customer must not create another customer request");
    assert.deepEqual((await listRecords(accounts.B.owner, "portal_requests", `select=source_id&source_id=eq.${requestA}`)).payload, []);

    // Generic cloud_collections: Surveys, RAMS, Job Packs and AI learning memory.
    const genericCases = [
      ["jr-os-surveys", source("survey-a"), { circuits: [{ id: "c1" }] }],
      ["jr-os-rams", source("rams-a"), { risks: [{ id: "r1" }] }],
      ["jr-os-job-packs", source("pack-a"), { materials: [{ id: "m1" }] }],
      ["jr-os-ai-learning-memory", source("memory-a"), { confidence: { overall: 75 } }],
    ];
    for (const [collectionKey, sourceId, payload] of genericCases) {
      await expectAllowed(await insertRecord(accounts.A.electrician, "cloud_collections", genericRecord(organisationA, collectionKey, sourceId, accounts.A.electrician, customerA, jobA, payload)), `Field staff should write ${collectionKey}`);
      await expectDenied(await insertRecord(accounts.A.electrician, "cloud_collections", genericRecord(organisationB, collectionKey, `${sourceId}-cross`, accounts.A.electrician, customerB, jobB, payload)), `Cross-tenant generic write must fail for ${collectionKey}`);
      assert.deepEqual((await listRecords(accounts.B.owner, "cloud_collections", `select=source_id&collection_key=eq.${encodeURIComponent(collectionKey)}&source_id=eq.${sourceId}`)).payload, []);
    }

    // Soft delete/tombstone and conflict-safe versioning assumptions.
    const tombstone = await patchRecords(accounts.A.electrician, "jobs", `source_id=eq.${jobA}`, { deleted_at: new Date().toISOString() });
    await expectAllowed(tombstone, "Field staff should create a soft-delete tombstone");
    assert.equal(tombstone.payload[0].version >= 2, true);
    const activeJobs = await listRecords(accounts.A.owner, "jobs", `select=source_id&source_id=eq.${jobA}&deleted_at=is.null`);
    assert.deepEqual(activeJobs.payload, [], "Tombstoned rows must be excluded by active-record queries");
    const tombstones = await listRecords(accounts.A.owner, "jobs", `select=source_id,deleted_at&source_id=eq.${jobA}&deleted_at=not.is.null`);
    assert.equal(tombstones.payload.length, 1, "Tombstone must remain available for sync conflict detection");

    // Role-change protection and deactivation.
    await expectDenied(await patchRecords(accounts.A.office, "profiles", `id=eq.${accounts.A.office.id}`, { role: "owner" }), "Office user must not self-promote");
    await expectAllowed(await patchRecords(accounts.A.owner, "profiles", `id=eq.${accounts.A.office.id}`, { role: "admin" }), "Owner should change staff role");
    await expectAllowed(await patchRecords(accounts.A.owner, "profiles", `id=eq.${accounts.A.office.id}`, { role: "office" }), "Owner should restore staff role");
    await expectAllowed(await patchRecords(accounts.A.owner, "profiles", `id=eq.${accounts.A.electrician.id}`, { active: false }), "Owner should deactivate user");
    const deactivatedRead = await listRecords(accounts.A.electrician, "materials", "select=source_id");
    await expectAllowed(deactivatedRead, "Deactivated token query should be safely scoped");
    assert.deepEqual(deactivatedRead.payload, [], "Deactivated user must not see tenant data");
    await expectDenied(await insertRecord(accounts.A.electrician, "materials", typedRecord(organisationA, source("deactivated-write"), customerA, jobA)), "Deactivated user must not write");
    await expectAllowed(await patchRecords(accounts.A.owner, "profiles", `id=eq.${accounts.A.electrician.id}`, { active: true }), "Owner should reactivate user for remaining tests");

    // Session revocation: admin logout invalidates refresh-token reuse.
    const revokeResult = await service(`/auth/v1/admin/users/${accounts.B.electrician.id}/logout`, { method: "POST", body: { scope: "global" } });
    await expectAllowed(revokeResult, "Admin should revoke a user session");
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
    const otherCustomerPath = `${organisationA}/jobs/${jobA}/${source("file-other")}/other.png`;
    const tenantBPath = `${organisationB}/jobs/${jobB}/${source("file-cross")}/cross.png`;
    context.objectPaths.push(ownPath, otherCustomerPath, tenantBPath);
    const pngBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

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
      organisation_id: organisationA, source_id: source("file-other"), job_source_id: jobA, customer_source_id: otherCustomerA,
      bucket, object_path: otherCustomerPath, file_name: "other.png", mime_type: "image/png",
    }), "Office should write other-customer file metadata");

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
  } finally {
    await cleanup(context);
  }
});
