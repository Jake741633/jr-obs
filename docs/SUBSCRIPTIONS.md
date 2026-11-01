# JR OS subscriptions — commercialisation foundation

Status: server policy, Stripe adapter, unapplied persistence migration and disabled webhook receipt and unactivated reconciliation worker and owner billing-status screen and unactivated durable Checkout engine implemented and locally tested; **not connected to runtime access, checkout, payment collection or live billing**. Existing JR access remains unchanged. Jake approved GBP 29/month, GBP 290/year and a founding offer of GBP 19/month for 12 months for the first 20 businesses. Sandbox catalog created; no public paid checkout or trial has been launched.

## Proposed product

One subscription per business, with monthly and annual billing. Start with a straightforward business plan; staff-seat tiers can follow. Prices are approved as above; included staff and the trial policy still need final configuration. AI must have a separate server usage budget/allowance rather than an unlimited-cost promise. This is software access billing, separate from invoices that electricians issue to their customers.

Stripe-hosted Checkout and Customer Portal are the proposed payment interfaces. The portal can manage payment methods, subscription changes and invoice history. Each existing business gets a server-owned Stripe customer binding; an owner manages their own business's billing. Staff roles do not inherit payment-management powers.

## Implemented policy

`lib/billing/subscriptionAccess.mjs` is a pure server-policy foundation, currently unused by runtime code. A paid feature predicate requires exact business/environment/product matching, a known active subscription and an unexpired paid-through instant; a bounded provider trial is separately recognised. Cancellation at period end retains coverage until that boundary; failed/unpaid/paused/canceled/unknown states do not unlock paid features. Test records cannot enable live access. Trial completion cannot masquerade as a paid invoice. Billing management requires verified active owner membership for the same business.

Inputs must come from trusted server records reconciled with Stripe. This helper is not authentication, signature verification, RLS, payment proof or a complete billing integration. Normal tenant/role permissions always apply. Browser flags, redirects and cached records cannot be authorities. Existing access is not gated by this module yet.

## Integration sequence

1. **Choose product settings.** Business subscription basis, GBP prices, monthly/annual price IDs, included staff, trial and AI allowance. Keep test/live identifiers and secrets separate; never accept a client-provided price, customer ID or organisation binding as authority.
2. **Server-owned persistence.** Add billing customer/subscription tables and an event inbox with database uniqueness constraints. Clients cannot write billing status, paid-through coverage or provider IDs. Owner reads are tenant-scoped. Apply and verify migrations/RLS in isolated tests before any hosted migration.
3. **Authenticated owner Checkout and portal routes.** Verify current user, active business membership and owner role on the server. Resolve the bound customer and allowlisted price server-side; prevent concurrent duplicate subscriptions/sessions with durable idempotency. Use fixed approved return origins. No card details are stored in JR OS.
4. **Verified webhooks and reconciliation.** Use Stripe's supported SDK to verify signatures over the untouched raw request body. Store event IDs durably for retries. Delivery order is not authoritative: serialize/reconcile each subscription against current provider state, and handle duplicate/concurrent/old events. Paid-through coverage extends only from verified payment evidence. A success redirect never grants access.
5. **Billing screen.** Show actual server-reported plan, payment state, renewal/cancellation date and invoice/portal actions. Clearly distinguish test billing, pending setup, payment problems and inactive subscription; no simulated successful payment buttons.
6. **Enforcement.** Apply commercial entitlements to server APIs and direct database/RPC write paths; a frontend paywall alone is bypassable. Preserve authenticated read/export access to existing customer data when a subscription ends, without overriding revoked tenant membership. Provision existing JR access through an explicit server-managed migration policy, never a browser exemption.
7. **Acceptance before launch.** Test checkout, 3DS/payment failure, renewal, portal cancellation, duplicate sessions/events, out-of-order delivery, expired trial, organisation switches, test/live separation and read/export after expiry. Connect AI requests to tenant subscription and usage limits. Verify hosted test mode end-to-end before activating live charging.

## Setup still required

Stripe plugin connected on 1 November 2026 to the JR Electrical Services sandbox (test mode). The implementation planner was run and its applicable paths accepted; see `STRIPE_INTEGRATION_PLAN.md`. The server-only sandbox SDK adapter is implemented and locally tested; the webhook receipt route is disabled by default and Checkout/portal HTTP routes remain unimplemented. Server restricted API key/webhook secret, configured portal, hosted application/verification of the prepared migration, authenticated payment routes, worker scheduling/hosted acceptance, automated risk handling and real integration acceptance are still required. The approved JR OS Product, monthly/annual Prices and capped founding discount now exist in the sandbox; IDs and enforcement limits are in the integration plan. No provider account, secret, subscription or charge was created by this work. The pure policy is deliberately not a sale-ready billing system.

Primary implementation references: https://docs.stripe.com/billing/subscriptions/webhooks , https://docs.stripe.com/webhooks , https://docs.stripe.com/billing/subscriptions/integrating-customer-portal , https://docs.stripe.com/payments/checkout/limit-subscriptions . Verify current API/SDK contracts when wiring the provider.
