# Owner billing status and mobile screen

Spec: docs/STRIPE_INTEGRATION_PLAN.md. Add an owner-only sanitized status RPC using existing live membership/session helpers, same-origin authenticated status API and phone-friendly billing page. No Checkout activation, payment buttons that simulate success, new charges or hosted migration.

- SQL tests RED→GREEN with actual existing private authorization helper definitions and local Postgres auth fixtures: owner can read only own subscription; non-owner/inactive/revoked-session/anonymous users denied; no customer/invoice/secret IDs returned.
- API tests RED→GREEN: verify bearer user and normal account, exact intended organisation, same origin, strict empty request, safe setup/permission errors and no secret output. User JWT only; no service key used for status.
- UI behavioral tests: approved prices/setup state, owner-only visibility, loading/error/real status, canceled renewal wording, identity switch/recovery/late-response rejection. Add Settings entry.
- Full suite/lint/build; fresh review; fix important findings and publish draft PR327. Both processing flags remain off; migration remains unapplied.

Ruling: read-only status UI is useful before Checkout is ready; disabled payment actions explain setup rather than appearing functional. Cost: no subscription purchase action in this stage.

## Verification and review

- SQL owner projection, status API, client loader and real React-rendered screen tests observed RED before implementation; 17 new focused tests pass.
- Full repository suite: 2,930 tests passed. Zero-warning ESLint and production Next.js build passed for the page and API. API security inventory explicitly includes the new status route.
- Fresh review found no blocking issue. Recovery provenance was clarified: server RPC now rejects signed recovery/anonymous AMR claims; direct recovery RPC regression observed RED→GREEN. Ruling: require ordinary sign-in after recovery before billing access; cost is one additional sign-in after password reset.
- Documentation corrected for the authenticated owner-read/private-definer exception. Minor deferred: tests currently load August 9 live-session helper definitions; August 13's additional customer-portal scope logic is equivalent for owners but full latest-chain/hosted verification remains required.
- Hosted grants/PostgREST/full migration recovery, actual browser effect transitions and physical phone acceptance remain unverified. No hosted schema/keys/tax/payment changes; Checkout and both worker/receipt flags remain inactive.
