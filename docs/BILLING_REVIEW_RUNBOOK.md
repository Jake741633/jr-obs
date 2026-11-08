# Private JR OS billing review recovery

Prepared and inactive. This tool clears a reviewed application flag in the sandbox billing binding. It does not make payments, change a Stripe dispute/refund or restore old paid/trial coverage. Hosted schema/configuration, operator access, current-provider reconciliation operations and end-to-end acceptance remain prerequisites for activation. Existing JR access is unchanged.

## Inspect a case

Use a controlled operator environment with the existing private `SUPABASE_SERVICE_ROLE_KEY` and `NEXT_PUBLIC_SUPABASE_URL`. Tenant accounts and public keys have no review permissions. The CLI does not need a Stripe key; inspect current payment resources in the authorized Stripe Dashboard separately. Keep credentials out of arguments, output and case notes.

```sh
node scripts/review-billing.mjs --organisation BUSINESS_UUID
```

The default command only reads. `held` returns the exact Customer, `reviewVersion`, first marker, up to 20 unresolved signal summaries, total `signalCount`, `truncated` and `reconciliationBusy`. `clear` means the Customer flag is clear at inspection time; it does not establish payment coverage or clear a separately uncertain Checkout operation. `unbound` requires investigation of the intended business binding.

Review every unresolved signal against current provider records and the case history. New verified signals advance the version even while the first marker stays the same. Missing/gapped/mismatched evidence and cases exceeding 20 unresolved signals remain held for further investigation. The tool cannot resolve them by overlooking omitted evidence.

## Record an explicitly reviewed decision

The private `JR_OS_BILLING_REVIEW_RESOLUTION_ENABLED` flag defaults to false. Only an authorized operator environment enables it after hosted acceptance. A tenant request cannot enable it. Record a case reference, a meaningful reason and one fresh resolution UUID; retain that UUID and the **identical** decision arguments for uncertain-response retries.

```sh
node scripts/review-billing.mjs --resolve \
  --organisation BUSINESS_UUID \
  --customer cus_INSPECTED_CUSTOMER \
  --version INSPECTED_VERSION \
  --resolution-id RESOLUTION_UUID \
  --operator-reference ops:JR-100 \
  --note 'Reviewed all current payment signals under case JR-100.'
```

The operator reference is an operator-supplied audit label. Service authorization proves access to the controlled process; the label does not independently authenticate a person. The future operator authentication, credential scopes, audit retention and monitoring policy still need deployment acceptance.

| Result | Meaning and next action |
| --- | --- |
| `cleared` | The exact version was audited, its Customer marker cleared and **all** old paid-through/invoice/trial coverage on that binding invalidated atomically. Inspect again and obtain fresh normal provider reconciliation. |
| `already_recorded` | The identical resolution UUID was recorded earlier. This says nothing about a newer hold; inspect current state. |
| `stale` | The version changed. Inspect and review every new signal, then create a new decision/UUID. |
| `busy` | A current reconciliation lease owns the business. Allow that work to finish, then inspect again. |
| `needs_investigation` | Evidence is absent, incomplete, inconsistent or exceeds the 20-signal bound. Keep the hold while further operator tooling/investigation addresses it. |
| `conflict` | A resolution UUID was reused with different arguments. Preserve the existing audit and investigate the mismatched request. |
| `unbound` / `not_held` | The exact binding was not found or no matching hold remains; inspect the intended business. |

Exit 0 means successful inspection or a recorded decision. Exit 1 means an acknowledged non-success resolution state. Exit 2 means disabled/invalid/unavailable tooling with a fixed safe code. A lost response can have committed; retry the same decision rather than guessing a new UUID. The command never logs raw provider/SQL errors or the secret key.

## After clearance

Clearance never grants paid features. Provider subscription status and price remain unchanged while paid-through, paid-invoice and trial dates are nulled. Normal current-provider reconciliation must verify new coverage before the pure policy can allow it. This command does not fabricate a Stripe webhook or requeue an already processed event; a duplicate resend retains normal inbox deduplication. Fresh reconciliation/recovery operations are still required before commercial launch.

Existing nonterminal subscriptions still prevent duplicate signup. Separately uncertain Checkout operations, unknown/unbound/unsupported risk events and cases larger than 20 signals need their own operational resolution. New verified financial signals create a new hold/version, and ordinary paid updates cannot clear it. Otherwise configured owner Portal management remains available.

A review learned from a successful status read stays visible through loading and unavailable refresh results. A later successful current status read replaces that remembered status; a denied status read discards it and shows the sign-in state. A review reported directly by Checkout is intentionally retained for that owner-screen instance because a separately uncertain operation may not appear in Customer status; ask the owner to reopen Settings → Subscription & billing after operator resolution in that case. A later update cannot recall previously delivered provider URLs or prevent Stripe administrator changes to issued Portal configurations.

Signals and resolutions are retained in `jr_billing_review_signals` and `jr_billing_review_resolutions`. RLS and grants exclude browser roles; the application service role can SELECT/INSERT but cannot UPDATE/DELETE/TRUNCATE audit rows. Database administrators remain trusted. No retention/deletion workflow is implemented by this stage.

After a trial's old date is invalidated, a still-trialing record displays “Trial confirmation needed”; a known past date still displays “Trial ended”. A Checkout-return URL hint appears only after a successful current status read with no review and no subscription or missing active/trial coverage. Confirmed coverage, ended periods, payment-attention states and unavailable/denied status take precedence over that hint. None of these labels restores coverage or triggers a provider check; fresh reconciliation operations are still required.

For an open Checkout on another plan, the owner screen explains that choosing the original plan resumes its checkout, or the owner can wait for it to expire before choosing a different plan. Refreshing stored status does not itself expire or switch a Checkout. The existing server operation remains authoritative, including if readiness, review or provider state changes before retry.
