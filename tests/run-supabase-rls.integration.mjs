import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const scriptsDirectory = join(process.cwd(), "scripts");
const { liveSupabaseTestConfiguration } = await import(
  pathToFileURL(join(scriptsDirectory, "run-supabase-rls.mjs")).href
);
const { verifyDeployedMigration } = await import(
  pathToFileURL(join(scriptsDirectory, "verify-supabase-deployed-migration.mjs")).href
);

const fieldCasesSnippet = `    // Field-write tables.\n    const fieldCases = [\n      ["materials", source("material-a"), { name: "Cable" }],\n      ["stock_items", source("stock-a"), { quantity: 4 }],\n      ["stock_movements", source("movement-a"), { type: "Used", quantity: 1 }],\n      ["purchase_lists", source("purchase-a"), { status: "Draft" }],\n      ["planner_entries", source("planner-a"), { startDate: "2026-08-01" }],\n      ["timesheets", source("timesheet-a"), { hours: 8 }],\n      ["certificates", source("certificate-a"), { status: "Draft" }],\n      ["electrical_testing_records", source("testing-a"), { status: "Draft" }],\n      ["job_documents", source("document-a"), { category: "Photo" }],\n    ];\n    for (const [table, sourceId, payload] of fieldCases) {\n      await expectAllowed(await insertRecord(accounts.A.electrician, table, typedRecord(organisationA, sourceId, customerA, jobA, payload)), \`Electrician should write \${table}\`);\n      await expectDenied(await insertRecord(accounts.A.electrician, table, typedRecord(organisationB, \`\${sourceId}-cross\`, customerB, jobB, payload)), \`Electrician must not write cross-tenant \${table}\`);\n    }`;

const safeFieldCasesSnippet = `    // Field-write tables use the exact team identity resolved from the\n    // authenticated electrician before relationship-bound planner/timesheet writes.\n    const fieldTeamA = source("field-team-a");\n    await expectAllowed(\n      await insertRecord(accounts.A.office, "team_members", typedRecord(organisationA, fieldTeamA, null, null, {\n        name: "Field write electrician",\n        email: accounts.A.electrician.email,\n        role: "Electrician",\n        status: "Active",\n      })),\n      "Office should create the field-write team identity",\n    );\n    const fieldCases = [\n      ["materials", source("material-a"), { name: "Cable" }],\n      ["stock_items", source("stock-a"), { quantity: 4 }],\n      ["stock_movements", source("movement-a"), { type: "Used", quantity: 1 }],\n      ["purchase_lists", source("purchase-a"), { status: "Draft" }],\n      ["planner_entries", source("planner-a"), { teamMemberIds: [fieldTeamA], startDate: "2026-08-01" }],\n      ["timesheets", source("timesheet-a"), { teamMemberId: fieldTeamA, hours: 8 }],\n      ["certificates", source("certificate-a"), { status: "Draft" }],\n      ["electrical_testing_records", source("testing-a"), { status: "Draft" }],\n      ["job_documents", source("document-a"), { category: "Photo" }],\n    ];\n    for (const [table, sourceId, payload] of fieldCases) {\n      await expectAllowed(await insertRecord(accounts.A.electrician, table, typedRecord(organisationA, sourceId, customerA, jobA, payload)), \`Electrician should write \${table}\`);\n      await expectDenied(await insertRecord(accounts.A.electrician, table, typedRecord(organisationB, \`\${sourceId}-cross\`, customerB, jobB, payload)), \`Electrician must not write cross-tenant \${table}\`);\n    }\n    // Field identity fixtures are complete.`;

const sourcePath = new URL("./supabase-rls.integration.mjs", import.meta.url);
const source = readFileSync(sourcePath, "utf8");

const obsoleteSnippet = `    const revokeResult = await service(\`/auth/v1/admin/users/\${accounts.B.electrician.id}/logout\`, { method: "POST", body: { scope: "global" } });\n    await expectAllowed(revokeResult, "Admin should revoke a user session");`;

const supportedSnippet = `    const revokeResult = await request("/auth/v1/logout?scope=global", {\n      method: "POST",\n      accessToken: accounts.B.electrician.accessToken,\n    });\n    await expectAllowed(revokeResult, "Authenticated user should globally revoke their session");`;

const customerSeedSnippet = `    await expectAllowed(\n      await insertRecord(accounts.A.office, "customers", typedRecord(organisationA, customerA, customerA, null, { name: "Tenant A customer" })),\n      "Office should create its tenant customer",\n    );`;
const safeCustomerSeedSnippet = `    await expectAllowed(\n      await insertRecord(accounts.A.office, "customers", typedRecord(organisationA, customerA, customerA, null, {\n        name: "Tenant A customer",\n        email: "customer-a@example.com",\n        phone: "07000000001",\n        address: "1 Customer Street",\n        notes: "Internal CRM note",\n      })),\n      "Office should create its tenant customer",\n    );`;

const customerReadAnchor = `    await expectAllowed(\n      await insertRecord(accounts.B.office, "customers", typedRecord(organisationB, customerB, customerB, null, { name: "Tenant B customer" })),\n      "Tenant B office should create its customer",\n    );`;

const customerReadCoverage = `${customerReadAnchor}\n\n    const officeCompleteCustomer = await listRecords(accounts.A.office, "customers", \`select=source_id,payload&source_id=eq.\${customerA}\`);\n    await expectAllowed(officeCompleteCustomer, "Office complete customer query should execute");\n    assert.equal(officeCompleteCustomer.payload.length, 1, "Office should retain complete customer reads");\n    assert.equal(officeCompleteCustomer.payload[0].payload.notes, "Internal CRM note", "Office should retain internal CRM notes");\n\n    const electricianCompleteCustomer = await listRecords(accounts.A.electrician, "customers", \`select=source_id,payload&source_id=eq.\${customerA}\`);\n    await expectAllowed(electricianCompleteCustomer, "Electrician complete customer query should fail closed");\n    assert.deepEqual(electricianCompleteCustomer.payload, [], "Electrician must not read complete customer CRM records");\n\n    const electricianFieldCustomer = await listRecords(accounts.A.electrician, "field_customers", \`select=source_id,payload&source_id=eq.\${customerA}\`);\n    await expectAllowed(electricianFieldCustomer, "Electrician field-safe customer query should execute");\n    assert.equal(electricianFieldCustomer.payload.length, 1, "Electrician should retain contact-safe customer reads");\n    assert.equal(electricianFieldCustomer.payload[0].payload.name, "Tenant A customer");\n    assert.equal(electricianFieldCustomer.payload[0].payload.phone, "07000000001");\n    assert.equal(electricianFieldCustomer.payload[0].payload.notes, undefined, "Field customer projection must omit internal CRM notes");\n\n    const customerCompleteCustomer = await listRecords(accounts.A.customer, "customers", \`select=source_id,payload&source_id=eq.\${customerA}\`);\n    await expectAllowed(customerCompleteCustomer, "Customer complete customer query should fail closed");\n    assert.deepEqual(customerCompleteCustomer.payload, [], "Customer must not read complete customer CRM records");\n\n    const portalCustomer = await listRecords(accounts.A.customer, "portal_customers", \`select=source_id,payload&source_id=eq.\${customerA}\`);\n    await expectAllowed(portalCustomer, "Customer portal-safe customer query should execute");\n    assert.equal(portalCustomer.payload.length, 1, "Customer should retain their contact-safe customer record");\n    assert.equal(portalCustomer.payload[0].payload.name, "Tenant A customer");\n    assert.equal(portalCustomer.payload[0].payload.email, "customer-a@example.com");\n    assert.equal(portalCustomer.payload[0].payload.notes, undefined, "Portal customer projection must omit internal CRM notes");\n\n    const otherCustomerProjection = await listRecords(accounts.A.customer, "portal_customers", \`select=source_id&source_id=eq.\${otherCustomerA}\`);\n    await expectAllowed(otherCustomerProjection, "Cross-customer portal customer query should execute safely");\n    assert.deepEqual(otherCustomerProjection.payload, [], "Another customer must not read the customer contact projection");\n\n    const crossTenantCustomerProjection = await listRecords(accounts.B.customer, "portal_customers", \`select=source_id&source_id=eq.\${customerA}\`);\n    await expectAllowed(crossTenantCustomerProjection, "Cross-tenant portal customer query should execute safely");\n    assert.deepEqual(crossTenantCustomerProjection.payload, [], "Another organisation must not read the customer contact projection");\n\n    await expectDenied(\n      await patchRecords(accounts.A.electrician, "field_customers", \`source_id=eq.\${customerA}\`, { payload: { id: customerA, name: "Forged field update" } }),\n      "Electrician must not write the field customer projection",\n    );\n    await expectDenied(\n      await patchRecords(accounts.A.customer, "portal_customers", \`source_id=eq.\${customerA}\`, { payload: { id: customerA, name: "Forged portal update" } }),\n      "Customer must not write the portal customer projection",\n    );`;

const unscopedElectricianFieldCustomerRead = `    const electricianFieldCustomer = await listRecords(accounts.A.electrician, "field_customers", \`select=source_id,payload&source_id=eq.\${customerA}\`);
    await expectAllowed(electricianFieldCustomer, "Electrician field-safe customer query should execute");
    assert.equal(electricianFieldCustomer.payload.length, 1, "Electrician should retain contact-safe customer reads");
    assert.equal(electricianFieldCustomer.payload[0].payload.name, "Tenant A customer");
    assert.equal(electricianFieldCustomer.payload[0].payload.phone, "07000000001");
    assert.equal(electricianFieldCustomer.payload[0].payload.notes, undefined, "Field customer projection must omit internal CRM notes");`;

const scopedElectricianFieldCustomerRead = `    const electricianFieldCustomerBeforeIdentity = await listRecords(accounts.A.electrician, "field_customers", \`select=source_id&source_id=eq.\${customerA}\`);
    await expectAllowed(electricianFieldCustomerBeforeIdentity, "Electrician field customer query before identity should execute safely");
    assert.deepEqual(electricianFieldCustomerBeforeIdentity.payload, [], "Electrician must not read field customers before active identity binding");`;

const unscopedFieldCustomerReadCount = customerReadCoverage.split(unscopedElectricianFieldCustomerRead).length - 1;
if (unscopedFieldCustomerReadCount !== 1) {
  throw new Error(`Expected the pre-identity field customer read fixture exactly once, found ${unscopedFieldCustomerReadCount}`);
}
const scopedCustomerReadCoverage = customerReadCoverage.replace(
  unscopedElectricianFieldCustomerRead,
  scopedElectricianFieldCustomerRead,
);

const teamSeedSnippet = `      ["team_members", teamA, { role: "Electrician" }],`;
const safeTeamSeedSnippet = `      ["team_members", teamA, {\n        role: "Electrician",\n        name: "Field electrician",\n        hourlyCost: 28,\n        chargeRate: 65,\n        emergencyContact: "Private contact",\n        emergencyPhone: "07000000000",\n        notes: "Private HR note",\n        qualifications: [{\n          id: source("qualification-a"),\n          name: "ECS Gold Card",\n          certificateNumber: "PRIVATE-123",\n          issuedAt: "2025-01-01",\n          expiresAt: "2028-01-01",\n          notes: "Private qualification note",\n        }],\n      }],`;

const teamReadSnippet = `    const electricianTeamRead = await listRecords(accounts.A.electrician, "team_members", \`select=source_id&source_id=eq.\${teamA}\`);\n    await expectAllowed(electricianTeamRead, "Electrician field team query should execute");\n    assert.equal(electricianTeamRead.payload.length, 1, "Electrician should retain field team reads");`;

const safeTeamReadSnippet = `    const officeTeamRead = await listRecords(accounts.A.office, "team_members", \`select=source_id,payload&source_id=eq.\${teamA}\`);\n    await expectAllowed(officeTeamRead, "Office full team query should execute");\n    assert.equal(officeTeamRead.payload[0].payload.hourlyCost, 28, "Office should retain complete team payroll data");\n\n    const electricianPrivateTeamRead = await listRecords(accounts.A.electrician, "team_members", \`select=source_id,payload&source_id=eq.\${teamA}\`);\n    await expectAllowed(electricianPrivateTeamRead, "Electrician private team query should fail closed");\n    assert.deepEqual(electricianPrivateTeamRead.payload, [], "Electrician must not read private team member records");\n\n    const electricianFieldTeamRead = await listRecords(accounts.A.electrician, "field_team_members", \`select=source_id,payload&source_id=eq.\${teamA}\`);\n    await expectAllowed(electricianFieldTeamRead, "Electrician field-safe team query should execute");\n    assert.equal(electricianFieldTeamRead.payload.length, 1, "Electrician should retain field-safe team directory reads");\n    assert.equal(electricianFieldTeamRead.payload[0].payload.name, "Field electrician");\n    assert.equal(electricianFieldTeamRead.payload[0].payload.hourlyCost, undefined, "Field team projection must omit payroll rates");\n    assert.equal(electricianFieldTeamRead.payload[0].payload.chargeRate, undefined, "Field team projection must omit charge rates");\n    assert.equal(electricianFieldTeamRead.payload[0].payload.emergencyContact, undefined, "Field team projection must omit emergency contacts");\n    assert.equal(electricianFieldTeamRead.payload[0].payload.emergencyPhone, undefined, "Field team projection must omit emergency phone numbers");\n    assert.equal(electricianFieldTeamRead.payload[0].payload.notes, undefined, "Field team projection must omit private team notes");\n    assert.equal(electricianFieldTeamRead.payload[0].payload.qualifications[0].certificateNumber, undefined, "Field team projection must omit qualification identifiers");`;

const jobSeedSnippet = `    await expectAllowed(\n      await insertRecord(accounts.A.electrician, "jobs", typedRecord(organisationA, jobA, customerA, null, { title: "Tenant A job" })),\n      "Electrician should create a same-tenant job",\n    );`;

const safeJobSeedSnippet = `    await expectAllowed(\n      await insertRecord(accounts.A.office, "jobs", typedRecord(organisationA, jobA, customerA, null, {\n        title: "Tenant A job",\n        siteAddress: "1 Test Street",\n        status: "First fix",\n        startDate: "2026-08-01",\n        value: 12500,\n        originalContractValue: 12000,\n        retentionPercent: 5,\n        retentionDueDate: "2026-12-01",\n        quoteSnapshot: {\n          quoteId: source("job-quote-a"),\n          quoteNumber: "Q-JOB-SEC",\n          items: [{\n            id: source("job-quote-line-a"),\n            description: "Private priced line",\n            quantity: 1,\n            unitPrice: 12500,\n            unitCost: 4000,\n          }],\n          profitability: { expectedProfit: 5000, grossMargin: 40 },\n          attachments: [],\n          vatEnabled: true,\n          vatRate: 20,\n          notes: "Visible quote note",\n          internalNotes: "Private commercial note",\n          terms: "Test terms",\n          convertedAt: "2026-08-01T00:00:00.000Z",\n        },\n        notes: "Field operational note",\n      })),\n      "Office should create a complete commercial job",\n    );`;

const jobReadAnchor = `    await expectAllowed(\n      await insertRecord(accounts.B.electrician, "jobs", typedRecord(organisationB, jobB, customerB, null, { title: "Tenant B job" })),\n      "Tenant B electrician should create its own job",\n    );`;

const jobReadCoverage = `${jobReadAnchor}\n\n    const officeCommercialJob = await listRecords(accounts.A.office, "jobs", \`select=source_id,payload&source_id=eq.\${jobA}\`);\n    await expectAllowed(officeCommercialJob, "Office complete job query should execute");\n    assert.equal(officeCommercialJob.payload[0].payload.value, 12500, "Office should retain job contract value");\n    assert.equal(officeCommercialJob.payload[0].payload.quoteSnapshot.profitability.expectedProfit, 5000, "Office should retain job profitability snapshot");\n\n    const electricianCommercialJob = await listRecords(accounts.A.electrician, "jobs", \`select=source_id,payload&source_id=eq.\${jobA}\`);\n    await expectAllowed(electricianCommercialJob, "Electrician complete job query should fail closed");\n    assert.deepEqual(electricianCommercialJob.payload, [], "Electrician must not read complete commercial job records");\n\n    const electricianFieldJob = await listRecords(accounts.A.electrician, "field_jobs", \`select=source_id,payload&source_id=eq.\${jobA}\`);\n    await expectAllowed(electricianFieldJob, "Electrician field-safe job query should execute");\n    assert.equal(electricianFieldJob.payload.length, 1, "Electrician should retain field-safe job reads");\n    assert.equal(electricianFieldJob.payload[0].payload.title, "Tenant A job");\n    assert.equal(electricianFieldJob.payload[0].payload.notes, "Field operational note");\n    assert.equal(electricianFieldJob.payload[0].payload.value, undefined, "Field job projection must omit contract value");\n    assert.equal(electricianFieldJob.payload[0].payload.originalContractValue, undefined, "Field job projection must omit original contract value");\n    assert.equal(electricianFieldJob.payload[0].payload.retentionPercent, undefined, "Field job projection must omit retention");\n    assert.equal(electricianFieldJob.payload[0].payload.quoteSnapshot, undefined, "Field job projection must omit quote profitability snapshots");\n\n    const customerCommercialJob = await listRecords(accounts.A.customer, "jobs", \`select=source_id,payload&source_id=eq.\${jobA}\`);\n    await expectAllowed(customerCommercialJob, "Customer complete job query should fail closed");\n    assert.deepEqual(customerCommercialJob.payload, [], "Customer must not read complete commercial job records");\n\n    const customerPortalJob = await listRecords(accounts.A.customer, "customer_jobs", \`select=source_id,payload&source_id=eq.\${jobA}\`);\n    await expectAllowed(customerPortalJob, "Customer portal-safe job query should execute");\n    assert.equal(customerPortalJob.payload.length, 1, "Customer should retain portal-safe job reads");\n    assert.equal(customerPortalJob.payload[0].payload.title, "Tenant A job");\n    assert.equal(customerPortalJob.payload[0].payload.value, undefined, "Customer job projection must omit contract value");\n    assert.equal(customerPortalJob.payload[0].payload.quoteSnapshot, undefined, "Customer job projection must omit quote snapshots");\n    assert.equal(customerPortalJob.payload[0].payload.notes, undefined, "Customer job projection must omit private job notes");\n\n    const otherCustomerPortalJob = await listRecords(accounts.A.customer, "customer_jobs", \`select=source_id&source_id=eq.\${otherCustomerJobA}\`);\n    await expectAllowed(otherCustomerPortalJob, "Cross-customer portal job query should execute safely");\n    assert.deepEqual(otherCustomerPortalJob.payload, [], "Another customer must not read the portal job projection");\n    const otherTenantPortalJob = await listRecords(accounts.B.customer, "customer_jobs", \`select=source_id&source_id=eq.\${jobA}\`);\n    await expectAllowed(otherTenantPortalJob, "Cross-tenant portal job query should execute safely");\n    assert.deepEqual(otherTenantPortalJob.payload, [], "Another organisation must not read the portal job projection");\n\n    await expectAllowed(\n      await patchRecords(accounts.A.electrician, "jobs", \`source_id=eq.\${jobA}\`, {\n        payload: {\n          id: jobA,\n          customerId: customerA,\n          title: "Tenant A job - field update",\n          siteAddress: "1 Test Street",\n          status: "Second fix",\n          startDate: "2026-08-01",\n          notes: "Updated from field",\n        },\n      }),\n      "Electrician should update allowlisted operational job fields",\n    );\n    const officeJobAfterFieldUpdate = await listRecords(accounts.A.office, "jobs", \`select=payload&source_id=eq.\${jobA}\`);\n    await expectAllowed(officeJobAfterFieldUpdate, "Office should read job after field update");\n    assert.equal(officeJobAfterFieldUpdate.payload[0].payload.title, "Tenant A job - field update");\n    assert.equal(officeJobAfterFieldUpdate.payload[0].payload.value, 12500, "Field updates must preserve hidden commercial job data");\n    assert.equal(officeJobAfterFieldUpdate.payload[0].payload.quoteSnapshot.profitability.expectedProfit, 5000, "Field updates must preserve hidden profitability snapshots");\n\n    await expectDenied(\n      await patchRecords(accounts.A.electrician, "jobs", \`source_id=eq.\${jobA}\`, {\n        customer_source_id: otherCustomerA,\n        payload: { id: jobA, customerId: otherCustomerA, title: "Rebound job", siteAddress: "1 Test Street", status: "Second fix", startDate: "2026-08-01" },\n      }),\n      "Electricians must not rebind jobs to another customer",\n    );`;

