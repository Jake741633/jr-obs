# JR AI Daily Assistant

`/ai/assistant` is a compact, read-only briefing for owner, admin and office
accounts. It uses existing account-scoped collection hooks for jobs, quotes,
invoices, planner entries, purchase lists, reminders and certificates. No external
model, API key, new collection, schema change or write action is introduced.

The assistant ranks individual actions by urgency, calendar due date and stable
record ID. Users can choose a focus, search record titles/numbers and open the
relevant workspace. Eight cards load into view at a time, with a Show more
control. Each card explains its reason, next step and saved evidence.

## Connected checks

- **Money:** only sent, part-paid or overdue invoices with a positive remaining
  balance and a valid past due date. Draft, settled and cancelled invoices are
  excluded. Completed/invoiced jobs with no linked non-cancelled invoice get a
  billing review, not an automatic new invoice.
- **Quotes:** saved next-follow-up dates take precedence over the default
  three-day reminder. Recent recorded contact suppresses repeated chasing.
  Expired sent quotes get one pricing-review action; a future agreed contact date
  stays visible and is not overridden. Accepted quotes are checked for both
  quote-side and job-side/snapshot links before conversion is suggested.
- **Site:** active work and visits in the coming seven days are joined to linked
  purchase lists. Missing addresses, missing assigned workers, needed materials
  and unconfirmed deliveries produce one readiness card per job. A planner
  assignment or visit address can satisfy the corresponding job-level gap.
  Closed jobs without a completed certificate get a review of requirements,
  never a conclusion about electrical compliance.
- **Diary:** the existing scheduling engine detects overlapping staff, vehicle
  or job assignments. The assistant excludes cancelled/completed visits, checks
  a seven-day horizon and requires valid explicit times. Multiple shared
  resources for the same pair produce one card. Missing times are not treated
  as a confirmed clash.
- **Reminders:** incomplete reminders due today or earlier remain visible.

The shared invoice/follow-up predicates also correct the existing Today’s
Assistant, Smart Recommendations and daily invoice briefing. Calendar comparisons
use the device's local date; the new assistant refreshes its clock each minute
and when the app regains focus.

## Account and data boundaries

Authorization is checked before mounting any business hooks. Identity resolution
hides the briefing; a change to mode, organisation, user, role or customer scope
remounts both collections and local search state. Every source must be ready
before recommendations appear. Existing RLS, cache, queue, tombstone and conflict
handling remain in place. There is no new response cache or automatic mutation.

The results describe **loaded records**, which may include offline data. The
interface directs the user to check sync status, and never interprets an empty
result as business-wide clearance. Suggestions cannot account for unrecorded
payments, agreements, deliveries or certificates. Users review the source and
perform any changes through existing authorized workflows.

## Verification

`tests/assistant-briefing.test.mjs` executes the actual rules and scheduling
engine, including payment/quote false positives, relationship joins, duplicate
suppression, timing, encoded record links and source immutability.
`tests/mobile-assistant-ui.test.mjs` exercises actual component handlers for
authorization, loading, focus/search, progressive reveal, account-state reset,
modal opening and closing, and role-appropriate shortcuts. Mobile navigation and
manifest tests cover the new routes without broadening access.

Required release gates remain `npm test`, lint, build, TypeScript, dependency
audit, both CI workflows, SQL and full Supabase rehearsals, and preview checks.
Signed-in physical iPhone/Android acceptance and actual production recovery
evidence remain separate requirements in `RELEASE_REVIEW.md`.
