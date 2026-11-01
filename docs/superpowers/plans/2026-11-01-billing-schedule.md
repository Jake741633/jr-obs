# Scheduled billing reconciliation implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans inline, then obtain one fresh review.

**Goal:** Prepare automatic processing of the durable Stripe inbox without enabling billing or adding a public worker API.

**Architecture:** Continue the accepted integration plan's worker scheduling step with one native Netlify scheduled function. Every minute (UTC interval, no local-time/DST dependency), a published production invocation may process at most five events, with a 20-second provider-work budget and 24-second total I/O budget inside Netlify's documented 30-second scheduled limit. Each event still uses the existing service-only queue, current Stripe evidence and atomic lease-fenced completion. No event/body may select a customer, business, price or action.

**Tech stack:** Existing JavaScript server modules, Stripe 23.1.0/API 2026-10-28.endive, native Netlify scheduled `.mjs` entry, Supabase service RPCs/PGlite tests. No new dependencies or schema changes.

**Spec:** `docs/STRIPE_INTEGRATION_PLAN.md` worker/acceptance requirements and `docs/SUBSCRIPTIONS.md` launch requirements. Current foundation is unactivated; continue it without enabling hosted services.

## Global constraints

- All activation flags remain false. Add private `JR_OS_BILLING_SCHEDULE_ENABLED=false`; require it, receipt/reconciliation flags, `JR_OS_BILLING_SANDBOX_VERIFIED`, normal validated private sandbox configuration and trusted published production deployment context before scheduled work.
- Add the scheduler flag to Checkout API/capability readiness. Keep the owner Portal independent of the scheduler toggle so pausing signup/processing does not itself hide invoice/cancellation management.
- Read secrets through the Netlify runtime environment API. Native scheduled functions cannot be invoked by a production URL; do not add a custom HTTP worker path or background endpoint. Do not change region, memory, site settings, keys, hosted schema, charges, emails or live mode.
- Provider reads use the pinned SDK fetch/AbortController transport with zero retries and an absolute timeout covering connection plus full JSON body; per-request limits are bounded by remaining monotonic processing time. Store requests use AbortSignal timeouts bounded by remaining total time and at most three seconds for scheduled work. Never race an uncanceled mutation promise against a timer and return while it may continue writing.
- A processing-budget timeout defers the event with existing SQL backoff and restores its failure budget; real provider errors retain existing retry/review behavior. Stale/expired writes still fail closed. Stop before claiming another event when less than five processing seconds remain.
- Use `.mjs` to match the server modules and avoid an unnecessary types-only dependency. Netlify discovers it outside the publish directory at `netlify/functions/billing-reconcile.mjs`.
- Persist no new business data. Log only fixed outcome/count summaries; never raw provider/database errors, identifiers, bodies, secrets or URLs. This polls received webhooks; it is not a missing-webhook provider sweep or an automated risk workflow.

## Review focus

- Platform deadlines must stop actual I/O; a promise timeout alone cannot leave an unfenced write running.
- Budget exhaustion must not consume ten attempts and strand a valid payment in review.
- Disabled/preview/unpublished contexts must make no database or Stripe calls even if request data claims readiness.
- Concurrent schedules, lost responses and partial batches must preserve existing lease/token fencing and leave unfinished work recoverable.
- A stopped scheduler must block new Checkout readiness while allowing an otherwise configured owner Portal.

### Task 1: Bound worker I/O and preserve retry semantics

**Files:** `lib/server/stripeBilling.mjs`, `lib/server/billingWorker.mjs`, provider-reader/worker tests.

**Interfaces:** Optional trusted `remainingReadMs:()=>number` on `createStripeBillingGateway`; optional `remainingRequestMs:()=>number` on `createBillingReconciliationStore`. Default behavior remains five-second no-retry provider reads/eight-second RPCs. Exhausted provider budget throws fixed `billing_processing_budget_exhausted`; coordinator records `defer`, not `retry`. RPC budget exhaustion returns the existing fixed store-unavailable failure.

