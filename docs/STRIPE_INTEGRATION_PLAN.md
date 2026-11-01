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

- Flat subscription per business. One Product per purchasable tier; monthly and annual GBP Prices for variants of the same tier. Amounts, included staff, AI allowance and trial remain undecided.
- Standard Stripe-hosted Checkout with flexible billing mode and dynamic payment methods. Omit `payment_method_types`. Use `integration_identifier` with a stable flow label and an eight-random-letter suffix per current API guidance. Do not enable Managed Payments by assumption.
- Pay at signup is a proposed default, not a published policy. Do not configure a trial until Jake chooses it. Stripe Billing generates subscription invoices; do not create a second job invoice for subscription charges.
- Owner-only Customer Portal for payment methods, invoices and cancellation at period end. Enable plan switching only between approved compatible Prices. Choose proration behavior explicitly before offering changes.
- Configure Smart Retries and recovery emails before launch; planning has not enabled emails or changed account settings.
- Keep AI costs bounded by server-enforced business usage limits. Usage charging is outside this first release; if added later, evaluate Stripe's current Metronome recommendation separately.

## Review against existing code

`lib/billing/subscriptionAccess.mjs` and its six tests already provide a useful fail-closed predicate: exact business/mode/allowlisted Price, bounded paid/trial coverage, active owner management, and remaining paid coverage after scheduled cancellation. It is unused by runtime code and receives trusted records; it cannot authenticate users, verify payments or enforce database access.

The following are missing and required before selling access: Stripe SDK/client, authenticated Checkout/portal routes, server-owned customer binding, billing tables and RLS, durable event handling/reconciliation, billing UI, paid-feature enforcement, AI usage limits and hosted sandbox acceptance. No Stripe API key or webhook secret was made available to the JR OS server through the plugin connection. Plugin OAuth authorizes these tools; it does not install server credentials.

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

Only describe billing as operational after deployed sandbox Checkout, real webhook delivery, persistence, portal and access enforcement pass end to end. Live activation, prices and tax settings need separate deliberate configuration. No real charges, invoice emails, account settings, products, migrations or subscriptions were created during this planning pass.

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
