import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const client = await readFile(new URL("../lib/supabase/client.ts", import.meta.url), "utf8");

test("unreachable Supabase requests produce an actionable cloud-service error", () => {
  assert.match(
    client,
    /const cloudServiceUnavailableMessage = "JR OS cloud service is unavailable\. Check your connection and confirm the Supabase project is active, then try again\.";/,
  );
  assert.match(
    client,
    /let response: Response;\s*try \{\s*response = await fetch\([\s\S]*?\);\s*\} catch \{\s*throw new Error\(cloudServiceUnavailableMessage\);\s*\}/,
  );
});

test("HTTP responses still retain Supabase's specific error message", () => {
  const networkErrorBoundary = client.indexOf("throw new Error(cloudServiceUnavailableMessage);");
  const responseParsing = client.indexOf("const body = response.status === 204");
  const apiErrorMessage = client.indexOf("body?.msg || body?.message || body?.error_description || body?.error");

  assert.ok(networkErrorBoundary !== -1 && networkErrorBoundary < responseParsing);
  assert.ok(responseParsing !== -1 && responseParsing < apiErrorMessage);
});

test("configuration and session checks still run before network access", () => {
  const fetchSource = client.slice(client.indexOf("export async function supabaseFetch"));
  const configurationCheck = fetchSource.indexOf('if (!config) throw new Error("Supabase is not configured yet.");');
  const sessionCheck = fetchSource.indexOf("const session = readSupabaseSession();");
  const networkRequest = fetchSource.indexOf("response = await fetch(");

  assert.ok(configurationCheck !== -1 && configurationCheck < sessionCheck);
  assert.ok(sessionCheck < networkRequest);
});
