import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { collectionCloudMutationRoute, fieldMutationRouteAllows } from "../lib/cloud/fieldMutationPolicy-core.mjs";
import { typedCollectionTables } from "../lib/cloud/migrationStoragePolicy-core.mjs";

const jobPage = readFileSync(new URL("../app/jobs/[id]/page.tsx", import.meta.url), "utf8");
const secureFieldBoundary = readFileSync(
  new URL("../supabase/migrations/20260813235633_secure_field_mutation_boundary.sql", import.meta.url),
  "utf8",
);
const tombstoneBoundary = readFileSync(
  new URL("../supabase/migrations/20260803_021_tombstone_transition_guard.sql", import.meta.url),
  "utf8",
);

function section(source, startText, endText) {
  const start = source.indexOf(startText);
  assert.ok(start >= 0, `Missing section start: ${startText}`);
  const end = source.indexOf(endText, start);
  assert.ok(end > start, `Missing section end: ${endText}`);
  return source.slice(start, end);
}

test("job document writes remain outside every approved electrician mutation route", () => {
  const table = typedCollectionTables["jr-os-job-documents"];
  assert.equal(table, "job_documents");

  const route = collectionCloudMutationRoute(table, "electrician", "jr-os-job-documents");
  assert.deepEqual(route, { kind: "deny" });
  assert.equal(fieldMutationRouteAllows(route, "upsert", "create"), false);
  assert.equal(fieldMutationRouteAllows(route, "upsert", "update"), false);
  assert.equal(fieldMutationRouteAllows(route, "delete", "update"), false);
  assert.deepEqual(collectionCloudMutationRoute(table, "office", "jr-os-job-documents"), { kind: "direct" });
});

test("server boundaries keep document creation and update office-only and tombstones owner/admin-only", () => {
  const writeBoundary = section(
    secureFieldBoundary,
    "-- File metadata and object writes cannot safely prove assigned-job ownership",
    "create or replace function public.jr_os_deployed_migration()",
  );

  assert.match(writeBoundary, /private\.jr_can_write_private_file[\s\S]*private\.can_manage_office_data\(\)/i);
  assert.match(writeBoundary, /create policy jr_private_insert[\s\S]*private\.can_manage_office_data\(\)/i);
  assert.match(writeBoundary, /'job_documents'/i);
  assert.match(writeBoundary, /drop policy if exists %I on public\.%I'[\s\S]*table_name \|\| '_field_insert'/i);
  assert.match(writeBoundary, /drop policy if exists %I on public\.%I'[\s\S]*table_name \|\| '_field_update'/i);
  assert.match(writeBoundary, /create policy %I on public\.%I for insert[\s\S]*private\.can_manage_office_data\(\)/i);
  assert.match(writeBoundary, /create policy %I on public\.%I for update[\s\S]*private\.can_manage_office_data\(\)/i);
  assert.match(tombstoneBoundary, /'job_documents'/i);
  assert.match(tombstoneBoundary, /not public\.can_manage_business\(\)[\s\S]*Only an owner or admin can delete or restore records/i);
});

test("restricted document creation returns before file or collection side effects", () => {
  const handler = section(jobPage, "async function addDocument", "\n\n  function deleteDocument");
  const guard = handler.indexOf("if (documentMutationRestricted)");
  const guardReturn = handler.indexOf("return;", guard);
  assert.ok(guard >= 0 && guardReturn > guard, "document creation must return from the restriction guard");
  assert.match(handler.slice(guard, guardReturn), /setDocumentError\(documentHandoffMessage\)/);

  for (const sideEffect of ["new FileReader", "documents.setItems", "setShowDocumentForm(false)"]) {
    assert.ok(handler.indexOf(sideEffect) > guardReturn, `${sideEffect} must remain behind the document guard`);
  }
});

test("restricted document deletion returns before confirmation or optimistic removal", () => {
  const handler = section(jobPage, "function deleteDocument", "\n\n  function generateInvoice");
  const guard = handler.indexOf("if (documentMutationRestricted)");
  const guardReturn = handler.indexOf("return;", guard);
  assert.ok(guard >= 0 && guardReturn > guard, "document deletion must return from the restriction guard");
  assert.ok(handler.indexOf("window.confirm") > guardReturn);
  assert.ok(handler.indexOf("documents.remove") > guardReturn);
});

test("field job document records remain readable while add, form and delete controls fail closed", () => {
  assert.match(
    jobPage,
    /const documentMutationRestricted = identityState\.mode !== "local" && \([\s\S]*!canEditFinance\(identityState\.identity\?\.role\)[\s\S]*collectionCloudMutationRoute\("job_documents", identityState\.identity\?\.role, "jr-os-job-documents"\)\.kind !== "direct"/,
  );
  assert.match(jobPage, /const isReady = identityState\.isReady &&/);
  assert.match(
    jobPage,
    /Assigned job documents remain available to review\. Contact the office to arrange new files, links or removals until a dedicated secure field document route is available\./,
  );
  assert.match(
    jobPage,
    /documentMutationRestricted \? <p[^>]*>\{documentHandoffMessage\}<\/p> : <Button[^>]*>[\s\S]*Add document/,
  );
  assert.match(jobPage, /!documentMutationRestricted && showDocumentForm \? <Card><form onSubmit=\{addDocument\}/);
  assert.match(jobPage, /\{!documentMutationRestricted \? <button onClick=\{\(\) => deleteDocument\(document\)\}/);
  assert.match(jobPage, /jobDocuments\.map\(\(document\) => <Card/);
  assert.match(jobPage, /\{document\.notes \? <p[^>]*>\{document\.notes\}<\/p> : null\}/);
  assert.match(jobPage, /<ExternalLink[^>]*\/>Open link<\/a>/);
});

test("non-field and local document controls remain available", () => {
  assert.match(jobPage, /identityState\.mode !== "local"/);
  assert.match(jobPage, /documents\.setItems\(\(current\) => \[record, \.\.\.current\]\)/);
  assert.match(jobPage, /documents\.remove\(\(item\) => item\.id === document\.id\)/);
  assert.match(jobPage, /Save document/);
});
