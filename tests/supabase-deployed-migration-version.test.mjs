import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  latestMigrationFilename,
  verifyDeployedMigration,
} from "../scripts/verify-supabase-deployed-migration.mjs";

const migrationsDirectory = "supabase/migrations";
const migrationFiles = readdirSync(migrationsDirectory)
  .filter((file) => /^\d+_.+\.sql$/i.test(file))
  .sort();
const latestMigration = migrationFiles.at(-1);
const latestMigrationSql = readFileSync(join(migrationsDirectory, latestMigration), "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const workflow = readFileSync(".github/workflows/supabase-rls-integration.yml", "utf8");

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function response({ ok = true, status = 200, payload }) {
  return {
    ok,
    status,
    async text() {
      return payload === undefined ? "" : JSON.stringify(payload);
    },
  };
}

test("the latest migration publishes its exact service-role-only deployment marker", () => {
  assert.ok(latestMigration, "At least one Supabase migration must exist");
  assert.match(
    latestMigrationSql,
    /create\s+or\s+replace\s+function\s+public\.jr_os_deployed_migration\s*\(\s*\)/i,
  );
  assert.match(latestMigrationSql, new RegExp(escapeRegExp(latestMigration), "i"));
  assert.match(latestMigrationSql, /security\s+invoker[\s\S]*set\s+search_path\s*=\s*''/i);
  assert.match(
    latestMigrationSql,
    /revoke\s+execute\s+on\s+function\s+public\.jr_os_deployed_migration\s*\(\s*\)[\s\S]*from\s+public\s*,\s*anon\s*,\s*authenticated\s*,\s*service_role/i,
  );
  assert.match(
    latestMigrationSql,
    /grant\s+execute\s+on\s+function\s+public\.jr_os_deployed_migration\s*\(\s*\)[\s\S]*to\s+service_role/i,
  );
  assert.match(latestMigrationSql, /notify\s+pgrst\s*,\s*'reload schema'/i);
});

test("the protected workflow verifies the remote migration before live RLS tests", () => {
  assert.equal(
    packageJson.scripts["verify:supabase-schema"],
    "node scripts/verify-supabase-deployed-migration.mjs",
  );
  const verification = workflow.indexOf("npm run verify:supabase-schema");
  const liveRls = workflow.indexOf("npm run test:rls");
  assert.ok(verification >= 0, "Workflow must invoke the migration verifier");
  assert.ok(liveRls > verification, "Migration verification must run before live RLS tests");
});

test("latestMigrationFilename ignores non-migrations and sorts deterministically", () => {
  const directory = mkdtempSync(join(tmpdir(), "jr-os-migrations-"));
  try {
    writeFileSync(join(directory, "README.md"), "ignore", "utf8");
    writeFileSync(join(directory, "20260809_999_previous.sql"), "select 1;", "utf8");
    writeFileSync(join(directory, "20260810_001_latest.sql"), "select 1;", "utf8");
    assert.equal(latestMigrationFilename(directory), "20260810_001_latest.sql");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("migration verification authenticates with the protected service role and accepts only the exact marker", async () => {
  let request;
  const verified = await verifyDeployedMigration({
    url: "https://disposable.example.supabase.co/",
    serviceRoleKey: "test-service-role-key",
    confirmation: "JR_OS_RLS_TEST",
    migrationsDirectory,
    fetchImpl: async (url, init) => {
      request = { url, init };
      return response({ payload: { migration: latestMigration } });
    },
  });

  assert.equal(verified, latestMigration);
  assert.equal(request.url, "https://disposable.example.supabase.co/rest/v1/rpc/jr_os_deployed_migration");
  assert.equal(request.init.method, "POST");
  assert.equal(request.init.headers.apikey, "test-service-role-key");
  assert.equal(request.init.headers.Authorization, "Bearer test-service-role-key");
  assert.equal(request.init.body, "{}");
});

test("migration verification fails closed for stale, inaccessible, or unconfirmed projects", async () => {
  const options = {
    url: "https://disposable.example.supabase.co",
    serviceRoleKey: "test-service-role-key",
    confirmation: "JR_OS_RLS_TEST",
    migrationsDirectory,
  };

  await assert.rejects(
    verifyDeployedMigration({
      ...options,
      fetchImpl: async () => response({ payload: { migration: "20260809_999_previous.sql" } }),
    }),
    /schema is stale/i,
  );
  await assert.rejects(
    verifyDeployedMigration({
      ...options,
      fetchImpl: async () => response({ ok: false, status: 404, payload: { message: "missing" } }),
    }),
    /marker is unavailable \(HTTP 404\)/i,
  );
  await assert.rejects(
    verifyDeployedMigration({ ...options, confirmation: "wrong" }),
    /must exactly equal JR_OS_RLS_TEST/i,
  );
});
