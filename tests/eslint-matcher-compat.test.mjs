import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import test from "node:test";
import { ESLint } from "eslint";

const require = createRequire(import.meta.url);

test("real React and import rules retain callable glob matching while ESLint and TypeScript consumers retain their matcher APIs", async () => {
  const eslint = new ESLint({
    overrideConfigFile: true,
    overrideConfig: [{
      files: ["**/matcher-{allowed,rejected}.jsx"],
      languageOptions: { ecmaVersion: "latest", sourceType: "module", parserOptions: { ecmaFeatures: { jsx: true } } },
      plugins: { react: require("eslint-plugin-react"), import: require("eslint-plugin-import") },
      rules: {
        "react/jsx-pascal-case": ["error", { ignore: ["Legacy_*"] }],
        "import/no-unassigned-import": ["error", { allow: ["@styles/**"] }],
      },
    }],
  });
  const [allowed] = await eslint.lintText('import "@styles/base.css"; export default () => <><Legacy_widget /><NormalWidget /></>;', { filePath: "app/matcher-allowed.jsx" });
  assert.deepEqual(allowed.messages, []);
  const [rejected] = await eslint.lintText('import "@runtime/setup"; export default () => <Bad_widget />;', { filePath: "app/matcher-rejected.jsx" });
  assert.deepEqual(rejected.messages.map(message => message.ruleId).sort(), ["import/no-unassigned-import", "react/jsx-pascal-case"]);
  assert.equal(rejected.fatalErrorCount, 0);

  const eslintRequire = createRequire(require.resolve("eslint"));
  const { Minimatch } = eslintRequire("minimatch");
  const matcher = new Minimatch("app/{quotes,jobs}/*.tsx", { dot: true });
  assert.equal(matcher.match("app/quotes/page.tsx"), true);
  assert.equal(matcher.match("app/jobs/.draft.tsx"), true);
  assert.equal(matcher.match("app/invoices/page.tsx"), false);
  assert.equal(matcher.match("app/quotes/nested/page.tsx"), false);

  const typeScriptRequire = createRequire(require.resolve("@typescript-eslint/typescript-estree"));
  const { minimatch } = typeScriptRequire("minimatch");
  assert.equal(minimatch("config/.eslintrc.js", "config/*", { dot: true }), true);
  assert.equal(minimatch("config/.eslintrc.js", "config/*"), false);
  assert.equal(minimatch("src/page.tsx", "config/*", { dot: true }), false);
});


test("real import internal-module rules preserve compiled allow and forbid pattern matching", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "jr-os-import-matcher-"));
  try {
    for (const directory of ["public", "private"]) {
      mkdirSync(path.join(root, directory));
      writeFileSync(path.join(root, directory, "api.js"), "export const value = 1;");
    }
    for (const options of [{ allow: ["public/**"] }, { forbid: ["private/**"] }]) {
      const eslint = new ESLint({
        cwd: root,
        overrideConfigFile: true,
        overrideConfig: [{
          files: ["**/*.js"],
          languageOptions: { ecmaVersion: "latest", sourceType: "module" },
          plugins: { import: require("eslint-plugin-import") },
          settings: { "import/resolver": { node: { extensions: [".js"] } } },
          rules: { "import/no-internal-modules": ["error", options] },
        }],
      });
      const [allowed] = await eslint.lintText('import { value } from "./public/api.js";', { filePath: path.join(root, "entry.js") });
      assert.deepEqual(allowed.messages, []);
      const [mixed] = await eslint.lintText('import { value } from "./public/api.js";\nimport { value as secret } from "./private/api.js";', { filePath: path.join(root, "entry.js") });
      assert.equal(mixed.fatalErrorCount, 0);
      assert.deepEqual(mixed.messages.map(message => [message.ruleId, message.line]), [["import/no-internal-modules", 2]]);
      assert.match(mixed.messages[0].message, /private\/api\.js/);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
