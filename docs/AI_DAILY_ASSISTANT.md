# JR AI Daily Assistant

`/ai/assistant` is a compact, read-only briefing for owner, admin and office
accounts. It uses existing account-scoped collection hooks for jobs, quotes,
invoices, recorded payments, planner entries, purchase lists, reminders, certificates and job tasks. No external
model, API key, new collection, schema change or write action is introduced.

The assistant ranks individual actions by urgency, calendar due date and stable
record ID. Users can choose a focus, search record titles/numbers and open the
relevant workspace. Eight cards load into view at a time, with a Show more
control. Each card explains its reason, next step and saved evidence.

## Connected checks

- **Money:** only sent, part-paid or overdue invoices with a positive remaining
  balance and a valid past due date. Balance uses the existing payment policy: the higher of the invoice paid amount and its linked ledger payments, including credits and refunds. These two paid amounts are not added together. Draft, settled and cancelled invoices are
  excluded. Completed/invoiced jobs with no linked non-cancelled invoice get a
  billing review, not an automatic new invoice.
- **Quotes:** saved next-follow-up dates take precedence over the default
  three-day reminder. Recent recorded contact suppresses repeated chasing.
  Expired sent quotes get one pricing-review action; a future agreed contact date
  stays visible and is not overridden. Accepted quotes are checked for both
  quote-side and job-side/snapshot links before conversion is suggested.
- **Site:** active work and visits in the coming seven days are joined to linked
  purchase lists. Missing addresses, missing assigned workers, needed materials
  and unconfirmed deliveries produce one readiness card per job. Each upcoming visit is checked separately: one prepared visit cannot hide another visit’s missing address or worker. Job-level address/assignment can supply the corresponding fallback for each visit. Missing or invalid visit times produce a timing review rather than a guessed clash. Visit-only gaps link to the affected day; material or job-level checks link to the job.
  Closed jobs without a completed certificate get a review of requirements,
  never a conclusion about electrical compliance.
- **Diary:** the existing scheduling engine detects overlapping staff, vehicle
  or job assignments. The assistant excludes cancelled/completed visits, checks
  today plus six days and requires valid explicit times. Multiple shared
  resources for the same pair produce one card. Missing times are not treated
  as a confirmed clash. Clash links open the first affected day within the horizon, including today for ongoing multi-day clashes.
- **Tasks:** outstanding tasks and snags use their saved priority, category and due date. Urgent work, Safety-category records and past due dates appear first. High priority, due-today and work due through today plus six days follow. Completed/customer-confirmed records are excluded; closed-job and orphaned tasks remain reviewable with their actual source evidence. The Safety label comes from the saved record and is not a new assessment of the installation.
- **Reminders:** incomplete reminders due today or earlier remain visible.

Task priorities, open-task/snag answers and job briefings validate identities across all loaded tasks before filtering by job, type or status. Missing identities and duplicate copies become source-review cards with their open-work counts withheld; completed copies and copies on another job still establish a conflict. Scoped answers describe only the requested job's copies, including when a prebuilt global briefing is available. A warning marks the open-work count as incomplete, and saved urgency or Safety evidence keeps an uncertain source prominent without choosing an authoritative copy. All-closed sources do not create open-work claims. Ambiguous linked jobs never supply a guessed name or address. Review destinations retain role restrictions; oversized task identities use the inbox instead of an unusable exact link. These checks use loaded records only and never update tasks.

The shared invoice/follow-up predicates also correct the existing Today’s
Assistant, Smart Recommendations, daily invoice briefing, home dashboard and
Business Coach outstanding-money totals. Draft invoices are excluded from
outstanding-money figures. Calendar comparisons
use the device's local date; the new assistant refreshes its clock each minute
and when the app regains focus.

## Quick questions on phones

The assistant includes twelve one-tap questions plus a short question field. Supported forms cover today, tomorrow, the next seven days, overdue invoices, all unpaid invoices, quote follow-ups, site preparation, priorities, open tasks, open snags, next-visit checks, materials to order, awaiting deliveries and an individual job briefing. Matching uses explicit local question forms and normalises common phrasing, case and punctuation. Unsupported scopes, compound questions and commands return an explanation and examples; they never trigger record changes or a guessed answer.

