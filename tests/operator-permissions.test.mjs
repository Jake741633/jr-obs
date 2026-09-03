import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const cloudAccessGuard = readFileSync(new URL("../components/CloudAccessGuard.tsx", import.meta.url), "utf8");

function loadPermissions(operatorEmails = "operator@example.com") {
  const source = readFileSync(new URL("../lib/cloud/permissions.ts", import.meta.url), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const commonJsModule = { exports: {} };

  vm.runInNewContext(output, {
    exports: commonJsModule.exports,
    "module": commonJsModule,
    process: {
      env: {
        NEXT_PUBLIC_JR_OS_OPERATOR_EMAILS: operatorEmails,
      },
    },
  });

  return commonJsModule.exports;
}

test("operator-only routes fail closed without verified operator email", () => {
  const { canAccessPath } = loadPermissions();

  assert.equal(canAccessPath("owner", "/release-readiness"), false);
  assert.equal(canAccessPath("owner", "/cloud/cutover", "other@example.com"), false);
  assert.equal(canAccessPath("admin", "/cloud/queue", "operator@example.com"), false);
  assert.equal(canAccessPath("office", "/cloud/queue"), false);
});

test("only configured owner operators can open operator routes", () => {
  const { canAccessPath } = loadPermissions("first@example.com, Operator@Example.com ");

  assert.equal(canAccessPath("owner", "/release-readiness", "operator@example.com"), true);
  assert.equal(canAccessPath("owner", "/cloud/cutover/details", "OPERATOR@example.com"), true);
  assert.equal(canAccessPath("owner", "/cloud/queue", "first@example.com"), true);
});

test("ordinary role routes retain their existing access without email context", () => {
  const { canAccessPath, isOperatorOnlyPath } = loadPermissions();

  assert.equal(isOperatorOnlyPath("/cloud/queue"), true);
  assert.equal(isOperatorOnlyPath("/cloud"), false);
  assert.equal(canAccessPath("owner", "/customers"), true);
  assert.equal(canAccessPath("office", "/cloud"), true);
  assert.equal(canAccessPath("electrician", "/jobs/job-1"), true);
  assert.equal(canAccessPath("customer", "/customer-portal"), true);
});

test("settled local and migration workspaces remain usable without weakening operator routes", () => {
  const { canUseLocalWorkspaceWithoutIdentity } = loadPermissions();

  assert.equal(canUseLocalWorkspaceWithoutIdentity("local", "/customers"), true);
  assert.equal(canUseLocalWorkspaceWithoutIdentity("migration", "/jobs/job-1"), true);
  assert.equal(canUseLocalWorkspaceWithoutIdentity("cloud", "/customers"), false);

  for (const path of ["/release-readiness", "/cloud/cutover", "/cloud/queue/details"]) {
    assert.equal(canUseLocalWorkspaceWithoutIdentity("local", path), false);
    assert.equal(canUseLocalWorkspaceWithoutIdentity("migration", path), false);
  }
});

test("workspace guard waits for identity resolution before allowing an unrestricted mode", () => {
  const readinessCheck = cloudAccessGuard.indexOf("if (!isReady)");
  const missingIdentityCheck = cloudAccessGuard.indexOf("if (!identity)");
  const unrestrictedCheck = cloudAccessGuard.indexOf("canUseLocalWorkspaceWithoutIdentity(mode, pathname)");

  assert.match(cloudAccessGuard, /const \{ identity, isReady, mode \} = useCloudIdentity\(\)/);
  assert.ok(readinessCheck >= 0);
  assert.ok(missingIdentityCheck > readinessCheck);
  assert.ok(unrestrictedCheck > missingIdentityCheck);
});

test("malformed and unknown roles fail closed across every permission helper", () => {
  const {
    canAccessPath,
    canDeleteRecords,
    canEditFieldRecords,
    canEditFinance,
    canManageUsers,
    isJrOsOperator,
  } = loadPermissions();
  const invalidRoles = [undefined, null, "", "superadmin", "OWNER", 1, {}, []];

  for (const role of invalidRoles) {
    assert.equal(canAccessPath(role, "/customers", "operator@example.com"), false);
    assert.equal(canManageUsers(role), false);
    assert.equal(canDeleteRecords(role), false);
    assert.equal(canEditFinance(role), false);
    assert.equal(canEditFieldRecords(role), false);
    assert.equal(isJrOsOperator(role, "operator@example.com"), false);
  }
});
