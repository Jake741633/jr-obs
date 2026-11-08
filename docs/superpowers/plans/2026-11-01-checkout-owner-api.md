# Authenticated sandbox Checkout API

Connect the durable Checkout coordinator to a disabled-by-default POST /api/billing/checkout. Extract/reuse the existing normal owner verification from billing status; retain its signed user/RPC/intended-business checks and revalidate before provider mutations and URL return. Accept only monthly/annual plan selectors. Require server Checkout, receipt, worker and verified-sandbox flags plus validated sandbox configuration. No hosted configuration, actual provider request or purchase UI activation.

Tests RED→GREEN: actual local SQL/owner helper + controlled provider boundary for success, cross-origin/body spoofing, non-owner/cross-tenant/recovery/revoked sessions, revocation between steps, abort, duplicate clicks and fixed safe errors. Existing status API tests must stay green after extraction. Full suite/lint/build and fresh review before updating draft PR327.

Ruling: public purchase controls remain disabled until real hosted sandbox acceptance; the endpoint is off by default and cannot accept client flags. Cost: manual configuration/acceptance remains before purchases.

## Verification and review

- New API suite observed RED before implementation. Shared status verification retained all existing behavior tests. Seven new API scenarios use the actual local SQL/coordinator/store with latest owner helper definitions and a controlled external Stripe boundary.
- Fresh review found no blocking issue. Its disconnect coverage follow-up was exercised after reservation and after Session persistence: cancelled requests returned no URL; fresh requests reused exactly one durable Session. No unresolved code findings.
- 19 focused API/status/inventory tests and all 2,954 repository tests passed. Full ESLint passed with zero warnings; the added disconnect test file also passed a final targeted lint. Production Next.js build passed.
- No hosted configuration, migration, real provider call, credentials, charges, emails or VAT changes. All activation flags remain off; public payment UI still disabled. Hosted real timeout/disconnect/role/PostgREST/Stripe acceptance remains required before setting the sandbox-verified gate.

## Upgrade CI repair

The first remote CI run exposed a missing billing migration in the existing-data upgrade manifest. Both upgrade jobs stopped during their checksum/order preflight; the root verification job passed. Added the exact billing migration hash and latest target to the manifest. The earlier quote-total inventory check now finds its own entry rather than requiring it to remain the last migration. The main suite now executes the shared rehearsal preflight so omissions and stale hashes fail before deployment.

The new regression failed on the missing entry before the fix and passed afterward. The local embedded PostgreSQL 17.5 backup/restore and all 72 migrations passed: 134 baseline records, 125 unchanged, nine reviewed transformations, 48 public tables with RLS, and four rejected-baseline rollback checks. Full service CI is still required; no hosted migration or configuration changed.