const genericCasesSnippet = `    const genericCases = [\n      ["jr-os-surveys", source("survey-a"), { circuits: [{ id: "c1" }] }],\n      ["jr-os-rams", source("rams-a"), { risks: [{ id: "r1" }] }],\n      ["jr-os-job-packs", source("pack-a"), { materials: [{ id: "m1" }] }],\n    ];`;

const safeGenericCasesSnippet = `    const genericCases = [\n      ["jr-os-surveys", source("survey-a"), { circuits: [{ id: "c1" }], labourHours: 8, labourRate: 65 }],\n      ["jr-os-rams", source("rams-a"), { risks: [{ id: "r1" }] }],\n      ["jr-os-job-packs", source("pack-a"), { labourHours: 8, labourRate: 65, materials: [{ id: "m1", description: "Cable", quantity: 10, unitPrice: 4.5 }] }],\n      ["jr-os-job-variations", source("variation-a"), { number: "V001", title: "Extra socket", description: "Add socket", status: "Draft", approvalMethod: "Not approved", requestedBy: "Site", labourHours: 4, labourRate: 70, labourCostRate: 30, materialCost: 100, materialCharge: 200, otherCost: 10, otherCharge: 20, fixedPrice: 600, internalNotes: "Private variation note" }],\n      ["jr-os-job-material-usage", source("material-usage-a"), { description: "Cable", quantity: 5, unit: "Metre", unitCost: 2.5, supplier: "CEF", recordedBy: "Electrician" }],\n    ];`;

const genericReadSnippet = `      const electricianFieldRead = await listRecords(accounts.A.electrician, "cloud_collections", \`select=source_id&collection_key=eq.\${encodeURIComponent(collectionKey)}&source_id=eq.\${sourceId}\`);\n      await expectAllowed(electricianFieldRead, \`Electrician field \${collectionKey} query should execute\`);\n      assert.equal(electricianFieldRead.payload.length, 1, \`Electrician should retain field collection reads: \${collectionKey}\`);`;

const safeGenericReadSnippet = `      const electricianCompleteFieldRead = await listRecords(accounts.A.electrician, "cloud_collections", \`select=source_id,payload&collection_key=eq.\${encodeURIComponent(collectionKey)}&source_id=eq.\${sourceId}\`);\n      await expectAllowed(electricianCompleteFieldRead, \`Electrician complete generic \${collectionKey} query should fail closed\`);\n      assert.deepEqual(electricianCompleteFieldRead.payload, [], \`Electrician must not read complete generic field records: \${collectionKey}\`);\n\n      const electricianFieldRead = await listRecords(accounts.A.electrician, "field_cloud_collections", \`select=source_id,payload&collection_key=eq.\${encodeURIComponent(collectionKey)}&source_id=eq.\${sourceId}\`);\n      await expectAllowed(electricianFieldRead, \`Electrician projected field \${collectionKey} query should execute\`);\n      assert.equal(electricianFieldRead.payload.length, 1, \`Electrician should retain projected field collection reads: \${collectionKey}\`);\n      const fieldPayload = electricianFieldRead.payload[0].payload;\n      if (collectionKey === "jr-os-surveys") {\n        assert.equal(fieldPayload.labourRate, undefined, "Field survey projection must omit labour rates");\n      }\n      if (collectionKey === "jr-os-job-packs") {\n        assert.equal(fieldPayload.labourRate, undefined, "Field job pack projection must omit labour rates");\n        assert.equal(fieldPayload.materials[0].unitPrice, undefined, "Field job pack projection must omit material prices");\n\n        await expectAllowed(\n          await patchRecords(accounts.A.office, "cloud_collections", \`collection_key=eq.\${encodeURIComponent(collectionKey)}&source_id=eq.\${sourceId}\`, {\n            updated_by: accounts.A.office.id,\n            payload: { id: sourceId, customerId: customerA, jobId: jobA, labourHours: 8, labourRate: 90, materials: [{ id: "m1", description: "Cable", quantity: 10, unitPrice: 5.25 }] },\n          }),\n          "Office should add private job-pack pricing",\n        );\n        await expectAllowed(\n          await patchRecords(accounts.A.electrician, "cloud_collections", \`collection_key=eq.\${encodeURIComponent(collectionKey)}&source_id=eq.\${sourceId}\`, {\n            updated_by: accounts.A.electrician.id,\n            payload: { id: sourceId, customerId: customerA, jobId: jobA, labourHours: 9, materials: [{ id: "m1", description: "Cable", quantity: 12 }] },\n          }),\n          "Electrician should update field-safe job-pack details",\n        );\n        const officePackAfterFieldUpdate = await listRecords(accounts.A.office, "cloud_collections", \`select=payload&collection_key=eq.\${encodeURIComponent(collectionKey)}&source_id=eq.\${sourceId}\`);\n        await expectAllowed(officePackAfterFieldUpdate, "Office should read complete job pack after field update");\n        assert.equal(officePackAfterFieldUpdate.payload[0].payload.labourHours, 9);\n        assert.equal(officePackAfterFieldUpdate.payload[0].payload.labourRate, 90, "Field job-pack updates must preserve hidden labour rates");\n        assert.equal(officePackAfterFieldUpdate.payload[0].payload.materials[0].unitPrice, 5.25, "Field job-pack updates must preserve hidden material prices");\n      }\n      if (collectionKey === "jr-os-job-variations") {\n        assert.equal(fieldPayload.labourRate, undefined, "Field variation projection must omit labour rates");\n        assert.equal(fieldPayload.materialCost, undefined, "Field variation projection must omit material costs");\n        assert.equal(fieldPayload.fixedPrice, undefined, "Field variation projection must omit fixed prices");\n        assert.equal(fieldPayload.internalNotes, undefined, "Field variation projection must omit internal notes");\n      }\n      if (collectionKey === "jr-os-job-material-usage") {\n        assert.equal(fieldPayload.unitCost, undefined, "Field material usage projection must omit unit costs");\n      }`;

const fieldJobSeedNote = '        notes: "Field operational note",';
const confidentialFieldJobSeedNote = '        notes: "Created from quote Q-JOB-SEC.\\n\\nInternal quote notes: PRIVATE-JOB-MARGIN-8742\\n\\nAgreed scope:\\n- Private priced line (1 × £12500.37)",';
const fieldJobReadExpectation = '    assert.equal(electricianFieldJob.payload[0].payload.notes, "Field operational note");';
const confidentialFieldJobReadExpectation = '    assert.equal(electricianFieldJob.payload[0].payload.notes, undefined, "Field job projection must omit mixed commercial notes");';
const officeJobReadAnchor = '    assert.equal(officeCommercialJob.payload[0].payload.quoteSnapshot.profitability.expectedProfit, 5000, "Office should retain job profitability snapshot");';
const confidentialOfficeJobRead = `${officeJobReadAnchor}\n    assert.match(officeCommercialJob.payload[0].payload.notes, /PRIVATE-JOB-MARGIN-8742/, "Office should retain canonical accepted-quote notes");`;

const genericCasesStart = "    const genericCases = [";
const fieldTimelineCoverage = [
  '    const confidentialFieldTimeline = source("field-confidential-timeline-a");',
  '    const confidentialTimelineNote = "VAR-SEC · Extra socket changed from Sent to Accepted. Fixed price £9876.54. PRIVATE-VARIATION-MARGIN-91";',
  '    await expectAllowed(',
  '      await insertRecord(accounts.A.office, "cloud_collections", genericRecord(organisationA, "jr-os-job-timeline", confidentialFieldTimeline, accounts.A.office, customerA, jobA, { milestone: "Custom update", eventType: "  vArIaTiOn  ", sourceId: source("field-confidential-variation-a"), sourceType: "LegacyTimeline", fromStatus: "Sent", toStatus: "Accepted", note: confidentialTimelineNote, completedBy: "JR OS Office", completedAt: "2026-08-13T22:00:00.000Z", createdAt: "2026-08-13T22:00:00.000Z" })),',
  '      "Office should create a complete variation timeline record with commercial detail",',
  '    );',
  '    const officeConfidentialTimeline = await listRecords(accounts.A.office, "cloud_collections", "select=source_id,payload&collection_key=eq.jr-os-job-timeline&source_id=eq." + confidentialFieldTimeline);',
  '    await expectAllowed(officeConfidentialTimeline, "Office commercial timeline query should execute");',
  '    assert.equal(officeConfidentialTimeline.payload[0].payload.note, confidentialTimelineNote, "Office should retain the canonical variation financial note");',
  '    const electricianConfidentialTimeline = await listRecords(accounts.A.electrician, "field_cloud_collections", "select=source_id,payload&collection_key=eq.jr-os-job-timeline&source_id=eq." + confidentialFieldTimeline);',
  '    await expectAllowed(electricianConfidentialTimeline, "Electrician field timeline query should execute");',
  '    assert.equal(electricianConfidentialTimeline.payload.length, 1, "Electrician should retain the variation status event");',
  '    assert.equal(electricianConfidentialTimeline.payload[0].payload.note, "Variation status updated.", "Field timeline projection must mask variation financial notes");',
  '    assert.doesNotMatch(JSON.stringify(electricianConfidentialTimeline.payload[0].payload), /9876[.]54|PRIVATE-VARIATION-MARGIN-91/, "Field timeline projection must omit every variation price marker");',
  '    const crossTenantConfidentialTimeline = await listRecords(accounts.B.electrician, "field_cloud_collections", "select=source_id&collection_key=eq.jr-os-job-timeline&source_id=eq." + confidentialFieldTimeline);',
  '    await expectAllowed(crossTenantConfidentialTimeline, "Cross-tenant field timeline query should execute safely");',
  '    assert.deepEqual(crossTenantConfidentialTimeline.payload, [], "Another organisation must not read the field timeline projection");',
  '    const assignedNullCustomerTimeline = source("field-assigned-null-customer-timeline-a");',
  '    const unassignedNullCustomerTimeline = source("field-unassigned-null-customer-timeline-a");',
  '    const deletedTimelineJob = source("field-deleted-timeline-job-a");',
  '    const deletedJobTimeline = source("field-deleted-job-timeline-a");',
  '    await expectAllowed(await insertRecord(accounts.A.office, "jobs", typedRecord(organisationA, deletedTimelineJob, customerA, null, { title: "Deleted timeline job", status: "First fix", assignedTo: [fieldTeamA] })), "Office should create an assigned job for timeline deletion coverage");',
  '    await expectAllowed(await insertRecord(accounts.A.office, "cloud_collections", genericRecord(organisationA, "jr-os-job-timeline", assignedNullCustomerTimeline, accounts.A.office, null, jobA, { milestone: "Custom update", eventType: "Note", note: "Assigned site activity", completedBy: "JR OS Office", completedAt: "2026-08-20T12:00:00.000Z", createdAt: "2026-08-20T12:00:00.000Z" })), "Office should create production-shaped assigned timeline activity without a customer envelope");',
  '    await expectAllowed(await insertRecord(accounts.A.office, "cloud_collections", genericRecord(organisationA, "jr-os-job-timeline", unassignedNullCustomerTimeline, accounts.A.office, null, otherCustomerJobA, { milestone: "Custom update", eventType: "Note", note: "Unassigned private site activity", completedBy: "JR OS Office", completedAt: "2026-08-20T12:05:00.000Z", createdAt: "2026-08-20T12:05:00.000Z" })), "Office should create production-shaped unassigned timeline activity without a customer envelope");',
  '    await expectAllowed(await insertRecord(accounts.A.office, "cloud_collections", genericRecord(organisationA, "jr-os-job-timeline", deletedJobTimeline, accounts.A.office, null, deletedTimelineJob, { milestone: "Custom update", eventType: "Note", note: "Deleted job activity", completedBy: "JR OS Office", completedAt: "2026-08-20T12:10:00.000Z", createdAt: "2026-08-20T12:10:00.000Z" })), "Office should create timeline activity for the assigned job before deletion");',
  '    const assignedFieldTimeline = await listRecords(accounts.A.electrician, "field_cloud_collections", "select=source_id,payload&collection_key=eq.jr-os-job-timeline&source_id=eq." + assignedNullCustomerTimeline);',
  '    await expectAllowed(assignedFieldTimeline, "Assigned electrician field timeline query should execute");',
  '    assert.equal(assignedFieldTimeline.payload.length, 1, "Assigned electrician should retain production-shaped null-customer timeline activity");',
  '    const coworkerAssignedFieldTimeline = await listRecords(accounts.A.coworker, "field_cloud_collections", "select=source_id&collection_key=eq.jr-os-job-timeline&source_id=eq." + assignedNullCustomerTimeline);',
  '    await expectAllowed(coworkerAssignedFieldTimeline, "Co-assigned electrician field timeline query should execute");',
  '    assert.equal(coworkerAssignedFieldTimeline.payload.length, 1, "Co-assigned electrician should retain assigned job timeline activity");',
  '    const unassignedFieldTimeline = await listRecords(accounts.A.electrician, "field_cloud_collections", "select=source_id&collection_key=eq.jr-os-job-timeline&source_id=eq." + unassignedNullCustomerTimeline);',
  '    await expectAllowed(unassignedFieldTimeline, "Unassigned same-tenant field timeline query should execute safely");',
  '    assert.deepEqual(unassignedFieldTimeline.payload, [], "Electrician must not read unassigned same-tenant timeline activity");',
  '    const officeUnassignedTimeline = await listRecords(accounts.A.office, "cloud_collections", "select=source_id&collection_key=eq.jr-os-job-timeline&source_id=eq." + unassignedNullCustomerTimeline);',
  '    await expectAllowed(officeUnassignedTimeline, "Office unassigned timeline query should execute");',
  '    assert.equal(officeUnassignedTimeline.payload.length, 1, "Office should retain unassigned timeline activity");',
  '    const assignedTimelineBeforeJobDelete = await listRecords(accounts.A.electrician, "field_cloud_collections", "select=source_id&collection_key=eq.jr-os-job-timeline&source_id=eq." + deletedJobTimeline);',
  '    await expectAllowed(assignedTimelineBeforeJobDelete, "Assigned timeline query before job deletion should execute");',
  '    assert.equal(assignedTimelineBeforeJobDelete.payload.length, 1, "Electrician should read timeline activity while the job is active and assigned");',
  '    await expectAllowed(await patchRecords(accounts.A.owner, "jobs", "source_id=eq." + deletedTimelineJob, { deleted_at: new Date().toISOString() }), "Owner should soft-delete the assigned timeline job");',
  '    const deletedJobFieldTimeline = await listRecords(accounts.A.electrician, "field_cloud_collections", "select=source_id&collection_key=eq.jr-os-job-timeline&source_id=eq." + deletedJobTimeline);',
  '    await expectAllowed(deletedJobFieldTimeline, "Deleted-job field timeline query should execute safely");',
  '    assert.deepEqual(deletedJobFieldTimeline.payload, [], "Electrician must not read timeline activity for a soft-deleted job");',
  '    const officeDeletedJobTimeline = await listRecords(accounts.A.office, "cloud_collections", "select=source_id&collection_key=eq.jr-os-job-timeline&source_id=eq." + deletedJobTimeline);',
  '    await expectAllowed(officeDeletedJobTimeline, "Office deleted-job timeline query should execute");',
  '    assert.equal(officeDeletedJobTimeline.payload.length, 1, "Office should retain canonical timeline activity after job deletion");',
  '',
].join("\n");

