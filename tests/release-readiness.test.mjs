import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import * as review from "../lib/releaseReadiness.ts";
import { cloudCollectionStorageKeys } from "../lib/cloud/migrationStoragePolicy-core.mjs";

const reviewedAt = new Date("2026-09-27T12:00:00.000Z");
const completed = (mode) => review.releaseRequirements(mode).map((check) => review.releaseEvidence(mode, check, true, reviewedAt));

test("legacy completion flags cannot approve current requirements or supply their wording", () => {
  const old = [{ id: "ci", title: "Old instructions", detail: "Old instructions", complete: true }, { id: "mobile", complete: true }];
  const result = review.reconcileReleaseEvidence("cloud", old);
  assert.equal(result.filter((row) => row.complete).length, 0);
  assert.equal(result.length, review.releaseRequirements("cloud").length);
  assert.equal(result[0].title, "Exact release commit has passed its checks");
  assert.ok(result.some((row) => row.id === "production-backup"));
  assert.ok(result.some((row) => row.id === "iphone"));
  assert.ok(result.some((row) => row.id === "android"));
});

test("valid evidence restores only the current requirement confirmations", () => {
  const result = review.reconcileReleaseEvidence("migration", completed("migration"));
  assert.ok(result.every((row) => row.complete && row.reviewedAt === reviewedAt.toISOString()));
});

test("wording changes invalidate only affected evidence without needing a version bump", () => {
  const requirements = review.releaseRequirements("cloud");
  requirements[0] = { ...requirements[0], detail: "A newly required verification" };
  const result = review.reconcileReleaseEvidence("cloud", completed("cloud"), requirements);
  assert.equal(result[0].complete, false);
  assert.equal(result[0].reviewedAt, undefined);
  assert.ok(result.slice(1).every((row) => row.complete));
});

test("every mode transition requires fresh confirmations", () => {
  for (const from of ["local", "migration", "cloud"]) {
    for (const to of ["local", "migration", "cloud"]) {
      if (from !== to) assert.ok(review.reconcileReleaseEvidence(to, completed(from)).every((row) => !row.complete));
    }
  }
});

test("missing, malformed, duplicate and outdated evidence fails closed", () => {
  const valid = completed("cloud")[0];
  for (const saved of [null, {}, "bad", [null], [{ ...valid, reviewedAt: "not a date" }], [{ ...valid, reviewedAt: undefined }], [{ ...valid, complete: "true" }], [{ ...valid, requirement: "old-version" }], [valid, valid]]) {
    assert.ok(review.reconcileReleaseEvidence("cloud", saved).every((row) => !row.complete));
  }
});

test("unchecking a requirement removes the review timestamp", () => {
  const evidence = review.releaseEvidence("cloud", review.releaseRequirements("cloud")[0], false, reviewedAt);
  assert.equal(evidence.complete, false);
  assert.equal(evidence.reviewedAt, undefined);
  assert.equal(review.reconcileReleaseEvidence("cloud", [evidence])[0].complete, false);
});

test("the existing registered storage collection remains in use", () => {
  assert.equal(review.RELEASE_REVIEW_STORAGE_KEY, "jr-os-release-readiness-v0-1");
  assert.ok(cloudCollectionStorageKeys.includes(review.RELEASE_REVIEW_STORAGE_KEY));
});

test("cloud reviews distinguish production recovery and authorisation from a browser export", () => {
  for (const mode of ["migration", "cloud"]) {
    const checks = review.releaseRequirements(mode);
    const get = (id) => checks.find((row) => row.id === id).detail;
    assert.match(get("ci"), /tests, lint, TypeScript, production build, dependency audits/);
    assert.match(get("browser-backup"), /not a production database backup/);
    assert.match(get("production-backup"), /Auth, Storage metadata, grants, policies and migration history/);
    assert.match(get("production-backup"), /object bytes/);
    assert.match(get("production-backup"), /restore in an isolated full Supabase/);
    assert.match(get("production-authorisation"), /does not grant authorisation or apply migrations/);
    assert.match(get("hosted-security"), /live RLS and Storage/);
    assert.match(get("sync"), /pending edits, deletions, failed changes, conflicts/);
    for (const id of ["iphone", "android"]) {
      assert.match(get(id), /signed-out, office, field and customer/);
      assert.match(get(id), /Desktop emulation is not physical-device acceptance/);
    }
  }
  assert.equal(review.releaseRequirements("local").some((row) => row.id === "production-authorisation"), false);
  assert.match(review.releaseModeGuidance.local.detail, /stay in this browser/);
  assert.match(review.releaseModeGuidance.migration.detail, /does not prove/);
  assert.match(review.releaseModeGuidance.cloud.detail, /uses Supabase/);
});

