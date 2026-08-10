import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const REQUIRED_CONFIRMATION = "JR_OS_RLS_TEST";
const MIGRATION_RPC_PATH = "/rest/v1/rpc/jr_os_deployed_migration";

export function latestMigrationFilename(migrationsDirectory = "supabase/migrations") {
  const migrations = readdirSync(migrationsDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^\d+_.+\.sql$/i.test(entry.name))
    .map((entry) => entry.name)
    .sort();

  const latest = migrations.at(-1);
  if (!latest) throw new Error(`No Supabase migrations found in ${migrationsDirectory}`);
  return latest;
}

export async function verifyDeployedMigration({
  url = process.env.SUPABASE_TEST_URL,
  serviceRoleKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY,
  confirmation = process.env.SUPABASE_TEST_CONFIRM,
  migrationsDirectory = "supabase/migrations",
  fetchImpl = globalThis.fetch,
} = {}) {
  if (confirmation !== REQUIRED_CONFIRMATION) {
    throw new Error(`SUPABASE_TEST_CONFIRM must exactly equal ${REQUIRED_CONFIRMATION}`);
  }
  if (!url || !/^https:\/\//i.test(url)) {
    throw new Error("SUPABASE_TEST_URL must be a non-empty HTTPS URL");
  }
  if (!serviceRoleKey) {
    throw new Error("SUPABASE_TEST_SERVICE_ROLE_KEY is required");
  }
  if (typeof fetchImpl !== "function") {
    throw new Error("A Fetch API implementation is required");
  }

  const expectedMigration = latestMigrationFilename(migrationsDirectory);
  const endpoint = `${url.replace(/\/+$/, "")}${MIGRATION_RPC_PATH}`;
  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: "{}",
  });

  const responseText = await response.text();
  let payload = null;
  if (responseText) {
    try {
      payload = JSON.parse(responseText);
    } catch {
      payload = responseText;
    }
  }

  if (!response.ok) {
    throw new Error(`Disposable Supabase migration marker is unavailable (HTTP ${response.status})`);
  }

  const deployedMigration = typeof payload === "string" ? payload : payload?.migration;
  if (deployedMigration !== expectedMigration) {
    throw new Error(
      `Disposable Supabase schema is stale: expected ${expectedMigration}, received ${deployedMigration || "no migration marker"}`,
    );
  }

  return expectedMigration;
}

const entrypoint = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (entrypoint === import.meta.url) {
  try {
    const migration = await verifyDeployedMigration();
    console.log(`Verified disposable Supabase migration ${migration}.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
