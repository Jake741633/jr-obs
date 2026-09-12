import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

const workflow = readFileSync(new URL("../.github/workflows/supabase-rls-integration.yml", import.meta.url), "utf8");
const environment = Object.freeze({
  SUPABASE_TEST_URL: "https://abcdefghijklmnopqrst.supabase.co",
  SUPABASE_TEST_PROJECT_REF: "abcdefghijklmnopqrst",
  SUPABASE_TEST_ANON_KEY: "fixture-public-key",
  SUPABASE_TEST_SERVICE_ROLE_KEY: "fixture-service-key",
  SUPABASE_TEST_CONFIRM: "JR_OS_RLS_TEST",
});

function step(name) {
  const block = workflow.split(/^      - name: /m).slice(1).find((entry) => entry.startsWith(`${name}\n`));
  assert.ok(block, `Missing workflow step: ${name}`);
  return block;
}

function preflight(overrides = {}) {
  const block = step("Validate protected test configuration");
  assert.match(block, /\n        shell: bash\n/);
  const match = block.match(/\n        run: \|\n([\s\S]*)/);
  assert.ok(match, "Preflight must contain the protected Bash validation script");
  // Execute the real workflow preflight with isolated, non-secret fixture values.
  const script = match[1].replace(/^          /gm, "");
  const result = spawnSync("bash", ["--noprofile", "--norc", "-e", "-o", "pipefail", "-c", script], {
    env: { PATH: process.env.PATH, ...environment, ...overrides },
    encoding: "utf8",
    timeout: 5000,
  });
  assert.equal(result.error, undefined);
  const output = `${result.stdout}${result.stderr}`;
  assert.equal(output.includes(environment.SUPABASE_TEST_ANON_KEY), false);
  assert.equal(output.includes(environment.SUPABASE_TEST_SERVICE_ROLE_KEY), false);
  return { status: result.status, output };
}

test("workflow preflight accepts the exact confirmed project with an optional trailing slash", () => {
  assert.equal(preflight().status, 0);
  assert.equal(preflight({ SUPABASE_TEST_URL: `${environment.SUPABASE_TEST_URL}/` }).status, 0);
});

test("workflow preflight rejects empty, incorrect or whitespace-padded confirmation", () => {
  for (const confirmation of ["", "wrong", "    JR_OS_RLS_TEST", "JR_OS_RLS_TEST ", "JR_OS_RLS_TEST\n"]) {
    const result = preflight({ SUPABASE_TEST_CONFIRM: confirmation });
    assert.equal(result.status, 1);
    assert.match(result.output, /confirmation input must exactly equal JR_OS_RLS_TEST/);
  }
});

test("workflow preflight rejects each missing protected setting before live tests", () => {
  for (const name of ["SUPABASE_TEST_URL", "SUPABASE_TEST_PROJECT_REF", "SUPABASE_TEST_ANON_KEY", "SUPABASE_TEST_SERVICE_ROLE_KEY"]) {
    const result = preflight({ [name]: "" });
    assert.equal(result.status, 1);
    assert.ok(result.output.includes(`Missing ${name} in the supabase-test environment.`));
  }
});

test("workflow preflight rejects malformed references and mismatched project URLs", () => {
  for (const projectRef of ["short", "ABCDEFGHIJKLMNOPQRST", "abcdefghijklmnopqrs-", " abcdefghijklmnopqrst"]) {
    const result = preflight({ SUPABASE_TEST_PROJECT_REF: projectRef });
    assert.equal(result.status, 1);
    assert.match(result.output, /exact 20-character hosted project reference/);
  }
  for (const url of ["https://zzzzzzzzzzzzzzzzzzzz.supabase.co", `${environment.SUPABASE_TEST_URL}.invalid`, `${environment.SUPABASE_TEST_URL}/rest/v1`, `${environment.SUPABASE_TEST_URL}?query=1`]) {
    const result = preflight({ SUPABASE_TEST_URL: url });
    assert.equal(result.status, 1);
    assert.match(result.output, /must exactly match the protected project reference/);
  }
});

test("protected configuration and migration validation remain ahead of fixture creation", () => {
  assert.match(workflow, /environment: supabase-test/);
  assert.match(workflow, /SUPABASE_TEST_PROJECT_REF: \$\{\{ vars\.SUPABASE_TEST_PROJECT_REF \}\}/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.doesNotMatch(workflow, /continue-on-error:/);
  const markers = ["Validate protected test configuration", "Check out repository", "npm run verify:supabase-schema", "npm run test:rls", "Clean disposable Supabase test data"];
  let previous = -1;
  for (const marker of markers) {
    const index = workflow.indexOf(marker);
    assert.ok(index > previous, `${marker} must follow the previous protection step`);
    previous = index;
  }
});

test("fallback cleanup requires a successful checkout even when later steps fail or cancel", () => {
  const checkout = step("Check out repository");
  assert.match(checkout, /\n        id: checkout\n/);
  assert.match(checkout, /uses: actions\/checkout@[a-f0-9]{40}/);
  const cleanup = step("Clean disposable Supabase test data");
  assert.match(cleanup, /run: node tests\/supabase-rls\.cleanup\.mjs/);
  const expression = cleanup.match(/\n        if: \$\{\{ (.+) \}\}/)?.[1];
  assert.equal(expression, "always() && steps.checkout.outcome == 'success'");
  // This Boolean/string expression uses the same operators in Actions and JS.
  // Exercise the checked-in condition, not a separate implementation of it.
  for (const outcome of ["success", "failure", "cancelled", "skipped", ""]) {
    for (const laterStatus of ["success", "failure", "cancelled"]) {
      const shouldClean = runInNewContext(expression, {
        always: () => true,
        success: () => laterStatus === "success",
        failure: () => laterStatus === "failure",
        cancelled: () => laterStatus === "cancelled",
        steps: { checkout: { outcome } },
      }, { timeout: 1000 });
      assert.equal(shouldClean, outcome === "success", `${outcome || "not run"} checkout / ${laterStatus} later steps`);
    }
  }
});
