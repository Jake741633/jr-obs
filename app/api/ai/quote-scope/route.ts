import { createQuoteScopeHandler } from "../../../../lib/server/quoteScope.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const POST = createQuoteScopeHandler({
  deployment: { url: process.env.JR_OS_DEPLOY_URL, alias: process.env.JR_OS_DEPLOY_PRIME_URL },
});