- [x] Write/run RED regressions: no provider/store call after exhausted budget; real SDK timeout on a held local response; a spent processing budget defers with no paid write or failure-budget loss. Preserve ordinary outage and lease recovery tests.
- [x] Implement per-request deadlines using Stripe RequestOptions timeout and AbortSignal timeout; pass options to every current-provider read (including account resolution). Preserve evidence-review classification and safe errors.
- [x] Run focused provider/worker/store tests; expected all pass. Commit Task 1.

### Task 2: Scheduled batch and signup readiness

**Files:** `lib/server/billingScheduled.mjs`, `netlify/functions/billing-reconcile.mjs`, `.env.example`, Checkout/status readiness and related tests, new `tests/billing-scheduled-worker.test.mjs`, docs.

**Interfaces:** `runBillingScheduledBatch({env,deployment,fetchImpl,createStore,createGateway,now})` takes only trusted server configuration; `now` defaults to monotonic `performance.now`. Returns disabled/unavailable or a fixed handled/count/stop summary. The native entry reads an explicit private variable allowlist, passes trusted `context.deploy`, logs only this summary and returns an empty response. Schedule is `* * * * *`.

- [x] Write/run RED tests against real local SQL/coordinator/store with a controlled external provider: five-event limit, idle, safe review/retry, budget stop before next claim, budget deferral and late I/O/recovery, duplicate/overlapping invocations, disabled/preview/unpublished contexts and body substitution, no sensitive logs, exact emitted scheduled entry contract. Add Checkout scheduler-off and Portal-independent readiness cases.
- [x] Implement batch/entry/gates and document readiness, cadence, bounds, monitoring and hosted acceptance. Do not enable any flag or invoke an enabled hosted worker.
- [x] Run focused tests, root suite, full lint/build. One fresh review of the stage and its prior billing interaction; fix important findings RED→GREEN, then update draft PR327 and verify exact-tree remote CI/preview. Keep the branch unmerged and billing disabled.


## Local verification before review

Task 1 regressions observed RED: the SDK ignored an exhausted read budget, a held response exceeded its test ceiling, and processing-budget exhaustion was charged as a retry. Per-request limits and existing event-token deferral passed GREEN (43 focused provider/worker/store tests). Task 2's scheduler absence and disabled-scheduler signup readiness were observed RED; the batch/entry/gates passed with real local SQL and controlled provider/lifecycle boundaries. The final root suite passed 2,996/2,996; full zero-warning lint and the production Next.js build passed. Initial concurrent processes lacked completion summaries and were not counted as passing; serial full runs produced the confirmed results. No schema or dependency changes. Fresh review and exact-tree remote deployment checks remain.

## Fresh review and correction

One fresh review found that the SDK's default Node transport measures socket inactivity: periodic response chunks could outlast the remaining budget. Two real SDK/local HTTP regressions reproduced RED at about 750ms and 1,430ms despite 150ms/500ms budgets. Fixed by explicitly using the pinned SDK fetch transport, which retains its native AbortController timer through JSON body reads, and rejecting runtimes without cancellation. The read-client factory preserves that actual production transport in controlled local SDK tests. Tests also verified real connection closure and database deferral after an acquired business lease, with attempts restored and no paid snapshot. All 52 focused transport/worker/batch/provider checks passed after the fix. No Critical or Minor findings were identified. Final full verification follows.

The review assessed this stage and relevant earlier billing integration, not independent certification of the entire older branch. Hosted schedule/context behavior, Stripe flows/key scopes, PostgREST cancellation and true multi-session locking remain acceptance work. Missing-webhook sweeps, automated risk, backlog monitoring, entitlement/AI/founder enforcement and live/VAT readiness remain launch requirements; no activation is implied.

Final post-fix verification: all 2,998 repository tests passed; all 52 focused transport/worker/batch/provider checks passed; full zero-warning lint and the production Next.js build passed. No deferred minor findings. Remote exact-tree CI/preview and native scheduled-function artifact checks follow publishing. No enabled hosted invocation or billing activation.