const fieldSiteDiaryCoverage = [
  '    const deletedDiaryJob = source("field-deleted-diary-job-a");',
  '    await expectAllowed(await insertRecord(accounts.A.office, "jobs", typedRecord(organisationA, deletedDiaryJob, customerA, null, { title: "Deleted diary job", status: "First fix", assignedTo: [fieldTeamA, fieldTeamCoworkerA] })), "Office should create an assigned job for site-diary deletion coverage");',
  '    const diaryReadCases = [',
  '      {',
  '        collectionKey: "jr-os-site-diaries",',
  '        assignedId: source("field-assigned-current-diary-a"),',
  '        unassignedId: source("field-unassigned-current-diary-a"),',
  '        crossTenantId: source("field-cross-tenant-current-diary-b"),',
  '        unboundId: source("field-unbound-current-diary-a"),',
  '        deletedId: source("field-deleted-current-diary-a"),',
  '        assignedMessage: "Assigned electrician should retain a null-customer current site diary",',
  '        coworkerMessage: "Co-assigned electrician should retain a null-customer current site diary",',
  '        unassignedMessage: "Electrician must not read an unassigned current site diary",',
  '        crossTenantMessage: "Assigned electrician must not read another organisation\'s current site diary",',
  '      },',
  '      {',
  '        collectionKey: "jr-os-site-diary",',
  '        assignedId: source("field-assigned-legacy-diary-a"),',
  '        unassignedId: source("field-unassigned-legacy-diary-a"),',
  '        crossTenantId: source("field-cross-tenant-legacy-diary-b"),',
  '        unboundId: source("field-unbound-legacy-diary-a"),',
  '        deletedId: source("field-deleted-legacy-diary-a"),',
  '        assignedMessage: "Assigned electrician should retain a null-customer legacy site diary",',
  '        coworkerMessage: "Co-assigned electrician should retain a null-customer legacy site diary",',
  '        unassignedMessage: "Electrician must not read an unassigned legacy site diary",',
  '        crossTenantMessage: "Assigned electrician must not read another organisation\'s legacy site diary",',
  '      },',
  '    ];',
  '    for (const diaryCase of diaryReadCases) {',
  '      const assignedPayload = { workDate: "2026-08-20", completedBy: "JR OS Office", staffPresent: [], otherStaffPresent: "", workCompleted: "Assigned operational diary", delays: "", customerRequests: "", materialsUsed: "", voiceNotes: "" };',
  '      await expectAllowed(await insertRecord(accounts.A.office, "cloud_collections", genericRecord(organisationA, diaryCase.collectionKey, diaryCase.assignedId, accounts.A.office, undefined, jobA, assignedPayload)), "Office should create an assigned null-customer site diary");',
  '      await expectAllowed(await insertRecord(accounts.A.office, "cloud_collections", genericRecord(organisationA, diaryCase.collectionKey, diaryCase.unassignedId, accounts.A.office, undefined, otherCustomerJobA, { ...assignedPayload, workCompleted: "Unassigned private diary" })), "Office should create an unassigned null-customer site diary");',
  '      await expectAllowed(await insertRecord(accounts.B.office, "cloud_collections", genericRecord(organisationB, diaryCase.collectionKey, diaryCase.crossTenantId, accounts.B.office, undefined, jobB, { ...assignedPayload, workCompleted: "Other tenant diary" })), "Tenant B office should create a cross-tenant diary fixture");',
  '      await expectAllowed(await insertRecord(accounts.A.office, "cloud_collections", genericRecord(organisationA, diaryCase.collectionKey, diaryCase.unboundId, accounts.A.office, undefined, undefined, { ...assignedPayload, workCompleted: "Unbound private diary" })), "Office should create a wholly unbound diary fixture");',
  '      await expectAllowed(await insertRecord(accounts.A.office, "cloud_collections", genericRecord(organisationA, diaryCase.collectionKey, diaryCase.deletedId, accounts.A.office, undefined, deletedDiaryJob, { ...assignedPayload, workCompleted: "Diary for deleted job" })), "Office should create a site diary before job deletion");',
  '',
  '      const assignedDiary = await listRecords(accounts.A.electrician, "field_cloud_collections", "select=source_id,payload&collection_key=eq." + diaryCase.collectionKey + "&source_id=eq." + diaryCase.assignedId);',
  '      await expectAllowed(assignedDiary, "Assigned electrician site-diary query should execute");',
  '      assert.equal(assignedDiary.payload.length, 1, diaryCase.assignedMessage);',
  '      assert.equal(assignedDiary.payload[0].payload.completedBy, "JR OS Office", "Diary reads must not be limited to records authored by the reader");',
  '      const coworkerDiary = await listRecords(accounts.A.coworker, "field_cloud_collections", "select=source_id&collection_key=eq." + diaryCase.collectionKey + "&source_id=eq." + diaryCase.assignedId);',
  '      await expectAllowed(coworkerDiary, "Co-assigned electrician site-diary query should execute");',
  '      assert.equal(coworkerDiary.payload.length, 1, diaryCase.coworkerMessage);',
  '      const unassignedDiary = await listRecords(accounts.A.electrician, "field_cloud_collections", "select=source_id&collection_key=eq." + diaryCase.collectionKey + "&source_id=eq." + diaryCase.unassignedId);',
  '      await expectAllowed(unassignedDiary, "Unassigned site-diary query should execute safely");',
  '      assert.deepEqual(unassignedDiary.payload, [], diaryCase.unassignedMessage);',
  '      const crossTenantDiary = await listRecords(accounts.A.electrician, "field_cloud_collections", "select=source_id&collection_key=eq." + diaryCase.collectionKey + "&source_id=eq." + diaryCase.crossTenantId);',
  '      await expectAllowed(crossTenantDiary, "Cross-tenant site-diary query should execute safely");',
  '      assert.deepEqual(crossTenantDiary.payload, [], diaryCase.crossTenantMessage);',
  '      const unboundDiary = await listRecords(accounts.A.electrician, "field_cloud_collections", "select=source_id&collection_key=eq." + diaryCase.collectionKey + "&source_id=eq." + diaryCase.unboundId);',
  '      await expectAllowed(unboundDiary, "Unbound site-diary query should execute safely");',
  '      assert.deepEqual(unboundDiary.payload, [], "Electrician must not read a diary without a canonical job");',
  '      const officeUnassignedDiary = await listRecords(accounts.A.office, "cloud_collections", "select=source_id&collection_key=eq." + diaryCase.collectionKey + "&source_id=eq." + diaryCase.unassignedId);',
  '      await expectAllowed(officeUnassignedDiary, "Office unassigned site-diary query should execute");',
  '      assert.equal(officeUnassignedDiary.payload.length, 1, "Office should retain unassigned current and legacy site diaries");',
  '    }',
  '',
  '    const fieldDiariesBeforeJobDelete = await listRecords(accounts.A.electrician, "field_cloud_collections", "select=source_id&job_source_id=eq." + deletedDiaryJob + "&collection_key=in.(jr-os-site-diaries,jr-os-site-diary)");',
  '    await expectAllowed(fieldDiariesBeforeJobDelete, "Assigned diary query before job deletion should execute");',
  '    assert.equal(fieldDiariesBeforeJobDelete.payload.length, 2, "Electrician should read current and legacy diaries while the job is active and assigned");',
  '    await expectAllowed(await patchRecords(accounts.A.owner, "jobs", "source_id=eq." + deletedDiaryJob, { deleted_at: new Date().toISOString() }), "Owner should soft-delete the assigned site-diary job");',
  '    const fieldDiariesAfterJobDelete = await listRecords(accounts.A.electrician, "field_cloud_collections", "select=source_id&job_source_id=eq." + deletedDiaryJob + "&collection_key=in.(jr-os-site-diaries,jr-os-site-diary)");',
  '    await expectAllowed(fieldDiariesAfterJobDelete, "Deleted-job site-diary query should execute safely");',
  '    assert.deepEqual(fieldDiariesAfterJobDelete.payload, [], "Electrician must not read current or legacy diaries for a soft-deleted job");',
  '    const officeDiariesAfterJobDelete = await listRecords(accounts.A.office, "cloud_collections", "select=source_id&job_source_id=eq." + deletedDiaryJob + "&collection_key=in.(jr-os-site-diaries,jr-os-site-diary)");',
  '    await expectAllowed(officeDiariesAfterJobDelete, "Office deleted-job site-diary query should execute");',
  '    assert.equal(officeDiariesAfterJobDelete.payload.length, 2, "Office should retain canonical current and legacy site diaries after job deletion");',
  '',
].join("\n");

const fieldVariationCoverage = [
  '    const assignedVariation = source("field-assigned-variation-a");',
  '    const unassignedVariation = source("field-unassigned-variation-a");',
  '    const crossTenantVariation = source("field-cross-tenant-variation-b");',
  '    const unboundVariation = source("field-unbound-variation-a");',
  '    const deletedVariationJob = source("field-deleted-variation-job-a");',
  '    const deletedJobVariation = source("field-deleted-job-variation-a");',
  '    const variationPayload = { number: "V-SEC-001", title: "Assigned variation", description: "Assigned operational change", status: "Sent", approvalMethod: "Email", requestedBy: "Site manager", customerNotes: "Private job variation note" };',
  '    await expectAllowed(await insertRecord(accounts.A.office, "jobs", typedRecord(organisationA, deletedVariationJob, customerA, null, { title: "Deleted variation job", status: "First fix", assignedTo: [fieldTeamA, fieldTeamCoworkerA] })), "Office should create an assigned job for variation deletion coverage");',
  '    await expectAllowed(await insertRecord(accounts.A.office, "cloud_collections", genericRecord(organisationA, "jr-os-job-variations", assignedVariation, accounts.A.office, null, jobA, { ...variationPayload, id: assignedVariation, jobId: jobA })), "Office should create a production-shaped assigned variation without a customer envelope");',
  '    await expectAllowed(await insertRecord(accounts.A.office, "cloud_collections", genericRecord(organisationA, "jr-os-job-variations", unassignedVariation, accounts.A.office, null, otherCustomerJobA, { ...variationPayload, id: unassignedVariation, jobId: otherCustomerJobA, title: "Unassigned private variation" })), "Office should create an unassigned variation without a customer envelope");',
  '    await expectAllowed(await insertRecord(accounts.B.office, "cloud_collections", genericRecord(organisationB, "jr-os-job-variations", crossTenantVariation, accounts.B.office, null, jobB, { ...variationPayload, id: crossTenantVariation, jobId: jobB, title: "Other tenant variation" })), "Tenant B office should create a cross-tenant variation fixture");',
  '    await expectAllowed(await insertRecord(accounts.A.office, "cloud_collections", genericRecord(organisationA, "jr-os-job-variations", unboundVariation, accounts.A.office, null, undefined, { ...variationPayload, id: unboundVariation, jobId: undefined, title: "Unbound private variation" })), "Office should create a wholly unbound variation fixture");',
  '    await expectAllowed(await insertRecord(accounts.A.office, "cloud_collections", genericRecord(organisationA, "jr-os-job-variations", deletedJobVariation, accounts.A.office, null, deletedVariationJob, { ...variationPayload, id: deletedJobVariation, jobId: deletedVariationJob, title: "Variation for deleted job" })), "Office should create a variation before job deletion");',
  '',
  '    const assignedFieldVariation = await listRecords(accounts.A.electrician, "field_cloud_collections", "select=source_id,payload&collection_key=eq.jr-os-job-variations&source_id=eq." + assignedVariation);',
  '    await expectAllowed(assignedFieldVariation, "Assigned electrician variation query should execute");',
  '    assert.equal(assignedFieldVariation.payload.length, 1, "Assigned electrician should retain a null-customer job variation");',
  '    assert.equal(assignedFieldVariation.payload[0].payload.title, "Assigned variation");',
  '    const coworkerFieldVariation = await listRecords(accounts.A.coworker, "field_cloud_collections", "select=source_id&collection_key=eq.jr-os-job-variations&source_id=eq." + assignedVariation);',
  '    await expectAllowed(coworkerFieldVariation, "Co-assigned electrician variation query should execute");',
  '    assert.equal(coworkerFieldVariation.payload.length, 1, "Co-assigned electrician should retain an assigned job variation");',
  '    const unassignedFieldVariation = await listRecords(accounts.A.electrician, "field_cloud_collections", "select=source_id&collection_key=eq.jr-os-job-variations&source_id=eq." + unassignedVariation);',
  '    await expectAllowed(unassignedFieldVariation, "Unassigned variation query should execute safely");',
  '    assert.deepEqual(unassignedFieldVariation.payload, [], "Electrician must not read an unassigned same-tenant job variation");',
  '    const crossTenantFieldVariation = await listRecords(accounts.A.electrician, "field_cloud_collections", "select=source_id&collection_key=eq.jr-os-job-variations&source_id=eq." + crossTenantVariation);',
  '    await expectAllowed(crossTenantFieldVariation, "Cross-tenant variation query should execute safely");',
  '    assert.deepEqual(crossTenantFieldVariation.payload, [], "Assigned electrician must not read another organisation\'s job variation");',
  '    const unboundFieldVariation = await listRecords(accounts.A.electrician, "field_cloud_collections", "select=source_id&collection_key=eq.jr-os-job-variations&source_id=eq." + unboundVariation);',
  '    await expectAllowed(unboundFieldVariation, "Unbound variation query should execute safely");',
  '    assert.deepEqual(unboundFieldVariation.payload, [], "Electrician must not read a variation without a canonical job");',
  '    const officeUnassignedVariation = await listRecords(accounts.A.office, "cloud_collections", "select=source_id&collection_key=eq.jr-os-job-variations&source_id=eq." + unassignedVariation);',
  '    await expectAllowed(officeUnassignedVariation, "Office unassigned variation query should execute");',
  '    assert.equal(officeUnassignedVariation.payload.length, 1, "Office should retain unassigned job variation access");',
  '    const fieldVariationBeforeJobDelete = await listRecords(accounts.A.electrician, "field_cloud_collections", "select=source_id&collection_key=eq.jr-os-job-variations&source_id=eq." + deletedJobVariation);',
  '    await expectAllowed(fieldVariationBeforeJobDelete, "Assigned variation query before job deletion should execute");',
  '    assert.equal(fieldVariationBeforeJobDelete.payload.length, 1, "Electrician should read the job variation while the job is active and assigned");',
  '    await expectAllowed(await patchRecords(accounts.A.owner, "jobs", "source_id=eq." + deletedVariationJob, { deleted_at: new Date().toISOString() }), "Owner should soft-delete the assigned variation job");',
  '    const fieldVariationAfterJobDelete = await listRecords(accounts.A.electrician, "field_cloud_collections", "select=source_id&collection_key=eq.jr-os-job-variations&source_id=eq." + deletedJobVariation);',
  '    await expectAllowed(fieldVariationAfterJobDelete, "Deleted-job variation query should execute safely");',
  '    assert.deepEqual(fieldVariationAfterJobDelete.payload, [], "Electrician must not read a job variation for a soft-deleted job");',
  '    const officeVariationAfterJobDelete = await listRecords(accounts.A.office, "cloud_collections", "select=source_id&collection_key=eq.jr-os-job-variations&source_id=eq." + deletedJobVariation);',
  '    await expectAllowed(officeVariationAfterJobDelete, "Office deleted-job variation query should execute");',
  '    assert.equal(officeVariationAfterJobDelete.payload.length, 1, "Office should retain canonical job variation after job deletion");',
  '',
].join("\n");

const fieldProgressReadCoverage = [
  '    const assignedProgressJob = source("field-assigned-progress-job-a");',
  '    const unassignedProgressJob = source("field-unassigned-progress-job-a");',
  '    const crossTenantProgressJob = source("field-cross-tenant-progress-job-b");',
  '    const deletedProgressJob = source("field-deleted-progress-job-a");',
  '    const assignedProgress = source("field-assigned-progress-a");',
  '    const unassignedProgress = source("field-unassigned-progress-a");',
  '    const crossTenantProgress = source("field-cross-tenant-progress-b");',
  '    const unboundProgress = source("field-unbound-progress-a");',
  '    const deletedJobProgress = source("field-deleted-job-progress-a");',
  '    const progressPayload = { manual: { overall: 40, firstFix: 60, secondFix: 20, testing: 10, certificates: 0, materials: 50, payments: 75 }, suggestions: [{ metric: "testing", value: 25, reason: "Office plan", calculatedAt: "2026-08-26T09:00:00.000Z" }], updatedBy: "JR OS Office", createdAt: "2026-08-26T09:00:00.000Z", updatedAt: "2026-08-26T09:00:00.000Z" };',
  '    await expectAllowed(await insertRecord(accounts.A.office, "jobs", typedRecord(organisationA, assignedProgressJob, customerA, null, { title: "Assigned progress job", status: "First fix", assignedTo: [fieldTeamA, fieldTeamCoworkerA] })), "Office should create an assigned job for progress read coverage");',
  '    await expectAllowed(await insertRecord(accounts.A.office, "jobs", typedRecord(organisationA, unassignedProgressJob, customerA, null, { title: "Unassigned progress job", status: "First fix", assignedTo: [] })), "Office should create an unassigned job for progress read coverage");',
  '    await expectAllowed(await insertRecord(accounts.B.office, "jobs", typedRecord(organisationB, crossTenantProgressJob, customerB, null, { title: "Cross-tenant progress job", status: "First fix", assignedTo: [] })), "Tenant B office should create a cross-tenant progress job");',
  '    await expectAllowed(await insertRecord(accounts.A.office, "jobs", typedRecord(organisationA, deletedProgressJob, customerA, null, { title: "Deleted progress job", status: "First fix", assignedTo: [fieldTeamA, fieldTeamCoworkerA] })), "Office should create an assigned job for progress deletion coverage");',
  '    await expectAllowed(await insertRecord(accounts.A.office, "cloud_collections", genericRecord(organisationA, "jr-os-job-progress", assignedProgress, accounts.A.office, null, assignedProgressJob, { ...progressPayload, id: assignedProgress, jobId: assignedProgressJob })), "Office should create production-shaped assigned progress without a customer envelope");',
  '    await expectAllowed(await insertRecord(accounts.A.office, "cloud_collections", genericRecord(organisationA, "jr-os-job-progress", unassignedProgress, accounts.A.office, null, unassignedProgressJob, { ...progressPayload, id: unassignedProgress, jobId: unassignedProgressJob, updatedBy: "Private unassigned office plan" })), "Office should create unassigned progress without a customer envelope");',
  '    await expectAllowed(await insertRecord(accounts.B.office, "cloud_collections", genericRecord(organisationB, "jr-os-job-progress", crossTenantProgress, accounts.B.office, null, crossTenantProgressJob, { ...progressPayload, id: crossTenantProgress, jobId: crossTenantProgressJob, updatedBy: "Other tenant office" })), "Tenant B office should create cross-tenant progress");',
  '    await expectAllowed(await insertRecord(accounts.A.office, "cloud_collections", genericRecord(organisationA, "jr-os-job-progress", unboundProgress, accounts.A.office, null, undefined, { ...progressPayload, id: unboundProgress, jobId: undefined, updatedBy: "Unbound office plan" })), "Office should create wholly unbound progress");',
  '    await expectAllowed(await insertRecord(accounts.A.office, "cloud_collections", genericRecord(organisationA, "jr-os-job-progress", deletedJobProgress, accounts.A.office, null, deletedProgressJob, { ...progressPayload, id: deletedJobProgress, jobId: deletedProgressJob })), "Office should create progress before job deletion");',
  '',
  '    const assignedFieldProgress = await listRecords(accounts.A.electrician, "field_cloud_collections", "select=source_id,payload&collection_key=eq.jr-os-job-progress&source_id=eq." + assignedProgress);',
  '    await expectAllowed(assignedFieldProgress, "Assigned electrician progress query should execute");',
  '    assert.equal(assignedFieldProgress.payload.length, 1, "Assigned electrician should retain null-customer job progress");',
  '    assert.equal(assignedFieldProgress.payload[0].payload.manual.payments, 75, "Assigned progress should retain the office-controlled percentage");',
  '    const coworkerFieldProgress = await listRecords(accounts.A.coworker, "field_cloud_collections", "select=source_id&collection_key=eq.jr-os-job-progress&source_id=eq." + assignedProgress);',
  '    await expectAllowed(coworkerFieldProgress, "Co-assigned electrician progress query should execute");',
  '    assert.equal(coworkerFieldProgress.payload.length, 1, "Co-assigned electrician should retain assigned job progress");',
  '    const unassignedFieldProgress = await listRecords(accounts.A.electrician, "field_cloud_collections", "select=source_id&collection_key=eq.jr-os-job-progress&source_id=eq." + unassignedProgress);',
  '    await expectAllowed(unassignedFieldProgress, "Unassigned progress query should execute safely");',
  '    assert.deepEqual(unassignedFieldProgress.payload, [], "Electrician must not read unassigned same-tenant job progress");',
  '    const crossTenantFieldProgress = await listRecords(accounts.A.electrician, "field_cloud_collections", "select=source_id&collection_key=eq.jr-os-job-progress&source_id=eq." + crossTenantProgress);',
  '    await expectAllowed(crossTenantFieldProgress, "Cross-tenant progress query should execute safely");',
  '    assert.deepEqual(crossTenantFieldProgress.payload, [], "Assigned electrician must not read another organisation\'s job progress");',
  '    const unboundFieldProgress = await listRecords(accounts.A.electrician, "field_cloud_collections", "select=source_id&collection_key=eq.jr-os-job-progress&source_id=eq." + unboundProgress);',
  '    await expectAllowed(unboundFieldProgress, "Unbound progress query should execute safely");',
  '    assert.deepEqual(unboundFieldProgress.payload, [], "Electrician must not read progress without a canonical job");',
  '    const progressUnboundUser = await createUser("a-electrician-progress-unbound");',
  '    context.users.push(progressUnboundUser);',
  '    await createProfile(progressUnboundUser, organisationA, "electrician");',
  '    const progressUnboundAccount = { ...progressUnboundUser, ...(await signIn(progressUnboundUser)), organisationId: organisationA };',
  '    const noIdentityProgress = await listRecords(progressUnboundAccount, "field_cloud_collections", "select=source_id&collection_key=eq.jr-os-job-progress&source_id=eq." + assignedProgress);',
  '    await expectAllowed(noIdentityProgress, "Unbound field identity progress query should execute safely");',
  '    assert.deepEqual(noIdentityProgress.payload, [], "Electrician without an active field identity must not read job progress");',
  '    const officeUnassignedProgress = await listRecords(accounts.A.office, "cloud_collections", "select=source_id&collection_key=eq.jr-os-job-progress&source_id=eq." + unassignedProgress);',
  '    await expectAllowed(officeUnassignedProgress, "Office unassigned progress query should execute");',
  '    assert.equal(officeUnassignedProgress.payload.length, 1, "Office should retain unassigned job progress access");',
  '    const fieldProgressBeforeJobDelete = await listRecords(accounts.A.electrician, "field_cloud_collections", "select=source_id&collection_key=eq.jr-os-job-progress&source_id=eq." + deletedJobProgress);',
  '    await expectAllowed(fieldProgressBeforeJobDelete, "Assigned progress query before job deletion should execute");',
  '    assert.equal(fieldProgressBeforeJobDelete.payload.length, 1, "Electrician should read job progress while the job is active and assigned");',
  '    await expectAllowed(await patchRecords(accounts.A.owner, "jobs", "source_id=eq." + deletedProgressJob, { deleted_at: new Date().toISOString() }), "Owner should soft-delete the assigned progress job");',
  '    const fieldProgressAfterJobDelete = await listRecords(accounts.A.electrician, "field_cloud_collections", "select=source_id&collection_key=eq.jr-os-job-progress&source_id=eq." + deletedJobProgress);',
  '    await expectAllowed(fieldProgressAfterJobDelete, "Deleted-job progress query should execute safely");',
  '    assert.deepEqual(fieldProgressAfterJobDelete.payload, [], "Electrician must not read job progress for a soft-deleted job");',
  '    const officeProgressAfterJobDelete = await listRecords(accounts.A.office, "cloud_collections", "select=source_id&collection_key=eq.jr-os-job-progress&source_id=eq." + deletedJobProgress);',
  '    await expectAllowed(officeProgressAfterJobDelete, "Office deleted-job progress query should execute");',
  '    assert.equal(officeProgressAfterJobDelete.payload.length, 1, "Office should retain canonical job progress after job deletion");',
  '',
].join("\n");

