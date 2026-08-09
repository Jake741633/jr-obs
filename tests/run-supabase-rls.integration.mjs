import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const sourcePath = new URL("./supabase-rls.integration.mjs", import.meta.url);
const source = readFileSync(sourcePath, "utf8");

const obsoleteSnippet = `    const revokeResult = await service(\`/auth/v1/admin/users/\${accounts.B.electrician.id}/logout\`, { method: "POST", body: { scope: "global" } });\n    await expectAllowed(revokeResult, "Admin should revoke a user session");`;

const supportedSnippet = `    const revokeResult = await request("/auth/v1/logout?scope=global", {\n      method: "POST",\n      accessToken: accounts.B.electrician.accessToken,\n    });\n    await expectAllowed(revokeResult, "Authenticated user should globally revoke their session");`;

const teamSeedSnippet = `      ["team_members", teamA, { role: "Electrician" }],`;
const safeTeamSeedSnippet = `      ["team_members", teamA, {\n        role: "Electrician",\n        name: "Field electrician",\n        hourlyCost: 28,\n        chargeRate: 65,\n        emergencyContact: "Private contact",\n        emergencyPhone: "07000000000",\n        notes: "Private HR note",\n        qualifications: [{\n          id: source("qualification-a"),\n          name: "ECS Gold Card",\n          certificateNumber: "PRIVATE-123",\n          issuedAt: "2025-01-01",\n          expiresAt: "2028-01-01",\n          notes: "Private qualification note",\n        }],\n      }],`;

const teamReadSnippet = `    const electricianTeamRead = await listRecords(accounts.A.electrician, "team_members", \`select=source_id&source_id=eq.\${teamA}\`);\n    await expectAllowed(electricianTeamRead, "Electrician field team query should execute");\n    assert.equal(electricianTeamRead.payload.length, 1, "Electrician should retain field team reads");`;

const safeTeamReadSnippet = `    const officeTeamRead = await listRecords(accounts.A.office, "team_members", \`select=source_id,payload&source_id=eq.\${teamA}\`);\n    await expectAllowed(officeTeamRead, "Office full team query should execute");\n    assert.equal(officeTeamRead.payload[0].payload.hourlyCost, 28, "Office should retain complete team payroll data");\n\n    const electricianPrivateTeamRead = await listRecords(accounts.A.electrician, "team_members", \`select=source_id,payload&source_id=eq.\${teamA}\`);\n    await expectAllowed(electricianPrivateTeamRead, "Electrician private team query should fail closed");\n    assert.deepEqual(electricianPrivateTeamRead.payload, [], "Electrician must not read private team member records");\n\n    const electricianFieldTeamRead = await listRecords(accounts.A.electrician, "field_team_members", \`select=source_id,payload&source_id=eq.\${teamA}\`);\n    await expectAllowed(electricianFieldTeamRead, "Electrician field-safe team query should execute");\n    assert.equal(electricianFieldTeamRead.payload.length, 1, "Electrician should retain field-safe team directory reads");\n    assert.equal(electricianFieldTeamRead.payload[0].payload.name, "Field electrician");\n    assert.equal(electricianFieldTeamRead.payload[0].payload.hourlyCost, undefined, "Field team projection must omit payroll rates");\n    assert.equal(electricianFieldTeamRead.payload[0].payload.chargeRate, undefined, "Field team projection must omit charge rates");\n    assert.equal(electricianFieldTeamRead.payload[0].payload.emergencyContact, undefined, "Field team projection must omit emergency contacts");\n    assert.equal(electricianFieldTeamRead.payload[0].payload.emergencyPhone, undefined, "Field team projection must omit emergency phone numbers");\n    assert.equal(electricianFieldTeamRead.payload[0].payload.notes, undefined, "Field team projection must omit private team notes");\n    assert.equal(electricianFieldTeamRead.payload[0].payload.qualifications[0].certificateNumber, undefined, "Field team projection must omit qualification identifiers");`;

for (const [label, snippet] of [
  ["obsolete Supabase logout", obsoleteSnippet],
  ["team fixture", teamSeedSnippet],
  ["team read expectation", teamReadSnippet],
]) {
  const occurrences = source.split(snippet).length - 1;
  if (occurrences !== 1) {
    throw new Error(`Expected exactly one ${label} snippet, found ${occurrences}`);
  }
}

const temporaryDirectory = mkdtempSync(join(tmpdir(), "jr-os-rls-"));
const temporaryTest = join(temporaryDirectory, "supabase-rls.integration.mjs");

try {
  const supportedSource = source
    .replace(obsoleteSnippet, supportedSnippet)
    .replace(teamSeedSnippet, safeTeamSeedSnippet)
    .replace(teamReadSnippet, safeTeamReadSnippet);
  writeFileSync(temporaryTest, supportedSource, "utf8");
  const result = spawnSync(process.execPath, ["--test", temporaryTest], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });

  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
