import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { verifyDeployedMigration } from "./verify-supabase-deployed-migration.mjs";

const REQUIRED_LIVE_ENVIRONMENT = Object.freeze([
  "SUPABASE_TEST_URL",
  "SUPABASE_TEST_PROJECT_REF",
  "SUPABASE_TEST_ANON_KEY",
  "SUPABASE_TEST_SERVICE_ROLE_KEY",
  "SUPABASE_TEST_CONFIRM",
]);

export function liveSupabaseTestConfiguration(environment = process.env) {
  const supplied = REQUIRED_LIVE_ENVIRONMENT.filter((name) => Boolean(environment[name]));
  if (supplied.length === 0) return null;

  const missing = REQUIRED_LIVE_ENVIRONMENT.filter((name) => !environment[name]);
  if (missing.length > 0) {
    throw new Error(`Live Supabase RLS tests require every protected setting; missing ${missing.join(", ")}`);
  }

  return Object.freeze({
    url: environment.SUPABASE_TEST_URL,
    projectRef: environment.SUPABASE_TEST_PROJECT_REF,
    anonKey: environment.SUPABASE_TEST_ANON_KEY,
    serviceRoleKey: environment.SUPABASE_TEST_SERVICE_ROLE_KEY,
    confirmation: environment.SUPABASE_TEST_CONFIRM,
  });
}

export async function runSupabaseRlsTests({
  environment = process.env,
  verifyMigration = verifyDeployedMigration,
  spawn = spawnSync,
  nodeExecutable = process.execPath,
  cwd = process.cwd(),
  stdio = "inherit",
} = {}) {
  const configuration = liveSupabaseTestConfiguration(environment);
  const childEnvironment = { ...environment };
  delete childEnvironment.NODE_TEST_CONTEXT;

  if (configuration) {
    await verifyMigration({
      url: configuration.url,
      projectRef: configuration.projectRef,
      serviceRoleKey: configuration.serviceRoleKey,
      confirmation: configuration.confirmation,
    });
  }

  const result = spawn(nodeExecutable, ["--test", "tests/planner-team-live-rls.test.mjs"], {
    cwd,
    env: childEnvironment,
    stdio,
  });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

const entrypoint = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (entrypoint === import.meta.url) {
  try {
    process.exitCode = await runSupabaseRlsTests();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
