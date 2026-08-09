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

const jobSeedSnippet = `    await expectAllowed(\n      await insertRecord(accounts.A.electrician, "jobs", typedRecord(organisationA, jobA, customerA, null, { title: "Tenant A job" })),\n      "Electrician should create a same-tenant job",\n    );`;

const safeJobSeedSnippet = `    await expectAllowed(\n      await insertRecord(accounts.A.office, "jobs", typedRecord(organisationA, jobA, customerA, null, {\n        title: "Tenant A job",\n        siteAddress: "1 Test Street",\n        status: "First fix",\n        startDate: "2026-08-01",\n        value: 12500,\n        originalContractValue: 12000,\n        retentionPercent: 5,\n        retentionDueDate: "2026-12-01",\n        quoteSnapshot: {\n          quoteId: source("job-quote-a"),\n          quoteNumber: "Q-JOB-SEC",\n          items: [{\n            id: source("job-quote-line-a"),\n            description: "Private priced line",\n            quantity: 1,\n            unitPrice: 12500,\n            unitCost: 4000,\n          }],\n          profitability: { expectedProfit: 5000, grossMargin: 40 },\n          attachments: [],\n          vatEnabled: true,\n          vatRate: 20,\n          notes: "Visible quote note",\n          internalNotes: "Private commercial note",\n          terms: "Test terms",\n          convertedAt: "2026-08-01T00:00:00.000Z",\n        },\n        notes: "Field operational note",\n      })),\n      "Office should create a complete commercial job",\n    );`;

const jobReadAnchor = `    await expectAllowed(\n      await insertRecord(accounts.B.electrician, "jobs", typedRecord(organisationB, jobB, customerB, null, { title: "Tenant B job" })),\n      "Tenant B electrician should create its own job",\n    );`;

