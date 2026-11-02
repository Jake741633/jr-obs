# Private billing review recovery

Continue the inactive JR OS subscription foundation with a controlled operator path for resolving a verified payment review. Current owners can manage billing but cannot clear their own financial flags. Existing JR access remains unchanged. All billing flags stay off and the prepared migration remains unapplied.

## Approach

Use service-only database functions and a private Node operator command. Automatic clearance after payment would discard unresolved risk. An owner-facing clearance button would give the subject of a review authority over it. A new platform-admin web application would require a separate authentication design; the existing project has business membership roles, not platform operator identities. The private command is the bounded next step. This is an implementation choice under the existing autonomous development instruction, not a new user-selected authentication policy.

## Data and transaction boundaries

- Every verified risk event increments a monotonic Customer `review_version`, including signals received while already held. Preserve the first marker and append each verified signal to a service-only ledger. Duplicated webhook delivery cannot create a second signal.
- A service-only inspection function returns the exact sandbox business/Customer binding, version, first marker, active reconciliation state and up to 20 unresolved signal summaries. It exposes no raw event bodies, customer personal data or secrets. More than 20 signals, or missing ledger evidence, requires further investigation and cannot use this resolution function.
- Clearance requires the inspected business, Customer and version; a stable resolution UUID; an operator reference and a meaningful review note. Operator references are operator-supplied audit labels. The service credential authorizes the process; the label is not proof of an independently authenticated person.
- The resolution function locks the Customer, rejects a changed binding/version or active reconciliation lease, checks complete bounded signal evidence, inserts an append-only resolution audit and clears the marker atomically. Expired leases can be retired. A replayed resolution UUID is reported as already recorded only for identical inputs and never clears a later hold. Reusing an ID with different inputs is a conflict.
- Clearing a marker invalidates **all** old paid-through, paid-invoice and trial coverage for that binding in the same transaction. It does not create a payment, reverse a refund, resolve a Stripe dispute, change subscription status, manufacture a webhook, or grant paid features. Fresh normal reconciliation is still required to re-establish coverage. Existing nonterminal subscriptions continue to block duplicate signup.
- New signals after clearance create a new version/hold. Lifecycle reconciliation never clears review. Unknown/unbound/unsupported risk and uncertain Checkout operation review remain separate operational work.
- Signal and resolution tables have RLS, no browser privileges/policies and only service SELECT/INSERT grants; service UPDATE/DELETE are denied. Database administrators remain trusted and retention/deletion policy is separate launch work.

## Operator interface

`node scripts/review-billing.mjs --organisation <uuid>` inspects only. Resolution requires `--resolve`, the exact inspected Customer/version, a stable resolution UUID, operator reference and note, plus private `JR_OS_BILLING_REVIEW_RESOLUTION_ENABLED=true`. The default/example is false. Strict argument validation precedes any network call. No public endpoint, tenant control or embedded secret is added. The command uses existing private Supabase settings and fixed sandbox RPCs, bounded response bodies and request deadlines; all errors are fixed codes. Audit notes must reference a case/ticket, without card data or secrets.

No credentials, hosted query/migration, provider mutation, enabled worker, clearance of an actual account, merge or live activation is part of this work. Extend only the existing CLI-generated unapplied migration, refresh its inventory checksum and run local synthetic upgrade checks; do not rerun the previously rejected Supabase CLI/telemetry operation.

## Acceptance

Real local SQL must prove stale versions, concurrent lease states, duplicate/lost responses, later re-holds, cross-business substitution, rollback, stale paid/trial coverage and denied browser/audit mutation. Operator command tests must prove inspection is read-only, resolution defaults off, invalid/forged data fails before I/O and private errors are sanitized. Owner status continues to expose only the existing Boolean. Full tests, lint/build, upgrade rehearsal, one fresh review and exact-tree draft CI/preview are required. Hosted acceptance, independent concurrent database sessions, operator authentication/retention/monitoring, fresh-reconciliation operations and runtime paid/AI enforcement remain launch requirements.
