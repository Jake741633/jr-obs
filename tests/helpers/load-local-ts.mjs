import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import ts from "typescript";

// Execute the real local dependency graph; no browser, network or external API.
export function loadLocalTs(url) {
  const cache = new Map();
  function load(path) {
    if (cache.has(path)) return cache.get(path).exports;
    const mod = { exports: {} }; cache.set(path, mod);
    const source = ts.transpileModule(readFileSync(path, "utf8"), { fileName: path.replace(/\.(mjs|js)$/, ".ts"), compilerOptions: { allowJs: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    const require = name => {
      if (!name.startsWith(".")) throw new Error(`Unexpected dependency: ${name}`);
      const candidate = resolve(dirname(path), name);
      const resolved = [candidate, ...[".ts", ".tsx", ".mjs", ".js"].map(extension => candidate + extension)].find(existsSync);
      if (!resolved) throw new Error(`Missing dependency: ${name}`);
      return load(resolved);
    };
    vm.runInNewContext(source, { module: mod, exports: mod.exports, require, URL, Date, Error, structuredClone }, { filename: path });
    return mod.exports;
  }
  return load(fileURLToPath(url));
}
