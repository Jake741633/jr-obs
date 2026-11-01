# JR OS Stripe integration plan

Prepared 1 November 2026 using the connected Stripe implementation planner for JR Electrical Services, https://www.jrelectricalservices.org. Sandbox connection confirmed; guide `iguide_61VgOX4WP4umJi96141RxGUITlJWL` accepted. This records recommended design choices, not merchant pricing approval or a deployed payment integration.

## Product boundaries

| Purpose | Initial approach | Ownership |
| --- | --- | --- |
| Sell JR OS access | Stripe Billing, hosted subscription Checkout, Customer Portal | JR Electrical sells its own software subscription |
| Invoice for JR Electrical jobs | Invoicing API, reviewed drafts, Hosted Invoice Page | JR Electrical invoices its own customers |
| Other businesses collect their job payments | Separate future Stripe Connect design | Each business must have its own merchant/payment boundary |

JR OS currently uses Next.js/React, Netlify and Supabase business accounts. Its phone-friendly web/PWA interface follows the web Checkout path; a native app distribution would need a separate store/payment review. No Connect accounts, transfers or application fees are part of this initial implementation.

## Recommended first release

- Flat subscription per business. One Product per purchasable tier; monthly and annual GBP Prices for variants of the same tier. Jake approved GBP 29/month and GBP 290/year on 1 November 2026, plus the founding monthly offer below. Included staff and AI allowance remain undecided; a 14-day trial is proposed but not yet wired into Checkout.
- Standard Stripe-hosted Checkout with flexible billing mode and dynamic payment methods. Omit `payment_method_types`. Use `integration_identifier` with a stable flow label and an eight-random-letter suffix per current API guidance. Do not enable Managed Payments by assumption.
- Pay at signup is a proposed default, not a published policy. Do not configure a trial until Jake chooses it. Stripe Billing generates subscription invoices; do not create a second job invoice for subscription charges.
- Owner-only Customer Portal for payment methods, invoices and cancellation at period end. Enable plan switching only between approved compatible Prices. Choose proration behavior explicitly before offering changes.
- Configure Smart Retries and recovery emails before launch; planning has not enabled emails or changed account settings.
- Keep AI costs bounded by server-enforced business usage limits. Usage charging is outside this first release; if added later, evaluate Stripe's current Metronome recommendation separately.

## Review against existing code

`lib/billing/subscriptionAccess.mjs` and its six tests already provide a useful fail-closed predicate: exact business/mode/allowlisted Price, bounded paid/trial coverage, active owner management, and remaining paid coverage after scheduled cancellation. It is unused by runtime code and receives trusted records; it cannot authenticate users, verify payments or enforce database access.

The server-only Stripe SDK/provider boundary is now implemented and locally tested (see below). The following are still missing and required before selling access: authenticated Checkout/portal routes, server-owned customer binding, hosted application of the prepared billing schema, event worker/reconciliation, billing UI, paid-feature enforcement, AI usage limits and hosted sandbox acceptance. No Stripe API key or webhook secret was made available to the JR OS server through the plugin connection. Plugin OAuth authorizes these tools; it does not install server credentials.

## Implementation order