const fieldProgressUpdateEnvelopeCoverage = [
  '    const mismatchedProgressJob = source("field-mismatched-progress-job-a");',
  '    const mismatchedCustomerProgress = source("field-mismatched-customer-progress-a");',
  '    await expectAllowed(await insertRecord(accounts.A.office, "jobs", typedRecord(organisationA, mismatchedProgressJob, customerA, null, { title: "Mismatched progress envelope job", status: "First fix", assignedTo: [fieldTeamA] })), "Office should create an assigned job for progress envelope coverage");',
  '    await expectAllowed(await insertRecord(accounts.A.office, "cloud_collections", genericRecord(organisationA, "jr-os-job-progress", mismatchedCustomerProgress, accounts.A.office, otherCustomerA, mismatchedProgressJob, { ...progressPayload, id: mismatchedCustomerProgress, jobId: mismatchedProgressJob })), "Office should create a wrong non-null progress customer fixture");',
  '',
  '    const assignedProgressBeforeUpdate = await listRecords(accounts.A.office, "cloud_collections", "select=version,customer_source_id,payload&collection_key=eq.jr-os-job-progress&source_id=eq." + assignedProgress);',
  '    await expectAllowed(assignedProgressBeforeUpdate, "Office should read assigned progress before the field update");',
  '    assert.equal(assignedProgressBeforeUpdate.payload[0].customer_source_id, null, "Office-created progress fixture must retain its production null customer envelope");',
  '    const nullCustomerProgressUpdate = await authenticated(accounts.A.electrician, "/rest/v1/rpc/jr_field_save_job_progress", { method: "POST", body: { collection_key_value: "jr-os-job-progress", record_source_id: assignedProgress, expected_version: assignedProgressBeforeUpdate.payload[0].version, record_payload: { ...assignedProgressBeforeUpdate.payload[0].payload, manual: { ...assignedProgressBeforeUpdate.payload[0].payload.manual, overall: 55, payments: 0 } }, mutation_id: crypto.randomUUID() } });',
  '    await expectAllowed(nullCustomerProgressUpdate, "Assigned electrician should update office-created null-customer job progress");',
  '    assert.equal(nullCustomerProgressUpdate.payload.version, assignedProgressBeforeUpdate.payload[0].version + 1);',
  '    assert.equal(nullCustomerProgressUpdate.payload.payload.manual.overall, 55);',
  '    assert.equal(nullCustomerProgressUpdate.payload.payload.manual.payments, 75, "Progress RPC must preserve the canonical payment percentage");',
  '    assert.equal(nullCustomerProgressUpdate.payload.payload.suggestions.length, 1, "Progress RPC must preserve office suggestions");',
  '    assert.equal(nullCustomerProgressUpdate.payload.payload.updatedBy, "Field write electrician");',
  '    const assignedProgressAfterUpdate = await listRecords(accounts.A.office, "cloud_collections", "select=customer_source_id,payload&collection_key=eq.jr-os-job-progress&source_id=eq." + assignedProgress);',
  '    await expectAllowed(assignedProgressAfterUpdate, "Office should read assigned progress after the field update");',
  '    assert.equal(assignedProgressAfterUpdate.payload[0].customer_source_id, null, "Progress RPC must preserve a legitimate null customer envelope");',
  '    assert.equal(assignedProgressAfterUpdate.payload[0].payload.manual.payments, 75);',
  '',
  '    await expectDeniedWithCode(await authenticated(accounts.A.electrician, "/rest/v1/rpc/jr_field_save_job_progress", { method: "POST", body: { collection_key_value: "jr-os-job-progress", record_source_id: mismatchedCustomerProgress, expected_version: 1, record_payload: { ...progressPayload, id: mismatchedCustomerProgress, jobId: mismatchedProgressJob }, mutation_id: crypto.randomUUID() } }), "PT409", "Wrong non-null progress customer envelope must fail closed");',
  '    await expectDeniedWithCode(await authenticated(accounts.A.electrician, "/rest/v1/rpc/jr_field_save_job_progress", { method: "POST", body: { collection_key_value: "jr-os-job-progress", record_source_id: unassignedProgress, expected_version: 1, record_payload: { ...progressPayload, id: unassignedProgress, jobId: unassignedProgressJob }, mutation_id: crypto.randomUUID() } }), "42501", "Electrician must not update unassigned job progress");',
  '',
].join("\n");

const fieldMaterialUsageReadCoverage = [
  '    const deletedMaterialUsageJob = source("field-deleted-material-usage-job-a");',
  '    const assignedMaterialUsage = source("field-assigned-material-usage-a");',
  '    const unassignedMaterialUsage = source("field-unassigned-material-usage-a");',
  '    const crossTenantMaterialUsage = source("field-cross-tenant-material-usage-b");',
  '    const unboundMaterialUsage = source("field-unbound-material-usage-a");',
  '    const wrongCustomerMaterialUsage = source("field-wrong-customer-material-usage-a");',
  '    const deletedJobMaterialUsage = source("field-deleted-job-material-usage-a");',
  '    const materialUsagePayload = { materialId: source("material-usage-stock-a"), description: "Twin and earth cable", quantity: 12, unit: "Metre", unitCost: 2.5, supplier: "CEF", usedAt: "2026-08-26T10:00:00.000Z", recordedBy: "JR OS Office", notes: "Stored beside the private riser", createdAt: "2026-08-26T10:00:00.000Z", updatedAt: "2026-08-26T10:00:00.000Z" };',
  '    await expectAllowed(await insertRecord(accounts.A.office, "jobs", typedRecord(organisationA, deletedMaterialUsageJob, customerA, null, { title: "Deleted material usage job", status: "First fix", assignedTo: [fieldTeamA, fieldTeamCoworkerA] })), "Office should create an assigned job for material-usage deletion coverage");',
  '    await expectAllowed(await insertRecord(accounts.A.office, "cloud_collections", genericRecord(organisationA, "jr-os-job-material-usage", assignedMaterialUsage, accounts.A.office, null, jobA, { ...materialUsagePayload, id: assignedMaterialUsage, jobId: jobA })), "Office should create production-shaped assigned material usage without a customer envelope");',
  '    await expectAllowed(await insertRecord(accounts.A.office, "cloud_collections", genericRecord(organisationA, "jr-os-job-material-usage", unassignedMaterialUsage, accounts.A.office, null, otherCustomerJobA, { ...materialUsagePayload, id: unassignedMaterialUsage, jobId: otherCustomerJobA, description: "Private unassigned materials" })), "Office should create unassigned material usage without a customer envelope");',
  '    await expectAllowed(await insertRecord(accounts.B.office, "cloud_collections", genericRecord(organisationB, "jr-os-job-material-usage", crossTenantMaterialUsage, accounts.B.office, null, jobB, { ...materialUsagePayload, id: crossTenantMaterialUsage, jobId: jobB, description: "Other tenant materials" })), "Tenant B office should create cross-tenant material usage");',
  '    await expectAllowed(await insertRecord(accounts.A.office, "cloud_collections", genericRecord(organisationA, "jr-os-job-material-usage", unboundMaterialUsage, accounts.A.office, null, undefined, { ...materialUsagePayload, id: unboundMaterialUsage, jobId: undefined, description: "Unbound private materials" })), "Office should create wholly unbound material usage");',
  '    await expectAllowed(await insertRecord(accounts.A.office, "cloud_collections", genericRecord(organisationA, "jr-os-job-material-usage", wrongCustomerMaterialUsage, accounts.A.office, otherCustomerA, jobA, { ...materialUsagePayload, id: wrongCustomerMaterialUsage, jobId: jobA, description: "Mismatched customer materials" })), "Office should create a mismatched-customer material usage fixture");',
  '    await expectAllowed(await insertRecord(accounts.A.office, "cloud_collections", genericRecord(organisationA, "jr-os-job-material-usage", deletedJobMaterialUsage, accounts.A.office, null, deletedMaterialUsageJob, { ...materialUsagePayload, id: deletedJobMaterialUsage, jobId: deletedMaterialUsageJob })), "Office should create material usage before job deletion");',
  '',
  '    const assignedFieldMaterialUsage = await listRecords(accounts.A.electrician, "field_cloud_collections", "select=source_id,payload&collection_key=eq.jr-os-job-material-usage&source_id=eq." + assignedMaterialUsage);',
  '    await expectAllowed(assignedFieldMaterialUsage, "Assigned electrician material-usage query should execute");',
  '    assert.equal(assignedFieldMaterialUsage.payload.length, 1, "Assigned electrician should retain null-customer job material usage");',
  '    assert.equal(assignedFieldMaterialUsage.payload[0].payload.notes, "Stored beside the private riser", "Assigned usage should retain operational site notes");',
  '    assert.equal(assignedFieldMaterialUsage.payload[0].payload.unitCost, undefined, "Field material usage projection must omit unit costs");',
  '    const coworkerFieldMaterialUsage = await listRecords(accounts.A.coworker, "field_cloud_collections", "select=source_id&collection_key=eq.jr-os-job-material-usage&source_id=eq." + assignedMaterialUsage);',
  '    await expectAllowed(coworkerFieldMaterialUsage, "Co-assigned electrician material-usage query should execute");',
  '    assert.equal(coworkerFieldMaterialUsage.payload.length, 1, "Co-assigned electrician should retain assigned job material usage");',
  '    const unassignedFieldMaterialUsage = await listRecords(accounts.A.electrician, "field_cloud_collections", "select=source_id&collection_key=eq.jr-os-job-material-usage&source_id=eq." + unassignedMaterialUsage);',
  '    await expectAllowed(unassignedFieldMaterialUsage, "Unassigned material-usage query should execute safely");',
  '    assert.deepEqual(unassignedFieldMaterialUsage.payload, [], "Electrician must not read unassigned same-tenant job material usage");',
  '    const crossTenantFieldMaterialUsage = await listRecords(accounts.A.electrician, "field_cloud_collections", "select=source_id&collection_key=eq.jr-os-job-material-usage&source_id=eq." + crossTenantMaterialUsage);',
  '    await expectAllowed(crossTenantFieldMaterialUsage, "Cross-tenant material-usage query should execute safely");',
  '    assert.deepEqual(crossTenantFieldMaterialUsage.payload, [], "Assigned electrician must not read another organisation\'s job material usage");',
  '    const unboundFieldMaterialUsage = await listRecords(accounts.A.electrician, "field_cloud_collections", "select=source_id&collection_key=eq.jr-os-job-material-usage&source_id=eq." + unboundMaterialUsage);',
  '    await expectAllowed(unboundFieldMaterialUsage, "Unbound material-usage query should execute safely");',
  '    assert.deepEqual(unboundFieldMaterialUsage.payload, [], "Electrician must not read material usage without a canonical job");',
  '    const wrongCustomerFieldMaterialUsage = await listRecords(accounts.A.electrician, "field_cloud_collections", "select=source_id&collection_key=eq.jr-os-job-material-usage&source_id=eq." + wrongCustomerMaterialUsage);',
  '    await expectAllowed(wrongCustomerFieldMaterialUsage, "Wrong-customer material-usage query should execute safely");',
  '    assert.deepEqual(wrongCustomerFieldMaterialUsage.payload, [], "Wrong customer material usage envelope must fail closed");',
  '    const materialUsageUnboundUser = await createUser("a-electrician-material-usage-unbound");',
  '    context.users.push(materialUsageUnboundUser);',
  '    await createProfile(materialUsageUnboundUser, organisationA, "electrician");',
  '    const materialUsageUnboundAccount = { ...materialUsageUnboundUser, ...(await signIn(materialUsageUnboundUser)), organisationId: organisationA };',
  '    const noIdentityMaterialUsage = await listRecords(materialUsageUnboundAccount, "field_cloud_collections", "select=source_id&collection_key=eq.jr-os-job-material-usage&source_id=eq." + assignedMaterialUsage);',
  '    await expectAllowed(noIdentityMaterialUsage, "Unbound field identity material-usage query should execute safely");',
  '    assert.deepEqual(noIdentityMaterialUsage.payload, [], "Electrician without an active field identity must not read job material usage");',
  '    const officeUnassignedMaterialUsage = await listRecords(accounts.A.office, "cloud_collections", "select=source_id,payload&collection_key=eq.jr-os-job-material-usage&source_id=eq." + unassignedMaterialUsage);',
  '    await expectAllowed(officeUnassignedMaterialUsage, "Office unassigned material-usage query should execute");',
  '    assert.equal(officeUnassignedMaterialUsage.payload.length, 1, "Office should retain unassigned job material usage access");',
  '    assert.equal(officeUnassignedMaterialUsage.payload[0].payload.unitCost, 2.5, "Office should retain canonical material unit costs");',
  '    const fieldMaterialUsageBeforeJobDelete = await listRecords(accounts.A.electrician, "field_cloud_collections", "select=source_id&collection_key=eq.jr-os-job-material-usage&source_id=eq." + deletedJobMaterialUsage);',
  '    await expectAllowed(fieldMaterialUsageBeforeJobDelete, "Assigned material-usage query before job deletion should execute");',
  '    assert.equal(fieldMaterialUsageBeforeJobDelete.payload.length, 1, "Electrician should read job material usage while the job is active and assigned");',
  '    await expectAllowed(await patchRecords(accounts.A.owner, "jobs", "source_id=eq." + deletedMaterialUsageJob, { deleted_at: new Date().toISOString() }), "Owner should soft-delete the assigned material-usage job");',
  '    const fieldMaterialUsageAfterJobDelete = await listRecords(accounts.A.electrician, "field_cloud_collections", "select=source_id&collection_key=eq.jr-os-job-material-usage&source_id=eq." + deletedJobMaterialUsage);',
  '    await expectAllowed(fieldMaterialUsageAfterJobDelete, "Deleted-job material-usage query should execute safely");',
  '    assert.deepEqual(fieldMaterialUsageAfterJobDelete.payload, [], "Electrician must not read job material usage for a soft-deleted job");',
  '    const officeMaterialUsageAfterJobDelete = await listRecords(accounts.A.office, "cloud_collections", "select=source_id&collection_key=eq.jr-os-job-material-usage&source_id=eq." + deletedJobMaterialUsage);',
  '    await expectAllowed(officeMaterialUsageAfterJobDelete, "Office deleted-job material-usage query should execute");',
  '    assert.equal(officeMaterialUsageAfterJobDelete.payload.length, 1, "Office should retain canonical job material usage after job deletion");',
  '',
].join("\n");

