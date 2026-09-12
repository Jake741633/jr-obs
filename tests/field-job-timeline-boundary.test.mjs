import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { collectionCloudMutationRoute, fieldMutationRouteAllows } from "../lib/cloud/fieldMutationPolicy-core.mjs";
import { fieldOperatorName } from "../lib/siteDiaryIdentity-core.mjs";

const jobPage = readFileSync(new URL("../app/jobs/[id]/page.tsx", import.meta.url), "utf8");
const secureFieldBoundary = readFileSync(
  new URL("../supabase/migrations/20260813235633_secure_field_mutation_boundary.sql", import.meta.url),
  "utf8",
);

function section(source, startText, endText) {
  const start = source.indexOf(startText);
  assert.ok(start >= 0, `Missing section start: ${startText}`);
  const end = source.indexOf(endText, start);
  assert.ok(end > start, `Missing section end: ${endText}`);
  return source.slice(start, end);
}

test("field job timelines have an assignment-bound create-only RPC route", () => {
  const route = collectionCloudMutationRoute("cloud_collections", "electrician", "jr-os-job-timeline");
  assert.deepEqual(route, {
    kind: "rpc",
    functionName: "jr_field_save_collection",
    resource: "cloud_collections",
    allowedIntents: ["create"],
  });
  assert.equal(fieldMutationRouteAllows(route, "upsert", "create"), true);
  assert.equal(fieldMutationRouteAllows(route, "upsert", "update"), false);
  assert.equal(fieldMutationRouteAllows(route, "delete", "update"), false);
  assert.deepEqual(
    collectionCloudMutationRoute("cloud_collections", "office", "jr-os-job-timeline"),
    { kind: "direct" },
  );
});

