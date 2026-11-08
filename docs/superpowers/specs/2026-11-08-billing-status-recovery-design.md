# Billing recovery status on a phone

Continue the inactive subscription foundation in PR327. The latest recovery stage deliberately invalidates old trial and paid dates after a reviewed hold is cleared. A missing trial date currently reads as an expired trial, and the Checkout return query can continue to claim pending payment even when current status is denied, unavailable, already confirmed or needs attention.

## Approach and scope

Keep the current owner-verified status contract and change presentation only. Missing coverage needs confirmation; a known past date means the period ended. A Checkout return hint is informational and appears only after a successful current status read, with no known review and either no subscription or an active/trialing record with its relevant coverage date absent. Current confirmed, expired, cancelled and failed/incomplete states take precedence over old URL hints. Never use URL parameters to enable actions, grant access or clear a review.

For an open Checkout on a different plan, explain that the owner can choose the original plan to resume its checkout or wait for it to expire before choosing another. Existing server idempotency and operation checks remain the authority; no Checkout switch/expiry operation is added.

Use the existing Next/React component and phone-page action controller. Adding a new status field or recovery endpoint would expand this bounded presentation correction into separate provider/operations work. This implementation choice follows the existing instruction to continue autonomously.

## Acceptance and limits

- A trial with a null trial end says `Trial confirmation needed`, without `Trial ended`, a trial-end date or paid-access claim. Future and past known trial dates remain distinguishable.
- A legacy Checkout-return query cannot display pending payment through loading, denied or unavailable status, a financial review, confirmed paid/trial coverage, an expired period, a cancelled subscription or a payment-attention state.
- Pending information remains available for ready/clear status with no subscription or active/trialing coverage awaiting confirmation.
- Phone actions and ownership/session/duplicate-request guards remain unchanged. Conflict guidance is exercised through the real page/action client and a resumed same-plan checkout.
- Remember a verified status-read review through loading/unavailable refreshes, replace it on a successful current status read and discard it on a sign-in denial. Keep direct Checkout-review provenance separately conservative because Customer status does not cover uncertain Checkout operations.
- Regression tests must fail before the correction, then focused/full root tests, lint and production build must pass. One fresh read-only review and exact-head draft CI/preview verify publication.

All activation flags remain false, the billing migration remains unapplied and PR327 remains draft/unmerged. Fresh-provider reconciliation operations, hosted Stripe/Auth/mobile acceptance and commercial launch work remain separate. No provider request, hosted database change, account clearance, customer message or live activation is authorized by this presentation correction.
