import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  liveSupabaseTestConfiguration,
  runSupabaseRlsTests,
} from "../scripts/run-supabase-rls.mjs";

const fullEnvironment = Object.freeze({
  SUPABASE_TEST_URL: "https://abcdefghijklmnopqrst.supabase.co",
  SUPABASE_TEST_PROJECT_REF: "abcdefghijklmnopqrst",
  SUPABASE_TEST_ANON_KEY: "test-anon-key",
  SUPABASE_TEST_SERVICE_ROLE_KEY: "test-service-role-key",
  SUPABASE_TEST_CONFIRM: "JR_OS_RLS_TEST",
});

function successfulSpawn(overrides = {}) {
  return { status: 0, error: null, ...overrides };
}

test("the public RLS command routes through the verified runner", () => {
  const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
  assert.equal(packageJson.scripts["test:rls"], "node scripts/run-supabase-rls.mjs");
});

test("no live configuration preserves the standard skipped-suite path", async () => {
  const calls = [];
  const environment = { NODE_TEST_CONTEXT: "standard-suite" };
  const status = await runSupabaseRlsTests({
    environment,
    verifyMigration: async () => {
      calls.push("verify");
    },
    spawn: (command, args, options) => {
      calls.push({ command, args, options });
      return successfulSpawn();
    },
    nodeExecutable: "/usr/bin/node",
    cwd: "/repo",
    stdio: "pipe",
  });

  assert.equal(status, 0);
  assert.equal(calls.length, 1, "The remote verifier must remain disabled when no live settings exist");
  assert.equal(calls[0].command, "/usr/bin/node");
  assert.deepEqual(calls[0].args, ["--test", "tests/planner-team-live-rls.test.mjs"]);
  assert.equal(calls[0].options.cwd, "/repo");
  assert.equal(calls[0].options.stdio, "pipe");
  assert.equal(calls[0].options.env.NODE_TEST_CONTEXT, undefined);
  assert.equal(environment.NODE_TEST_CONTEXT, "standard-suite", "Caller environment must not be mutated");
});

test("partial live configuration fails before verification or test execution", async () => {
  let verified = false;
  let spawned = false;
  await assert.rejects(
    runSupabaseRlsTests({
      environment: { SUPABASE_TEST_URL: fullEnvironment.SUPABASE_TEST_URL },
      verifyMigration: async () => {
        verified = true;
      },
      spawn: () => {
        spawned = true;
        return successfulSpawn();
      },
    }),
    /missing SUPABASE_TEST_PROJECT_REF, SUPABASE_TEST_ANON_KEY, SUPABASE_TEST_SERVICE_ROLE_KEY, SUPABASE_TEST_CONFIRM/i,
  );
  assert.equal(verified, false);
  assert.equal(spawned, false);
});

test("complete live configuration verifies the exact project and migration before spawning", async () => {
  const events = [];
  const status = await runSupabaseRlsTests({
    environment: { ...fullEnvironment, NODE_TEST_CONTEXT: "parent" },
    verifyMigration: async (options) => {
      events.push({ type: "verify", options });
      return "20260810_066_bind_portal_payment_links.sql";
    },
    spawn: (command, args, options) => {
      events.push({ type: "spawn", command, args, options });
      return successfulSpawn();
    },
    nodeExecutable: "/usr/bin/node",
    cwd: "/repo",
    stdio: "pipe",
  });

  assert.equal(status, 0);
  assert.deepEqual(events.map((event) => event.type), ["verify", "spawn"]);
  assert.deepEqual(events[0].options, {
    url: fullEnvironment.SUPABASE_TEST_URL,
    projectRef: fullEnvironment.SUPABASE_TEST_PROJECT_REF,
    serviceRoleKey: fullEnvironment.SUPABASE_TEST_SERVICE_ROLE_KEY,
    confirmation: fullEnvironment.SUPABASE_TEST_CONFIRM,
  });
  assert.equal(events[1].options.env.SUPABASE_TEST_ANON_KEY, fullEnvironment.SUPABASE_TEST_ANON_KEY);
  assert.equal(events[1].options.env.NODE_TEST_CONTEXT, undefined);
});

test("verification failure blocks the live runner", async () => {
  let spawned = false;
  await assert.rejects(
    runSupabaseRlsTests({
      environment: fullEnvironment,
      verifyMigration: async () => {
        throw new Error("stale remote migration");
      },
      spawn: () => {
        spawned = true;
        return successfulSpawn();
      },
    }),
    /stale remote migration/i,
  );
  assert.equal(spawned, false);
});

test("runner configuration parsing is all-or-nothing", () => {
  assert.equal(liveSupabaseTestConfiguration({}), null);
  assert.deepEqual(liveSupabaseTestConfiguration(fullEnvironment), {
    url: fullEnvironment.SUPABASE_TEST_URL,
    projectRef: fullEnvironment.SUPABASE_TEST_PROJECT_REF,
    anonKey: fullEnvironment.SUPABASE_TEST_ANON_KEY,
    serviceRoleKey: fullEnvironment.SUPABASE_TEST_SERVICE_ROLE_KEY,
    confirmation: fullEnvironment.SUPABASE_TEST_CONFIRM,
  });
  assert.throws(
    () => liveSupabaseTestConfiguration({ SUPABASE_TEST_CONFIRM: "JR_OS_RLS_TEST" }),
    /missing SUPABASE_TEST_URL/i,
  );
});

test("spawn failures and signal-only exits fail closed", async () => {
  const spawnError = new Error("unable to spawn");
  await assert.rejects(
    runSupabaseRlsTests({ environment: {}, spawn: () => successfulSpawn({ error: spawnError }) }),
    /unable to spawn/i,
  );
  assert.equal(
    await runSupabaseRlsTests({ environment: {}, spawn: () => successfulSpawn({ status: null }) }),
    1,
  );
});