Open-task answers include future and undated work as well as the briefing’s attention items. Snag answers only include outstanding snags. Missing/invalid dates and unknown historical statuses remain explicit in the source evidence. Task links carry encoded job/task IDs into the existing office task workspace, which shows only the exact loaded task. Missing or mismatched links cannot silently open another record. A completed task still opens with its current status; navigation does not create or change records.

Task and snag shortcuts can use a saved job selected on the phone. Typed questions also accept “Show tasks for Workshop” or “Show snags at 10 High Street”, using the full saved job title or site address. Matching ignores case, repeated spaces and straight/curly apostrophe differences; it does not guess from part of a name. Quoted names preserve literal punctuation. Duplicate titles, duplicate addresses and title/address collisions show job choices with links to review their details. Four choices appear first, with Show more for the rest. Selecting a choice filters by its saved ID, not its display name.

A submitted job answer stays bound to the resolved saved identity as records refresh. A removed or renamed match cannot silently substitute another job, even if its title is reused. Unavailable scopes show no task results until the user chooses a current record or clears the scope. Typed names take precedence over the shortcut selector. Other shortcuts retain their normal scope. Completed/customer-confirmed tasks stay excluded; outstanding tasks on closed jobs remain visible with their saved job status. Missing task data is still reported separately from an empty result. Scope, choice and question state remain ephemeral under the existing account boundary.

Job briefing requires one chosen job, or an exact question such as “Show job briefing for Workshop”, “Job briefing at 10 High Street” or “What needs attention for Workshop?”. The existing exact-name and duplicate-choice rules apply. The answer combines ranked checks, saved job status/dates, all loaded unpaid linked invoices after recorded payments, ongoing/future planned or confirmed visits, and open tasks including future/undated work. Each record appears once, with priority checks first and four items initially. Invalid invoice amounts and linked visit dates are reported; missing task data remains different from an empty loaded list. A saved job date alone is not a confirmed booking.

Checks carry explicit saved job relationships. Quote-side job ids take precedence; otherwise job source-quote and snapshot links are used. Titles alone never associate invoices, quotes, tasks or reminders. Cross-job clashes keep both visits as evidence while unrelated records stay outside the briefing. Site priorities retain the seven-day horizon, although later bookings remain listed. Closed-job status, billing/certificate reviews and outstanding tasks remain visible without site-clearance claims. The answer refreshes when tasks, visits or payments change and stays bound to the chosen saved identity. No writes, external model or new data collection is introduced.

Job record and job workspace headers offer Ask JR AI about this job to accounts that can access the assistant. The link carries one encoded saved id in `/ai/assistant?job=…` and prepares only a read-only Job briefing when the question panel mounts after all sources are ready. It does not focus the phone keyboard. Other query parameters cannot run commands or create records. Duplicate, empty or oversized ids are reported as invalid and require a choice; unavailable ids never broaden to other job records. User selection, editing and Clear answer take precedence after the initial link. Account remounts retain the existing identity boundary; field/customer roles do not receive the shortcut.

The existing route permissions also control task destinations. Owner/admin and local workspaces retain exact task links. Office accounts review the permitted linked job page; orphan task links go to their jobs list for review. Their task suggestions explain that updates require the management task workspace. The task route permissions and database access rules are unchanged.

Diary answers include planned/confirmed visits that span the selected dates, with actual recorded times and addresses. Active job starts without a matching visit are listed separately as unconfirmed scheduling. Each distinct visit remains visible, but a job is not repeated as an unbooked start when it has a matching visit. Invalid dates are reported; missing or invalid times remain visible for review. Seven days means today plus six calendar days, including month/year changes. These results do not confirm availability or site readiness.

Diary source links open the specific ISO day in `/planner?date=YYYY-MM-DD`. The planner accepts only real calendar dates, changes only the view, and includes multi-day entries overlapping its day/week/month range. Existing create-booking links keep their own workflow.

Money answers distinguish invoices overdue before today from all unpaid invoices, including those not yet due. They reuse the payment-aware balance, aggregate in pence, show source evidence and refuse unsafe numeric totals. Invalid amounts and unknown overdue dates are reported rather than silently implying all records are clear. Quote answers respect agreed follow-up dates even when an expired quote independently needs a pricing review.

Money answers and the daily briefing validate invoice identities across all loaded invoices before filtering by status or job. Missing or duplicate identities with a potentially outstanding copy produce an invoice-inbox review, never a chosen copy, duplicate balance or customer-chase claim. Paid, draft and cancelled copies still establish identity conflicts. Only closed copies without an outstanding candidate do not create a debt review.

