# Durable sandbox Checkout start

Implement standard monthly/annual checkout start around the approved Stripe adapter. Keep feature flags off and no hosted changes. Add service-only reservation/customer-binding/session-recording RPCs to the existing unapplied migration, a one-business durable coordinator, and read/write provider adapters. Every external creation uses the persisted operation's idempotency key; unknown outcomes past a safe recovery window require review, not a fresh operation. Reuse known open sessions and only retire provider-confirmed expired sessions. Never grant access here.

RED→GREEN: actual local SQL for owner/tenant restrictions, unique open operations, lease fencing, customer binding, resume/expiry/review; real SDK/localHTTP contract tests for customer creation, subscription checks and session retrieval; coordinator tests for duplicate clicks, lost responses and retired owners. Full suite/lint/build and fresh review before updating draft PR327.

Ruling: no live activation or public purchase UI until hosted recovery and owner/financial acceptance checks pass. Ambiguous creation outcomes require review after 20 minutes; cost: occasional manual recovery rather than risking duplicate subscriptions.

## Verification and review

- Durable SQL, coordinator and SDK changes observed RED before GREEN; missing reservation-token regression also reproduced and fixed.
- Fresh review found known completed attempts permanently blocked signup after cancellation. Reproduced RED, then added current subscription-status verification and safe retirement; active subscriptions still block purchase and canceled/incomplete-expired ones can sign up again. Existing-provider subscription blocks without an owned Session close only that unneeded attempt, preventing a permanent review trap.
- 33 focused tests and all 2,947 repository tests passed after the fix. ESLint with zero warnings and production Next.js build passed. No unresolved code findings.
- No public HTTP route or UI activates the engine. Signed-owner authentication/revalidation, same-origin/body validation and intended-business binding must be supplied by that route. Hosted schema/roles/PostgREST/concurrent sessions and real Stripe responses remain unverified; service profile-read privileges must be checked before activation.
- Existing migration is an unapplied draft extended in place. No hosted changes, credentials, actual customers/Sessions, charges, VAT settings, emails or feature-flag changes occurred in this stage.
