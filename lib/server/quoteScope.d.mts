export function createQuoteScopeHandler(options?: { env?: Record<string, string | undefined>; fetchImpl?: typeof fetch; now?: () => number }): (request: Request) => Promise<Response>;
