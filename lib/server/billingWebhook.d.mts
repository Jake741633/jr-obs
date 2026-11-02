export function createBillingWebhookHandler(options?: {env?: Record<string,string|undefined>;fetchImpl?: typeof globalThis.fetch}): (request: Request) => Promise<Response>;
