import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const sourcePath = new URL("./supabase-rls.integration.mjs", import.meta.url);
const source = readFileSync(sourcePath, "utf8");

const obsoleteSnippet = `    // Session revocation: admin logout invalidates refresh-token reuse.\n    const revokeResult = await service(\`/auth/v1/admin/users/\${accounts.B.electrician.id}/logout\`, { method: "POST", body: { scope: "global" } });\n    await expectAllowed(revokeResult, "Admin should revoke a user session");`;

const supportedSnippet = `    // Session revocation: global sign-out invalidates the authenticated user's refresh tokens.\n    const revokeResult = await request("/auth/v1/logout?scope=global", {\n      method: "POST",\n      accessToken: accounts.B.electrician.accessToken,\n    });\n    await expectAllowed(revokeResult, "Authenticated user should globally revoke their session");`;

const occurrences = source.split(obsoleteSnippet).length - 1;
if (occurrences !== 1) {
  throw new Error(`Expected exactly one obsolete Supabase logout snippet, found ${occurrences}`);
}

const temporaryDirectory = mkdtempSync(join(tmpdir(), "jr-os-rls-"));
const temporaryTest = join(temporaryDirectory, "supabase-rls.integration.mjs");

try {
  writeFileSync(temporaryTest, source.replace(obsoleteSnippet, supportedSnippet), "utf8");
  const result = spawnSync(process.execPath, ["--test", temporaryTest], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });

  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