const jobReadCoverage = `${jobReadAnchor}\n\n    const officeCommercialJob = await listRecords(accounts.A.office, "jobs", \`select=source_id,payload&source_id=eq.\${jobA}\`);\n    await expectAllowed(officeCommercialJob, "Office complete job query should execute");\n    assert.equal(officeCommercialJob.payload[0].payload.value, 12500, "Office should retain job contract value");\n    assert.equal(officeCommercialJob.payload[0].payload.quoteSnapshot.profitability.expectedProfit, 5000, "Office should retain job profitability snapshot");\n\n    const electricianCommercialJob = await listRecords(accounts.A.electrician, "jobs", \`select=source_id,payload&source_id=eq.\${jobA}\`);\n    await expectAllowed(electricianCommercialJob, "Electrician complete job query should fail closed");\n    assert.deepEqual(electricianCommercialJob.payload, [], "Electrician must not read complete commercial job records");\n\n    const electricianFieldJob = await listRecords(accounts.A.electrician, "field_jobs", \`select=source_id,payload&source_id=eq.\${jobA}\`);\n    await expectAllowed(electricianFieldJob, "Electrician field-safe job query should execute");\n    assert.equal(electricianFieldJob.payload.length, 1, "Electrician should retain field-safe job reads");\n    assert.equal(electricianFieldJob.payload[0].payload.title, "Tenant A job");\n    assert.equal(electricianFieldJob.payload[0].payload.notes, "Field operational note");\n    assert.equal(electricianFieldJob.payload[0].payload.value, undefined, "Field job projection must omit contract value");\n    assert.equal(electricianFieldJob.payload[0].payload.originalContractValue, undefined, "Field job projection must omit original contract value");\n    assert.equal(electricianFieldJob.payload[0].payload.retentionPercent, undefined, "Field job projection must omit retention");\n    assert.equal(electricianFieldJob.payload[0].payload.quoteSnapshot, undefined, "Field job projection must omit quote profitability snapshots");\n\n    const customerCommercialJob = await listRecords(accounts.A.customer, "jobs", \`select=source_id,payload&source_id=eq.\${jobA}\`);\n    await expectAllowed(customerCommercialJob, "Customer complete job query should fail closed");\n    assert.deepEqual(customerCommercialJob.payload, [], "Customer must not read complete commercial job records");\n\n    const customerPortalJob = await listRecords(accounts.A.customer, "customer_jobs", \`select=source_id,payload&source_id=eq.\${jobA}\`);\n    await expectAllowed(customerPortalJob, "Customer portal-safe job query should execute");\n    assert.equal(customerPortalJob.payload.length, 1, "Customer should retain portal-safe job reads");\n    assert.equal(customerPortalJob.payload[0].payload.title, "Tenant A job");\n    assert.equal(customerPortalJob.payload[0].payload.value, undefined, "Customer job projection must omit contract value");\n    assert.equal(customerPortalJob.payload[0].payload.quoteSnapshot, undefined, "Customer job projection must omit quote snapshots");\n    assert.equal(customerPortalJob.payload[0].payload.notes, undefined, "Customer job projection must omit private job notes");\n\n    const otherCustomerPortalJob = await listRecords(accounts.A.customer, "customer_jobs", \`select=source_id&source_id=eq.\${otherCustomerJobA}\`);\n    await expectAllowed(otherCustomerPortalJob, "Cross-customer portal job query should execute safely");\n    assert.deepEqual(otherCustomerPortalJob.payload, [], "Another customer must not read the portal job projection");\n    const otherTenantPortalJob = await listRecords(accounts.B.customer, "customer_jobs", \`select=source_id&source_id=eq.\${jobA}\`);\n    await expectAllowed(otherTenantPortalJob, "Cross-tenant portal job query should execute safely");\n    assert.deepEqual(otherTenantPortalJob.payload, [], "Another organisation must not read the portal job projection");\n\n    await expectAllowed(\n      await patchRecords(accounts.A.electrician, "jobs", \`source_id=eq.\${jobA}\`, {\n        payload: {\n          id: jobA,\n          customerId: customerA,\n          title: "Tenant A job - field update",\n          siteAddress: "1 Test Street",\n          status: "Second fix",\n          startDate: "2026-08-01",\n          notes: "Updated from field",\n        },\n      }),\n      "Electrician should update allowlisted operational job fields",\n    );\n    const officeJobAfterFieldUpdate = await listRecords(accounts.A.office, "jobs", \`select=payload&source_id=eq.\${jobA}\`);\n    await expectAllowed(officeJobAfterFieldUpdate, "Office should read job after field update");\n    assert.equal(officeJobAfterFieldUpdate.payload[0].payload.title, "Tenant A job - field update");\n    assert.equal(officeJobAfterFieldUpdate.payload[0].payload.value, 12500, "Field updates must preserve hidden commercial job data");\n    assert.equal(officeJobAfterFieldUpdate.payload[0].payload.quoteSnapshot.profitability.expectedProfit, 5000, "Field updates must preserve hidden profitability snapshots");\n\n    await expectDenied(\n      await patchRecords(accounts.A.electrician, "jobs", \`source_id=eq.\${jobA}\`, {\n        customer_source_id: otherCustomerA,\n        payload: { id: jobA, customerId: otherCustomerA, title: "Rebound job", siteAddress: "1 Test Street", status: "Second fix", startDate: "2026-08-01" },\n      }),\n      "Electricians must not rebind jobs to another customer",\n    );`;

for (const [label, snippet] of [
  ["obsolete Supabase logout", obsoleteSnippet],
  ["team fixture", teamSeedSnippet],
  ["team read expectation", teamReadSnippet],
  ["job fixture", jobSeedSnippet],
  ["job read anchor", jobReadAnchor],
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
    .replace(teamReadSnippet, safeTeamReadSnippet)
    .replace(jobSeedSnippet, safeJobSeedSnippet)
    .replace(jobReadAnchor, jobReadCoverage);
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
