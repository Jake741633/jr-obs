import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { canAccessPath } from "../lib/cloud/permissions.ts";

const workspace = readFileSync(new URL("../app/jobs/[id]/workspace/page.tsx", import.meta.url), "utf8");

function section(source, startText, endText) {
  const start = source.indexOf(startText);
  assert.ok(start >= 0, `Missing section start: ${startText}`);
  const end = source.indexOf(endText, start);
  assert.ok(end > start, `Missing section end: ${endText}`);
  return source.slice(start, end);
}

const quickActions = section(
  workspace,
  '<p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">On-site workspace</p>',
  '<div className="flex items-end justify-between gap-3">',
);
const fieldBranch = section(quickActions, "{fieldWorkspace ? <>", "</> : <>");
const nonFieldBranch = section(quickActions, "</> : <>", "</>}");

test("job workspace detects an authenticated cloud electrician", () => {
  assert.match(workspace, /const identityState = useCloudIdentity\(\)/);
  assert.match(
    workspace,
    /const fieldWorkspace = identityState\.mode !== "local" && identityState\.identity\?\.role === "electrician"/,
  );
});

test("every electrician quick action targets a permitted field route", () => {
  const expected = [
    ["/field/snags", "Snags"],
    ["/field/site-diary", "Site diary"],
    ["/jobs/job-1", "Job record & documents"],
    ["/field/testing", "Testing"],
  ];
  for (const [path, label] of expected) {
    assert.equal(canAccessPath("electrician", path), true, `${path} must remain electrician-accessible`);
    if (path === "/jobs/job-1") {
      assert.match(fieldBranch, /quickLink\(`\/jobs\/\$\{jobId\}`, "Job record & documents"/);
    } else {
      assert.match(fieldBranch, new RegExp(`quickLink\\("${path.replaceAll("/", "\\/")}", "${label}"`));
    }
  }
});

test("field quick actions do not advertise guarded office routes", () => {
  for (const path of ["/job-tasks", "/site-management", "/job-finance"]) {
    assert.equal(canAccessPath("electrician", path), false);
    assert.doesNotMatch(fieldBranch, new RegExp(path.replaceAll("/", "\\/")));
  }
  assert.doesNotMatch(fieldBranch, /\?job=/);
  assert.match(
    quickActions,
    /Variations and job financials remain office-managed\. Use the dedicated field workflows above for assigned-job work\./,
  );
});

test("owner, admin and local quick actions retain the full workspace", () => {
  for (const path of ["/job-tasks", "/site-management", "/job-finance"]) {
    assert.match(nonFieldBranch, new RegExp(path.replaceAll("/", "\\/")));
  }
  assert.match(nonFieldBranch, /"Tasks & snagging"/);
  assert.match(nonFieldBranch, /"Variations"/);
  assert.match(nonFieldBranch, /"Job financials"/);
});

test("field workspace back actions return electricians to field job control", () => {
  assert.equal(canAccessPath("electrician", "/field/jobs"), true);
  const missingJobBack = section(workspace, "if (!job) return <main", "const currentJob = job;");
  const workspaceBack = section(workspace, 'return <main className="space-y-6 pb-28">', '<Card className="border-cyan-500/25">');

  assert.match(missingJobBack, /href=\{fieldWorkspace \? "\/field\/jobs" : "\/jobs"\}/);
  assert.match(missingJobBack, /className="inline-flex min-h-12/);
  assert.match(missingJobBack, /\{fieldWorkspace \? "Back to field jobs" : "Back to jobs"\}/);

  assert.match(workspaceBack, /href=\{fieldWorkspace \? "\/field\/jobs" : `\/jobs\/\$\{jobId\}`\}/);
  assert.match(workspaceBack, /className="inline-flex min-h-12/);
  assert.match(workspaceBack, /\{fieldWorkspace \? "Back to field jobs" : "Back to job record"\}/);
  assert.doesNotMatch(workspaceBack, /min-h-11/);
});