const fieldJobTaskReadCoverage = [
  '    const deletedTaskReadJob = source("field-deleted-task-read-job-a");',
  '    const fieldCreatedTaskReadId = source("field-created-task-read-a");',
  '    const assignedTaskReadId = source("field-assigned-task-read-a");',
  '    const unassignedTaskReadId = source("field-unassigned-task-read-a");',
  '    const crossTenantTaskReadId = source("field-cross-tenant-task-read-b");',
  '    const unboundTaskReadId = source("field-unbound-task-read-a");',
  '    const wrongCustomerTaskReadId = source("field-wrong-customer-task-read-a");',
  '    const deletedJobTaskReadId = source("field-deleted-job-task-read-a");',
  '    const taskReadPayload = { type: "Task", title: "Assigned operational task", description: "Inspect the riser containment", category: "General", priority: "High", assignedTo: fieldTeamA, dueDate: "2026-08-27", status: "Open", photos: [{ id: "task-private-photo", externalUrl: "https://private.invalid/task-photo", dataUrl: "data:image/jpeg;base64,cHJpdmF0ZQ==" }], notes: "Private operational task note", createdAt: "2026-08-26T11:40:00.000Z", updatedAt: "2026-08-26T11:40:00.000Z" };',
  '    await expectAllowed(await insertRecord(accounts.A.office, "jobs", typedRecord(organisationA, deletedTaskReadJob, customerA, null, { title: "Deleted task read job", status: "First fix", assignedTo: [fieldTeamA, fieldTeamCoworkerA] })), "Office should create an assigned job for task deletion coverage");',
  '    const fieldCreatedTaskRead = await authenticated(accounts.A.electrician, "/rest/v1/rpc/jr_field_save_collection", { method: "POST", body: { collection_key_value: "jr-os-job-tasks", record_source_id: fieldCreatedTaskReadId, expected_version: 0, record_payload: { ...taskReadPayload, id: fieldCreatedTaskReadId, jobId: jobA, assignedTo: "forged", photos: [{ id: "forged" }] }, mutation_id: crypto.randomUUID() } });',
  '    await expectAllowed(fieldCreatedTaskRead, "Assigned electrician should create a task for read-scope coverage");',
  '    await expectAllowed(await insertRecord(accounts.A.office, "cloud_collections", genericRecord(organisationA, "jr-os-job-tasks", assignedTaskReadId, accounts.A.office, null, jobA, { ...taskReadPayload, id: assignedTaskReadId, jobId: jobA })), "Office should create a production-shaped assigned task without a customer envelope");',
  '    await expectAllowed(await insertRecord(accounts.A.office, "cloud_collections", genericRecord(organisationA, "jr-os-job-tasks", unassignedTaskReadId, accounts.A.office, null, otherCustomerJobA, { ...taskReadPayload, id: unassignedTaskReadId, jobId: otherCustomerJobA, title: "Unassigned private task" })), "Office should create an unassigned task without a customer envelope");',
  '    await expectAllowed(await insertRecord(accounts.B.office, "cloud_collections", genericRecord(organisationB, "jr-os-job-tasks", crossTenantTaskReadId, accounts.B.office, null, jobB, { ...taskReadPayload, id: crossTenantTaskReadId, jobId: jobB, title: "Other tenant private task" })), "Tenant B office should create a cross-tenant task fixture");',
  '    await expectAllowed(await insertRecord(accounts.A.office, "cloud_collections", genericRecord(organisationA, "jr-os-job-tasks", unboundTaskReadId, accounts.A.office, null, undefined, { ...taskReadPayload, id: unboundTaskReadId, jobId: undefined, title: "Unbound private task" })), "Office should create a wholly unbound task fixture");',
  '    await expectAllowed(await insertRecord(accounts.A.office, "cloud_collections", genericRecord(organisationA, "jr-os-job-tasks", wrongCustomerTaskReadId, accounts.A.office, otherCustomerA, jobA, { ...taskReadPayload, id: wrongCustomerTaskReadId, jobId: jobA, title: "Wrong customer private task" })), "Office should create a mismatched-customer task fixture");',
  '    await expectAllowed(await insertRecord(accounts.A.office, "cloud_collections", genericRecord(organisationA, "jr-os-job-tasks", deletedJobTaskReadId, accounts.A.office, null, deletedTaskReadJob, { ...taskReadPayload, id: deletedJobTaskReadId, jobId: deletedTaskReadJob, title: "Deleted job private task" })), "Office should create a task before job deletion");',
  '',
  '    const fieldCreatedTaskProjection = await listRecords(accounts.A.electrician, "field_cloud_collections", "select=source_id,payload&collection_key=eq.jr-os-job-tasks&source_id=eq." + fieldCreatedTaskReadId);',
  '    await expectAllowed(fieldCreatedTaskProjection, "Field-created task projection query should execute");',
  '    assert.equal(fieldCreatedTaskProjection.payload.length, 1, "Assigned electrician should retain a server-bound field-created task");',
  '    assert.equal(fieldCreatedTaskProjection.payload[0].payload.customerId, customerA, "Field-created task must retain its server-bound customer");',
  '    const assignedFieldTask = await listRecords(accounts.A.electrician, "field_cloud_collections", "select=source_id,payload&collection_key=eq.jr-os-job-tasks&source_id=eq." + assignedTaskReadId);',
  '    await expectAllowed(assignedFieldTask, "Assigned electrician task query should execute");',
  '    assert.equal(assignedFieldTask.payload.length, 1, "Assigned electrician should retain production-shaped null-customer job tasks");',
  '    assert.equal(assignedFieldTask.payload[0].payload.notes, "Private operational task note", "Assigned task projection should retain operational notes and attachments");',
  '    assert.equal(assignedFieldTask.payload[0].payload.photos[0].dataUrl, "data:image/jpeg;base64,cHJpdmF0ZQ==");',
  '    const coworkerFieldTask = await listRecords(accounts.A.coworker, "field_cloud_collections", "select=source_id&collection_key=eq.jr-os-job-tasks&source_id=eq." + assignedTaskReadId);',
  '    await expectAllowed(coworkerFieldTask, "Co-assigned electrician task query should execute");',
  '    assert.equal(coworkerFieldTask.payload.length, 1, "Co-assigned electrician should retain assigned job task details");',
  '    const unassignedFieldTask = await listRecords(accounts.A.electrician, "field_cloud_collections", "select=source_id&collection_key=eq.jr-os-job-tasks&source_id=eq." + unassignedTaskReadId);',
  '    await expectAllowed(unassignedFieldTask, "Unassigned task query should execute safely");',
  '    assert.deepEqual(unassignedFieldTask.payload, [], "Electrician must not read unassigned same-tenant job tasks");',
  '    const crossTenantFieldTask = await listRecords(accounts.A.electrician, "field_cloud_collections", "select=source_id&collection_key=eq.jr-os-job-tasks&source_id=eq." + crossTenantTaskReadId);',
  '    await expectAllowed(crossTenantFieldTask, "Cross-tenant task query should execute safely");',
  '    assert.deepEqual(crossTenantFieldTask.payload, [], "Assigned electrician must not read another organisation\'s job tasks");',
  '    const unboundFieldTask = await listRecords(accounts.A.electrician, "field_cloud_collections", "select=source_id&collection_key=eq.jr-os-job-tasks&source_id=eq." + unboundTaskReadId);',
  '    await expectAllowed(unboundFieldTask, "Unbound task query should execute safely");',
  '    assert.deepEqual(unboundFieldTask.payload, [], "Electrician must not read task without a canonical job");',
  '    const wrongCustomerFieldTask = await listRecords(accounts.A.electrician, "field_cloud_collections", "select=source_id&collection_key=eq.jr-os-job-tasks&source_id=eq." + wrongCustomerTaskReadId);',
  '    await expectAllowed(wrongCustomerFieldTask, "Wrong-customer task query should execute safely");',
  '    assert.deepEqual(wrongCustomerFieldTask.payload, [], "Wrong customer task envelope must fail closed");',
  '    const taskReadUnboundUser = await createUser("a-electrician-task-read-unbound");',
  '    context.users.push(taskReadUnboundUser);',
  '    await createProfile(taskReadUnboundUser, organisationA, "electrician");',
  '    const taskReadUnboundAccount = { ...taskReadUnboundUser, ...(await signIn(taskReadUnboundUser)), organisationId: organisationA };',
  '    const noIdentityTaskRead = await listRecords(taskReadUnboundAccount, "field_cloud_collections", "select=source_id&collection_key=eq.jr-os-job-tasks&source_id=eq." + assignedTaskReadId);',
  '    await expectAllowed(noIdentityTaskRead, "Unbound field identity task query should execute safely");',
  '    assert.deepEqual(noIdentityTaskRead.payload, [], "Electrician without an active field identity must not read job tasks");',
  '    const officeUnassignedTask = await listRecords(accounts.A.office, "cloud_collections", "select=source_id,payload&collection_key=eq.jr-os-job-tasks&source_id=eq." + unassignedTaskReadId);',
  '    await expectAllowed(officeUnassignedTask, "Office unassigned task query should execute");',
  '    assert.equal(officeUnassignedTask.payload.length, 1, "Office should retain unassigned job task access");',
  '    const fieldTaskBeforeJobDelete = await listRecords(accounts.A.electrician, "field_cloud_collections", "select=source_id&collection_key=eq.jr-os-job-tasks&source_id=eq." + deletedJobTaskReadId);',
  '    await expectAllowed(fieldTaskBeforeJobDelete, "Assigned task query before job deletion should execute");',
  '    assert.equal(fieldTaskBeforeJobDelete.payload.length, 1, "Electrician should read job tasks while the job is active and assigned");',
  '    await expectAllowed(await patchRecords(accounts.A.owner, "jobs", "source_id=eq." + deletedTaskReadJob, { deleted_at: new Date().toISOString() }), "Owner should soft-delete the assigned task job");',
  '    const fieldTaskAfterJobDelete = await listRecords(accounts.A.electrician, "field_cloud_collections", "select=source_id&collection_key=eq.jr-os-job-tasks&source_id=eq." + deletedJobTaskReadId);',
  '    await expectAllowed(fieldTaskAfterJobDelete, "Deleted-job task query should execute safely");',
  '    assert.deepEqual(fieldTaskAfterJobDelete.payload, [], "Electrician must not read job tasks for a soft-deleted job");',
  '    const officeTaskAfterJobDelete = await listRecords(accounts.A.office, "cloud_collections", "select=source_id&collection_key=eq.jr-os-job-tasks&source_id=eq." + deletedJobTaskReadId);',
  '    await expectAllowed(officeTaskAfterJobDelete, "Office deleted-job task query should execute");',
  '    assert.equal(officeTaskAfterJobDelete.payload.length, 1, "Office should retain canonical job tasks after job deletion");',
  '',
].join("\n");

const obsoleteCustomerInvoiceRead = `    assert.equal(customerInvoice.payload.length, 1, "Customer must retain own invoice reads");`;
const safeCustomerInvoiceRead = `    assert.deepEqual(customerInvoice.payload, [], "Customer base invoice reads must fail closed in favour of the customer-safe projection");`;

const obsoleteCustomerPaymentRead = `    assert.equal(customerPayment.payload.length, 1, "Customer must retain own payment reads");`;
const safeCustomerPaymentRead = `    assert.deepEqual(customerPayment.payload, [], "Customer base payment reads must fail closed in favour of the customer-safe projection");`;

const otherCustomerJobSnippet = `    await expectAllowed(
      await insertRecord(accounts.A.electrician, "jobs", typedRecord(organisationA, otherCustomerJobA, otherCustomerA, null, { title: "Other customer job" })),
      "Electrician should create a same-tenant job for the other customer",
    );`;

const secureOtherCustomerJobSnippet = `    await expectAllowed(
      await insertRecord(accounts.A.office, "jobs", typedRecord(organisationA, otherCustomerJobA, otherCustomerA, null, {
        title: "Other customer job",
        status: "First fix",
        assignedTo: [],
      })),
      "Office should create the unassigned comparison job",
    );`;

const secureJobSeedSnippet = `    const fieldTeamA = source("field-team-a");
    const fieldCoworkerUser = await createUser("a-electrician-coworker");
    context.users.push(fieldCoworkerUser);
    await createProfile(fieldCoworkerUser, organisationA, "electrician");
    accounts.A.coworker = { ...fieldCoworkerUser, ...(await signIn(fieldCoworkerUser)), organisationId: organisationA };
    const fieldTeamCoworkerA = source("field-team-coworker-a");
    await expectAllowed(
      await insertRecord(accounts.A.office, "team_members", typedRecord(organisationA, fieldTeamA, null, null, {
        name: "Field write electrician",
        email: accounts.A.electrician.email,
        role: "Electrician",
        status: "Active",
      })),
      "Office should create the active field identity",
    );
    await expectAllowed(
      await insertRecord(accounts.A.office, "team_members", typedRecord(organisationA, fieldTeamCoworkerA, null, null, {
        name: "Field coworker",
        email: accounts.A.coworker.email,
        role: "Electrician",
        status: "Active",
      })),
      "Office should create a second active field identity",
    );
    await expectAllowed(
      await insertRecord(accounts.A.office, "jobs", typedRecord(organisationA, jobA, customerA, null, {
        title: "Tenant A job",
        siteAddress: "1 Test Street",
        status: "First fix",
        assignedTo: [fieldTeamA, fieldTeamCoworkerA],
        startDate: "2026-08-01",
        value: 12500,
        originalContractValue: 12000,
        retentionPercent: 5,
        retentionDueDate: "2026-12-01",
        quoteSnapshot: {
          quoteId: source("job-quote-a"),
          quoteNumber: "Q-JOB-SEC",
          items: [{ id: source("job-quote-line-a"), description: "Private priced line", quantity: 1, unitPrice: 12500, unitCost: 4000 }],
          profitability: { expectedProfit: 5000, grossMargin: 40 },
          attachments: [], vatEnabled: true, vatRate: 20,
          notes: "Visible quote note", internalNotes: "Private commercial note",
          terms: "Test terms", convertedAt: "2026-08-01T00:00:00.000Z",
        },
        notes: "Field operational note",
      })),
      "Office should create a complete assigned commercial job",
    );`;

const secureJobReadAnchor = `    await expectAllowed(
      await insertRecord(accounts.B.office, "jobs", typedRecord(organisationB, jobB, customerB, null, { title: "Tenant B job" })),
      "Tenant B office should create its own job",
    );`;

