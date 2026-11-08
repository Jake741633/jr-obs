# Billing review recovery implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans inline, followed by one fresh review.

**Goal:** Add an auditable private operator path for clearing a reviewed financial flag without reviving stale payment coverage.

**Architecture:** Version and retain every verified signal, then resolve an explicitly reviewed version under the existing Customer lock into an append-only audit. A disabled private CLI exposes inspection and explicit resolution; normal owner/API/policy boundaries stay intact.

**Tech stack:** Existing sandbox Stripe adapter, service-only Postgres RPCs in the existing unapplied migration, Node/PGlite, existing Next.js. No dependency or public endpoint.

**Spec:** `docs/superpowers/specs/2026-11-02-billing-review-recovery-design.md`; prior billing integration and subscription specifications.

## Global constraints

- All activation flags remain false, migration unapplied, branch draft/unmerged. No real credentials, hosted queries/mutations, charges, refunds, disputes, account clearance, messages or tax changes. Do not rerun the rejected Supabase CLI operation.
- Private service-role authorization is distinct from tenant owner permissions; operator audit labels are not independently authenticated identities.
- Every new verified risk signal advances `review_version`; first evidence is preserved. New signal/audit tables are RLS/service SELECT+INSERT only, no browser policies/grants, no service UPDATE/DELETE.
- Atomic clearance checks exact organisation/Customer/version and active lease, audits the decision and nulls old paid/trial coverage; it cannot grant coverage or manufacture provider events. Missing or more than 20 unresolved signals cannot clear.
- Stable resolution UUID replay is idempotent for identical arguments and cannot clear a later hold. New risk re-holds normally; later lifecycle updates never clear the marker.
- CLI inspection is read-only; writes additionally require `JR_OS_BILLING_REVIEW_RESOLUTION_ENABLED=true`. Strict pre-I/O validation, fixed RPC/HTTPS origin, deadlines, response caps and sanitized errors.

## Review focus

- A second risk signal arriving after inspection must make clearance stale even if the first marker is unchanged.
- A lost resolution response followed by a new hold and replay must not clear the new generation or claim current billing is clear.
- Clearing a partial/refunded/trial review must not revive old paid-through or trial dates, including another subscription on the binding.
- Raw tenant claims, wrong Customer/version, active/expired worker leases and audit mutation must preserve the correct business and transaction outcome.
- Inspection truncation, legacy/missing evidence, provider-independent operator labels and failed RPC bodies must never look like verified payment or authenticated human identity.

### Task 1: Versioned signals and atomic clearance

**Files:** existing billing migration, migration manifest, `tests/billing-review-recovery.test.mjs`, existing hold/persistence tests.

**Interfaces:**
- `jr_billing_mark_review(...)` retains its signature, advances Customer `review_version` and inserts one `jr_billing_review_signals` row per verified event.
- `jr_billing_operator_review(p_organisation_id uuid)` returns `state:unbound` or `{state:held|clear,organisationId,customerId,reviewVersion,review,signals,signalCount,truncated,reconciliationBusy}`. Review/signal summaries contain reason/source/event/time and version only. Maximum 20 unresolved summaries.
- `jr_billing_resolve_review(p_organisation_id uuid,p_customer_id text,p_expected_version integer,p_resolution_id uuid,p_operator_reference text,p_note text)` returns `{state:cleared|already_recorded|stale|busy|unbound|not_held|needs_investigation|conflict}`. Already-recorded describes the audit, not current clearance. Functions are service-only SECURITY INVOKER with empty search_path.

- [x] Write/run RED SQL tests for generation/first evidence, exact bounded inspection, conditional clearance, multiple old subscriptions/trials, repeat and changed-ID arguments, late signal/replay, current/expired lease, cross-business, denied browser and append-only audit, atomic rollback and missing/21 signals. Expected failure: missing functions/columns.
- [x] Implement tables/grants/constraint/functions; update existing hold test cleanup and persistence table inventory. Refresh final migration checksum. Run recovery/hold/worker/reconciliation/persistence tests, expected all pass; run full embedded72 migration rehearsal. Commit.

### Task 2: Disabled private operator command

**Files:** `lib/server/billingReviewOperator.mjs`, `scripts/review-billing.mjs`, `tests/billing-review-operator.test.mjs`, `.env.example`, billing/runbook docs.

**Interfaces:** `createBillingReviewOperator({env,fetchImpl})` supplies `inspect(organisationId)` and `resolve({organisationId,customerId,expectedVersion,resolutionId,operatorReference,note})`; only resolve requires the private enable flag. `runBillingReviewCommand({args,env,fetchImpl,write})` emits a sanitized JSON result and returns 0 for inspect/cleared/already-recorded, 1 for safe non-success, 2 for invalid usage/unavailable. Runtime entry writes no raw errors.

- [x] Write/run RED command/store tests using real SQL through controlled RPC transport: read-only default, all off/write/argument gates before I/O, exact resource mapping, lost response/idempotency/new hold, malformed/oversized/error response, safe bounded output and actual CLI invalid-input execution. Expected failure: missing modules.
- [x] Implement minimal private command/adapter and add false example flag/runbook. Update launch limitations and preserve deferred prior plan-switch copy. Run focused tests, full root suite, lint/build and required inventory/rehearsal checks. Commit.
- [x] One fresh review; no Critical/Important findings, independently passed 28 focused tests; Minors deferred.
- Publish the exact tested tree to existing draft PR327 and verify all CI/preview checks; record final acceptance in that PR. No activation.


## Review outcome and retained boundaries

One fresh review found no Critical or Important defects and independently passed 28 recovery/hold/operator tests. Root verified all 3,045 tests, zero-warning ESLint, the production build and the 72-migration synthetic rehearsal. An older receipt-timing assertion was reproduced with equal timestamps and corrected to compare persisted event IDs; production scheduling was unchanged. A generated Turbopack cache left by an interrupted build was preserved/rebuilt, and unchanged-source build verification passed.

Deferred Minors: after clearance, a still-trialing subscription with its date invalidated can display “Trial ended” while confirmation is pending; improve that presentation alongside fresh-reconciliation operations. Existing plan-conflict copy still recommends status refresh even though an open Checkout must be resumed or expire. Neither changes payment authority or grants access.

Accepted review boundaries: hosted schema/Auth/PostgREST grants/helper chain, independent concurrent SQL sessions, real Stripe contracts/delivery, missing-webhook recovery, published scheduler/deadlines and actual phone lifecycle need separate acceptance. The operator fresh-reconciliation trigger is pending; clearing a marker safely removes old coverage, so legitimate confirmation can wait. Missing/unknown/unbound/unsupported and more-than-20 cases, plus uncertain Checkout operations, still require further tooling/investigation. No person-level operator authentication, key distribution/rotation, monitoring or retention is certified by case labels. Trusted administrators/full service credentials remain outside an administrator-proof audit guarantee. Current JR access and pending paid/AI/read-export/founder/trial/live/VAT/job-invoicing/Connect work are unchanged. Issued bearer links and later provider-admin changes cannot be revoked by a past read. The reviewer checked focused behavior independently; root owns full-suite/build/rehearsal and exact-tree publication/CI evidence. All flags stay off; this is an inactive foundation, not sale-ready billing.
