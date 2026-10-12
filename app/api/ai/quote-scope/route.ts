import { createQuoteScopeHandler } from "../../../../lib/server/quoteScope.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const POST = createQuoteScopeHandler();