const secureJobReadCoverage = `${secureJobReadAnchor}

    const assignedFieldCustomer = await listRecords(accounts.A.electrician, "field_customers", \`select=source_id,payload&source_id=eq.\${customerA}\`);
    await expectAllowed(assignedFieldCustomer, "Assigned electrician field customer query should execute");
    assert.equal(assignedFieldCustomer.payload.length, 1, "Assigned electrician should retain the assigned field customer");
    assert.equal(assignedFieldCustomer.payload[0].payload.name, "Tenant A customer");
    assert.equal(assignedFieldCustomer.payload[0].payload.phone, "07000000001");
    assert.equal(assignedFieldCustomer.payload[0].payload.notes, undefined, "Field customer projection must omit internal CRM notes");
    const coworkerAssignedFieldCustomer = await listRecords(accounts.A.coworker, "field_customers", \`select=source_id&source_id=eq.\${customerA}\`);
    await expectAllowed(coworkerAssignedFieldCustomer, "Co-assigned electrician field customer query should execute");
    assert.equal(coworkerAssignedFieldCustomer.payload.length, 1, "Co-assigned electrician should retain the assigned field customer");
    const unassignedFieldCustomer = await listRecords(accounts.A.electrician, "field_customers", \`select=source_id&source_id=eq.\${otherCustomerA}\`);
    await expectAllowed(unassignedFieldCustomer, "Unassigned same-tenant field customer query should execute safely");
    assert.deepEqual(unassignedFieldCustomer.payload, [], "Electrician must not read a same-tenant customer with only unassigned jobs");
    const crossTenantFieldCustomer = await listRecords(accounts.A.electrician, "field_customers", \`select=source_id&source_id=eq.\${customerB}\`);
    await expectAllowed(crossTenantFieldCustomer, "Cross-tenant field customer query should execute safely");
    assert.deepEqual(crossTenantFieldCustomer.payload, [], "Assigned electrician must not read another organisation's field customer");

    const officeCommercialJob = await listRecords(accounts.A.office, "jobs", \`select=source_id,payload,version&source_id=eq.\${jobA}\`);
    await expectAllowed(officeCommercialJob, "Office complete job query should execute");
    assert.equal(officeCommercialJob.payload[0].payload.value, 12500, "Office should retain job contract value");
    assert.equal(officeCommercialJob.payload[0].payload.quoteSnapshot.profitability.expectedProfit, 5000, "Office should retain job profitability snapshot");

    const electricianCommercialJob = await listRecords(accounts.A.electrician, "jobs", \`select=source_id,payload&source_id=eq.\${jobA}\`);
    await expectAllowed(electricianCommercialJob, "Electrician complete job query should fail closed");
    assert.deepEqual(electricianCommercialJob.payload, [], "Electrician must not read complete commercial job records");

    const electricianFieldJob = await listRecords(accounts.A.electrician, "field_jobs", \`select=source_id,payload,version&source_id=eq.\${jobA}\`);
    await expectAllowed(electricianFieldJob, "Electrician field-safe job query should execute");
    assert.equal(electricianFieldJob.payload.length, 1, "Electrician should retain field-safe job reads");
    assert.equal(electricianFieldJob.payload[0].payload.title, "Tenant A job");
    assert.equal(electricianFieldJob.payload[0].payload.notes, undefined, "Field job projection must omit mixed commercial notes");
    assert.equal(electricianFieldJob.payload[0].payload.value, undefined, "Field job projection must omit contract value");
    assert.equal(electricianFieldJob.payload[0].payload.quoteSnapshot, undefined, "Field job projection must omit quote profitability snapshots");

    const coworkerAssignedFieldJob = await listRecords(accounts.A.coworker, "field_jobs", \`select=source_id&source_id=eq.\${jobA}\`);
    await expectAllowed(coworkerAssignedFieldJob, "Co-assigned electrician field job query should execute");
    assert.equal(coworkerAssignedFieldJob.payload.length, 1, "Co-assigned electrician should retain the assigned job");
    const unassignedFieldJob = await listRecords(accounts.A.electrician, "field_jobs", \`select=source_id&source_id=eq.\${otherCustomerJobA}\`);
    await expectAllowed(unassignedFieldJob, "Unassigned same-tenant field job query should execute safely");
    assert.deepEqual(unassignedFieldJob.payload, [], "Electrician must not read an unassigned same-tenant job");
    const crossTenantFieldJob = await listRecords(accounts.B.electrician, "field_jobs", \`select=source_id&source_id=eq.\${jobA}\`);
    await expectAllowed(crossTenantFieldJob, "Cross-tenant field job query should execute safely");
    assert.deepEqual(crossTenantFieldJob.payload, [], "Another organisation must not read the assigned field job");

    const assignedJobDocument = source("assigned-job-document-a");
    const unassignedJobDocument = source("unassigned-job-document-a");
    const deletedJobDocument = source("deleted-job-document-a");
    const crossTenantJobDocument = source("cross-tenant-job-document-b");
    await expectAllowed(
      await insertRecord(accounts.A.office, "job_documents", typedRecord(organisationA, assignedJobDocument, null, jobA, { name: "Assigned site photo", category: "Photo" })),
      "Office should create a production-shaped assigned job document without a customer envelope",
    );
    await expectAllowed(
      await insertRecord(accounts.A.office, "job_documents", typedRecord(organisationA, unassignedJobDocument, null, otherCustomerJobA, { name: "Unassigned RAMS", category: "RAMS" })),
      "Office should create an unassigned job document fixture",
    );
    await expectAllowed(
      await insertRecord(accounts.A.office, "job_documents", typedRecord(organisationA, deletedJobDocument, null, jobA, { name: "Deleted site note", category: "Site note" })),
      "Office should create a job document before soft-delete testing",
    );
    await expectAllowed(
      await insertRecord(accounts.B.office, "job_documents", typedRecord(organisationB, crossTenantJobDocument, null, jobB, { name: "Tenant B drawing", category: "Drawing" })),
      "Tenant B office should create a cross-tenant job document fixture",
    );
    await expectAllowed(
      await patchRecords(accounts.A.owner, "job_documents", \`source_id=eq.\${deletedJobDocument}\`, { deleted_at: new Date().toISOString() }),
      "Owner should soft-delete the job document fixture",
    );

    const assignedFieldDocument = await listRecords(accounts.A.electrician, "job_documents", \`select=source_id,payload&source_id=eq.\${assignedJobDocument}\`);
    await expectAllowed(assignedFieldDocument, "Assigned electrician job-document query should execute");
    assert.equal(assignedFieldDocument.payload.length, 1, "Assigned electrician should retain the production-shaped null-customer job document");
    assert.equal(assignedFieldDocument.payload[0].payload.name, "Assigned site photo");
    const coworkerAssignedFieldDocument = await listRecords(accounts.A.coworker, "job_documents", \`select=source_id&source_id=eq.\${assignedJobDocument}\`);
    await expectAllowed(coworkerAssignedFieldDocument, "Co-assigned electrician job-document query should execute");
    assert.equal(coworkerAssignedFieldDocument.payload.length, 1, "Co-assigned electrician should retain the assigned job document");
    const unassignedFieldDocument = await listRecords(accounts.A.electrician, "job_documents", \`select=source_id&source_id=eq.\${unassignedJobDocument}\`);
    await expectAllowed(unassignedFieldDocument, "Unassigned same-tenant job-document query should execute safely");
    assert.deepEqual(unassignedFieldDocument.payload, [], "Electrician must not read an unassigned same-tenant job document");
    const deletedFieldDocument = await listRecords(accounts.A.electrician, "job_documents", \`select=source_id&source_id=eq.\${deletedJobDocument}\`);
    await expectAllowed(deletedFieldDocument, "Deleted job-document query should execute safely");
    assert.deepEqual(deletedFieldDocument.payload, [], "Electrician must not read a deleted job document");
    const crossTenantFieldDocument = await listRecords(accounts.A.electrician, "job_documents", \`select=source_id&source_id=eq.\${crossTenantJobDocument}\`);
    await expectAllowed(crossTenantFieldDocument, "Cross-tenant job-document query should execute safely");
    assert.deepEqual(crossTenantFieldDocument.payload, [], "Assigned electrician must not read another organisation's job document");
    const officeUnassignedDocument = await listRecords(accounts.A.office, "job_documents", \`select=source_id&source_id=eq.\${unassignedJobDocument}\`);
    await expectAllowed(officeUnassignedDocument, "Office unassigned job-document query should execute");
    assert.equal(officeUnassignedDocument.payload.length, 1, "Office should retain unassigned job document access");

    const customerCommercialJob = await listRecords(accounts.A.customer, "jobs", \`select=source_id,payload&source_id=eq.\${jobA}\`);
    await expectAllowed(customerCommercialJob, "Customer complete job query should fail closed");
    assert.deepEqual(customerCommercialJob.payload, [], "Customer must not read complete commercial job records");
    const customerPortalJob = await listRecords(accounts.A.customer, "customer_jobs", \`select=source_id,payload&source_id=eq.\${jobA}\`);
    await expectAllowed(customerPortalJob, "Customer portal-safe job query should execute");
    assert.equal(customerPortalJob.payload.length, 1, "Customer should retain portal-safe job reads");
    assert.equal(customerPortalJob.payload[0].payload.notes, undefined, "Customer job projection must omit private job notes");
    assert.deepEqual((await listRecords(accounts.A.customer, "customer_jobs", \`select=source_id&source_id=eq.\${otherCustomerJobA}\`)).payload, [], "Another customer must not read the portal job projection");
    assert.deepEqual((await listRecords(accounts.B.customer, "customer_jobs", \`select=source_id&source_id=eq.\${jobA}\`)).payload, [], "Another organisation must not read the portal job projection");

    await expectDenied(
      await patchRecords(accounts.A.electrician, "jobs", \`source_id=eq.\${jobA}\`, { payload: { id: jobA, status: "Second fix" } }),
      "Electrician direct job updates must fail closed",
    );
    const rejectedJobStatusMutationId = crypto.randomUUID();
    await expectDeniedWithCode(
      await authenticated(accounts.A.electrician, "/rest/v1/rpc/jr_field_update_job_status", {
        method: "POST",
        body: { record_source_id: jobA, expected_version: electricianFieldJob.payload[0].version, requested_status: "Paid", mutation_id: rejectedJobStatusMutationId },
      }),
      "22023",
      "Assigned electrician must not apply an unsupported canonical job status transition",
    );
    const officeJobAfterRejectedStatus = await listRecords(accounts.A.office, "jobs", \`select=version,payload&source_id=eq.\${jobA}\`);
    await expectAllowed(officeJobAfterRejectedStatus, "Office should read the canonical job after a rejected field status");
    assert.equal(officeJobAfterRejectedStatus.payload[0].version, electricianFieldJob.payload[0].version, "Rejected field status must not advance the canonical job version");
    assert.equal(officeJobAfterRejectedStatus.payload[0].payload.status, "First fix", "Rejected field status must not change the canonical job");
    const rejectedStatusTimelineSource = "field-status-" + accounts.A.electrician.id + "-" + rejectedJobStatusMutationId;
    const rejectedStatusTimeline = await listRecords(accounts.A.office, "cloud_collections", "select=source_id&collection_key=eq.jr-os-job-timeline&source_id=eq." + rejectedStatusTimelineSource);
    await expectAllowed(rejectedStatusTimeline, "Office should query authoritative timeline evidence after a rejected field status");
    assert.equal(rejectedStatusTimeline.payload.length, 0, "Rejected field status must not create authoritative timeline evidence");
    const jobStatusMutationId = crypto.randomUUID();
    const statusMutation = await authenticated(accounts.A.electrician, "/rest/v1/rpc/jr_field_update_job_status", {
      method: "POST",
      body: { record_source_id: jobA, expected_version: electricianFieldJob.payload[0].version, requested_status: "Second fix", mutation_id: jobStatusMutationId },
    });
    await expectAllowed(statusMutation, "Assigned electrician should apply a valid job status transition through the RPC");
    assert.equal(statusMutation.payload.status, "applied");
    assert.equal(statusMutation.payload.resource, "jobs");
    assert.equal(statusMutation.payload.sourceId, jobA);
    assert.equal(statusMutation.payload.payload.status, "Second fix");
    assert.equal(statusMutation.payload.payload.notes, undefined, "Status RPC response must use the latest field-safe job projection");
    const statusReplay = await authenticated(accounts.A.electrician, "/rest/v1/rpc/jr_field_update_job_status", {
      method: "POST",
      body: { record_source_id: jobA, expected_version: electricianFieldJob.payload[0].version, requested_status: "Second fix", mutation_id: jobStatusMutationId },
    });
    await expectAllowed(statusReplay, "A response-loss retry should return the exact prior job mutation result");
    assert.deepEqual(statusReplay.payload, statusMutation.payload, "Job mutation replay must be byte-equivalent JSON");
    await expectDeniedWithCode(
      await authenticated(accounts.A.electrician, "/rest/v1/rpc/jr_field_update_job_status", {
        method: "POST",
        body: { record_source_id: jobA, expected_version: electricianFieldJob.payload[0].version, requested_status: "Testing", mutation_id: jobStatusMutationId },
      }),
      "PT409",
      "A mutation id must not be reused with changed job arguments",
    );
    await expectDeniedWithCode(
      await authenticated(accounts.A.electrician, "/rest/v1/rpc/jr_field_update_job_status", {
        method: "POST",
        body: { record_source_id: otherCustomerJobA, expected_version: 1, requested_status: "Second fix", mutation_id: crypto.randomUUID() },
      }),
      "42501",
      "Electrician must not mutate an unassigned same-tenant job",
    );
    const statusTimelineSource = "field-status-" + accounts.A.electrician.id + "-" + jobStatusMutationId;
    const statusTimeline = await listRecords(accounts.A.office, "cloud_collections", "select=source_id,customer_source_id,job_source_id,payload&collection_key=eq.jr-os-job-timeline&source_id=eq." + statusTimelineSource);
    await expectAllowed(statusTimeline, "Office should read the authoritative status timeline evidence");
    assert.equal(statusTimeline.payload.length, 1, "Status RPC must atomically create one timeline record");
    assert.equal(statusTimeline.payload[0].customer_source_id, customerA, "Status evidence must bind the canonical linked customer");
    assert.equal(statusTimeline.payload[0].job_source_id, jobA);
    assert.equal(statusTimeline.payload[0].payload.customerId, customerA);
    assert.equal(statusTimeline.payload[0].payload.eventType, "Status change");
    assert.equal(statusTimeline.payload[0].payload.fromStatus, "First fix");
    assert.equal(statusTimeline.payload[0].payload.toStatus, "Second fix");
    const officeJobAfterFieldUpdate = await listRecords(accounts.A.office, "jobs", \`select=payload&source_id=eq.\${jobA}\`);
    assert.equal(officeJobAfterFieldUpdate.payload[0].payload.value, 12500, "Field RPC updates must preserve hidden commercial job data");
    assert.equal(officeJobAfterFieldUpdate.payload[0].payload.quoteSnapshot.profitability.expectedProfit, 5000, "Field RPC updates must preserve hidden profitability snapshots");

    const legacyPlannerJob = source("legacy-planner-status-job");
    await expectAllowed(await insertRecord(accounts.A.office, "jobs", typedRecord(organisationA, legacyPlannerJob, otherCustomerA, null, { title: "Legacy planner status job", status: "Scheduled", assignedTo: [fieldTeamA] })), "Office should create a Scheduled job for legacy field status compatibility");
    const legacyStatusMutation = await authenticated(accounts.A.electrician, "/rest/v1/rpc/jr_field_update_job_status", { method: "POST", body: { record_source_id: legacyPlannerJob, expected_version: 1, requested_status: "In progress", mutation_id: crypto.randomUUID() } });
    await expectAllowed(legacyStatusMutation, "Legacy In progress request should canonicalize through the status RPC");
    assert.equal(legacyStatusMutation.payload.payload.status, "First fix", "Legacy requested status must return the canonical lifecycle state");`;

const secureFieldCasesSnippet = `    // Direct field writes are closed; only existing planner/timesheet identity-bound policies remain.
    const closedFieldCases = [
      ["materials", source("material-a"), { name: "Cable" }],
      ["stock_items", source("stock-a"), { quantity: 4 }],
      ["stock_movements", source("movement-a"), { type: "Used", quantity: 1 }],
      ["purchase_lists", source("purchase-a"), { status: "Draft" }],
      ["certificates", source("certificate-a"), { status: "Draft" }],
      ["electrical_testing_records", source("testing-a"), { status: "Draft" }],
      ["job_documents", source("document-a"), { category: "Photo" }],
    ];
    for (const [table, sourceId, payload] of closedFieldCases) {
      await expectDenied(await insertRecord(accounts.A.electrician, table, typedRecord(organisationA, sourceId, customerA, jobA, payload)), \`Electrician direct write must fail closed for \${table}\`);
      await expectAllowed(await insertRecord(accounts.A.office, table, typedRecord(organisationA, sourceId, customerA, jobA, payload)), \`Office should retain direct write access for \${table}\`);
      await expectDenied(await insertRecord(accounts.A.electrician, table, typedRecord(organisationB, \`\${sourceId}-cross\`, customerB, jobB, payload)), \`Electrician must not write cross-tenant \${table}\`);
    }
    for (const [table, sourceId, payload] of [
      ["planner_entries", source("planner-a"), { teamMemberIds: [fieldTeamA], startDate: "2026-08-01" }],
      ["timesheets", source("timesheet-a"), { teamMemberId: fieldTeamA, hours: 8 }],
    ]) {
      await expectAllowed(await insertRecord(accounts.A.electrician, table, typedRecord(organisationA, sourceId, customerA, jobA, payload)), \`Electrician should retain own-team \${table} writes\`);
      await expectDenied(await insertRecord(accounts.A.electrician, table, typedRecord(organisationB, \`\${sourceId}-cross\`, customerB, jobB, payload)), \`Electrician must not write cross-tenant \${table}\`);
    }
    await expectDenied(
      await insertRecord(accounts.A.electrician, "planner_entries", typedRecord(organisationA, source("planner-unassigned-job"), otherCustomerA, otherCustomerJobA, { teamMemberIds: [fieldTeamA], startDate: "2026-08-02" })),
      "Electrician must not create a planner entry for an unassigned same-tenant job",
    );
    await expectDenied(
      await insertRecord(accounts.A.electrician, "timesheets", typedRecord(organisationA, source("timesheet-unassigned-job"), otherCustomerA, otherCustomerJobA, { teamMemberId: fieldTeamA, hours: 1 })),
      "Electrician must not create a timesheet for an unassigned same-tenant job",
    );
    // Secure field identity fixtures are complete.`;

const genericInsertSnippet = `      await expectAllowed(await insertRecord(accounts.A.electrician, "cloud_collections", genericRecord(organisationA, collectionKey, sourceId, accounts.A.electrician, customerA, jobA, payload)), \`Field staff should write \${collectionKey}\`);
      await expectDenied(await insertRecord(accounts.A.electrician, "cloud_collections", genericRecord(organisationB, collectionKey, \`\${sourceId}-cross\`, accounts.A.electrician, customerB, jobB, payload)), \`Cross-tenant generic write must fail for \${collectionKey}\`);
      assert.deepEqual((await listRecords(accounts.B.owner, "cloud_collections", \`select=source_id&collection_key=eq.\${encodeURIComponent(collectionKey)}&source_id=eq.\${sourceId}\`)).payload, []);`;

const secureGenericInsertSnippet = `      await expectDenied(await insertRecord(accounts.A.electrician, "cloud_collections", genericRecord(organisationA, collectionKey, sourceId, accounts.A.electrician, customerA, jobA, payload)), \`Electrician direct generic write must fail closed for \${collectionKey}\`);
      await expectAllowed(await insertRecord(accounts.A.office, "cloud_collections", genericRecord(organisationA, collectionKey, sourceId, accounts.A.office, customerA, jobA, payload)), \`Office should seed complete generic record \${collectionKey}\`);
      await expectDenied(await insertRecord(accounts.A.electrician, "cloud_collections", genericRecord(organisationB, collectionKey, \`\${sourceId}-cross\`, accounts.A.electrician, customerB, jobB, payload)), \`Cross-tenant generic write must fail for \${collectionKey}\`);
      assert.deepEqual((await listRecords(accounts.B.owner, "cloud_collections", \`select=source_id&collection_key=eq.\${encodeURIComponent(collectionKey)}&source_id=eq.\${sourceId}\`)).payload, []);`;

const secureGenericReadSnippet = `      const electricianCompleteFieldRead = await listRecords(accounts.A.electrician, "cloud_collections", \`select=source_id,payload&collection_key=eq.\${encodeURIComponent(collectionKey)}&source_id=eq.\${sourceId}\`);
      await expectAllowed(electricianCompleteFieldRead, \`Electrician complete generic \${collectionKey} query should fail closed\`);
      assert.deepEqual(electricianCompleteFieldRead.payload, [], \`Electrician must not read complete generic field records: \${collectionKey}\`);
      const electricianFieldRead = await listRecords(accounts.A.electrician, "field_cloud_collections", \`select=source_id,payload&collection_key=eq.\${encodeURIComponent(collectionKey)}&source_id=eq.\${sourceId}\`);
      await expectAllowed(electricianFieldRead, \`Electrician projected field \${collectionKey} query should execute\`);
      assert.equal(electricianFieldRead.payload.length, 1, \`Electrician should retain projected field collection reads: \${collectionKey}\`);
      const fieldPayload = electricianFieldRead.payload[0].payload;
      if (collectionKey === "jr-os-surveys") assert.equal(fieldPayload.labourRate, undefined, "Field survey projection must omit labour rates");
      if (collectionKey === "jr-os-job-packs") {
        assert.equal(fieldPayload.labourRate, undefined, "Field job pack projection must omit labour rates");
        assert.equal(fieldPayload.materials[0].unitPrice, undefined, "Field job pack projection must omit material prices");
        await expectDenied(
          await patchRecords(accounts.A.electrician, "cloud_collections", \`collection_key=eq.\${encodeURIComponent(collectionKey)}&source_id=eq.\${sourceId}\`, { payload: { id: sourceId, customerId: customerA, jobId: jobA, labourHours: 9 } }),
          "Electrician direct job-pack updates must fail closed",
        );
      }
      if (collectionKey === "jr-os-job-variations") {
        assert.equal(fieldPayload.labourRate, undefined, "Field variation projection must omit labour rates");
        assert.equal(fieldPayload.materialCost, undefined, "Field variation projection must omit material costs");
        assert.equal(fieldPayload.fixedPrice, undefined, "Field variation projection must omit fixed prices");
        assert.equal(fieldPayload.internalNotes, undefined, "Field variation projection must omit internal notes");
      }
      if (collectionKey === "jr-os-job-material-usage") assert.equal(fieldPayload.unitCost, undefined, "Field material usage projection must omit unit costs");`;

