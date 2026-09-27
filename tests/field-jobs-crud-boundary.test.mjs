import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { collectionCloudMutationRoute, fieldMutationRouteAllows } from "../lib/cloud/fieldMutationPolicy-core.mjs";
import { canDeleteRecords, canEditFinance } from "../lib/cloud/permissions.ts";

const jobsPage = readFileSync(new URL("../app/jobs/page.tsx", import.meta.url), "utf8");
const jobsSource = ts.createSourceFile("app/jobs/page.tsx", jobsPage, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

function between(start, end) {
  const startIndex = jobsPage.indexOf(start);
  const endIndex = jobsPage.indexOf(end, startIndex + start.length);
  assert.ok(startIndex >= 0 && endIndex > startIndex, `Expected ${start} before ${end}`);
  return jobsPage.slice(startIndex, endIndex);
}

function collectNodes(predicate) {
  const matches = [];
  function visit(node) {
    if (predicate(node)) matches.push(node);
    ts.forEachChild(node, visit);
  }
  visit(jobsSource);
  return matches;
}

function compactSource(value) {
  return value.replace(/\s+/g, "");
}

function variableInitializer(name) {
  const declarations = collectNodes((node) => ts.isVariableDeclaration(node)
    && ts.isIdentifier(node.name)
    && node.name.text === name);
  assert.equal(declarations.length, 1, `Expected exactly one ${name} declaration`);
  assert.ok(declarations[0].initializer, `Expected ${name} to have an initializer`);
  return compactSource(declarations[0].initializer.getText(jobsSource));
}

function visibilityConditionsThroughReturn(node) {
  const conditions = [];
  for (let current = node.parent; current; current = current.parent) {
    if (ts.isReturnStatement(current)) return conditions;
    if (ts.isConditionalExpression(current)) conditions.push(current.condition.getText(jobsSource));
    if (ts.isBinaryExpression(current) && [
      ts.SyntaxKind.AmpersandAmpersandToken,
      ts.SyntaxKind.BarBarToken,
      ts.SyntaxKind.QuestionQuestionToken,
    ].includes(current.operatorToken.kind)) conditions.push(current.left.getText(jobsSource));
  }
  assert.fail(`Expected ${node.getText(jobsSource)} inside the JobsPage return value`);
}

test("electrician jobs use the narrow RPC while office edits stay direct and deletion stays privileged", () => {
  const fieldRoute = collectionCloudMutationRoute("jobs", "electrician");
  assert.equal(fieldRoute.kind, "rpc");
  assert.equal(fieldRoute.functionName, "jr_field_update_job_status");
  assert.equal(fieldMutationRouteAllows(fieldRoute, "upsert", "update"), true);
  assert.equal(fieldMutationRouteAllows(fieldRoute, "upsert", "create"), false);
  assert.equal(fieldMutationRouteAllows(fieldRoute, "delete", "update"), false);

  for (const role of ["owner", "admin"]) {
    assert.equal(canEditFinance(role), true);
    assert.equal(canDeleteRecords(role), true);
    assert.equal(collectionCloudMutationRoute("jobs", role).kind, "direct");
  }

  assert.equal(canEditFinance("office"), true);
  assert.equal(canDeleteRecords("office"), false);
  assert.equal(collectionCloudMutationRoute("jobs", "office").kind, "direct");

  for (const role of ["electrician", "customer"]) {
    assert.equal(canEditFinance(role), false);
    assert.equal(canDeleteRecords(role), false);
  }
});

test("cloud job edit and deletion gates fail closed for unsupported identities", () => {
  assert.match(jobsPage, /const identityState = useCloudIdentity\(\)/);
  assert.equal(variableInitializer("directJobMutation"), "identityState.identity?collectionCloudMutationRoute(\"jobs\",identityState.identity.role).kind===\"direct\":false");
  assert.equal(variableInitializer("jobEditRestricted"), "identityState.mode!==\"local\"&&(!identityState.identity||!canEditFinance(identityState.identity.role)||!directJobMutation)");
  assert.equal(variableInitializer("jobDeleteRestricted"), "identityState.mode!==\"local\"&&(!identityState.identity||!canDeleteRecords(identityState.identity.role)||!directJobMutation)");
});

test("every job CRUD handler checks its live restriction before mutating UI state", () => {
  const blockJobEdit = between("function blockJobEdit", "function blockJobDelete");
  const blockJobDelete = between("function blockJobDelete", "function startEdit");
  const startEdit = between("function startEdit", "function submit");
  const submit = between("function submit", "function updateStatus");
  const deleteJob = between("function deleteJob", "const relatedName");

  assert.match(blockJobEdit, /if \(!jobEditRestricted\) return false;[\s\S]*setError\(jobEditHandoffMessage\);[\s\S]*return true;/);
  assert.match(blockJobDelete, /if \(!jobDeleteRestricted\) return false;[\s\S]*setError\(jobDeleteHandoffMessage\);[\s\S]*return true;/);

  for (const [handler, guardText, sideEffects] of [
    [startEdit, "if (blockJobEdit()) return;", ["setForm(", "setEditingId(", "setShowForm("]],
    [submit, "if (blockJobEdit()) return;", ["jobs.setItems", "timeline.setItems", "resetForm()"]],
    [deleteJob, "if (blockJobDelete()) return;", ["window.confirm", "jobs.remove"]],
  ]) {
    const guard = handler.indexOf(guardText);
    assert.ok(guard >= 0, `The handler must retain the fail-closed guard: ${guardText}`);
    for (const sideEffect of sideEffects) {
      const effect = handler.indexOf(sideEffect);
      assert.ok(effect >= 0, `Expected handler side effect ${sideEffect}`);
      assert.ok(guard < effect, `${sideEffect} must follow the fail-closed guard`);
    }
  }
});

test("field users retain job viewing and status controls without office CRUD controls", () => {
  assert.match(jobsPage, /action=\{jobEditRestricted \? undefined : <Button/);
  assert.match(jobsPage, /showForm && !jobEditRestricted/);
  assert.match(jobsPage, /!jobEditRestricted \? <button[\s\S]*startEdit\(job\)/);
  assert.match(jobsPage, /!jobDeleteRestricted \? <button[\s\S]*deleteJob\(job\)/);
  assert.match(jobsPage, /!jobEditRestricted \? <div className="fixed inset-x-4/);
  assert.match(jobsPage, /Office-managed job records/);

  const viewLinks = collectNodes((node) => ts.isJsxElement(node)
    && node.openingElement.tagName.getText(jobsSource) === "Link"
    && node.openingElement.getText(jobsSource).includes("href={`/jobs/${job.id}`}"));
  const statusSelects = collectNodes((node) => ts.isJsxElement(node)
    && node.openingElement.tagName.getText(jobsSource) === "select"
    && node.openingElement.getText(jobsSource).includes("updateStatus(job.id"));
  const editCalls = collectNodes((node) => ts.isCallExpression(node)
    && node.expression.getText(jobsSource) === "startEdit"
    && node.arguments.length === 1
    && node.arguments[0].getText(jobsSource) === "job");
  const deleteCalls = collectNodes((node) => ts.isCallExpression(node)
    && node.expression.getText(jobsSource) === "deleteJob"
    && node.arguments.length === 1
    && node.arguments[0].getText(jobsSource) === "job");

  assert.equal(viewLinks.length, 1, "Each job card must expose exactly one view link");
  assert.equal(statusSelects.length, 1, "Each job card must expose exactly one status control");
  assert.equal(editCalls.length, 1, "Each job card must contain exactly one edit action");
  assert.equal(deleteCalls.length, 1, "Each job card must contain exactly one delete action");
  const listConditions = ["filtered.length === 0", "!jobs.isReady"];
  assert.deepEqual(visibilityConditionsThroughReturn(viewLinks[0]), listConditions, "The view link must not be hidden by any role or derived condition");
  assert.deepEqual(visibilityConditionsThroughReturn(statusSelects[0]), listConditions, "Quick status must not be hidden by any role or derived condition");
  assert.deepEqual(visibilityConditionsThroughReturn(editCalls[0]), ["!jobEditRestricted", ...listConditions], "The edit action must have exactly the office-edit gate");
  assert.deepEqual(visibilityConditionsThroughReturn(deleteCalls[0]), ["!jobDeleteRestricted", ...listConditions], "The delete action must have exactly the privileged-delete gate");
});