test("the field timeline RPC accepts only assigned-job, nonblank, insert-only notes", () => {
  const rpc = section(
    secureFieldBoundary,
    "create or replace function public.jr_field_save_collection(",
    "revoke execute on function public.jr_field_save_collection",
  );

  assert.match(rpc, /private\.jr_active_field_identity\(\)/i);
  assert.match(rpc, /private\.jr_lock_active_field_identity\(/i);
  assert.match(rpc, /canonical_job\.deleted_at is not null[\s\S]*not private\.jr_job_is_assigned_to_team_member\(/i);
  assert.match(rpc, /collection_key_value = 'jr-os-job-timeline'[\s\S]*btrim\(coalesce\(record_payload ->> 'note', ''\)\) = ''[\s\S]*A field timeline note is required/i);
  assert.match(rpc, /collection_key_value in \('jr-os-site-diaries', 'jr-os-job-timeline'\)[\s\S]*This field collection is insert-only/i);
  assert.match(rpc, /'jobId', canonical_job\.source_id[\s\S]*'customerId', canonical_job\.customer_source_id/i);
});

test("the server replaces field timeline classifications, actor and time with plain-note semantics", () => {
  const writer = section(
    secureFieldBoundary,
    "create or replace function private.jr_field_collection_write_payload(",
    "revoke execute on function private.jr_field_collection_write_payload",
  );
  const timelineWriter = section(writer, "when 'jr-os-job-timeline' then", "else null");

  assert.match(timelineWriter, /'milestone', pg_catalog\.to_jsonb\('Custom update'::text\)/i);
  assert.match(timelineWriter, /'eventType', pg_catalog\.to_jsonb\('Note'::text\)/i);
  assert.match(timelineWriter, /pg_catalog\.left\(pg_catalog\.btrim\(coalesce\(record_payload ->> 'note', ''\)\), 2000\)/i);
  assert.match(timelineWriter, /'completedBy', pg_catalog\.to_jsonb\(actor_name\)/i);
  assert.match(timelineWriter, /'completedAt', pg_catalog\.to_jsonb\(received_at\)/i);
  assert.match(timelineWriter, /'createdAt', pg_catalog\.to_jsonb\(received_at\)/i);

  for (const untrustedKey of ["milestone", "eventType", "completedBy", "completedAt", "createdAt", "sourceId", "sourceType", "fromStatus", "toStatus"]) {
    assert.doesNotMatch(timelineWriter, new RegExp(`record_payload\\s*->>?\\s*'${untrustedKey}'`, "i"));
  }
});

test("field timeline attribution requires one active team mapping for the signed-in email", () => {
  const teamMembers = [
    { id: "field-1", name: "Alex Field", email: "field@example.com", status: "Active" },
    { id: "former", name: "Former Field", email: "former@example.com", status: "Inactive" },
  ];

  assert.equal(fieldOperatorName({ identity: { email: "FIELD@example.com" }, teamMembers, mode: "cloud" }), "Alex Field");
  assert.equal(fieldOperatorName({ identity: { email: "former@example.com" }, teamMembers, mode: "cloud" }), "");
  assert.equal(fieldOperatorName({
    identity: { email: "field@example.com" },
    teamMembers: [...teamMembers, { id: "field-2", name: "Duplicate", email: "field@example.com", status: "Active" }],
    mode: "cloud",
  }), "");

  assert.match(jobPage, /const team = useTeamCollection\(\)/);
  assert.match(jobPage, /fieldOperatorName\(\{[\s\S]*identity: identityState\.identity,[\s\S]*teamMembers: team\.items,[\s\S]*mode: identityState\.mode/);
  assert.match(jobPage, /variations\.isReady && team\.isReady/);
});

test("field timeline save validates identity and note before a server-shaped optimistic preview", () => {
  const handler = section(jobPage, "function addTimelineEntry", "\n\n  function addMilestoneNow");
  const restrictedGuard = handler.indexOf("if (timelineMutationRestricted)");
  const restrictedReturn = handler.indexOf("return;", restrictedGuard);
  const fieldBranch = section(handler, "if (fieldTimelineMode) {", "\n    if (!timelineForm.completedAt)");
  const operatorGuard = fieldBranch.indexOf("if (!fieldTimelineOperatorName)");
  const noteGuard = fieldBranch.indexOf("if (!note)");
  const write = fieldBranch.indexOf("timeline.setItems");

  assert.ok(restrictedGuard >= 0 && restrictedReturn > restrictedGuard);
  assert.ok(handler.indexOf("timeline.setItems") > restrictedReturn);
  assert.ok(operatorGuard >= 0 && noteGuard > operatorGuard && write > noteGuard);
  assert.match(fieldBranch, /timelineForm\.note\.trim\(\)\.slice\(0, 2000\)/);
  assert.match(fieldBranch, /milestone: "Custom update"/);
  assert.match(fieldBranch, /eventType: "Note"/);
  assert.match(fieldBranch, /completedBy: fieldTimelineOperatorName/);
  assert.match(fieldBranch, /completedAt: now/);
  assert.match(fieldBranch, /createdAt: now/);
  assert.doesNotMatch(fieldBranch, /timelineForm\.(milestone|completedBy|completedAt)/);
  assert.ok(fieldBranch.indexOf("setShowTimelineForm(false)") > write);
});

test("field quick milestones and deletion fail closed before optimistic side effects", () => {
  const quick = section(jobPage, "function addMilestoneNow", "\n\n  function deleteEntry");
  const quickGuard = quick.indexOf("if (fieldTimelineMode)");
  const quickReturn = quick.indexOf("return;", quickGuard);
  const quickRestrictedGuard = quick.indexOf("if (timelineMutationRestricted)");
  const quickRestrictedReturn = quick.indexOf("return;", quickRestrictedGuard);
  assert.ok(quickGuard >= 0 && quickReturn > quickGuard);
  assert.ok(quickRestrictedGuard > quickReturn && quickRestrictedReturn > quickRestrictedGuard);
  assert.ok(quick.indexOf("timeline.setItems") > quickRestrictedReturn);

  const deletion = section(jobPage, "function deleteEntry", "\n\n  function chooseFile");
  const deleteGuard = deletion.indexOf("if (fieldTimelineMode)");
  const deleteReturn = deletion.indexOf("return;", deleteGuard);
  const deleteRestrictedGuard = deletion.indexOf("if (timelineMutationRestricted)");
  const deleteRestrictedReturn = deletion.indexOf("return;", deleteRestrictedGuard);
  assert.ok(deleteGuard >= 0 && deleteReturn > deleteGuard);
  assert.ok(deleteRestrictedGuard > deleteReturn && deleteRestrictedReturn > deleteRestrictedGuard);
  assert.ok(deletion.indexOf("window.confirm") > deleteRestrictedReturn);
  assert.ok(deletion.indexOf("timeline.remove") > deleteRestrictedReturn);
});

test("field users get a note-only timeline while existing activity remains readable", () => {
  assert.match(
    jobPage,
    /const timelineMutationRoute = collectionCloudMutationRoute\("cloud_collections", identityState\.identity\?\.role, "jr-os-job-timeline"\)/,
  );
  assert.match(jobPage, /fieldMutationRouteAllows\(timelineMutationRoute, "upsert", "create"\)/);
  assert.match(jobPage, /Field job timeline changes are limited to plain site notes\. Milestone completion and removals are unavailable in this field workflow\./);
  assert.match(jobPage, /fieldTimelineMode \? "Add site note" : "Add milestone"/);
  assert.match(jobPage, /fieldTimelineMode \? <div[^>]*><TextareaField required maxLength=\{2000\} label="Site note"/);
  assert.match(jobPage, /Recorded by \{fieldTimelineOperatorName \|\| "Active team identity unavailable"\}/);
  assert.match(jobPage, /disabled=\{fieldTimelineMode && !fieldTimelineOperatorName\}/);
  assert.match(jobPage, /onClick=\{\(\) => \{ setTimelineError\(""\); setShowTimelineForm\(\(current\) => !current\); \}\}/);
  assert.match(jobPage, /onClick=\{\(\) => \{ setTimelineError\(""\); setShowTimelineForm\(false\); \}\}>Cancel/);
  assert.match(jobPage, /fieldTimelineMode \? <p[^>]*>\{timelineHandoffMessage\}<\/p>[\s\S]*: <Button[^>]*onClick=\{\(\) => addMilestoneNow\(nextMilestone\)\}/);
  assert.match(jobPage, /\{!fieldTimelineMode && !timelineMutationRestricted \? <button[^>]*onClick=\{\(\) => deleteEntry\(entry\)\}/);
  assert.match(jobPage, /entries\.map\(\(entry\) => <div key=\{entry\.id\}/);
  assert.match(jobPage, /\{entry\.note \? <p[^>]*>\{entry\.note\}<\/p> : null\}/);
});

test("office and local job timelines retain full milestone controls", () => {
  const handler = section(jobPage, "function addTimelineEntry", "\n\n  function addMilestoneNow");
  const officeBranch = handler.slice(handler.indexOf("if (!timelineForm.completedAt)"));

  assert.match(jobPage, /identityState\.mode !== "local"/);
  assert.match(officeBranch, /milestone: timelineForm\.milestone/);
  assert.match(officeBranch, /completedBy: timelineForm\.completedBy/);
  assert.match(officeBranch, /completedAt: new Date\(timelineForm\.completedAt\)\.toISOString\(\)/);
  assert.match(jobPage, /<span[^>]*>Milestone<\/span><select/);
  assert.match(jobPage, /<InputField label="Completed by"/);
  assert.match(jobPage, /<InputField label="Completed at" type="datetime-local"/);
  assert.match(jobPage, /Mark complete now/);
  assert.match(jobPage, /Save milestone/);
});
