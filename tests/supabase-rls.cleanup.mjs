import assert from "node:assert/strict";

const url = process.env.SUPABASE_TEST_URL?.replace(/\/$/, "");
const serviceRoleKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const confirmation = process.env.SUPABASE_TEST_CONFIRM;
const bucket = "jr-os-private";

assert.equal(confirmation, "JR_OS_RLS_TEST", "Cleanup requires the disposable-test confirmation value");
assert.ok(url, "SUPABASE_TEST_URL is required");
assert.ok(serviceRoleKey, "SUPABASE_TEST_SERVICE_ROLE_KEY is required");

const headers = (extra = {}) => ({
  apikey: serviceRoleKey,
  Authorization: `Bearer ${serviceRoleKey}`,
  ...extra,
});

async function request(path, options = {}) {
  const response = await fetch(`${url}${path}`, {
    ...options,
    headers: headers(options.headers),
  });
  const text = await response.text();
  let payload = null;
  if (text) {
    try { payload = JSON.parse(text); } catch { payload = text; }
  }
  return { response, payload };
}

async function listFolder(prefix = "") {
  const result = await request(`/storage/v1/object/list/${bucket}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prefix, limit: 1000, offset: 0, sortBy: { column: "name", order: "asc" } }),
  });
  if (!result.response.ok) return [];
  return Array.isArray(result.payload) ? result.payload : [];
}

async function collectObjectPaths(prefix = "") {
  const entries = await listFolder(prefix);
  const paths = [];
  for (const entry of entries) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.id) paths.push(path);
    else paths.push(...await collectObjectPaths(path));
  }
  return paths;
}

async function removeStorageObjects() {
  const paths = await collectObjectPaths();
  if (!paths.length) return;
  await request(`/storage/v1/object/${bucket}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prefixes: paths }),
  });
}

async function removeTestUsers() {
  const result = await request("/auth/v1/admin/users?page=1&per_page=1000");
  if (!result.response.ok) return;
  const users = Array.isArray(result.payload?.users) ? result.payload.users : [];
  for (const user of users) {
    const isTestUser = user.email?.startsWith("jr-os-rls-") || user.user_metadata?.jr_os_test_run;
    if (isTestUser) await request(`/auth/v1/admin/users/${user.id}`, { method: "DELETE" });
  }
}

async function removeTestOrganisations() {
  const filters = [
    "name=like.JR%20OS%20Security%20*",
    "name=eq.JR%20Electrical%20Services",
  ];
  for (const filter of filters) {
    await request(`/rest/v1/organisations?${filter}`, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" },
    });
  }
}

await removeStorageObjects();
await removeTestUsers();
await removeTestOrganisations();
console.log("Disposable Supabase RLS test cleanup completed.");