Linked payments must have unique saved identities across the full loaded ledger, including copies linked to another invoice or left unallocated. Missing/duplicate identities, unsupported payment types and negative, non-finite or unsafe amounts withhold the entire affected invoice balance. Dropping an uncertain payment must not overstate debt; accepting both copies must not manufacture settlement. Valid payments retain the existing maximum-of-recorded-paid-and-ledger policy, including deposits, stage payments, credits and refunds. Unrelated malformed payments do not suppress a valid invoice. The shared ledger helpers and other dashboards are unchanged.

Uncertain sources appear as read-only Money review cards with saved evidence and the permitted invoice or payment workspace. Answers put these reviews before verified invoice entries, retain four-card progressive reveal, and label numeric results as a verified subtotal with an explicit incomplete-total warning. Existing invalid amount/date exclusions also mark the total incomplete; unsafe aggregate balances never display a numeric total. Job briefings check global identities but expose only the chosen job's invoice-copy evidence. Source refreshes can move an answer from balance to review and back without keeping stale claims. These checks neither reconcile payments nor modify invoice status or records.

Review invoice opens one literal saved identity in `/invoices?invoice=…`, not a number-based text search. Repeated numbers, similar titles and number prefixes cannot substitute another invoice. Empty, repeated or oversized query identities are invalid; unavailable or duplicate saved identities show no invoice cards until explicitly cleared. Refreshes retain the same identity, showing its current number/status or an unavailable message. A review parameter takes precedence over customer quick-create parameters and cannot open a form, record a payment or change status. Oversized historical identities use the explicitly labelled Review invoice inbox link. The source page clearly labels its saved-invoice balance separately from the assistant's payment-ledger-aware balance.

Four answer records show initially, with progressive reveal. Editing a question clears its previous answer; submitting dismisses the phone keyboard. Answers refresh with the loaded collections and the existing local clock. The account-scoped parent remounts question state on account changes, and every source must be ready before the question panel mounts. Questions and answers are not persisted or sent to an external service.

Next visit checks answers “Which jobs need booking?” or “Show next visit checks”, optionally using the phone job selector or an exact saved name/address such as “Show next visit checks for Workshop”. It applies the same identity, duplicate-choice and unavailable-record rules as task questions. Checks cover accepted, awaiting-deposit, scheduled and on-site work; enquiries, unaccepted quotes, closed and held jobs are excluded. An ongoing or future planned/confirmed Job visit counts even outside seven days. History, surveys and deliveries cannot hide a missing work visit.

Uncertain work dates or statuses remain review checks even alongside a valid future visit. Missing bookings receive Next priority with no invented deadline; uncertain records receive Today review priority. Source evidence includes saved job status/date, actual uncertain booking identities and any known work visits. Awaiting-deposit and awaiting-builder jobs get specific review steps before agreeing a visit. These checks also appear once in a job briefing and refresh as records change. Their links open the permitted planner with one encoded saved job id, limiting diary cards, visit planning and reviews to that job while retaining the other affected visit in cross-job clashes. Invalid or unavailable scopes do not broaden to other jobs; oversized historical ids retain their source-job review link. Questions do not book, cancel or change a visit, confirm deposit receipt, or establish availability or site readiness.

Materials to order answers “Which materials need ordering?” and Awaiting deliveries answers “What deliveries am I waiting for?” or “Show awaiting deliveries”. Both use the phone job selector or an exact full job name/address, such as “Which materials need ordering for Workshop?” or “What deliveries am I waiting for at 1 High Street?”. The same duplicate-choice, literal-id, unavailable-record and submitted-answer identity rules apply. Only saved purchase-list job links establish job scope; pricing-document links or similar titles do not infer a relationship.

Answers group matching lines by purchase list, showing four lists initially. Needed and Ordered stay separate, Delivered is excluded, and unsupported statuses appear as uncertain review lines in both answers without being counted as either order stage. Evidence retains each line's description, identity, quantity, supplier and stock code, plus the saved job status. Missing, zero, negative or non-finite quantities produce a source-review warning; quantities are not summed across different materials, inferred from estimates or converted into a cost. Global answers retain unlinked lists, unavailable linked jobs and outstanding records on closed jobs. Ordered is not proof of a late delivery: these records contain no agreed delivery dates. Answers refresh with source records and never place orders or mark receipt.