1. **Configuration and credentials.** Use a dedicated development sandbox; separate CI sandbox and live configuration. Pin the current supported Node SDK/API after checking the actual API contracts (Stripe guidance at planning time: Node SDK 23, API `2026-09-30.endive`). Create a least-privilege sandbox restricted key for the server and configure the webhook endpoint's own signing secret. Keep both in secure server deployment settings, never chat, git, browser code, public environment variables, analytics or logs. Prepare validated server-only names: `STRIPE_RESTRICTED_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_ACCOUNT_ID`, `STRIPE_MODE`, `STRIPE_PRICE_MONTHLY`, `STRIPE_PRICE_ANNUAL`, `STRIPE_PORTAL_CONFIGURATION_ID`, `APP_ORIGIN`. These are proposed names, not configured values. A full-page redirect does not require exposing a secret or adding an embedded card form.
2. **Persistence and authorization.** Add service-owned business/customer bindings, subscription snapshots, event inbox, durable operation/idempotency records and risk-review records. Unique constraints must prevent cross-business customer reuse and concurrent duplicate signup. Authenticate using current Supabase user and active membership; only an owner may manage billing. RLS must deny browser writes to payment identifiers, coverage, event state and entitlements. Validate test/live account scope throughout. Do not trust submitted customer IDs, Price IDs, metadata or redirect flags.
3. **Checkout and portal.** Server resolves business, bound Customer and approved monthly/annual Price. Create/reuse a durable pending operation under a database lock; use its key with Stripe. Handle an already subscribed or pending business without creating another subscription. Return only a provider URL. Use fixed configured HTTPS return origins, origin/CSRF protection and allowlisted provider URLs. Success shows pending confirmation until verified server state is available.
4. **Required webhook worker.** Verify the untouched request body with the SDK and signing secret before persisting anything. Durably enqueue event ID with uniqueness and recoverable work state; acknowledge after durable receipt, not before. Serialize per subscription/customer, retrieve current Stripe objects, and reconcile rather than applying events by delivery order. Failed work remains retryable; add periodic reconciliation for missed deliveries. Resolve ownership through stored Customer/Subscription IDs and provider object relationships, not event metadata alone.
5. **Subscription and risk events.** Handle relevant `customer.subscription.*`, `invoice.paid`, `invoice.payment_failed`, `checkout.session.completed` and asynchronous Checkout outcomes. A checkout completion does not by itself prove payment; invoice settlement must match the owned subscription, approved recurring items, mode and period. Map refunds, disputes and fraud warnings through current version-specific invoice/payment relationships. Act on `charge.refunded`, `charge.dispute.created` and `radar.early_fraud_warning.created` using auditable risk-review handling; do not automatically revoke all access for every partial refund. Include credit-note reconciliation for job invoices. Subscribe only to events the integration processes. Handle `customer.updated` if caching customer personal/billing details.
6. **Job invoicing.** Begin with JR Electrical's own business only. Owner reviews the job, approved quote version, customer, line items, VAT, deposit already paid and balance. Snapshot totals server-side; associate invoice items explicitly with the intended invoice to avoid sweeping unrelated pending items. Use durable per-job/milestone idempotency. Create drafts with `auto_advance:false`; an explicit separate action approves finalization/sending. Never auto-charge a saved method without the customer's appropriate agreement. Hosted Invoice Page collects customer payment. Reconcile paid/failed/void/credit-note/refund outcomes back to the right job. Deposits and final balances must not double-bill the same work.
7. **UI and enforcement.** Add a phone-friendly Billing screen with large Subscribe/Manage billing/View invoices actions and actual server plan, status, renewal and cancellation dates. Clearly show sandbox/setup/pending/payment-problem states. Apply subscription and AI allowance checks to APIs, workers, RLS and RPC write paths. Preserve authenticated historical read/export after expiry while respecting revoked memberships. Existing JR use needs an explicit server migration policy before any gate is enabled.

## Tax decision remains open

Confirm JR Electrical's VAT registrations and intended customer locations, plus whether prices include or exclude VAT. Software access and electrical services need their appropriate separate product tax treatment. Read Stripe Tax guidance and verify active registrations before enabling `automatic_tax`; simply enabling the flag is insufficient. Do not infer tax registration from the website or the presence of VAT fields in JR OS. This planning pass has not configured tax collection.

## Required acceptance evidence

Test authenticated owner/staff/customer access and cross-business ID substitution; duplicate Checkout clicks, concurrent signup and expired sessions; successful payment, authentication challenge and failed/asynchronous payment; renewal and exact paid-period boundaries; portal updates/cancellation/reactivation; invoice failure and recovery; trial expiry if trials are chosen; forged signatures and wrong signing secrets; duplicate, concurrent, delayed and out-of-order events; worker retry/crash and reconciliation; partial/full refund, dispute and fraud-review outcomes; test/live mixing; direct database/RPC bypass; revoked membership; historical read/export after expiry; AI allowance exhaustion. Job invoice tests must cover draft review, retry without duplicates, deposit/balance accounting, credits and wrong-business customer/job IDs.

