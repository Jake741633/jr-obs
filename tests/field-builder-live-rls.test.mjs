import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const runnerSource = readFileSync(new URL("./run-supabase-rls.integration.mjs", import.meta.url), "utf8");
const integrationSourceUrl = new URL("./supabase-rls.integration.mjs", import.meta.url);

const anchor = [
  "    await expectDenied(",
  '      await patchRecords(accounts.A.customer, "portal_customers", \\`source_id=eq.\\${customerA}\\`, { payload: { id: customerA, name: "Forged portal update" } }),',
  '      "Customer must not write the portal customer projection",',
  "    );",
].join("\\n");

const builderLines = [
  '    const builderA = source("builder-a");',
  '    const builderB = source("builder-b");',
  "    await expectAllowed(",
  '      await insertRecord(accounts.A.office, "builders", typedRecord(organisationA, builderA, null, null, {',
  '        companyName: "Tenant A Builder Ltd",',
  '        contactName: "Builder Contact",',
  '        email: "builder-a@example.com",',
  '        phone: "07000000002",',
  '        address: "2 Builder Street",',
  '        notes: "Private builder relationship note",',
  "      })),",
  '      "Office should create a complete builder CRM record",',
  "    );",
  "    await expectAllowed(",
  '      await insertRecord(accounts.B.office, "builders", typedRecord(organisationB, builderB, null, null, { companyName: "Tenant B Builder Ltd", notes: "Tenant B private note" })),',
  '      "Tenant B office should create its builder",',
  "    );",
  "",
  '    const officeCompleteBuilder = await listRecords(accounts.A.office, "builders", \\`select=source_id,payload&source_id=eq.\\${builderA}\\`);',
  '    await expectAllowed(officeCompleteBuilder, "Office complete builder query should execute");',
  '    assert.equal(officeCompleteBuilder.payload.length, 1, "Office should retain complete builder reads");',
  '    assert.equal(officeCompleteBuilder.payload[0].payload.notes, "Private builder relationship note", "Office should retain builder relationship notes");',
  "",
  '    const electricianCompleteBuilder = await listRecords(accounts.A.electrician, "builders", \\`select=source_id,payload&source_id=eq.\\${builderA}\\`);',
  '    await expectAllowed(electricianCompleteBuilder, "Electrician complete builder query should fail closed");',
  '    assert.deepEqual(electricianCompleteBuilder.payload, [], "Electrician must not read complete builder CRM records");',
  "",
  '    const electricianFieldBuilder = await listRecords(accounts.A.electrician, "field_builders", \\`select=source_id,payload&source_id=eq.\\${builderA}\\`);',
  '    await expectAllowed(electricianFieldBuilder, "Electrician field-safe builder query should execute");',
  '    assert.equal(electricianFieldBuilder.payload.length, 1, "Electrician should retain builder contact reads");',
  '    assert.equal(electricianFieldBuilder.payload[0].payload.companyName, "Tenant A Builder Ltd");',
  '    assert.equal(electricianFieldBuilder.payload[0].payload.phone, "07000000002");',
  '    assert.equal(electricianFieldBuilder.payload[0].payload.notes, undefined, "Field builder projection must omit relationship notes");',
  "",
  '    const customerBuilderRead = await listRecords(accounts.A.customer, "builders", \\`select=source_id&source_id=eq.\\${builderA}\\`);',
  '    await expectAllowed(customerBuilderRead, "Customer builder query should fail closed");',
  '    assert.deepEqual(customerBuilderRead.payload, [], "Customers must not read builder CRM records");',
  "",
  '    const crossTenantBuilder = await listRecords(accounts.B.electrician, "field_builders", \\`select=source_id&source_id=eq.\\${builderA}\\`);',
  '    await expectAllowed(crossTenantBuilder, "Cross-tenant field builder query should execute safely");',
  '    assert.deepEqual(crossTenantBuilder.payload, [], "Another organisation must not read the field builder projection");',
  "",
  "    await expectDenied(",
  '      await patchRecords(accounts.A.electrician, "field_builders", \\`source_id=eq.\\${builderA}\\`, { payload: { id: builderA, companyName: "Forged field builder" } }),',
  '      "Electrician must not write the field builder projection",',
  "    );",
];

const builderCoverage = `${anchor}\\n\\n${builderLines.join("\\n")}`;

test("live RLS runner proves builder CRM notes stay office-only", () => {
  const occurrences = runnerSource.split(anchor).length - 1;
  assert.equal(occurrences, 1, `Expected one customer projection anchor, found ${occurrences}`);

  const patchedRunner = runnerSource.replace(anchor, builderCoverage);
  for (const phrase of [
    "Electrician complete builder query should fail closed",
    "Field builder projection must omit relationship notes",
    "Customers must not read builder CRM records",
    "Another organisation must not read the field builder projection",
    "Electrician must not write the field builder projection",
  ]) {
    assert.match(patchedRunner, new RegExp(phrase.replaceAll(" ", "\\s+"), "i"));
  }

  const temporaryDirectory = mkdtempSync(join(tmpdir(), "jr-os-builder-rls-"));
  const temporaryRunner = join(temporaryDirectory, "run-supabase-rls.integration.mjs");
  const temporaryIntegration = join(temporaryDirectory, "supabase-rls.integration.mjs");
  try {
    writeFileSync(temporaryRunner, patchedRunner, "utf8");
    copyFileSync(integrationSourceUrl, temporaryIntegration);
    const result = spawnSync(process.execPath, [temporaryRunner], {
      cwd: process.cwd(),
      env: process.env,
      stdio: "inherit",
    });
    if (result.error) throw result.error;
    assert.equal(result.status ?? 1, 0, "Builder live RLS wrapper should complete successfully");
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});
