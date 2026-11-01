# Subscription foundation plan

Goal: begin the commercial billing request with an isolated, tested server access policy and concrete provider-integration design; keep existing runtime access unchanged.

Design: docs/SUBSCRIPTIONS.md. Proposed one subscription per business, monthly/annual; prices/trial/staff/AI allowances remain undecided. This first stage does not take payments or claim live integration.

- [x] Inspect existing business roles/account boundaries and payment infrastructure; no subscription provider integration exists.
- [x] Verify Stripe primary documentation and distinguish hosted Checkout/Portal, trusted webhooks and duplicate subscription controls.
- [x] Observe six policy tests RED; implement exact tenant/product/environment, paid/trial time boundaries and owner-only management.
- [x] Full tests/lint/build and independent policy review:2,859 tests, zero-warning ESLint and production build passed; review found no actionable issue. Trusted-input and deferred-integration boundaries remain explicit; this is not live billing.
- [ ] Commit code/design and prepare a reviewable draft PR. Full provider implementation follows the integration sequence; it requires provider configuration and business pricing decisions.

Constraints: no credentials, charges, provider account changes, migrations, runtime paywall, dependency changes or customer-data changes. Do not treat this pure predicate as authentication or accept client records. Review focus: exact expiry, invalid clocks, unsupported statuses, tenant/mode/product confusion, and unverified browser-success claims.
