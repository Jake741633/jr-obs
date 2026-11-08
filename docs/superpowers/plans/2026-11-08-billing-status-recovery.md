# Billing recovery status implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans inline, then one fresh read-only review.

**Goal:** Show the current billing evidence accurately after recovery and make an existing Checkout conflict actionable on a phone.

**Architecture:** Correct the existing status component and page guidance. Keep server contracts, storage, provider operations and feature gates unchanged.

**Tech stack:** Existing Next/React, Node test runner and real-component TypeScript test loader. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-08-billing-status-recovery-design.md`.

## Global constraints

- All activation flags remain false, the billing migration remains unapplied and PR327 remains draft/unmerged.
- URL hints never grant access, enable actions, clear reviews or override current owner-verified status.
- Missing coverage requires confirmation; a known past coverage date means the period ended.
- No provider request, hosted database change, account clearance, customer message or live activation.

## Review focus

- A null trial date after clearance must not imply expiration or current trial access.
- An old `checkout=pending` query must not imply payment is processing after denial or a terminal/payment-attention status.
- A current verified financial review must supersede every pending or confirmed label, including through refresh failures.
- Original-plan retry after a conflict must remain available without client-selected provider resources or duplicate navigation.
- Future and past dates must be exercised against a deterministic clock; no wall-clock-sensitive expectations.

### Task 1: Evidence-aware recovery presentation

**Files:** `components/billing/BillingStatusPanel.tsx`, `tests/billing-status-ui.test.mjs`.

**Interfaces:** Preserve `BillingStatusPanel` props and `BillingStatusResult`. Correct missing-trial label to `Trial confirmation needed`; pending Checkout notice requires ready/clear status plus no subscription or null active/trial coverage. Existing expiry and review behavior remains authoritative.

- [x] Write actual rendered-component regressions for null/future/past trial coverage and the full ready/error/review/Checkout-return matrix; freeze only the test loader's clock.
- [x] Run focused UI tests and observe expected assertions fail on current labels/pending claims.
- [x] Correct the existing branches without changing data or action capabilities.
- [x] Run focused UI/client/page-action tests; all 34 pass.

### Task 2: Useful original-plan recovery guidance

**Files:** `app/settings/billing/page.tsx`, `tests/billing-page-actions.test.mjs`, `docs/BILLING_REVIEW_RUNBOOK.md`.

**Interfaces:** Existing `billing_checkout_conflict` result stays unchanged. Real page message explains resuming the original plan or waiting for expiry; test transport returns a conflict for annual and a successful existing monthly session.

- [x] Write a real-page conflict regression: annual selection returns conflict without redirect, displayed guidance describes original-plan resume/expiry, monthly retry sends only `{plan:'monthly'}` and navigates once.
- [x] Run the regression and observe the old refresh-only help fail.
- [x] Correct guidance and update the runbook's resolved presentation follow-ups while retaining fresh-provider operations as pending.
- [x] Address the fresh review's status-read retention gap: regress initial reviewed status → loading → HTTP 503 → denial and initial reviewed status → fresh clear trial record; keep a Checkout-reported review through a clear Customer status. Two regressions failed before the correction; all 36 focused tests pass after retaining status provenance separately from Checkout provenance.
- [x] Run focused billing tests, full `npm test`, `npm run lint`, `npm run build`; all 36 focused tests, all 3,052 root tests, zero-warning ESLint and the production build pass.
- [x] Obtain one fresh read-only review of the change from `e80ece6dc0d6f4d90dc2948a9ed3c5a87ed26932` and address its one Important finding with RED→GREEN evidence. No other Critical, Important or Minor findings were reported.

## Publication acceptance

Commit and publish the exact tested tree to existing draft PR327, then verify CI and the Netlify preview. Record final commit/tree/workflow evidence in that PR after the remote jobs complete; this document is saved before those jobs start. Preserve inactive scope and do not merge.

## Review outcome

The reviewer independently passed 34 focused tests and reproduced the status-read review disappearing on loading/failure. Two new actual-page regressions failed before retaining that provenance separately; all 36 focused and 3,052 root tests pass after the correction. Current clear status can replace a prior status-read hold; direct Checkout review remains conservative because uncertain operations are not represented by Customer status. A denied status read discards remembered status review and remains a sign-in state on subsequent retry. Original-plan retry, plan-only bodies, single navigation and existing stale-account guards remain covered.

Hosted/provider/physical-phone acceptance, fresh-provider reconciliation operations, the wider billing foundation and commercial activation remain separate pending work. They were explicitly outside this bounded review, not newly introduced defects. No new credential, provider, database, environment, dependency or activation change was made.
