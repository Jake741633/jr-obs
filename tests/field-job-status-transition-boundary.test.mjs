import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import {
  canonicalJobStatuses,
  fieldJobStatusTransitionAllowed,
  fieldJobStatusTransitions,
  normaliseFieldJobStatus,
} from "../lib/jobManagement-core.mjs";

const jobsPath = "app/jobs/page.tsx";
const workspacePath = "app/jobs/[id]/workspace/page.tsx";
const jobsPage = readFileSync(new URL(`../${jobsPath}`, import.meta.url), "utf8");
const workspacePage = readFileSync(new URL(`../${workspacePath}`, import.meta.url), "utf8");
const fieldPage = readFileSync(new URL("../app/field/page.tsx", import.meta.url), "utf8");
const dayPlannerPage = readFileSync(new URL("../app/field/day-planner/page.tsx", import.meta.url), "utf8");
const jobsSource = ts.createSourceFile(jobsPath, jobsPage, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const workspaceSource = ts.createSourceFile(workspacePath, workspacePage, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const fieldSource = ts.createSourceFile("app/field/page.tsx", fieldPage, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const dayPlannerSource = ts.createSourceFile("app/field/day-planner/page.tsx", dayPlannerPage, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

const expectedFieldGraph = {
  Scheduled: ["First fix"],
  "First fix": ["Awaiting builder", "Second fix"],
  "Awaiting builder": ["First fix", "Second fix"],
  "Second fix": ["Testing"],
  Testing: ["Snagging", "Complete"],
  Snagging: ["Testing", "Complete"],
};

function compact(value) {
  return value.replace(/\s+/g, "");
}

function collectNodes(root, predicate) {
  const matches = [];
  function visit(node) {
    if (predicate(node)) matches.push(node);
    ts.forEachChild(node, visit);
  }
  visit(root);
  return matches;
}

function functionNode(source, path, name) {
  const functions = collectNodes(source, (node) => ts.isFunctionDeclaration(node)
    && node.name?.text === name);
  assert.equal(functions.length, 1, `Expected exactly one ${name} function in ${path}`);
  assert.ok(functions[0].body, `Expected ${name} to have a body in ${path}`);
  return functions[0];
}

function initializer(source, path, name) {
  const declarations = collectNodes(source, (node) => ts.isVariableDeclaration(node)
    && ts.isIdentifier(node.name)
    && node.name.text === name);
  assert.equal(declarations.length, 1, `Expected exactly one ${name} declaration in ${path}`);
  assert.ok(declarations[0].initializer, `Expected ${name} to have an initializer`);
  return compact(declarations[0].initializer.getText(source));
}

function returnedExpression(statement, source, label) {
  if (ts.isReturnStatement(statement)) {
    assert.ok(statement.expression, `Expected ${label} to return a value`);
    return statement.expression;
  }
  assert.ok(ts.isBlock(statement), `Expected ${label} to return directly or through a block`);
  assert.equal(statement.statements.length, 1, `Expected ${label} block to contain only its return`);
  assert.ok(ts.isReturnStatement(statement.statements[0]), `Expected ${label} block to return`);
  assert.ok(statement.statements[0].expression, `Expected ${label} to return a value`);
  return statement.statements[0].expression;
}

function assertGuardReturns(guard, label) {
  if (ts.isReturnStatement(guard.thenStatement)) return;
  assert.ok(ts.isBlock(guard.thenStatement), `${label} must terminate directly or through a block`);
  const lastStatement = guard.thenStatement.statements.at(-1);
  assert.ok(lastStatement && ts.isReturnStatement(lastStatement), `${label} must end with an unconditional return`);
}

function exactTopLevelGuard(handler, source, condition, label) {
  const matches = handler.body.statements.filter((statement) => ts.isIfStatement(statement)
    && compact(statement.expression.getText(source)) === condition);
  assert.equal(matches.length, 1, `Expected exactly one ${label}`);
  assertGuardReturns(matches[0], label);
  return matches[0];
}

function nearestIfStatement(node, boundary) {
  for (let current = node.parent; current && current !== boundary; current = current.parent) {
    if (ts.isIfStatement(current)) return current;
  }
  return undefined;
}

function assertTransitionTarget(call, source, expectedTarget) {
  assert.equal(call.arguments.length, 1, "A job transition must receive one object argument");
  assert.ok(ts.isObjectLiteralExpression(call.arguments[0]), "A job transition must use an explicit object argument");
  const targets = call.arguments[0].properties.filter((property) => (
    ts.isShorthandPropertyAssignment(property) || ts.isPropertyAssignment(property)
  ) && property.name.getText(source) === "nextStatus");
  assert.equal(targets.length, 1, "A job transition must have one nextStatus target");
  const target = ts.isShorthandPropertyAssignment(targets[0])
    ? targets[0].name.getText(source)
    : targets[0].initializer.getText(source);
  assert.equal(target, expectedTarget, "The guarded status must be the status passed to transitionJobStatus");
}

function assertJobsUpdater(call, source, expectedUpdater) {
  assert.equal(call.arguments.length, 1, "A job status write must have one updater");
  assert.equal(compact(call.arguments[0].getText(source)), expectedUpdater, "The optimistic write must use the audited transition result unchanged");
}

function assertHandlerGuardsBeforeOptimism(source, path, transitionCondition, expectedUpdater) {
  const handler = functionNode(source, path, "updateStatus");
  const unavailableGuard = exactTopLevelGuard(handler, source, "jobStatusMutationDenied", `${path} unavailable guard`);
  const transitionGuard = exactTopLevelGuard(handler, source, transitionCondition, `${path} transition guard`);
  const effects = ["transitionJobStatus", "jobs.setItems", "timeline.setItems"].map((callee) => {
    const calls = collectNodes(handler.body, (node) => ts.isCallExpression(node)
      && node.expression.getText(source) === callee);
    assert.equal(calls.length, 1, `Expected exactly one ${callee} call in ${path} updateStatus`);
    assert.ok(unavailableGuard.end < calls[0].getStart(source), `${callee} must follow the unavailable guard`);
    assert.ok(transitionGuard.end < calls[0].getStart(source), `${callee} must follow the transition guard`);
    return calls[0];
  });
  const timelineGuard = nearestIfStatement(effects[2], handler.body);
  assert.ok(timelineGuard, `Expected the ${path} timeline write to be guarded`);
  assert.equal(
    compact(timelineGuard.expression.getText(source)),
    "!fieldJobStatusRestricted&&result.timelineEntry",
    `Field status evidence must stay server-authored in ${path}`,
  );
  assertTransitionTarget(effects[0], source, "nextStatus");
  assertJobsUpdater(effects[1], source, expectedUpdater);
  return handler;
}

function jsxAttributeExpression(element, source, attributeName) {
  const attributes = element.openingElement.attributes.properties.filter((attribute) => ts.isJsxAttribute(attribute)
    && attribute.name.getText(source) === attributeName);
  assert.equal(attributes.length, 1, `Expected one ${attributeName} attribute`);
  assert.ok(attributes[0].initializer && ts.isJsxExpression(attributes[0].initializer), `Expected ${attributeName} to be an expression`);
  assert.ok(attributes[0].initializer.expression, `Expected ${attributeName} expression content`);
  return compact(attributes[0].initializer.expression.getText(source));
}

function assertOnlyMappedOptions(element, source, expectedExpression) {
  const children = element.children.filter((child) => !(ts.isJsxText(child) && !child.text.trim()));
  assert.equal(children.length, 1, "A field status select must have exactly one option source");
  assert.ok(ts.isJsxExpression(children[0]) && children[0].expression, "Expected mapped status options");
  assert.equal(compact(children[0].expression.getText(source)), expectedExpression);
}

function assertListStatusHelpers() {
  const current = functionNode(jobsSource, jobsPath, "jobCurrentStatus");
  assert.equal(current.body.statements.length, 1);
  assert.ok(ts.isReturnStatement(current.body.statements[0]) && current.body.statements[0].expression);
  assert.equal(
    compact(current.body.statements[0].expression.getText(jobsSource)),
    "fieldRestricted?normaliseFieldJobStatus(job.status):normaliseJobStatus(job.status)",
  );

  const options = functionNode(jobsSource, jobsPath, "jobStatusOptions");
  assert.equal(options.body.statements.length, 2, "jobStatusOptions must normalize once and return the gated options");
  const declarationStatement = options.body.statements[0];
  assert.ok(ts.isVariableStatement(declarationStatement));
  assert.equal(declarationStatement.declarationList.declarations.length, 1);
  const declaration = declarationStatement.declarationList.declarations[0];
  assert.ok(ts.isIdentifier(declaration.name) && declaration.name.text === "currentStatus");
  assert.ok(declaration.initializer);
  assert.equal(compact(declaration.initializer.getText(jobsSource)), "jobCurrentStatus(job,fieldJobStatusRestricted)");
  const optionsReturn = options.body.statements[1];
  assert.ok(ts.isReturnStatement(optionsReturn) && optionsReturn.expression);
  assert.equal(
    compact(optionsReturn.expression.getText(jobsSource)),
    "fieldJobStatusRestricted?[currentStatus,...fieldJobStatusTransitions(currentStatus)]:canonicalJobStatuses",
  );

  const locked = functionNode(jobsSource, jobsPath, "jobStatusLocked");
  assert.equal(locked.body.statements.length, 1);
  assert.ok(ts.isReturnStatement(locked.body.statements[0]) && locked.body.statements[0].expression);
  assert.equal(
    compact(locked.body.statements[0].expression.getText(jobsSource)),
    "jobStatusMutationDenied||(fieldJobStatusRestricted&&fieldJobStatusTransitions(job.status).length===0)",
  );

  const notice = functionNode(jobsSource, jobsPath, "jobStatusNotice");
  assert.equal(notice.body.statements.length, 3, "jobStatusNotice must handle deny, terminal field, then unlocked cases");
  const unavailable = notice.body.statements[0];
  assert.ok(ts.isIfStatement(unavailable));
  assert.equal(compact(unavailable.expression.getText(jobsSource)), "jobStatusMutationDenied");
  assert.equal(returnedExpression(unavailable.thenStatement, jobsSource, "unavailable notice").getText(jobsSource), "unavailableStatusMessage");
  const terminal = notice.body.statements[1];
  assert.ok(ts.isIfStatement(terminal));
  assert.equal(
    compact(terminal.expression.getText(jobsSource)),
    "fieldJobStatusRestricted&&fieldJobStatusTransitions(job.status).length===0",
  );
  const terminalMessage = returnedExpression(terminal.thenStatement, jobsSource, "terminal field notice");
  assert.ok(ts.isStringLiteral(terminalMessage));
  assert.equal(terminalMessage.text, "Further lifecycle changes for this job require office review.");
  const unlocked = notice.body.statements[2];
  assert.ok(ts.isReturnStatement(unlocked) && unlocked.expression && ts.isStringLiteral(unlocked.expression));
  assert.equal(unlocked.expression.text, "");
}

function assertStatusTemplate(expression, source, head, tail, label) {
  assert.ok(ts.isTemplateExpression(expression), `Expected ${label} to be a status template`);
  assert.equal(expression.head.text, head);
  assert.equal(expression.templateSpans.length, 1);
  assert.equal(expression.templateSpans[0].expression.getText(source), "nextStatus");
  assert.equal(expression.templateSpans[0].literal.text, tail);
}

function assertListStatusMessage(handler) {
  const conditionalMessages = collectNodes(handler.body, (node) => ts.isCallExpression(node)
    && node.expression.getText(jobsSource) === "setStatusMessage"
    && node.arguments.length === 1
    && ts.isConditionalExpression(node.arguments[0]));
  assert.equal(conditionalMessages.length, 1, "Expected one field-aware list status message");
  const message = conditionalMessages[0].arguments[0];
  assert.equal(compact(message.condition.getText(jobsSource)), "fieldJobStatusRestricted");
  assert.ok(ts.isTemplateExpression(message.whenTrue));
  assert.equal(message.whenTrue.head.text, "");
  assert.equal(message.whenTrue.templateSpans.length, 2);
  assert.equal(message.whenTrue.templateSpans[0].expression.getText(jobsSource), "job.title");
  assert.equal(message.whenTrue.templateSpans[0].literal.text, " stage change to ");
  assert.equal(message.whenTrue.templateSpans[1].expression.getText(jobsSource), "nextStatus");
  assert.equal(message.whenTrue.templateSpans[1].literal.text, " queued for secure sync.");
  assert.ok(ts.isStringLiteral(message.whenFalse));
  assert.equal(message.whenFalse.text, "");
  assert.match(jobsPage, /role="status"[^>]*>\{statusMessage\}<\/p>/);
}

function assertWorkspaceStatusMessage(handler) {
  const conditionalMessages = collectNodes(handler.body, (node) => ts.isCallExpression(node)
    && node.expression.getText(workspaceSource) === "setStatusMessage"
    && node.arguments.length === 1
    && ts.isConditionalExpression(node.arguments[0]));
  assert.equal(conditionalMessages.length, 1, "Expected one field-aware status result message");
  const message = conditionalMessages[0].arguments[0];
  assert.equal(compact(message.condition.getText(workspaceSource)), "fieldJobStatusRestricted");
  assertStatusTemplate(message.whenTrue, workspaceSource, "Job status change to ", " queued for secure sync.", "field status message");
  assertStatusTemplate(message.whenFalse, workspaceSource, "Job status updated to ", ".", "office status message");
}

function finalJobStatusRpc() {
  const migrationsUrl = new URL("../supabase/migrations/", import.meta.url);
  const definitions = [];
  for (const file of readdirSync(migrationsUrl).filter((name) => name.endsWith(".sql")).sort()) {
    const sql = readFileSync(new URL(file, migrationsUrl), "utf8");
    const starts = sql.matchAll(/create\s+or\s+replace\s+function\s+public\.jr_field_update_job_status\s*\(/gi);
    for (const start of starts) {
      const definition = sql.slice(start.index);
      const delimiterMatch = /\bas\s+(\$\$|\$[A-Za-z_][A-Za-z0-9_]*\$)/i.exec(definition);
      assert.ok(delimiterMatch, `Expected a dollar-quoted body for the job status RPC in ${file}`);
      const delimiter = delimiterMatch[1];
      const bodyStart = delimiterMatch.index + delimiterMatch[0].length;
      const bodyEnd = definition.indexOf(delimiter, bodyStart);
      assert.ok(bodyEnd > bodyStart, `Expected the job status RPC body to close in ${file}`);
      definitions.push({ file, body: definition.slice(bodyStart, bodyEnd) });
    }
  }
  assert.ok(definitions.length > 0, "Expected a field job-status RPC definition");
  return definitions.at(-1);
}

function transitionPredicate(rpc) {
  const marker = /if\s+not\s*\(/i.exec(rpc.body);
  assert.ok(marker, `Expected the final transition predicate in ${rpc.file}`);
  const start = marker.index + marker[0].length;
  let depth = 1;
  let inString = false;
  for (let index = start; index < rpc.body.length; index += 1) {
    const character = rpc.body[index];
    if (character === "'") {
      if (inString && rpc.body[index + 1] === "'") { index += 1; continue; }
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (character === "(") depth += 1;
    if (character !== ")") continue;
    depth -= 1;
    if (depth === 0) {
      assert.match(rpc.body.slice(index + 1), /^\s*then\b/i, "Expected THEN immediately after the transition predicate");
      return rpc.body.slice(start, index);
    }
  }
  assert.fail(`Unclosed transition predicate in ${rpc.file}`);
}

function compactSql(sql) {
  let result = "";
  let inString = false;
  for (let index = 0; index < sql.length; index += 1) {
    const character = sql[index];
    if (character === "'") {
      result += character;
      if (inString && sql[index + 1] === "'") { result += "'"; index += 1; continue; }
      inString = !inString;
      continue;
    }
    if (!inString && /\s/.test(character)) continue;
    result += inString ? character : character.toLowerCase();
  }
  assert.equal(inString, false, "Expected closed SQL string literals");
  return result;
}

function expectedTransitionPredicate() {
  const literal = (value) => `'${value.replaceAll("'", "''")}'`;
  return Object.entries(expectedFieldGraph).map(([source, targets]) => {
    const targetPredicate = targets.length === 1
      ? `normalized_status=${literal(targets[0])}`
      : `normalized_statusin(${targets.map(literal).join(",")})`;
    return `(transition_source_status=${literal(source)}and${targetPredicate})`;
  }).join("or");
}

function assertStatusBoundaryInitializers(source, path) {
  assert.equal(initializer(source, path, "jobStatusMutationRoute"), "identityState.identity?collectionCloudMutationRoute(\"jobs\",identityState.identity.role):{kind:\"deny\"asconst}");
  assert.equal(initializer(source, path, "directJobStatusMutation"), "identityState.identity?canEditFinance(identityState.identity.role)&&jobStatusMutationRoute.kind===\"direct\":false");
  assert.equal(initializer(source, path, "fieldJobStatusRestricted"), "identityState.mode!==\"local\"&&fieldMutationRouteAllows(jobStatusMutationRoute,\"upsert\",\"update\")");
  assert.equal(initializer(source, path, "jobStatusMutationDenied"), "identityState.mode!==\"local\"&&!directJobStatusMutation&&!fieldJobStatusRestricted");
}

test("client field transitions exactly match the final server RPC graph", () => {
  const rpc = finalJobStatusRpc();
  assert.equal(compactSql(transitionPredicate(rpc)), expectedTransitionPredicate());
  assert.match(rpc.body, /normalized_status\s+text\s*:=\s*case\s+pg_catalog\.btrim\(coalesce\(requested_status,\s*''\)\)/i);
  assert.match(rpc.body, /current_status\s*:=\s*pg_catalog\.btrim\(coalesce\(canonical_job\.payload\s*->>\s*'status',\s*''\)\)/i);

  for (const currentStatus of canonicalJobStatuses) {
    const expectedTargets = expectedFieldGraph[currentStatus] ?? [];
    const actualTargets = fieldJobStatusTransitions(currentStatus);
    assert.equal(Object.isFrozen(actualTargets), true);
    assert.deepEqual([...actualTargets], expectedTargets);
    for (const requestedStatus of canonicalJobStatuses) {
      assert.equal(
        fieldJobStatusTransitionAllowed(currentStatus, requestedStatus),
        expectedTargets.includes(requestedStatus),
        `${currentStatus} -> ${requestedStatus}`,
      );
    }
  }
  assert.deepEqual([...fieldJobStatusTransitions(" In progress ")], expectedFieldGraph["First fix"]);
  assert.deepEqual([...fieldJobStatusTransitions(" Scheduled ")], expectedFieldGraph.Scheduled);
  assert.equal(normaliseFieldJobStatus(" Scheduled "), "Scheduled");
  assert.equal(normaliseFieldJobStatus("\tScheduled\t"), "Enquiry", "PostgreSQL btrim does not remove tabs");
  assert.equal(fieldJobStatusTransitionAllowed("Scheduled", " In progress "), true);
  assert.equal(fieldJobStatusTransitionAllowed(" In progress ", " Second fix "), true);
  assert.equal(fieldJobStatusTransitionAllowed(" First fix ", " Second fix "), true);
  assert.equal(fieldJobStatusTransitionAllowed("\tScheduled\t", "First fix"), false);
  assert.equal(fieldJobStatusTransitionAllowed("Scheduled", "First fix\t"), false);
  assert.equal(fieldJobStatusTransitionAllowed("First fix", "First fix"), false);
  assert.equal(fieldJobStatusTransitionAllowed("First fix", " Paid "), false);
});

test("both electrician-accessible job status surfaces fail closed before optimistic writes", () => {
  assertStatusBoundaryInitializers(jobsSource, jobsPath);
  assertStatusBoundaryInitializers(workspaceSource, workspacePath);

  const listHandler = assertHandlerGuardsBeforeOptimism(
    jobsSource,
    jobsPath,
    "fieldJobStatusRestricted&&!fieldJobStatusTransitionAllowed(job.status,nextStatus)",
    "(current)=>current.map((item)=>item.id===id?result.job:item)",
  );
  assertListStatusMessage(listHandler);
  const workspaceHandler = assertHandlerGuardsBeforeOptimism(
    workspaceSource,
    workspacePath,
    "fieldJobStatusRestricted&&!fieldJobStatusTransitionAllowed(currentStatus,nextStatus)",
    "(current)=>current.map((item)=>item.id===currentJob.id?result.job:item)",
  );
  assertWorkspaceStatusMessage(workspaceHandler);
});

test("field controls expose only current and server-approved next stages while office and local keep the full workflow", () => {
  assertListStatusHelpers();

  const listSelects = collectNodes(jobsSource, (node) => ts.isJsxElement(node)
    && node.openingElement.tagName.getText(jobsSource) === "select"
    && node.openingElement.getText(jobsSource).includes("updateStatus(job.id"));
  assert.equal(listSelects.length, 1, "Expected exactly one quick-status select");
  assert.equal(jsxAttributeExpression(listSelects[0], jobsSource, "value"), "jobCurrentStatus(job,fieldJobStatusRestricted)");
  assert.equal(jsxAttributeExpression(listSelects[0], jobsSource, "disabled"), "jobStatusLocked(job)");
  assertOnlyMappedOptions(
    listSelects[0],
    jobsSource,
    "jobStatusOptions(job).map((item)=><optionkey={item}>{item}</option>)",
  );
  assert.match(jobsPage, /jobStatusNotice\(job\)/);

  assert.equal(initializer(workspaceSource, workspacePath, "statusOptions"), "fieldJobStatusRestricted?[currentStatus,...fieldStatusTransitions]:canonicalJobStatuses");
  assert.equal(initializer(workspaceSource, workspacePath, "currentStatus"), "fieldJobStatusRestricted?normaliseFieldJobStatus(job.status):normaliseJobStatus(job.status)");
  assert.equal(initializer(workspaceSource, workspacePath, "statusControlLocked"), "jobStatusMutationDenied||(fieldJobStatusRestricted&&fieldStatusTransitions.length===0)");
  const workspaceSelects = collectNodes(workspaceSource, (node) => ts.isJsxElement(node)
    && node.openingElement.tagName.getText(workspaceSource) === "select"
    && node.openingElement.getText(workspaceSource).includes("disabled={statusControlLocked}"));
  assert.equal(workspaceSelects.length, 1, "Expected exactly one workspace status select");
  assert.equal(jsxAttributeExpression(workspaceSelects[0], workspaceSource, "disabled"), "statusControlLocked");
  assertOnlyMappedOptions(
    workspaceSelects[0],
    workspaceSource,
    "statusOptions.map((status)=><optionkey={status}value={status}>{status}</option>)",
  );
  assert.match(workspacePage, /Further lifecycle changes for this job require office review/);
});

test("dedicated field start actions remain inside the same approved Scheduled to First fix edge", () => {
  const startJob = functionNode(fieldSource, "app/field/page.tsx", "startJob");
  const legacyStatusHelper = functionNode(fieldSource, "app/field/page.tsx", "updateJobStatus");
  const helperTransitions = collectNodes(legacyStatusHelper.body, (node) => ts.isCallExpression(node)
    && node.expression.getText(fieldSource) === "transitionJobStatus");
  assert.equal(helperTransitions.length, 1);
  assertTransitionTarget(helperTransitions[0], fieldSource, "status");
  const helperJobWrites = collectNodes(legacyStatusHelper.body, (node) => ts.isCallExpression(node)
    && node.expression.getText(fieldSource) === "jobs.setItems");
  assert.equal(helperJobWrites.length, 1);
  assertJobsUpdater(helperJobWrites[0], fieldSource, "(current)=>current.map((item)=>item.id===jobId?result.job:item)");

  const startCalls = collectNodes(startJob.body, (node) => ts.isCallExpression(node)
    && node.expression.getText(fieldSource) === "updateJobStatus");
  assert.equal(startCalls.length, 1, "The field start handler must have one status mutation");
  assert.equal(startCalls[0].arguments.length, 2);
  assert.equal(startCalls[0].arguments[0].getText(fieldSource), "job.id");
  assert.ok(ts.isStringLiteral(startCalls[0].arguments[1]));
  assert.equal(startCalls[0].arguments[1].text, "First fix");
  const startGuard = nearestIfStatement(startCalls[0], startJob.body);
  assert.ok(startGuard);
  assert.equal(compact(startGuard.expression.getText(fieldSource)), "normaliseJobStatus(job.status)===\"Scheduled\"");
  assert.equal(collectNodes(startJob.body, (node) => ts.isCallExpression(node)
    && node.expression.getText(fieldSource) === "jobs.setItems").length, 0, "startJob must not bypass its status helper");

  const completion = functionNode(fieldSource, "app/field/page.tsx", "saveCompletionPack");
  const completionCalls = collectNodes(completion.body, (node) => ts.isCallExpression(node)
    && node.expression.getText(fieldSource) === "updateJobStatus");
  assert.equal(completionCalls.length, 1, "The local completion path must retain one status mutation");
  assert.equal(completionCalls[0].arguments[0].getText(fieldSource), "form.jobId");
  assert.ok(ts.isStringLiteral(completionCalls[0].arguments[1]));
  assert.equal(completionCalls[0].arguments[1].text, "Complete");
  const cloudCompletionGuard = completion.body.statements.find((statement) => ts.isIfStatement(statement)
    && compact(statement.expression.getText(fieldSource)) === "cloudFieldMode");
  assert.ok(cloudCompletionGuard, "Cloud completion must retain its fail-closed guard");
  assertGuardReturns(cloudCompletionGuard, "cloud completion guard");
  assert.ok(cloudCompletionGuard.end < completionCalls[0].getStart(fieldSource));
  assert.equal(collectNodes(fieldSource, (node) => ts.isCallExpression(node)
    && node.expression.getText(fieldSource) === "updateJobStatus").length, 2, "No other field status calls may be introduced");
  assert.equal(collectNodes(fieldSource, (node) => ts.isCallExpression(node)
    && node.expression.getText(fieldSource) === "jobs.setItems").length, 1, "All field job status writes must use the audited helper");

  const startEntry = functionNode(dayPlannerSource, "app/field/day-planner/page.tsx", "startEntry");
  const plannerTransitions = collectNodes(startEntry.body, (node) => ts.isCallExpression(node)
    && node.expression.getText(dayPlannerSource) === "transitionJobStatus");
  assert.equal(plannerTransitions.length, 1, "The day-planner start handler must have one job transition");
  assert.equal(plannerTransitions[0].arguments.length, 1);
  assert.ok(ts.isObjectLiteralExpression(plannerTransitions[0].arguments[0]));
  const nextStatuses = plannerTransitions[0].arguments[0].properties.filter((property) => ts.isPropertyAssignment(property)
    && property.name.getText(dayPlannerSource) === "nextStatus");
  assert.equal(nextStatuses.length, 1);
  assert.ok(ts.isStringLiteral(nextStatuses[0].initializer));
  assert.equal(nextStatuses[0].initializer.text, "First fix");
  const plannerGuard = nearestIfStatement(plannerTransitions[0], startEntry.body);
  assert.ok(plannerGuard);
  assert.equal(compact(plannerGuard.expression.getText(dayPlannerSource)), "job&&normaliseJobStatus(job.status)===\"Scheduled\"");
  const plannerJobWrites = collectNodes(startEntry.body, (node) => ts.isCallExpression(node)
    && node.expression.getText(dayPlannerSource) === "jobs.setItems");
  assert.equal(plannerJobWrites.length, 1);
  assert.strictEqual(nearestIfStatement(plannerJobWrites[0], startEntry.body), plannerGuard);
  assertJobsUpdater(plannerJobWrites[0], dayPlannerSource, "(current)=>current.map((item)=>item.id===job.id?result.job:item)");
  assert.equal(collectNodes(dayPlannerSource, (node) => ts.isCallExpression(node)
    && node.expression.getText(dayPlannerSource) === "transitionJobStatus").length, 1, "No other day-planner job transitions may be introduced");
});