const fieldMutationCoverage = [
  '    await expectDenied(await request("/rest/v1/rpc/jr_field_save_collection", { method: "POST", body: { collection_key_value: "jr-os-surveys", record_source_id: source("anonymous-rpc"), expected_version: 0, record_payload: { id: source("anonymous-rpc"), jobId: jobA, status: "Draft" }, mutation_id: crypto.randomUUID() } }), "Anonymous field mutation RPC calls must fail");',
  '    await expectDeniedWithCode(await authenticated(accounts.A.office, "/rest/v1/rpc/jr_field_save_collection", { method: "POST", body: { collection_key_value: "jr-os-surveys", record_source_id: source("office-rpc"), expected_version: 0, record_payload: { id: source("office-rpc"), jobId: jobA, status: "Draft" }, mutation_id: crypto.randomUUID() } }), "42501", "Office sessions must not use the electrician mutation RPC");',
  '    await expectDeniedWithCode(await authenticated(accounts.A.customer, "/rest/v1/rpc/jr_field_save_collection", { method: "POST", body: { collection_key_value: "jr-os-surveys", record_source_id: source("customer-rpc"), expected_version: 0, record_payload: { id: source("customer-rpc"), jobId: jobA, status: "Draft" }, mutation_id: crypto.randomUUID() } }), "42501", "Customer sessions must not use the electrician mutation RPC");',
  '    const oversizedSurveyId = source("rpc-survey-oversized");',
  '    await expectDeniedWithCode(await authenticated(accounts.A.electrician, "/rest/v1/rpc/jr_field_save_collection", { method: "POST", body: { collection_key_value: "jr-os-surveys", record_source_id: oversizedSurveyId, expected_version: 0, record_payload: { id: oversizedSurveyId, jobId: jobA, status: "Draft", ignoredDataUrl: "x".repeat(131073) }, mutation_id: crypto.randomUUID() } }), "22023", "Oversized field payloads must be rejected before receipt persistence");',
  '    const fieldSurveyId = source("rpc-survey-a");',
  '    const fieldSurveyPayload = { id: fieldSurveyId, jobId: jobA, customerId: otherCustomerA, builderId: "forged-builder", number: "SUR-RPC-001", status: "Draft", propertyType: "House", circuits: [], photos: [{ id: "forged-photo", dataUrl: "data:image/png;base64,AAAA" }], labourHours: 2, labourRate: 999 };',
  '    const surveyMutationId = crypto.randomUUID();',
  '    const surveyCreate = await authenticated(accounts.A.electrician, "/rest/v1/rpc/jr_field_save_collection", { method: "POST", body: { collection_key_value: "jr-os-surveys", record_source_id: fieldSurveyId, expected_version: 0, record_payload: fieldSurveyPayload, mutation_id: surveyMutationId } });',
  '    await expectAllowed(surveyCreate, "Assigned electrician should create a survey through the field RPC");',
  '    assert.equal(surveyCreate.payload.status, "applied");',
  '    assert.equal(surveyCreate.payload.collectionKey, "jr-os-surveys");',
  '    assert.equal(surveyCreate.payload.payload.customerId, customerA, "Survey RPC must bind the canonical linked customer");',
  '    assert.deepEqual(surveyCreate.payload.payload.photos, [], "Survey RPC must discard client attachment bytes");',
  '    assert.equal(surveyCreate.payload.payload.labourRate, undefined, "Survey RPC must not accept an office labour rate");',
  '    const assignedSurveyProjection = await listRecords(accounts.A.electrician, "field_cloud_collections", "select=source_id&collection_key=eq.jr-os-surveys&source_id=eq." + fieldSurveyId);',
  '    await expectAllowed(assignedSurveyProjection, "Assigned electrician should read the assigned survey projection");',
  '    assert.equal(assignedSurveyProjection.payload.length, 1);',
  '    const unassignedSurveyId = source("rpc-survey-unassigned-read");',
  '    await expectAllowed(await insertRecord(accounts.A.office, "cloud_collections", genericRecord(organisationA, "jr-os-surveys", unassignedSurveyId, accounts.A.office, otherCustomerA, otherCustomerJobA, { number: "SUR-UNASSIGNED", status: "Draft", surveyNotes: "Private unassigned survey note" })), "Office should create an unassigned comparison survey");',
  '    const unassignedSurveyProjection = await listRecords(accounts.A.electrician, "field_cloud_collections", "select=source_id&collection_key=eq.jr-os-surveys&source_id=eq." + unassignedSurveyId);',
  '    await expectAllowed(unassignedSurveyProjection, "Unassigned same-tenant survey query should execute safely");',
  '    assert.deepEqual(unassignedSurveyProjection.payload, [], "Electrician must not read an unassigned same-tenant survey");',
  '    const surveyReplay = await authenticated(accounts.A.electrician, "/rest/v1/rpc/jr_field_save_collection", { method: "POST", body: { collection_key_value: "jr-os-surveys", record_source_id: fieldSurveyId, expected_version: 0, record_payload: fieldSurveyPayload, mutation_id: surveyMutationId } });',
  '    await expectAllowed(surveyReplay, "Survey response-loss retry should return the exact prior result");',
  '    assert.deepEqual(surveyReplay.payload, surveyCreate.payload);',
  '    await expectDeniedWithCode(await authenticated(accounts.A.electrician, "/rest/v1/rpc/jr_field_save_collection", { method: "POST", body: { collection_key_value: "jr-os-surveys", record_source_id: fieldSurveyId, expected_version: 0, record_payload: { ...fieldSurveyPayload, surveyNotes: "changed" }, mutation_id: surveyMutationId } }), "PT409", "Generic mutation id reuse with changed payload must fail");',
  '    await expectDeniedWithCode(await authenticated(accounts.A.electrician, "/rest/v1/rpc/jr_field_save_collection", { method: "POST", body: { collection_key_value: "jr-os-surveys", record_source_id: fieldSurveyId, expected_version: 0, record_payload: fieldSurveyPayload, mutation_id: crypto.randomUUID() } }), "PT409", "Create-only retry with a fresh mutation id must collide");',
  '    const concurrentSurveyId = source("rpc-survey-concurrent");',
  '    const concurrentSurveyPayload = { ...fieldSurveyPayload, id: concurrentSurveyId };',
  '    const concurrentCreates = await Promise.all([crypto.randomUUID(), crypto.randomUUID()].map((concurrentMutationId) => authenticated(accounts.A.electrician, "/rest/v1/rpc/jr_field_save_collection", { method: "POST", body: { collection_key_value: "jr-os-surveys", record_source_id: concurrentSurveyId, expected_version: 0, record_payload: concurrentSurveyPayload, mutation_id: concurrentMutationId } })));',
  '    assert.equal(concurrentCreates.filter((result) => result.response.ok).length, 1, "Exactly one simultaneous field create must apply");',
  '    assert.equal(concurrentCreates.filter((result) => !result.response.ok)[0]?.payload?.code, "PT409", "Concurrent field create loser must use the conflict contract");',
  '    const officeSurveyId = source("rpc-survey-office-owned");',
  '    const officeSurveyPayload = { id: officeSurveyId, jobId: jobA, customerId: customerA, number: "SUR-OFFICE-001", status: "Draft", circuits: [] };',
  '    await expectAllowed(await insertRecord(accounts.A.office, "cloud_collections", genericRecord(organisationA, "jr-os-surveys", officeSurveyId, accounts.A.office, customerA, jobA, officeSurveyPayload)), "Office should create a survey that has no field-owner grant");',
  '    await expectDeniedWithCode(await authenticated(accounts.A.electrician, "/rest/v1/rpc/jr_field_save_collection", { method: "POST", body: { collection_key_value: "jr-os-surveys", record_source_id: officeSurveyId, expected_version: 1, record_payload: { ...officeSurveyPayload, status: "In progress" }, mutation_id: crypto.randomUUID() } }), "42501", "Electrician must not update an office or coworker-owned survey");',
  '    const coworkerSurveyId = source("rpc-survey-coworker-owned");',
  '    const coworkerSurveyPayload = { id: coworkerSurveyId, jobId: jobA, customerId: customerA, number: "SUR-COWORKER-001", status: "Draft", circuits: [] };',
  '    const coworkerSurveyCreate = await authenticated(accounts.A.coworker, "/rest/v1/rpc/jr_field_save_collection", { method: "POST", body: { collection_key_value: "jr-os-surveys", record_source_id: coworkerSurveyId, expected_version: 0, record_payload: coworkerSurveyPayload, mutation_id: crypto.randomUUID() } });',
  '    await expectAllowed(coworkerSurveyCreate, "Co-assigned electrician should create their own survey");',
  '    await expectDeniedWithCode(await authenticated(accounts.A.electrician, "/rest/v1/rpc/jr_field_save_collection", { method: "POST", body: { collection_key_value: "jr-os-surveys", record_source_id: coworkerSurveyId, expected_version: coworkerSurveyCreate.payload.version, record_payload: { ...coworkerSurveyPayload, status: "In progress" }, mutation_id: crypto.randomUUID() } }), "42501", "Electrician must not update a co-assigned coworker survey");',
  '    const duplicateCoworkerTeamA = source("field-team-coworker-duplicate-a");',
  '    await expectAllowed(await insertRecord(accounts.A.office, "team_members", typedRecord(organisationA, duplicateCoworkerTeamA, null, null, { name: "Duplicate field coworker", email: accounts.A.coworker.email, role: "Electrician", status: "Active" })), "Office should create a duplicate team identity for fail-closed testing");',
  '    await expectDeniedWithCode(await authenticated(accounts.A.coworker, "/rest/v1/rpc/jr_field_save_collection", { method: "POST", body: { collection_key_value: "jr-os-job-timeline", record_source_id: source("duplicate-identity-note"), expected_version: 0, record_payload: { id: source("duplicate-identity-note"), jobId: jobA, note: "Must fail" }, mutation_id: crypto.randomUUID() } }), "42501", "Duplicate active team identities must fail closed");',
  '    await expectAllowed(await patchRecords(accounts.A.office, "team_members", "source_id=eq." + fieldTeamCoworkerA, { payload: { id: fieldTeamCoworkerA, name: "Field coworker", email: accounts.A.coworker.email, role: "Electrician", status: "Inactive" } }), "Office should inactivate the original coworker identity");',
  '    await expectAllowed(await patchRecords(accounts.A.office, "team_members", "source_id=eq." + duplicateCoworkerTeamA, { payload: { id: duplicateCoworkerTeamA, name: "Duplicate field coworker", email: accounts.A.coworker.email, role: "Electrician", status: "Inactive" } }), "Office should inactivate the duplicate coworker identity");',
  '    await expectDeniedWithCode(await authenticated(accounts.A.coworker, "/rest/v1/rpc/jr_field_save_collection", { method: "POST", body: { collection_key_value: "jr-os-job-timeline", record_source_id: source("inactive-identity-note"), expected_version: 0, record_payload: { id: source("inactive-identity-note"), jobId: jobA, note: "Must fail" }, mutation_id: crypto.randomUUID() } }), "42501", "Inactive team identities must fail closed");',
  '',
  '    await expectAllowed(await patchRecords(accounts.A.office, "cloud_collections", "collection_key=eq.jr-os-surveys&source_id=eq." + fieldSurveyId, { updated_by: accounts.A.office.id, payload: { ...surveyCreate.payload.payload, customerId: customerA, jobId: jobA, labourRate: 81, photos: [{ id: "canonical-photo", documentId: "office-file" }] } }), "Office should add canonical hidden survey values");',
  '    const canonicalSurvey = await listRecords(accounts.A.office, "cloud_collections", "select=version,payload&collection_key=eq.jr-os-surveys&source_id=eq." + fieldSurveyId);',
  '    const surveyUpdate = await authenticated(accounts.A.electrician, "/rest/v1/rpc/jr_field_save_collection", { method: "POST", body: { collection_key_value: "jr-os-surveys", record_source_id: fieldSurveyId, expected_version: canonicalSurvey.payload[0].version, record_payload: { ...fieldSurveyPayload, status: "In progress", photos: [{ id: "replacement-forgery" }], labourRate: 1 }, mutation_id: crypto.randomUUID() } });',
  '    await expectAllowed(surveyUpdate, "Assigned electrician should update allowlisted survey fields");',
  '    const preservedSurvey = await listRecords(accounts.A.office, "cloud_collections", "select=payload&collection_key=eq.jr-os-surveys&source_id=eq." + fieldSurveyId);',
  '    assert.equal(preservedSurvey.payload[0].payload.labourRate, 81, "Survey update must preserve office labour rate");',
  '    assert.equal(preservedSurvey.payload[0].payload.photos[0].id, "canonical-photo", "Survey update must preserve canonical attachments");',
  '    await expectDeniedWithCode(await authenticated(accounts.A.electrician, "/rest/v1/rpc/jr_field_save_collection", { method: "POST", body: { collection_key_value: "jr-os-surveys", record_source_id: fieldSurveyId, expected_version: canonicalSurvey.payload[0].version, record_payload: fieldSurveyPayload, mutation_id: crypto.randomUUID() } }), "PT409", "Stale survey version must fail");',
  '',
  '    const diaryId = source("rpc-diary-a");',
  '    const diaryMutationId = crypto.randomUUID();',
  '    const diaryPayload = { id: diaryId, jobId: jobA, customerId: otherCustomerA, workDate: "2026-08-14", completedBy: "Forged", staffPresent: ["forged"], otherStaffPresent: "  Subcontractor  ", plantAndEquipment: "  Podium steps  ", deliveriesReceived: "  " + "D".repeat(4001) + "  ", toolboxTalks: "  Manual handling  ", engineerSignatureName: "Forged engineer", engineerSignedAt: "1900-01-01T00:00:00.000Z", customerSignOffName: "Forged customer", customerSignOffNotes: "Forged consent", customerSignedAt: "1900-01-01T00:00:00.000Z", dailySummary: "Forged summary", photos: [{ id: "forged-photo" }], photoDocumentIds: ["forged-file"], workCompleted: "First fix", delays: "", customerRequests: "", materialsUsed: "", voiceNotes: "", createdAt: "1900-01-01T00:00:00.000Z", updatedAt: "1900-01-01T00:00:00.000Z" };',
  '    const diaryCreate = await authenticated(accounts.A.electrician, "/rest/v1/rpc/jr_field_save_collection", { method: "POST", body: { collection_key_value: "jr-os-site-diaries", record_source_id: diaryId, expected_version: 0, record_payload: diaryPayload, mutation_id: diaryMutationId } });',
  '    await expectAllowed(diaryCreate, "Assigned electrician should create a canonical site diary");',
  '    assert.deepEqual(diaryCreate.payload.payload.staffPresent, [fieldTeamA], "Diary RPC must bind staff presence to the actor");',
  '    assert.equal(diaryCreate.payload.payload.completedBy, "Field write electrician", "Diary RPC must bind the canonical actor name");',
  '    assert.equal(diaryCreate.payload.payload.customerId, customerA, "Diary RPC must bind the canonical customer");',
  '    assert.equal(diaryCreate.payload.payload.otherStaffPresent, "Subcontractor", "Diary RPC must trim bounded additional labour detail");',
  '    assert.equal(diaryCreate.payload.payload.plantAndEquipment, "Podium steps", "Diary RPC must preserve bounded plant and equipment detail");',
  '    assert.equal(diaryCreate.payload.payload.deliveriesReceived, "D".repeat(4000), "Diary RPC must preserve bounded delivery detail");',
  '    assert.equal(diaryCreate.payload.payload.toolboxTalks, "Manual handling", "Diary RPC must preserve bounded toolbox-talk detail");',
  '    assert.notEqual(diaryCreate.payload.payload.createdAt, diaryPayload.createdAt, "Diary RPC must replace browser-authored receipt timestamps");',
  '    assert.equal(diaryCreate.payload.payload.createdAt, diaryCreate.payload.payload.updatedAt, "Diary RPC must use one server receipt time");',
  '    assert.equal(diaryCreate.payload.payload.engineerSignatureName, undefined, "Diary RPC must discard browser-authored acknowledgement evidence");',
  '    for (const deniedDiaryKey of ["engineerSignedAt", "customerSignOffName", "customerSignOffNotes", "customerSignedAt", "dailySummary", "photos", "photoDocumentIds"]) assert.equal(diaryCreate.payload.payload[deniedDiaryKey], undefined, `Diary RPC must discard unsupported ${deniedDiaryKey}`);',
  '    assert.equal(diaryCreate.payload.payload.photoDocumentIds, undefined, "Diary RPC must discard attachment references");',
  '    const fieldCreatedDiary = await listRecords(accounts.A.electrician, "field_cloud_collections", "select=source_id,payload&collection_key=eq.jr-os-site-diaries&source_id=eq." + diaryId);',
  '    await expectAllowed(fieldCreatedDiary, "Field-created canonical diary query should execute");',
  '    assert.equal(fieldCreatedDiary.payload.length, 1, "Electrician should read the canonical diary created through the field RPC");',
  '    assert.deepEqual(fieldCreatedDiary.payload[0].payload, diaryCreate.payload.payload, "Field projection must retain the complete canonical diary payload");',
  '    const officeCreatedDiary = await listRecords(accounts.A.office, "cloud_collections", "select=source_id,payload&collection_key=eq.jr-os-site-diaries&source_id=eq." + diaryId);',
  '    await expectAllowed(officeCreatedDiary, "Office canonical diary query should execute");',
  '    assert.deepEqual(officeCreatedDiary.payload[0].payload, diaryCreate.payload.payload, "Office reads must retain the complete canonical diary payload");',
  '    const diaryReplay = await authenticated(accounts.A.electrician, "/rest/v1/rpc/jr_field_save_collection", { method: "POST", body: { collection_key_value: "jr-os-site-diaries", record_source_id: diaryId, expected_version: 0, record_payload: diaryPayload, mutation_id: diaryMutationId } });',
  '    await expectAllowed(diaryReplay, "Diary response-loss retry should return the exact prior result");',
  '    assert.deepEqual(diaryReplay.payload, diaryCreate.payload);',
  '    await expectDeniedWithCode(await authenticated(accounts.A.electrician, "/rest/v1/rpc/jr_field_save_collection", { method: "POST", body: { collection_key_value: "jr-os-site-diaries", record_source_id: diaryId, expected_version: 0, record_payload: { ...diaryPayload, plantAndEquipment: "Changed" }, mutation_id: diaryMutationId } }), "PT409", "Diary mutation id reuse with changed payload must fail");',
  '    await expectDeniedWithCode(await authenticated(accounts.A.electrician, "/rest/v1/rpc/jr_field_save_collection", { method: "POST", body: { collection_key_value: "jr-os-site-diaries", record_source_id: diaryId, expected_version: 0, record_payload: diaryPayload, mutation_id: crypto.randomUUID() } }), "PT409", "Diary create-only retry with a fresh mutation id must collide");',
  '    await expectDeniedWithCode(await authenticated(accounts.A.electrician, "/rest/v1/rpc/jr_field_save_collection", { method: "POST", body: { collection_key_value: "jr-os-site-diaries", record_source_id: diaryId, expected_version: diaryCreate.payload.version, record_payload: diaryPayload, mutation_id: crypto.randomUUID() } }), "42501", "Field site diaries must remain insert-only");',
  '',
  '    const taskId = source("rpc-task-a");',
  '    const taskCreate = await authenticated(accounts.A.electrician, "/rest/v1/rpc/jr_field_save_collection", { method: "POST", body: { collection_key_value: "jr-os-job-tasks", record_source_id: taskId, expected_version: 0, record_payload: { id: taskId, jobId: jobA, customerId: otherCustomerA, type: "Snag", title: "Socket snag", description: "Repair", category: "Second fix", priority: "High", assignedTo: "forged", dueDate: "2026-08-20", status: "Open", photos: [{ id: "forged" }], notes: "Field note" }, mutation_id: crypto.randomUUID() } });',
  '    await expectAllowed(taskCreate, "Assigned electrician should create an actor-bound task");',
  '    assert.equal(taskCreate.payload.payload.assignedTo, fieldTeamA);',
  '    assert.equal(taskCreate.payload.payload.status, "Open");',
  '    assert.deepEqual(taskCreate.payload.payload.photos, []);',
  '    const taskUpdate = await authenticated(accounts.A.electrician, "/rest/v1/rpc/jr_field_save_collection", { method: "POST", body: { collection_key_value: "jr-os-job-tasks", record_source_id: taskId, expected_version: taskCreate.payload.version, record_payload: { ...taskCreate.payload.payload, title: "Forged rewrite", status: "Completed", customerConfirmedAt: "1900-01-01T00:00:00Z" }, mutation_id: crypto.randomUUID() } });',
  '    await expectAllowed(taskUpdate, "Assigned electrician should update task status only");',
  '    assert.equal(taskUpdate.payload.payload.title, "Socket snag", "Task update must preserve canonical content");',
  '    assert.equal(taskUpdate.payload.payload.customerConfirmedAt, undefined);',
  '',
  '    const legacyTaskId = source("legacy-null-customer-task");',
  '    await expectAllowed(await insertRecord(accounts.A.office, "cloud_collections", { organisation_id: organisationA, collection_key: "jr-os-job-tasks", source_id: legacyTaskId, customer_source_id: null, job_source_id: jobA, payload: { id: legacyTaskId, jobId: jobA, type: "Task", title: "Legacy task", description: "", category: "General", priority: "Normal", assignedTo: fieldTeamA, dueDate: "2026-08-21", status: "Open", photos: [], notes: "" }, created_by: accounts.A.office.id, updated_by: accounts.A.office.id }), "Office should seed a legacy task without customer envelope");',
  '    const legacyTaskUpdate = await authenticated(accounts.A.electrician, "/rest/v1/rpc/jr_field_save_collection", { method: "POST", body: { collection_key_value: "jr-os-job-tasks", record_source_id: legacyTaskId, expected_version: 1, record_payload: { id: legacyTaskId, jobId: jobA, type: "Task", category: "General", priority: "Normal", status: "In progress" }, mutation_id: crypto.randomUUID() } });',
  '    await expectAllowed(legacyTaskUpdate, "Legacy null-customer task should remain status-updatable");',
  '    const legacyTaskStored = await listRecords(accounts.A.office, "cloud_collections", "select=customer_source_id,payload&collection_key=eq.jr-os-job-tasks&source_id=eq." + legacyTaskId);',
  '    assert.equal(legacyTaskStored.payload[0].customer_source_id, null, "Legacy task update must preserve its canonical null envelope");',
  '    assert.equal(legacyTaskStored.payload[0].payload.customerId, undefined);',
  '',
  '    const noteId = source("rpc-note-a");',
  '    const noteCreate = await authenticated(accounts.A.electrician, "/rest/v1/rpc/jr_field_save_collection", { method: "POST", body: { collection_key_value: "jr-os-job-timeline", record_source_id: noteId, expected_version: 0, record_payload: { id: noteId, jobId: jobA, customerId: otherCustomerA, eventType: "Variation", sourceType: "JobVariation", sourceId: "forged-source", fromStatus: "Sent", toStatus: "Accepted", note: "Plain site observation" }, mutation_id: crypto.randomUUID() } });',
  '    await expectAllowed(noteCreate, "Assigned electrician should create a plain field note");',
  '    assert.equal(noteCreate.payload.payload.eventType, "Note");',
  '    assert.equal(noteCreate.payload.payload.milestone, "Custom update");',
  '    assert.equal(noteCreate.payload.payload.customerId, customerA);',
  '    assert.equal(noteCreate.payload.payload.sourceType, undefined, "Field note must not forge authoritative evidence classification");',
  '    assert.equal(noteCreate.payload.payload.fromStatus, undefined, "Field note must discard client status-evidence fields");',
  '    assert.equal(noteCreate.payload.payload.toStatus, undefined, "Field note output must always remain a plain server-authored note");',
  '',
  '    await expectDeniedWithCode(await authenticated(accounts.A.electrician, "/rest/v1/rpc/jr_field_save_collection", { method: "POST", body: { collection_key_value: "jr-os-rams", record_source_id: source("denied-rams"), expected_version: 0, record_payload: { id: source("denied-rams"), jobId: jobA }, mutation_id: crypto.randomUUID() } }), "42501", "Read-only field collections must remain denied");',
  '',
].join("\n");

