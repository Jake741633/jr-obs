# Billing persistence stage

Spec: docs/STRIPE_INTEGRATION_PLAN.md. Add sandbox service-owned customer bindings, subscription snapshots, pending operations and a durable webhook inbox. No hosted migration, runtime paywall, payments or public Checkout.

- Test and implement actual SQL using pinned PGlite (Postgres WASM) locally: denied browser reads/writes/RPCs; exact sandbox/account scope; tenant/customer/subscription foreign keys; unique pending Checkout; duplicate events; leases, crash reclaim, stale completion and retry/review outcomes.
- Add a disabled-by-default webhook HTTP handler: SDK raw signature verification before durable RPC receipt, bounded body, supported events only, safe errors and retryable persistence failure. No fulfillment or entitlement changes.
- Run focused RED/GREEN, all repository tests, lint and build. Fresh review of this stage; fix important findings. Publish to existing draft PR327; keep migration unapplied.

Ruling: CLI scaffold file was generated before auto-review blocked telemetry. Use that generated local file; do not rerun CLI or telemetry. Local Postgres tests cannot prove hosted Supabase schema/auth/permissions; hosted verification remains required before activation.
Review focus: RLS/grants, cross-business FK binding, duplicate pending operations, event idempotency, lease token fencing, crashes, forged/oversized events, service-key leakage, false success on storage failure. Only durable receipt is implemented; current-provider reconciliation remains required before granting paid access.

## Completed verification

- Migration and webhook tests observed RED before implementation. Additional missing-interval/crash-budget regressions observed RED and fixed; focused tests pass (9 database, 7 webhook, 7 API security inventory).
- Full suite: 2,887 tests passed. Initial full-suite route inventory failure was resolved by explicitly registering the new webhook route in its security inventory. ESLint with zero warnings and production Next.js build passed after the review fix.
- Fresh review found upstream empty/oversized RPC responses were misclassified as bad inbound webhooks. Treated as a required protocol correction: persistence failure must return retryable 503. New cases reproduced RED, fixed GREEN, then the full suite/lint/build passed. No deferred code findings.
- Hosted Supabase/PostgREST, true multi-session locking, complete migration recovery, provider-state reconciliation/atomic coverage fencing, risk actions, Checkout recovery and real Stripe delivery are deferred. This receipt-only stage cannot grant access and remains disabled. No hosted migrations or billing configuration changes were made.
- Changelog reviewed: recent database upgrade notes do not affect these built-in types/functions; explicit grants handle the Data API default-privilege change. Local catalog tests verify service-only execution and RLS. Hosted security-advisor checks remain required before activation.