Review purchase list carries one encoded saved list id into `/purchases?list=…`. The source page shows that list's current lines and totals, including any status or quantity changes since the answer. Invalid, duplicate, oversized, missing or ambiguous ids cannot substitute another list; Show all purchase lists explicitly clears the scope. Oversized historical ids use the general purchase-list workspace instead. Navigation and query parameters cannot create or update records. No source or route permissions change.

## Job-aware follow-ups

The phone question form appears first, followed by its visible job selector. Four primary questions remain exposed; a native More questions disclosure retains all eight other shortcuts without changing their handlers or scope. Longer scope help is separately expandable. Identity warnings and answers remain outside collapsed content. The 48px disclosures do not autofocus, submit, clear state or write records.

A successfully matched named-job question now updates the visible Job scope selector. Tasks, snags, materials, deliveries, next-work-visit checks and job briefings keep that exact saved identity for the next question. Each resolved job answer offers six 48px related-answer buttons, resetting progressive results to four and dismissing the keyboard without navigating away or writing records.

Explicit follow-ups such as “What about materials?”, “And deliveries”, “What about the next visit?” and “Show tasks for this job” use the chosen job. Without a selected identity, the assistant asks for one unique loaded job even if only one is available; it never guesses or runs the question across all jobs. Duplicate/missing job identities, unavailable records and reused titles retain their existing fail-closed behavior. Quoted literal names such as “This job” remain available through exact named-job questions.

An unresolved new named-job question clears the previous job context before another follow-up. Choosing All loaded jobs or Clear answer also removes it. Diary, money, quote and site-preparation shortcuts keep their existing global scope and do not claim to answer for the selected job. Unsupported, mixed-topic and mutation requests remain unsupported. No conversation history is persisted or sent externally; the context lives only in the existing account-scoped question panel.

Older related-answer and job-choice callbacks cannot restore cleared answers or replace subsequent input, scope choices or shortcuts. A deferred initial job-link frame cannot override an interaction already made by the user. Refreshed records still determine whether the retained identity is available. Behavioral tests exercise the actual handlers, progressive choice lists, unavailable/duplicate records, office destinations and source immutability.

## Account and data boundaries

Scoped questions require a unique saved job identity across the complete loaded job collection, even if only one duplicate copy matches the typed name/address. Missing or duplicate job identities cannot appear as selectable phone choices. A retained or linked selection becomes unavailable/ambiguous until that exact identity is unique again; a reused title cannot substitute another job.

Materials and delivery status counts exclude missing/ambiguous purchase and line identities. Duplicate list identities produce one explicit source review with saved-copy evidence; conflicts outside the selected job do not broaden its evidence. Conflicting line copies are reviewed together, including any Delivered copy needed to explain the conflict, without being counted as outstanding. Missing or oversized list ids offer Review purchase inbox explicitly. Empty saved lists, absent descriptions and unavailable/ambiguous linked jobs remain reviewable rather than implying requirements are covered. Existing four-card reveal and source links are retained; Source details and Clear answer have 48px touch targets. No copy is chosen as authoritative and no records are changed.

Authorization is checked before mounting any business hooks. Identity resolution
hides the briefing; a change to mode, organisation, user, role or customer scope
remounts both collections and local search state. Every source, including the payment ledger and task records, must be ready
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

Payment regression cases execute the actual ledger policy, assistant, Today and Smart Recommendations, including full/partial payments, credit notes, refunds, overpayments, unrelated invoices, avoiding duplicate paid amounts, ledger readiness and source immutability. Existing payment-policy semantics and records are unchanged.

Quick-question regression tests execute the actual answer rules and form handlers, including unsupported intent, calendar boundaries, spanning visits, duplicate suppression, invalid data, payment totals, follow-up agreements, source links, progressive reveal, stale-answer clearing, record refresh and read-only planner navigation.

`tests/task-inbox.test.mjs` executes task priorities, evidence and exact task links, mobile search/filters, progressive reveal, completed/deleted target updates and read-only navigation. Assistant tests also cover task readiness, narrow snag scope, unsupported task commands and live completion updates.

Calendar and site-readiness regression cases cover each visit independently, missing-time reviews, consistent seven-day horizons and targeted clash dates. `tests/planner-calendar.test.mjs` checks week/month/year boundaries, leap days, monthly recurrence, local Today across timezones, invalid range rejection and actual planner navigation/create/move handlers.
