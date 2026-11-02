# Subscription reconciliation stage

Spec: docs/STRIPE_INTEGRATION_PLAN.md. Implement an unactivated one-event worker for standard subscription/invoice/Checkout lifecycle events, a current-provider reader and a strict payment-evidence reducer. Extend the existing unapplied billing migration in place: business reconciliation lease; atomic snapshot+event completion with token/expiry fences. No hosted changes, scheduler, Checkout enablement or runtime paid-feature gate.

- RED→GREEN tests for current subscription and genuine settled Stripe payment evidence, approved one-item catalog, period/customer/subscription matching, bounded trials and canceled/failed status. Manual/out-of-band, credits, partial/refunded/disputed payment and uncertain evidence require review; no extension from redirects or event payloads.
- Actual local SQL tests for per-business exclusion, lease expiry/reclaim, stale-token rejection and atomic snapshot+event completion. No snapshot can be moved to another bound business.
- Real SDK/local HTTP tests for current-provider object graph. Coordinator tests with actual local database and controlled external provider boundary; old events reconcile current state. Risk/credit-note events remain in manual review; automated risk decisions are not implemented and block launch.
- Full tests/lint/build and a fresh stage review. Publish draft PR327 only; webhook remains disabled and migration unapplied.

Ruling: only bounded standard paid invoices supported here. Unsupported settlement/proration/multiple-item configurations enter review, preserving existing bounded coverage rather than inventing entitlement. Cost: manual review for valid but unsupported billing configurations.

## Verification and review

- Evidence, current-provider reader, atomic SQL and coordinator tests observed RED before implementation. Lost-acquisition response and catalog-prototype regressions also reproduced RED and fixed GREEN.
- Fresh review found mixed customer-credit settlement could grant coverage and business contention could exhaust the failure budget. Both reproduced RED, fixed GREEN; added matching reported-versus-persisted failure-exhaustion coverage. No unresolved code findings.
- 54 focused billing/provider tests and all 2,913 repository tests passed; zero-warning ESLint and production Next.js build passed after fixes. Annual and monthly positive cases included.
- Database tests run real local Postgres WASM; SDK tests use local HTTP fixtures. Hosted grants/PostgREST/full chain, genuine multi-session locking and actual Stripe sandbox responses/delivery remain unverified. Automated risk review, scheduler, Checkout ownership and runtime entitlement gates are intentionally not activated; these remain launch blockers.
- The existing migration is still an unapplied draft, extended in place. No Supabase CLI command, hosted migration, secret provisioning or financial write was performed in this stage. Both activation flags remain false.
