import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import * as signals from "../lib/assistantSignals-core.mjs";
import * as identity from "../lib/assistantIdentity.ts";

const mod = { exports: {} };
vm.runInNewContext(ts.transpileModule(readFileSync(new URL("../lib/assistantQuotes.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
  { module: mod, exports: mod.exports, Date, require(name) { return { "./assistantIdentity": identity, "./assistantSignals-core.mjs": signals }[name]; } });
const { assistantQuoteSnapshot } = mod.exports;
const now = new Date(2026, 9, 10, 10);
const quote = (patch = {}) => ({ id: "q1", type: "Quote", status: "Sent", title: "Workshop", number: "Q-1", validUntil: "2026-11-01", updatedAt: "2026-10-01T10:00:00Z", ...patch });
const snapshot = (documents, options = {}, jobs = []) => assistantQuoteSnapshot(documents, jobs, now, options);

test("quote identities are checked across estimates and closed statuses before advice", () => {
  for (const patch of [{ type: "Estimate" }, { status: "Draft" }, { status: "Accepted" }, { status: "Declined" }, { status: "Expired" }]) {
    const result = snapshot([quote(), quote(patch)], { followUpsOnly: true });
    assert.equal(result.followUpCount, 0); assert.equal(result.reviewCount, 1); assert.equal(result.actions.length, 1);
    assert.equal(result.actions[0].href, "/quotes"); assert.match(result.actions[0].reason, /2 loaded pricing documents/);
    assert.match(result.warnings[0], /count is incomplete/); assert.ok(!result.actions.some(a => a.id.startsWith("follow-up:") || a.id.startsWith("convert:")));
  }
});

test("missing quote identities are grouped for review and never used in a record link", () => {
  const result = snapshot([quote({ id: "" }), quote({ id: "   " }), quote({ id: undefined }), quote({ id: null })]);
  assert.equal(result.actions.length, 1); assert.equal(result.reviewCount, 1); assert.equal(result.followUpCount, 0);
  assert.equal(result.actions[0].href, "/quotes"); assert.match(result.actions[0].reason, /identities are missing/);
});

test("closed-only quote conflicts and standalone estimates do not manufacture chase reviews", () => {
  const result = snapshot([quote({ status: "Declined" }), quote({ status: "Expired" }), quote({ id: "draft", status: "Draft" }), quote({ id: "estimate", type: "Estimate" })]);
  assert.equal(result.actions.length, 0); assert.equal(result.reviewCount, 0);
});

test("accepted duplicate quotes never recommend conversion", () => {
  const result = snapshot([quote({ status: "Accepted" }), quote({ type: "Estimate", status: "Draft" })]);
  assert.equal(result.actions.length, 1); assert.ok(result.actions[0].id.startsWith("quote-source:"));
  assert.equal(snapshot([quote({ status: "Accepted" })]).actions[0].id, "convert:q1");
  assert.equal(snapshot([quote({ status: "Accepted" })], { followUpsOnly: true }).actions.length, 0);
});

test("job-side and snapshot links suppress conversion while explicit quote ownership wins scope", () => {
  for (const link of [{ sourceQuoteId: "q1" }, { quoteSnapshot: { quoteId: "q1" } }]) {
    const jobs = [{ id: "job", ...link }];
    assert.equal(snapshot([quote({ status: "Accepted" })], {}, jobs).actions.length, 0);
    assert.equal(snapshot([quote()], { jobId: "job" }, jobs).followUpCount, 1);
    assert.equal(snapshot([quote({ jobId: "elsewhere" })], { jobId: "job" }, jobs).actions.length, 0);
  }
});

test("scoped quote reviews detect other-job conflicts without exposing their evidence", () => {
  const result = snapshot([quote({ jobId: "job" }), quote({ jobId: "other", type: "Estimate", title: "Private other job details" })], { jobId: "job" });
  assert.equal(result.reviewCount, 1); assert.equal(result.followUpCount, 0);
  assert.match(result.actions[0].reason, /2 loaded/); assert.doesNotMatch(JSON.stringify(result), /Private other job details/);
  assert.deepEqual(Array.from(result.actions[0].jobIds), ["job"]);
});

test("same titles and document numbers with distinct saved identities remain independent", () => {
  const result = snapshot([quote(), quote({ id: "q2" })], { followUpsOnly: true });
  assert.equal(result.followUpCount, 2); assert.equal(result.reviewCount, 0); assert.equal(result.actions.length, 2);
});

test("invalid agreed contact dates cannot fall back to the default reminder or expiry", () => {
  for (const nextFollowUpDate of ["invalid", "2026-02-30", "2026-10-10T00:00:00Z", "   "]) {
    const result = snapshot([quote({ nextFollowUpDate, validUntil: "2026-10-01" })], { followUpsOnly: true });
    assert.equal(result.followUpCount, 0); assert.equal(result.reviewCount, 1);
    assert.match(result.actions[0].reason, /agreed follow-up date is invalid/);
  }
});

test("invalid pricing validity withholds follow-up while missing expiry is allowed", () => {
  const result = snapshot([quote({ validUntil: "2026-02-30", nextFollowUpDate: "2026-10-10" })]);
  assert.equal(result.followUpCount, 0); assert.match(result.actions[0].reason, /pricing validity is unknown/);
  assert.equal(snapshot([quote({ validUntil: "" })]).followUpCount, 1);
});

test("missing, future and rolled-over last contact timestamps require evidence review", () => {
  for (const updatedAt of ["", "not-a-date", undefined, "2026-02-30T10:00:00Z", "2026-10-12T10:00:00Z", 123]) {
    const result = snapshot([quote({ updatedAt })]);
    assert.equal(result.followUpCount, 0); assert.equal(result.reviewCount, 1);
    assert.match(result.actions[0].reason, /timing is unknown/);
  }
  assert.equal(snapshot([quote({ lastFollowUpAt: "invalid" })]).reviewCount, 1);
});

test("a valid saved contact schedule takes precedence over the default timestamp", () => {
  assert.equal(snapshot([quote({ updatedAt: "invalid", nextFollowUpDate: "2026-10-10" })]).followUpCount, 1);
  const future = snapshot([quote({ updatedAt: "invalid", nextFollowUpDate: "2026-10-12" })]);
  assert.equal(future.actions.length, 0); assert.equal(future.reviewCount, 0);
});

test("expired pricing and due follow-ups stay distinct when customer contact was deferred", () => {
  const saved = quote({ validUntil: "2026-10-08", nextFollowUpDate: "2026-10-12" });
  assert.equal(snapshot([saved], { followUpsOnly: true }).actions.length, 0);
  const result = snapshot([saved]); assert.equal(result.followUpCount, 0); assert.equal(result.actions.length, 1);
  assert.match(result.actions[0].title, /Review expired quote/); assert.match(result.actions[0].nextStep, /keep any future follow-up/);
});

test("recent explicit contact suppresses default chasing even close to expiry", () => {
  const lastFollowUpAt = new Date(now.getTime() - 3600000).toISOString();
  const result = snapshot([quote({ lastFollowUpAt, validUntil: "2026-10-11" })]);
  assert.equal(result.followUpCount, 0); assert.equal(result.actions.length, 0);
});

test("unknown quote status remains reviewable without contact or conversion claims", () => {
  const result = snapshot([quote({ status: "Legacy" })], { followUpsOnly: true });
  assert.equal(result.followUpCount, 0); assert.equal(result.reviewCount, 1);
  assert.match(result.actions[0].reason, /status is missing or unsupported/);
  assert.match(result.actions[0].nextStep, /No customer contact is recommended/);
});

test("literal encoded quote links are bounded and oversized identities use the inbox", () => {
  assert.equal(snapshot([quote({ id: "q /?#" })]).actions[0].href, "/quotes/q%20%2F%3F%23");
  const result = snapshot([quote({ id: "q".repeat(301) })]).actions[0];
  assert.equal(result.href, "/quotes"); assert.equal(result.actionLabel, "Review quote inbox");
});

test("quote snapshots are immutable, order-independent and refresh after a conflict is resolved", () => {
  const docs = [Object.freeze(quote()), Object.freeze(quote({ status: "Declined" }))]; Object.freeze(docs);
  const before = JSON.stringify(docs);
  assert.deepEqual(snapshot(docs), snapshot(docs.toReversed())); assert.equal(JSON.stringify(docs), before);
  const recovered = snapshot([docs[0]]); assert.equal(recovered.reviewCount, 0); assert.equal(recovered.followUpCount, 1);
});