const fieldPrivateUploadSnippet = `    await expectAllowed(
      await uploadStorageObject(accounts.A.electrician, ownPath, pngBytes, "image/png"),
      "Authenticated staff upload must succeed",
    );`;
const secureFieldPrivateUploadSnippet = `    await expectDenied(
      await uploadStorageObject(accounts.A.electrician, ownPath, pngBytes, "image/png"),
      "Electrician private object upload must fail closed without an assigned upload intent",
    );
    await expectAllowed(
      await uploadStorageObject(accounts.A.office, ownPath, pngBytes, "image/png"),
      "Authenticated office upload should succeed",
    );`;

const fieldPrivateMetadataSnippet = `    await expectAllowed(await insertRecord(accounts.A.electrician, "private_files", {
      organisation_id: organisationA, source_id: source("file-own"), job_source_id: jobA, customer_source_id: customerA,
      bucket, object_path: ownPath, file_name: "photo.png", mime_type: "image/png",
    }), "Staff should write private file metadata");`;
const secureFieldPrivateMetadataSnippet = `    await expectDenied(await insertRecord(accounts.A.electrician, "private_files", {
      organisation_id: organisationA, source_id: source("file-field-denied"), storage_key: "jr-os-job-documents", job_source_id: jobA, customer_source_id: customerA,
      bucket, object_path: ownPath, file_name: "photo.png", mime_type: "image/png",
    }), "Electrician private-file metadata write must fail closed without an assigned upload intent");
    await expectAllowed(await insertRecord(accounts.A.office, "private_files", {
      organisation_id: organisationA, source_id: source("file-own"), storage_key: "jr-os-job-documents", job_source_id: jobA, customer_source_id: customerA,
      bucket, object_path: ownPath, file_name: "photo.png", mime_type: "image/png",
    }), "Office should register private file metadata");`;

const legacyFieldUploadSnippet = `    await expectAllowed(
      await uploadStorageObject(accounts.A.electrician, legacyPath, pngBytes, "image/png", legacyBucket),
      "Electrician should retain authenticated legacy upload compatibility",
    );`;
const secureLegacyFieldUploadSnippet = `    await expectDenied(
      await uploadStorageObject(accounts.A.electrician, legacyPath, pngBytes, "image/png", legacyBucket),
      "Electrician legacy object upload must fail closed",
    );`;

for (const [label, snippet] of [
  ["obsolete Supabase logout", obsoleteSnippet],
  ["customer fixture", customerSeedSnippet],
  ["customer read anchor", customerReadAnchor],
  ["team fixture", teamSeedSnippet],
  ["team read expectation", teamReadSnippet],
  ["job fixture", jobSeedSnippet],
  ["other-customer job fixture", otherCustomerJobSnippet],
  ["job read anchor", jobReadAnchor],
  ["field relationship fixtures", fieldCasesSnippet],
  ["generic field fixtures", genericCasesSnippet],
  ["generic direct-write loop", genericInsertSnippet],
  ["generic field read expectation", genericReadSnippet],
  ["field private object upload", fieldPrivateUploadSnippet],
]) {
  const occurrences = source.split(snippet).length - 1;
  if (occurrences !== 1) {
    throw new Error(`Expected exactly one ${label} snippet, found ${occurrences}`);
  }
}

const configuration = liveSupabaseTestConfiguration(process.env);
if (configuration) {
  await verifyDeployedMigration({
    url: configuration.url,
    projectRef: configuration.projectRef,
    serviceRoleKey: configuration.serviceRoleKey,
    confirmation: configuration.confirmation,
  });
}

const temporaryDirectory = mkdtempSync(join(tmpdir(), "jr-os-rls-"));
const temporaryTest = join(temporaryDirectory, "supabase-rls.integration.mjs");

try {
  const supportedSource = source
    .replace(obsoleteSnippet, supportedSnippet)
    .replace(customerSeedSnippet, safeCustomerSeedSnippet)
    .replace(customerReadAnchor, scopedCustomerReadCoverage)
    .replace(teamSeedSnippet, safeTeamSeedSnippet)
    .replace(teamReadSnippet, safeTeamReadSnippet)
    .replace(jobSeedSnippet, secureJobSeedSnippet)
    .replace(otherCustomerJobSnippet, secureOtherCustomerJobSnippet)
    .replace(jobReadAnchor, secureJobReadCoverage)
    .replace(fieldCasesSnippet, secureFieldCasesSnippet)
    .replace(genericCasesSnippet, safeGenericCasesSnippet)
    .replace(genericInsertSnippet, secureGenericInsertSnippet)
    .replace(genericReadSnippet, secureGenericReadSnippet)
    .replace(fieldPrivateUploadSnippet, secureFieldPrivateUploadSnippet)
    .replace(fieldPrivateMetadataSnippet, secureFieldPrivateMetadataSnippet)
    .replace(legacyFieldUploadSnippet, secureLegacyFieldUploadSnippet)
    .replace(fieldJobSeedNote, confidentialFieldJobSeedNote)
    .replace(fieldJobReadExpectation, confidentialFieldJobReadExpectation)
    .replace(officeJobReadAnchor, confidentialOfficeJobRead)
    .replace(genericCasesStart, `${fieldTimelineCoverage}${fieldSiteDiaryCoverage}${fieldVariationCoverage}${fieldProgressReadCoverage}${fieldProgressUpdateEnvelopeCoverage}${fieldMaterialUsageReadCoverage}${fieldJobTaskReadCoverage}${fieldMutationCoverage}${genericCasesStart}`)
    .replace(obsoleteCustomerInvoiceRead, safeCustomerInvoiceRead)
    .replace(obsoleteCustomerPaymentRead, safeCustomerPaymentRead);
  for (const requiredPhrase of [
    "Anonymous field mutation RPC calls must fail",
    "Office sessions must not use the electrician mutation RPC",
    "Customer sessions must not use the electrician mutation RPC",
    "Oversized field payloads must be rejected before receipt persistence",
    "Field job projection must omit mixed commercial notes",
    "Electrician must not read field customers before active identity binding",
    "Assigned electrician should retain the assigned field customer",
    "Co-assigned electrician should retain the assigned field customer",
    "Electrician must not read a same-tenant customer with only unassigned jobs",
    "Assigned electrician must not read another organisation's field customer",
    "Co-assigned electrician should retain the assigned job",
    "Electrician must not read an unassigned same-tenant job",
    "Another organisation must not read the assigned field job",
    "Assigned electrician should retain the production-shaped null-customer job document",
    "Co-assigned electrician should retain the assigned job document",
    "Electrician must not read an unassigned same-tenant job document",
    "Electrician must not read a deleted job document",
    "Assigned electrician must not read another organisation's job document",
    "Office should retain unassigned job document access",
    "Office should retain the canonical variation financial note",
    "Field timeline projection must mask variation financial notes",
    "Field timeline projection must omit every variation price marker",
    "Another organisation must not read the field timeline projection",
    "Assigned electrician should retain production-shaped null-customer timeline activity",
    "Co-assigned electrician should retain assigned job timeline activity",
    "Electrician must not read unassigned same-tenant timeline activity",
    "Office should retain unassigned timeline activity",
    "Electrician should read timeline activity while the job is active and assigned",
    "Electrician must not read timeline activity for a soft-deleted job",
    "Office should retain canonical timeline activity after job deletion",
    "Assigned electrician should retain a null-customer current site diary",
    "Co-assigned electrician should retain a null-customer current site diary",
    "Electrician must not read an unassigned current site diary",
    "Assigned electrician must not read another organisation's current site diary",
    "Assigned electrician should retain a null-customer legacy site diary",
    "Co-assigned electrician should retain a null-customer legacy site diary",
    "Electrician must not read an unassigned legacy site diary",
    "Assigned electrician must not read another organisation's legacy site diary",
    "Electrician must not read a diary without a canonical job",
    "Office should retain unassigned current and legacy site diaries",
    "Electrician should read current and legacy diaries while the job is active and assigned",
    "Electrician must not read current or legacy diaries for a soft-deleted job",
    "Office should retain canonical current and legacy site diaries after job deletion",
    "Assigned electrician should retain a null-customer job variation",
    "Co-assigned electrician should retain an assigned job variation",
    "Electrician must not read an unassigned same-tenant job variation",
    "Assigned electrician must not read another organisation's job variation",
    "Electrician must not read a variation without a canonical job",
    "Office should retain unassigned job variation access",
    "Electrician should read the job variation while the job is active and assigned",
    "Electrician must not read a job variation for a soft-deleted job",
    "Office should retain canonical job variation after job deletion",
    "Assigned electrician should retain null-customer job progress",
    "Co-assigned electrician should retain assigned job progress",
    "Electrician must not read unassigned same-tenant job progress",
    "Assigned electrician must not read another organisation's job progress",
    "Electrician must not read progress without a canonical job",
    "Electrician without an active field identity must not read job progress",
    "Office should retain unassigned job progress access",
    "Electrician should read job progress while the job is active and assigned",
    "Electrician must not read job progress for a soft-deleted job",
    "Office should retain canonical job progress after job deletion",
    "Assigned electrician should update office-created null-customer job progress",
    "Progress RPC must preserve a legitimate null customer envelope",
    "Progress RPC must preserve the canonical payment percentage",
    "Progress RPC must preserve office suggestions",
    "Wrong non-null progress customer envelope must fail closed",
    "Electrician must not update unassigned job progress",
    "Assigned electrician should retain null-customer job material usage",
    "Co-assigned electrician should retain assigned job material usage",
    "Electrician must not read unassigned same-tenant job material usage",
    "Assigned electrician must not read another organisation's job material usage",
    "Electrician must not read material usage without a canonical job",
    "Wrong customer material usage envelope must fail closed",
    "Electrician without an active field identity must not read job material usage",
    "Office should retain unassigned job material usage access",
    "Electrician should read job material usage while the job is active and assigned",
    "Electrician must not read job material usage for a soft-deleted job",
    "Office should retain canonical job material usage after job deletion",
    "Assigned electrician should retain a server-bound field-created task",
    "Field-created task must retain its server-bound customer",
    "Assigned electrician should retain production-shaped null-customer job tasks",
    "Co-assigned electrician should retain assigned job task details",
    "Electrician must not read unassigned same-tenant job tasks",
    "Assigned electrician must not read another organisation's job tasks",
    "Electrician must not read task without a canonical job",
    "Wrong customer task envelope must fail closed",
    "Electrician without an active field identity must not read job tasks",
    "Office should retain unassigned job task access",
    "Assigned task projection should retain operational notes and attachments",
    "Electrician should read job tasks while the job is active and assigned",
    "Electrician must not read job tasks for a soft-deleted job",
    "Office should retain canonical job tasks after job deletion",
    "Assigned electrician should apply a valid job status transition through the RPC",
    "Assigned electrician must not apply an unsupported canonical job status transition",
    "Rejected field status must not advance the canonical job version",
    "Rejected field status must not change the canonical job",
    "Rejected field status must not create authoritative timeline evidence",
    "A response-loss retry should return the exact prior job mutation result",
    "A mutation id must not be reused with changed job arguments",
    "Electrician direct job updates must fail closed",
    "Status evidence must bind the canonical linked customer",
    "Legacy In progress request should canonicalize through the status RPC",
    "Electrician direct write must fail closed for",
    "Electrician must not create a planner entry for an unassigned same-tenant job",
    "Electrician must not create a timesheet for an unassigned same-tenant job",
    "Assigned electrician should create a survey through the field RPC",
    "Assigned electrician should read the assigned survey projection",
    "Electrician must not read an unassigned same-tenant survey",
    "Survey response-loss retry should return the exact prior result",
    "Concurrent field create loser must use the conflict contract",
    "Electrician must not update an office or coworker-owned survey",
    "Co-assigned electrician should create their own survey",
    "Electrician must not update a co-assigned coworker survey",
    "Duplicate active team identities must fail closed",
    "Inactive team identities must fail closed",
    "Survey update must preserve office labour rate",
    "Diary RPC must bind staff presence to the actor",
    "Electrician should read the canonical diary created through the field RPC",
    "Assigned electrician should update task status only",
    "Legacy null-customer task should remain status-updatable",
    "Field note must not forge authoritative evidence classification",
    "Field note must discard client status-evidence fields",
    "Field note output must always remain a plain server-authored note",
    "Read-only field collections must remain denied",
    "Electrician direct generic write must fail closed for",
    "Electrician private object upload must fail closed without an assigned upload intent",
  ]) {
    if (!supportedSource.includes(requiredPhrase)) {
      throw new Error(`Generated live RLS test is missing field confidentiality coverage: ${requiredPhrase}`);
    }
  }
  writeFileSync(temporaryTest, supportedSource, "utf8");
  const childEnvironment = { ...process.env };
  delete childEnvironment.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, ["--test", temporaryTest], {
    cwd: process.cwd(),
    env: childEnvironment,
    stdio: "inherit",
  });

  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
