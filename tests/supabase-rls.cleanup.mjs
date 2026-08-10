import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { verifyDeployedMigration } from "../scripts/verify-supabase-deployed-migration.mjs";

const REQUIRED_CONFIRMATION = "JR_OS_RLS_TEST";
const STORAGE_BUCKETS = Object.freeze(["jr-os-private", "jr-os-files"]);
const STORAGE_PAGE_SIZE = 100;
const STORAGE_DELETE_BATCH_SIZE = 100;
const USER_PAGE_SIZE = 1000;
const RUN_ID_SOURCE = String.raw`\d{13}-[a-z0-9]{6,16}`;
const TEST_ORGANISATION_NAME = new RegExp(`^JR OS Security ([AB]) (${RUN_ID_SOURCE})$`);
const TEST_USER_EMAIL = new RegExp(
  `^jr-os-rls-[ab]-(?:owner|admin|office|electrician|customer)-(${RUN_ID_SOURCE})@example\\.com$`,
);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function testOrganisationIdentity(record) {
  const match = TEST_ORGANISATION_NAME.exec(record?.name ?? "");
  if (!match || !UUID.test(record?.id ?? "")) return null;
  return Object.freeze({ id: record.id, name: record.name, tenant: match[1], runId: match[2] });
}

export function isTestUserForRuns(user, runIds) {
  const emailMatch = TEST_USER_EMAIL.exec(user?.email ?? "");
  const metadataRunId = user?.user_metadata?.jr_os_test_run;
  return Boolean(
    emailMatch
      && typeof metadataRunId === "string"
      && emailMatch[1] === metadataRunId
      && runIds.has(metadataRunId),
  );
}

export function objectPathBelongsToTestRun(path, organisation) {
  if (typeof path !== "string" || !path.startsWith(`${organisation.id}/`)) return false;
  return path.split("/").some((segment) => segment.endsWith(`-${organisation.runId}`));
}

function chunks(values, size) {
  const result = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

export async function cleanupSupabaseRlsTest({
  url = process.env.SUPABASE_TEST_URL,
  projectRef = process.env.SUPABASE_TEST_PROJECT_REF,
  serviceRoleKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY,
  confirmation = process.env.SUPABASE_TEST_CONFIRM,
  fetchImpl = globalThis.fetch,
  verifyMigration = verifyDeployedMigration,
} = {}) {
  if (confirmation !== REQUIRED_CONFIRMATION) {
    throw new Error(`SUPABASE_TEST_CONFIRM must exactly equal ${REQUIRED_CONFIRMATION}`);
  }
  if (!url || !/^https:\/\//i.test(url)) throw new Error("SUPABASE_TEST_URL must be a non-empty HTTPS URL");
  if (!serviceRoleKey) throw new Error("SUPABASE_TEST_SERVICE_ROLE_KEY is required");
  if (typeof fetchImpl !== "function") throw new Error("A Fetch API implementation is required");

  const baseUrl = url.replace(/\/+$/, "");
  await verifyMigration({ url: baseUrl, projectRef, serviceRoleKey, confirmation, fetchImpl });

  const request = async (path, options = {}) => {
    const response = await fetchImpl(`${baseUrl}${path}`, {
      ...options,
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        ...options.headers,
      },
    });
    const text = await response.text();
    let payload = null;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = text;
      }
    }
    if (!response.ok) {
      throw new Error(`Supabase cleanup request failed (${options.method ?? "GET"} ${path}, HTTP ${response.status})`);
    }
    return payload;
  };

  const organisationPayload = await request(
    "/rest/v1/organisations?select=id,name&name=like.JR%20OS%20Security%20*",
  );
  if (!Array.isArray(organisationPayload)) throw new Error("Supabase cleanup expected an organisation array");
  const organisations = organisationPayload.map(testOrganisationIdentity).filter(Boolean);
  const runIds = new Set(organisations.map((organisation) => organisation.runId));

  const listFolder = async (bucket, prefix) => {
    const entries = [];
    for (let offset = 0; ; offset += STORAGE_PAGE_SIZE) {
      const page = await request(`/storage/v1/object/list/${bucket}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prefix,
          limit: STORAGE_PAGE_SIZE,
          offset,
          sortBy: { column: "name", order: "asc" },
        }),
      });
      if (!Array.isArray(page)) throw new Error(`Supabase cleanup expected a Storage list for ${bucket}/${prefix}`);
      entries.push(...page);
      if (page.length < STORAGE_PAGE_SIZE) break;
    }
    return entries;
  };

  const collectObjectPaths = async (bucket, prefix) => {
    const entries = await listFolder(bucket, prefix);
    const paths = [];
    for (const entry of entries) {
      const path = `${prefix}/${entry.name}`;
      if (entry.id) paths.push(path);
      else paths.push(...await collectObjectPaths(bucket, path));
    }
    return paths;
  };

  let deletedObjects = 0;
  for (const organisation of organisations) {
    for (const bucket of STORAGE_BUCKETS) {
      const paths = (await collectObjectPaths(bucket, organisation.id))
        .filter((path) => objectPathBelongsToTestRun(path, organisation));
      for (const batch of chunks(paths, STORAGE_DELETE_BATCH_SIZE)) {
        await request(`/storage/v1/object/${bucket}`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prefixes: batch }),
        });
        deletedObjects += batch.length;
      }
    }
  }

  const users = [];
  for (let page = 1; ; page += 1) {
    const payload = await request(`/auth/v1/admin/users?page=${page}&per_page=${USER_PAGE_SIZE}`);
    const pageUsers = Array.isArray(payload?.users) ? payload.users : null;
    if (!pageUsers) throw new Error("Supabase cleanup expected an Auth users array");
    users.push(...pageUsers);
    if (pageUsers.length < USER_PAGE_SIZE) break;
  }

  let deletedUsers = 0;
  for (const user of users) {
    if (!isTestUserForRuns(user, runIds) || !UUID.test(user.id ?? "")) continue;
    await request(`/auth/v1/admin/users/${user.id}`, { method: "DELETE" });
    deletedUsers += 1;
  }

  for (const organisation of organisations) {
    await request(`/rest/v1/organisations?id=eq.${organisation.id}`, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" },
    });
  }

  return {
    deletedObjects,
    deletedUsers,
    deletedOrganisations: organisations.length,
  };
}

const entrypoint = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (entrypoint === import.meta.url) {
  try {
    const result = await cleanupSupabaseRlsTest();
    console.log(
      `Disposable Supabase cleanup removed ${result.deletedObjects} objects, ${result.deletedUsers} users and ${result.deletedOrganisations} organisations.`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