Only describe billing as operational after deployed sandbox Checkout, real webhook delivery, persistence, portal and access enforcement pass end to end. Live activation, prices and tax settings need separate deliberate configuration. No real charges, invoice emails, account settings, migrations or subscriptions were created. Sandbox catalog objects were subsequently created after Jake approved the prices; see the configuration record below.

## Stripe primary references selected by the planner

- [Hosted subscription Checkout](https://docs.stripe.com/billing/subscriptions/build-subscriptions?payment-ui=checkout&ui=stripe-hosted)
- [Flat-rate subscription pricing](https://docs.stripe.com/subscriptions/pricing-models/flat-rate-pricing?dashboard-or-api=api)
- [Customer Portal](https://docs.stripe.com/customer-management/integrate-customer-portal)
- [Subscription webhooks and risk events](https://docs.stripe.com/billing/subscriptions/webhooks)
- [Revenue recovery](https://docs.stripe.com/billing/revenue-recovery)
- [Invoicing API](https://docs.stripe.com/invoicing/integration)
- [Hosted Invoice Page](https://docs.stripe.com/invoicing/hosted-invoice-page)
- [Restricted API keys](https://docs.stripe.com/keys#manage-your-api-keys)
- [Tax for recurring payments](https://docs.stripe.com/billing/taxes/collect-taxes)

The planner also offered Connect paths because other businesses were mentioned. Those paths were explicitly excluded from the initial acceptance; selling software access alone does not authorize collecting money for other merchants.

## Approved sandbox catalog — 1 November 2026

Account: `acct_1UWyMhRxGUITlJWL` (JR Electrical Services sandbox), `livemode:false`. These are test identifiers only, never fallback live configuration. Both Prices were read back and verified as active, GBP, correct amount/interval and attached to the same Product. No secret keys are recorded here.

| Object | Stripe ID | Configuration |
| --- | --- | --- |
| Business subscription Product | `jr_os_business` | JR OS Business; software access for one business |
| Monthly Price | `price_1UX0fdRxGUITlJWLXoEGdcBE` | GBP 29.00 / month; default Product price |
| Annual Price | `price_1UX0fpRxGUITlJWLs2gwl34S` | GBP 290.00 / year; lookup key `jr_os_business_annual_gbp_v1` |
| Founding discount | `jr_os_founders_20_monthly_v1` | GBP 10.00 off, repeating 12 months, max 20 redemptions, restricted to JR OS Product |

The founding offer is GBP 19/month for the first 12 months, then the normal GBP 29/month. It is deliberately a temporary discount on the standard monthly Price, not a permanently cheap recurring Price. No public promotion code or payment link was created. Coupon metadata describes restrictions but does not enforce them: the server must admit one qualifying business once, allow only the approved monthly Price and quantity one, and prevent annual switching or additional discounts from misapplying the offer. Portal plan-change configuration must preserve these restrictions. Twenty Stripe redemptions alone do not guarantee twenty distinct businesses. Validate discount start/end boundaries with the chosen trial policy and sandbox clocks before launch.

Tax behavior on both test Prices is `unspecified`. No automatic tax collection or immutable inclusive/exclusive tax choice was enabled; verify current VAT registration and intended displayed price treatment before launch. Catalog creation does not make billing operational: credentials, Checkout, portal, webhooks, persistence, enforcement and end-to-end tests remain outstanding.

## Implemented provider boundary

`lib/server/stripeBilling.mjs` now provides sandbox-only validated configuration, subscription Checkout creation, Customer Portal creation and raw-body webhook verification using pinned Stripe Node SDK 23.1.0 / API `2026-10-28.endive` (the installed SDK's current supported version). Example variable names are in `.env.example`, with secret values left blank.

The disabled-by-default `/api/billing/webhook` receipt route now imports this module. No Checkout or portal HTTP route uses it yet. It accepts only trusted server operation records; it does not authenticate a caller, create customer bindings, acquire locks, deduplicate events or grant access. Future routes must verify active owner membership and own the durable business/customer/operation records before using it. All provider errors become fixed safe messages. Remote account, customer mode and approved Price configuration are checked before Checkout. Returns use the configured HTTPS app origin; returned URLs must use the exact Stripe Checkout/portal hosts. Retries of one persisted operation reuse the same provider idempotency key, including if an erroneous caller changes its plan; provider idempotency is not a substitute for durable business locking and must not be relied on beyond Stripe's retention period.

Only the standard monthly/annual plans are currently accepted. Founding offer requests fail closed until the server can enforce durable eligibility and one offer per business. Trial policy is not applied yet. The webhook verifier checks raw bytes/signatures, event shape and test mode only; it must feed the durable inbox/reconciliation worker before any fulfillment. It does not make webhook processing complete.

Focused tests use the real Stripe SDK with a local HTTP fixture server, not real Stripe credentials or hosted payment requests. They exercise request serialization, approved prices, scope/mode mismatches, retries, redirects and signature failures. Deployed sandbox acceptance and remaining implementation steps are still required.

## Prepared persistence and webhook receipt stage

`supabase/migrations/20261101154212_subscription_billing_store.sql` is prepared locally and included in the recovery chain, but has NOT been applied to the hosted database. It adds sandbox-only service-owned customer bindings, subscription snapshots, durable operations and an event inbox. Composite foreign keys prevent a subscription/operation from using another business's customer. Unique indexes limit a business to one pending Checkout and one current subscription. Browser roles have no table privileges or RLS policies; RPCs are security-invoker and executable only by the service role.

Receipt inserts once per account/mode/event ID without replacing the original event. Claiming uses `FOR UPDATE SKIP LOCKED`, a 60-second lease and a fresh UUID token. Expired work is reclaimable; old tokens cannot finish it. Ten failed or crashed attempts require review. These inbox leases do not yet fence changes to subscription coverage: the future reconciliation worker must commit coverage plus event completion atomically under the current lease and business lock. Marking an event processed alone does not prove payment.

`app/api/billing/webhook/route.ts` verifies the bounded raw body with the Stripe SDK before calling the service-only receipt RPC. Duplicate receipt is acknowledged; failed, empty, malformed or oversized persistence responses return a safe retryable 503. Forged/live/Connect deliveries never reach storage. Supported subscription, invoice, Checkout and risk/credit-note events can be queued; unrelated events are acknowledged as ignored. The route is OFF unless `JR_OS_BILLING_WEBHOOK_ENABLED=true` and all required server credentials/configuration are present. **Keep it disabled until hosted migration checks and worker/reconciliation setup are complete.** No event processing worker, subscription fulfillment or paid access gate is activated by this change.

Local tests execute the actual migration in pinned PGlite 0.5.14 (Postgres WASM), checking grants/RLS, composite bindings, pending-operation uniqueness, duplicate receipts, lease recovery, stale token rejection and review exhaustion. HTTP-handler tests use signed fixtures and a controlled persistence boundary. Actual simultaneous database sessions, the full existing migration chain, Supabase hosted Auth/PostgREST/advisors, Stripe event delivery and live credentials remain unverified here and are required before activation.

The Supabase CLI generated the migration scaffold before automatic approval review blocked its attempted PostHog telemetry. The CLI was not rerun; implementation and tests used the already-generated local file and local Postgres. Review and apply the migration through an approved deployment path, verify the exact deployment marker and service-only permissions, and run hosted security advisors/acceptance before enabling the endpoint. No hosted account or schema changes were made in this stage.
