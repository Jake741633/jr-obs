import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { ESLint } from "eslint";

const require = createRequire(import.meta.url);
const pluginRequire = createRequire(require.resolve("@next/eslint-plugin-next"));
const { getRootDirs } = pluginRequire("./utils/get-root-dirs.js");

test("Next lint root discovery keeps directory, wildcard, brace and array behavior", () => {
  const root = mkdtempSync(path.join(tmpdir(), "jr-os-lint-roots-"));
  try {
    const apps = path.join(root, "apps");
    for (const name of ["one", "two"]) mkdirSync(path.join(apps, name), { recursive: true });
    writeFileSync(path.join(apps, "not-a-directory"), "");
    // tinyglobby returns cwd-relative paths for absolute patterns. Next passes
    // them to filesystem operations, so compare the effective directories.
    const resolve = (rootDir) => getRootDirs({ cwd: root, settings: { next: { rootDir } } }).map((dir) => path.resolve(dir)).sort();
    const expected = [path.join(apps, "one"), path.join(apps, "two")];
    assert.deepEqual(getRootDirs({ cwd: root, settings: {} }), [root]);
    assert.deepEqual(resolve(`${apps}/*`), expected);
    assert.deepEqual(resolve(`${apps}/{one,two}`), expected);
    assert.deepEqual(resolve([`${apps}/one`, null, `${apps}/two`]), expected);
    assert.deepEqual(resolve(`${apps}/missing*`), []);
    assert.deepEqual(resolve(`${apps}/one`.replace(/\//g, "\\")), [path.join(apps, "one")]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("real Next lint rule still discovers pages through the replacement glob", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "jr-os-lint-rule-"));
  try {
    const pages = path.join(root, "apps", "website", "pages");
    mkdirSync(pages, { recursive: true });
    writeFileSync(path.join(pages, "about.js"), "export default function About() { return null; }");
    const eslint = new ESLint({ overrideConfig: [{ settings: { next: { rootDir: `${root}/apps/*` } } }] });
    const [result] = await eslint.lintText('export default function Example() { return <a href="/about/">About</a>; }', { filePath: "app/lint-glob-probe.tsx" });
    assert.ok(result.messages.some((message) => message.ruleId === "@next/next/no-html-link-for-pages"), JSON.stringify(result.messages));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
