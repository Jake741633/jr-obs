import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fieldJobTaskStatusTransitionAllowed, transitionJobTask } from "../lib/jobTasks-core.mjs";
import { fieldOperatorMemberId } from "../lib/siteDiaryIdentity-core.mjs";

const page = readFileSync(new URL("../app/field/snags/page.tsx", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/20260813235633_secure_field_mutation_boundary.sql", import.meta.url), "utf8");

test("field task RPC binds new tasks to the authenticated electrician", () => {
  assert.match(migration, /when 'jr-os-job-tasks'/);
  assert.match(migration, /'assignedTo', pg_catalog\.to_jsonb\(team_member_source_id\)/);
  assert.match(migration, /Only the assigned electrician may update this task/);
});

test("cloud snag identity requires exactly one active email match", () => {
  const members = [
    { id: "field-1", name: "Field Engineer", email: "field@example.com", status: "Active" },
    { id: "former", name: "Former Engineer", email: "field@example.com", status: "Inactive" },
  ];
  const identity = { email: " FIELD@example.com " };
  assert.equal(fieldOperatorMemberId({ identity, teamMembers: members, mode: "cloud" }), "field-1");
  assert.equal(fieldOperatorMemberId({
    identity,
    teamMembers: [...members, { id: "duplicate", name: "Duplicate", email: "FIELD@example.com", status: "Active" }],
    mode: "cloud",
  }), "");
});

test("cloud snag operator reuses the shared exact-one identity resolver", () => {
  const resolution = page.slice(
    page.indexOf("const operatorMember = useMemo"),
    page.indexOf("const snagSyncScopeKey"),
  );

  assert.match(resolution, /fieldOperatorMemberId\(\{[\s\S]*identity: identityState\.identity,[\s\S]*teamMembers: team\.items,[\s\S]*mode: identityState\.mode/);
  assert.match(resolution, /if \(!operatorMemberId\) return undefined;/);
  assert.match(resolution, /team\.items\.find\(\(member\) => member\.id === operatorMemberId\)/);
  assert.match(resolution, /\[identityState\.identity, identityState\.mode, team\.items\]/);
  assert.doesNotMatch(resolution, /identityEmail|member\.email/);
});

test("cloud snag creation mirrors the server-bound assignee", () => {
  assert.match(page, /useCloudIdentity\(\)/);
  assert.match(page, /const cloudFieldMode = identityState\.mode !== "local"/);
  assert.match(page, /assignedTo: cloudFieldMode \? operatorMember\?\.id : form\.assignedTo \|\| undefined/);
  assert.match(page, /label="Assigned to" value=\{operatorMember\?\.name \|\| "Resolving active engineer…"\} readOnly/);
  assert.match(page, /Your active team identity could not be resolved/);
});

test("cloud snag status controls fail closed for another assignee", () => {
  assert.match(page, /task\.assignedTo !== operatorMember\.id/);
  assert.match(page, /Only snags assigned to your active field account can be updated here/);
});

test("unresolved snag identity fails before sync registration or optimistic writes", () => {
  const create = page.slice(page.indexOf("function createSnag"), page.indexOf("function changeStatus"));
  const change = page.slice(page.indexOf("function changeStatus"), page.indexOf("\n\n  return <div"));
  const createGuard = create.indexOf("if (cloudFieldMode && !operatorMember)");
  const changeGuard = change.indexOf("if (cloudFieldMode && (!operatorMember");

  assert.ok(createGuard >= 0);
  assert.ok(changeGuard >= 0);
  for (const mutation of ["registerSnagSyncAttempt", "tasks.setItems", "timeline.setItems"]) {
    assert.ok(create.indexOf(mutation) > createGuard, `create guard must precede ${mutation}`);
    assert.ok(change.indexOf(mutation) > changeGuard, `status guard must precede ${mutation}`);
  }
});

test("cloud snag status controls mirror the exact field RPC transition graph", () => {
  for (const [currentStatus, nextStatus] of [
    ["Open", "In progress"],
    ["Open", "Completed"],
    ["In progress", "Open"],
    ["In progress", "Completed"],
  ]) assert.equal(fieldJobTaskStatusTransitionAllowed(currentStatus, nextStatus), true);

  for (const [currentStatus, nextStatus] of [
    ["Completed", "Open"],
    ["Customer confirmed", "Open"],
    ["Open", "Customer confirmed"],
    ["Unknown", "Open"],
  ]) assert.equal(fieldJobTaskStatusTransitionAllowed(currentStatus, nextStatus), false);

  assert.match(migration, /canonical_task_status = 'Open' and requested_task_status in \('In progress', 'Completed'\)/);
  assert.match(migration, /canonical_task_status = 'In progress' and requested_task_status in \('Open', 'Completed'\)/);
});

test("cloud terminal reopen fails before optimistic task or timeline updates", () => {
  const guard = page.indexOf("if (cloudFieldMode && !fieldJobTaskStatusTransitionAllowed(task.status, nextStatus))");
  const taskMutation = page.indexOf("tasks.setItems", guard);
  const timelineMutation = page.indexOf("timeline.setItems", guard);
  assert.ok(guard >= 0 && taskMutation > guard && timelineMutation > guard);
  assert.match(page, /disabled=\{syncBlocked \|\| \(cloudFieldMode && !fieldJobTaskStatusTransitionAllowed\(snag\.status, "Open"\)\)\}/);
});

test("office and local task workflows retain terminal reopen transitions", () => {
  for (const status of ["Completed", "Customer confirmed"]) {
    const reopened = transitionJobTask({ task: { type: "Snag", status }, nextStatus: "Open", now: "2026-08-26T11:20:00.000Z" });
    assert.equal(reopened.status, "Open");
  }
});

test("local snag mode retains manual assignment controls", () => {
  assert.match(page, /cloudFieldMode \? <InputField[\s\S]*? : <label[\s\S]*?<span>Assigned to<\/span><select value=\{form\.assignedTo\}/);
});
