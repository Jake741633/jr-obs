# Stripe provider boundary stage

Spec: docs/STRIPE_INTEGRATION_PLAN.md. Implement first server-provider building block with actual pinned Stripe SDK. Use approved sandbox catalog only; no live-mode execution, runtime Checkout routes or paid access changes until durable business bindings, operation locking, webhook inbox and enforcement exist.

1. Tests RED then GREEN: server configuration rejects missing/invalid secrets, live mode/key mismatches, non-HTTPS origins, unapproved account/price IDs and reused IDs. No secret values in thrown errors.
2. Tests RED then GREEN: real SDK outbound request serialization against a local HTTP fixture server. Validate account and Price catalog; allow only monthly/annual known business plans, quantity one, approved origin, no metadata ownership or client-supplied arbitrary prices/URLs. Checkout only standard monthly/annual in this stage; founding discount fails closed until durable eligibility exists. Caller must supply trusted customer binding and durable operation ID; stable request idempotency per operation. Portal URL validation and webhook raw-body signature/mode checks. Provider errors mapped to fixed safe errors.
3. Full suite/lint/build, one fresh-context review of whole changed branch, address important findings, record exact verification and publish to existing draft PR327.

Review focus: secret exposure, mode/account/product confusion, pricing spoofing, arbitrary redirects, duplicate requests, discount eligibility, webhook forgery, malformed provider responses and unsafe claims of payment confirmation. Tests emulate provider network only; hosted sandbox acceptance remains required.

## Verification completed

- Twelve focused provider tests pass using the real SDK and a local HTTP fixture server. Initial missing-module RED and subsequent coercion/quantity-transform/retry regressions were observed before GREEN.
- Fresh review identified missing connected-account/context rejection. A signed cross-account regression failed, the verifier was fixed, and all 12 focused tests plus all 2,871 repository tests passed.
- Zero-warning ESLint and production Next.js build passed after the review fix. No hosted Stripe calls, secret provisioning, database migrations or runtime access changes were made in this stage.
- Review's deferred boundaries (owner authentication, bindings/locks, inbox/reconciliation/entitlements, real key permissions/Portal setup, hosted acceptance/tax/live activation) are deliberately not claimed complete. These remain required before enabling public billing. Existing JR access remains unchanged.