function pageHarness(mode = "cloud", initial = [], ready = true) {
  let saved = initial;
  const writes = [];
  const commonJsModule = { exports: {} };
  const jsx = (type, props) => ({ type, props });
  const dependencies = {
    "react/jsx-runtime": { jsx, jsxs: jsx },
    "next/link": { default: "Link" },
    "lucide-react": {},
    "../../components/ui/Card": { Card: "Card" },
    "../../components/ui/PageHeader": { PageHeader: "PageHeader" },
    "../../lib/cloud/useCloudIdentity": { useCloudIdentity: () => ({ mode, isReady: ready }) },
    "../../lib/releaseReadiness": review,
    "../../lib/storage": { useLocalStorageCollection: (key) => {
      assert.equal(key, review.RELEASE_REVIEW_STORAGE_KEY);
      return { items: saved, isReady: ready, setItems(value) {
        saved = typeof value === "function" ? value(saved) : value;
        writes.push(saved);
      } };
    } },
  };
  const output = ts.transpileModule(readFileSync(new URL("../app/release-readiness/page.tsx", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(output, {
    exports: commonJsModule.exports, module: commonJsModule,
    require(name) { assert.ok(name in dependencies, name); return dependencies[name]; },
  });
  return { render: () => commonJsModule.exports.default(), saved: () => saved, writes };
}

function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!tree || typeof tree !== "object") return [];
  return [tree, ...nodes(tree.props?.children), ...nodes(tree.props?.action)];
}

test("page renders mode-specific guidance and never equates completed reviews with a verified release", () => {
  for (const mode of ["local", "migration", "cloud"]) {
    const h = pageHarness(mode, completed(mode));
    const tree = h.render();
    const rendered = JSON.stringify(tree);
    assert.ok(rendered.includes(review.releaseModeGuidance[mode].detail));
    assert.match(rendered, /Review recorded/);
    assert.doesNotMatch(rendered, /Ready to merge/);
    assert.match(rendered, /Manual confirmations do not run tests/);
    assert.match(rendered, /Phone installation instructions/);
    assert.equal(nodes(tree).filter((node) => node.props?.["aria-pressed"] === true).length, completed(mode).length);
    assert.equal(h.writes.length, 0, "reading outdated or current evidence must not rewrite stored records");
  }
});

test("page toggles persist versioned evidence, survive a rerender and reset", () => {
  const old = { id: "ci", complete: true, title: "Obsolete" };
  const h = pageHarness("cloud", [old]);
  const toggle = () => nodes(h.render()).find((node) => node.type === "button" && "aria-pressed" in node.props);
  assert.equal(toggle().props["aria-pressed"], false);
  toggle().props.onClick();
  assert.equal(toggle().props["aria-pressed"], true);
  assert.equal(h.saved().length, 1);
  assert.equal(h.saved()[0].title, undefined);
  assert.ok(h.saved()[0].requirement);
  assert.ok(h.saved()[0].reviewedAt);
  toggle().props.onClick();
  assert.equal(toggle().props["aria-pressed"], false);
  const reset = nodes(h.render()).find((node) => node.type === "button" && JSON.stringify(node.props.children).includes("Reset confirmations"));
  reset.props.onClick();
  assert.equal(h.saved().length, 0);
});

test("unresolved identity never displays saved completion claims", () => {
  const tree = pageHarness("cloud", completed("cloud"), false).render();
  assert.match(JSON.stringify(tree), /Preparing release checklist/);
  assert.doesNotMatch(JSON.stringify(tree), /Review recorded/);
});
