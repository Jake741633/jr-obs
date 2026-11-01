# Billing review holds implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans inline, followed by one fresh review.

**Goal:** Prevent a verified refund/dispute/fraud/credit-note signal from continuing to look like clear billing, and show the owner a safe payment-review state.

**Architecture:** Resolve the supported signed event's resource through fresh sandbox Stripe reads to the existing server-owned SaaS Customer boundary. Acquire the existing business/event lease and atomically mark a sticky service-owned customer review flag plus finish the event in review. Later ordinary subscription updates cannot clear that flag. Status/Checkout/access policy consume its trusted projection; the owner Portal remains available under its existing setup/authentication gates.

**Tech stack:** Existing pinned Stripe23.1.0/API2026-10-28.endive, service RPCs and unapplied billing migration, PGlite, Next.js/React. No new dependency, public endpoint or hosted mutation.

**Spec:** Existing risk/acceptance and owner billing-screen requirements in `docs/STRIPE_INTEGRATION_PLAN.md` and `docs/SUBSCRIPTIONS.md`.

## Global constraints

- Keep all activation flags off, prepared migration unapplied, branch draft/unmerged. No API keys, charges, refunds, disputes, customer emails or tax settings are created/changed. Extend only the already CLI-generated unapplied migration; do not rerun the rejected Supabase CLI/telemetry operation.
- Risk ownership is the existing unique mode/account/Customer-to-business binding. This Customer is reserved for the business's JR OS software billing; job-customer payments remain separate. Any verified dispute or fraud warning for this Customer requires manual review, including a delayed/resolved warning; a refund requires a positive current refunded amount and a credit note a positive issued amount. A void credit note/zero refund cannot clear a previous hold.
- This conservative customer-wide policy does not attempt subscription-specific loss allocation or automatically treat a resolved dispute as cleared. Cost: a legitimate refund or older resolved issue can require operator review before new signup/paid-feature clearance. No automated resolution or punitive fraud wording in the owner UI.
- Fresh account/resource/customer checks and first-class charge/invoice references only; never event metadata, user attributes or browser flags. Charge-based signals retrieve the current Charge; credit notes retrieve their current Invoice and verify the same Customer. Unknown/malformed/unbound/unsupported evidence remains review work; provider failures retry and processing budgets defer under existing rules. These unresolved cases still require acceptance/operations before launch.
- New marker RPC is service-only security invoker, checks current event/business tokens/expiry and matches event kind/source. It writes no paid snapshot; marker/event completion/lease release is atomic. First marker evidence stays auditable. No client or lifecycle path can clear the marker.
- Public status exposes only strict `reviewRequired:boolean`. Checkout is unavailable during review, including revalidation between provider steps; Portal remains otherwise available. Missing review provenance fails closed. The unused pure access-policy foundation requires an explicitly clear trusted billing record; runtime paid enforcement is still separate launch work.
- Refresh migration hash/inventory and run embedded full-chain restore/upgrade checks. No new schema version filename is invented.

## Review focus

- Cross-business or metadata-substituted risk evidence must never mark another business.
- Expired/stale/replayed event or business leases must not change the review marker or completed event.
- A later paid/trial/canceled update or client `reviewRequired:false` must not clear a hold or obtain Checkout.
- Revocation or a hold arriving after reservation/recording must prevent a Checkout URL response.
- Owners must see review instead of active/pending-success claims while retaining normal Portal management; no provider IDs/reasons leak.

### Task 1: Verified risk marker and worker

**Files:** `lib/server/stripeBilling.mjs`, `lib/server/billingWorker.mjs`, existing billing migration, migration manifest, new provider-risk/hold tests and updated existing worker fixtures.

**Interfaces:** `gateway.resolveBillingRisk(event)` returns only `{customerId,reason,sourceId,reviewRequired}` after fresh current resource validation. `store.markReview(job,lock,risk)` calls a fixed marker RPC with current tokens/reason/source only; business is resolved by the lease, never caller input. Worker routes supported risk kinds to this path and retains existing retry/defer/review outcomes.

- [x] Write/run RED tests at real SDK/local HTTP and real SQL/coordinator boundaries: all four kinds, metadata/cross-mode/current resource mismatch, void/zero evidence, body deadline, correct own-business marking, replay/stale/expiry, denied browser RPC, atomic rollback and persistence through later lifecycle reconciliation. Update prior invalid-risk fixtures to remain explicit manual-review cases.
- [x] Implement current risk lookup, service-owned marker/constraint/RPC and coordinator path. Update checksum. Run focused tests and embedded72-migration restore/rehearsal; expected all pass. Commit Task1.

### Task 2: Owner review state and signup/access guards

**Files:** owner-status SQL projection, Checkout reservation/shared owner verifier/API/status bridge, public client/types, billing panel, pure subscription-access policy and relevant tests/docs.

**Interfaces:** public status includes `reviewRequired:boolean`; owner helper optionally requires clear billing for Checkout and checks it again on every revalidation. Status capabilities hide Checkout during review without hiding Portal. `subscriptionAccess` requires `subscription.reviewRequired===false` from a trusted business-bound record before paid or trial coverage can grant features.

- [x] Write/run RED regressions: review/missing provenance denies paid/trial policy; SQL reservation rejects held business; normal owner revalidations stop late holds; status strips raw marker evidence; client fails closed for missing/nonboolean review; actual phone panel renders clear review/Portal states and never calls a review account active.
- [x] Implement guards/projection/UI and update meaningful fixtures/docs. Run focused tests, all root tests, full lint/build and the embedded upgrade rehearsal.
- [x] One fresh review; fix the Important known-review UI response RED→GREEN.
- Publish exact tested tree to draft PR327 and verify CI/preview. Record final acceptance in the PR; no activation.


## Review result and retained limits

One fresh review independently passed 167 focused billing tests. Its Important finding was reproduced on the actual page: a 409 review response previously left pending claims and enabled signup. The owner-screen presentation now immediately records that response, starts authoritative refresh and keeps review visible through loading/failure. It never alters the Customer marker or permission authority; signed-session denial still takes precedence. The view remains conservative until that owner instance is reopened, since a Customer Boolean alone does not clear a separately uncertain Checkout operation. A future clearance can therefore require reopening billing.

Deferred Minor: plan-conflict copy suggests refreshing status even though an existing open Checkout must be resumed or expire. The durable no-duplicate session policy stands.

Accepted review boundaries: customer-wide legitimate/resolved signals can need unnecessary manual checks; clearance and unknown/unbound/unsupported queue resolution are launch blockers. Rejected lifecycle evidence can leave the old verified coverage until expiry, so monitoring/operator resolution is required before runtime enforcement. Existing JR access, historical export/read policy, AI limits, missed-event sweeps, real hosted/concurrent-session/disconnect/key-scope acceptance, founder/trial/live/VAT/job-invoicing/Connect remain separate launch work. This inactive draft is not sale-ready.

Response-time checks cannot recall already delivered provider bearer URLs, prevent later provider-admin configuration edits, or atomically track changes after final verification/an open screen. The dedicated Portal configuration remains operationally immutable. Open Checkout plan changes and uncertain creation after 20 minutes retain conservative manual/resume/expiry recovery; the tradeoff is slower legitimate recovery instead of duplicate subscription risk. Platform-secret diagnostics remain in operator tooling. The fresh reviewer independently verified focused billing behavior; root verifies the whole suite/build/rehearsal, not an independent hosted certification.
