# Billing portal and phone actions implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan inline, then obtain one fresh review.

**Goal:** Let a current business owner open authenticated sandbox Checkout or a fresh Stripe billing portal from the phone billing screen, only after explicit server readiness gates pass.

**Architecture:** Continue the accepted hosted Checkout/Customer Portal approach in `docs/STRIPE_INTEGRATION_PLAN.md`. The signed owner verifier remains authoritative; service-only RPCs resolve the bound customer and reserve a short portal attempt. No browser-supplied customer, price, role, operation or return URL is accepted. The status response exposes capability booleans, never provider identifiers.

**Tech stack:** Existing Next.js/React, pinned Stripe 23.1.0/API 2026-10-28.endive, Supabase SQL and local PGlite fixtures. No new dependencies.

**Spec:** `docs/STRIPE_INTEGRATION_PLAN.md` sections Checkout/portal, access and acceptance; `docs/SUBSCRIPTIONS.md` owner billing screen and launch requirements.

## Global constraints

- Retain £29/month and £290/year; founder eligibility is still unimplemented and cannot be selected in Checkout.
- All public activation flags remain false; hosted migration, secrets, portal configuration and real provider acceptance remain outstanding.
- Only exact sandbox account `acct_1UWyMhRxGUITlJWL`; no live payments, subscription mutations, invoice emails, VAT changes or hosted SQL.
- Portal configuration must be dedicated/nondefault and treated as immutable after links are issued; active/test, enable invoice history/card changes and cancellation at period end with no prorations, and disable plan updates and subscription pause. Request an expanded configuration on Session creation and validate the attached settings again with the same validator; an ID-only response fails closed. Validate the returned customer/return URL and exact Stripe host.
- Persist only portal attempt/session identifiers, never the short-lived bearer URL. Each new request after a completed/failed/expired attempt obtains a fresh link; a pending 60-second lease returns busy. Provider SDK retries reuse that attempt's key. A retry can create a second authorized portal link; it cannot create a second subscription.
- Existing unapplied CLI-generated billing migration may be edited; update its manifest hash and rerun upgrade checks. Do not rerun the rejected CLI scaffold/telemetry operation.

## Review focus

- Role/session changes or disconnects between reservation, provider creation and response must never release a URL.
- A wrong tenant/customer or stale lease cannot record a portal attempt.
- A Dashboard configuration change must not silently enable plan changes, pause or immediate cancellation.
- Duplicate phone taps and late responses after account switching must not redirect or reveal another account's state.
- Checkout's browser return remains pending; redirects never grant subscription access.

### Task 1: Authenticated portal API

**Files:** `lib/server/billingPortal.mjs`, `.d.mts`, `app/api/billing/portal/route.ts`, `lib/server/stripeBilling.mjs`, existing unapplied billing migration and upgrade manifest, `.env.example`, `tests/billing-portal-api.test.mjs`, `tests/stripe-provider.test.mjs`, route inventory.

**Interfaces:** Export `createBillingPortalHandler(options)` with the existing environment/deployment/fetch/gateway injection shape. Body is exactly `{}`. Reserve/finish service RPCs accept server-verified actor/business and a current lease; return a bounded trusted operation. Success is `{mode:'test',sessionId:'bps_…',url:'https://billing.stripe.com/…'}`. Never persist or return a URL before durable successful completion and final normal-owner revalidation.

- [x] Write/run RED tests using the real owner SQL, service RPCs and controlled external Stripe boundary: normal owner/binding, unknown binding, browser RPC denial, cross-business/staff/recovery/revocation, strict body/origin, busy/stale/expired leases, provider/config mismatches, safe errors and aborted requests.
- [x] Implement service-only portal reservation/completion, gated handler and strict provider configuration validation. Add the exact route to the security inventory and private disabled portal flag. Refresh the migration checksum.
- [x] Run focused tests and embedded upgrade rehearsal; expected all pass. Commit this task locally.

### Task 2: Server capabilities and phone actions

**Files:** `lib/server/billingStatus.mjs`, billing status client/types, `lib/billingActionsClient.mjs`, `.d.mts`, billing page/panel and status/action/UI tests.

**Interfaces:** Status adds strict booleans `checkoutAvailable` and `portalAvailable`. Both need validated private sandbox configuration, service credentials, webhook/reconciliation/verified-sandbox gates and their specific enabled flag. Portal also needs an own-business customer binding; Checkout requires no current nonterminal subscription. `createOwnerBillingActions({owner,isCurrent,navigate,fetchImpl})` exposes one in-flight `run('monthly'|'annual'|'portal')` and `cancel()`; it accepts only exact validated provider redirects, sends the minimal fixed request, discards stale responses and returns fixed safe outcome codes.

- [x] Write/run RED tests for disabled/incomplete readiness, active and ended subscriptions, late body resolution, wrong provider URL/mode, double taps, cancellation and switched identity. Render actual phone panel to check enabled/disabled controls and progress/error states.
- [x] Implement capability projection, action client and large monthly/annual/manage buttons. Keep setup messaging when capabilities are off; distinguish checkout-pending return without treating it as payment proof.
- [x] Run focused tests, root suite, lint, build and embedded upgrade rehearsal; expected all pass. Review the whole stage with one fresh reviewer, fix important findings with regression tests, then update draft PR327 and verify remote CI/preview. No merge or activation.


## Verification and fresh review

- The CI manifest omission was reproduced and fixed before this stage; all three remote CI jobs passed on the repair commit. The main suite now executes the shared migration inventory preflight.
- Portal and capability/page regressions observed RED and passed GREEN. The local suite passed 2,977 tests before review; full lint/build and the embedded 72-migration upgrade/restore rehearsal passed. Actual phone callbacks also survived effect replay, duplicate taps and a late response after account retirement.
- One fresh review found a configuration race: a mutable configuration could change between retrieve/create, and its expanded response was checked only by ID. Two new regressions failed with missing rejection. Fixed with one strict validator before creation and on its explicitly expanded attached configuration, plus a dedicated nondefault/immutable configuration policy. No minor findings were identified. Final post-fix verification is recorded below when complete.
- Hosted Auth/PostgREST, true concurrent locking, real provider and phone acceptance, changes to a configuration after URL delivery, worker/risk/enforcement/founder/VAT/live activation remain acceptance or follow-on work. The fresh review assessed prior receipt/reconciliation integration, not a new exhaustive audit of their entire edge-case space. No activation or merge is authorized by this review.

Final post-fix checks: all 2,979 repository tests passed; 56 focused API/provider/client/page/status checks passed; full ESLint with zero warnings and the production Next.js build passed. The current SQL also passed the complete embedded 72-migration backup/restore rehearsal. No minor findings remain. Remote CI and preview will be checked on the final published tree.
