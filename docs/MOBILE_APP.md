# JR OS on a phone

JR OS can be installed from its normal HTTPS address as a home-screen app. It
opens in a standalone window and uses the existing role-aware mobile workspaces.

The phone header keeps workspace and account access above the page content. The
bottom tabs remain within thumb reach, with an Account tab when cloud sign-in is
required. Sync status appears only after account checks succeed; signed-out users
see Sign in. Header, content and shared action bars respect the phone's safe areas
in portrait and landscape. Page zoom remains enabled.

The account screen puts sign-in first, with a single-column form, password
visibility control and announced request feedback. Submitting or changing
accounts clears the submitted password and hides it again. A verified account
can open its role-appropriate workspace directly. Cloud configuration and data
migration tools remain available in a collapsed section below installation help.

## Faster everyday actions

JR AI puts Your question before the job selector and shortcut grid, without automatically opening the keyboard. Today, Tomorrow, Job briefing and Materials to order stay immediately visible. More questions reveals the other eight shortcuts, including money, quotes, tasks, snags, next visits and deliveries. How job scope works keeps longer guidance available on demand. Both are native keyboard-accessible disclosures with 48px targets; the visible job selection and ambiguous-identity warnings never hide inside them. Opening help or extra questions does not submit, change scope or clear a typed question/answer. No new storage or account state is introduced.

The phone header's **+ Quick actions** button opens a native modal sheet with
large targets. Office accounts can open quick quotes, JR AI, customers, surveys
and the planner; field accounts get assigned jobs, diary, materials, testing and
snags. The sheet closes on navigation and resets with the account. Signed-out,
unresolved and customer sessions do not receive office or field shortcuts.

Office bottom tabs now put **JR AI** within one tap. Customers remain available
from Quick actions and More → Daily tools, including workspace search. The
assistant opens a compact priority list rather than the full command centre.
See [Daily Assistant](AI_DAILY_ASSISTANT.md) for the checks and their limits.

On browsers that support app-icon shortcuts, long-pressing the installed icon
can expose Workspace, Daily assistant and Quick quote. These are ordinary
guarded routes: a shortcut never grants access to another role's workspace.
Availability depends on the device and browser.

## Customer inbox

Customers shows eight cards first, with eight more per tap. Labelled search
matches words across the saved name, phone, email and address, including phone
numbers without spaces or brackets. Search and Clear customer search reset the
reveal without discarding an open form; Enter dismisses the search keyboard.
Notes remain outside search. Customer review links encode the exact saved ID,
and linked job record counts wait until the job collection finishes loading.

View, edit, delete and contact controls have 48px targets. Phone entry uses the
phone keyboard, long contact details wrap, and the page leaves room for bottom
navigation. Call and Email open the user's phone/mail app with the saved contact;
they do not log an interaction, send a message or add a subject/body. Unsupported
formats remain visible for review instead of creating an uncertain dialing or
recipient link. Signed-in physical-phone acceptance remains pending.

Customer creation and edits now use the durable collection methods before
closing the form. Failed saves retain editable details, with the same new-record
identity and creation time on retry. Older form callbacks and repeated successful
taps cannot save another copy or overwrite a newer draft. A changed name,
contact, address, note or creation identity requires explicit Use saved values
review; unrelated current metadata is preserved. Closing or leaving still loses
unsaved changes, and the form explains this. Success confirms the device save and
asks the user to check sync before switching devices.

Owner/admin deletion waits for loaded customer and linked-job records, checks
the exact unique saved customer and rejects an open edit for that customer.
It rechecks account permissions, current details and loaded job links after
confirmation; failed deletion leaves the customer visible. Office users can
create and edit, while cloud field/customer or unresolved identities cannot
write from this inbox. Local mode keeps its existing local workspace behavior.
These are client workflow guards using existing persistence and access rules;
they do not make customer/job changes into one atomic transaction.

## Customer profiles

Customer profiles provide 48px section shortcuts for jobs, quotes/estimates,
invoices and history. Relationship metrics stay available in a native disclosure.
Linked record groups start with four cards each and reveal four more per tap;
their headings retain the full loaded counts. Job cards offer a direct JR AI
briefing for the exact saved identity. Job, quote and invoice review links encode
that identity. The page leaves room for both the contact dock and app navigation.

History starts with eight activities, supports type and multiword searches across
the visible activity labels, descriptions and status, and reveals eight more per
tap. Changing or clearing filters resets history paging; Enter dismisses the
search keyboard. Switching customer routes starts with that customer's default
browsing controls. Filters and progressive browsing do not change saved records.

The profile requires one exact nonblank customer identity before showing contact
actions or CRM records; missing and duplicate identities need review. Call, Text
and Email use the same validated contact targets as the inbox. Unsupported saved
formats stay visible with review prompts, and the review-request composer cannot
use an unsupported recipient. Financial calculations retain their existing behavior.

Complete opens an unselected job picker, with the exact job, site and current stage
shown before confirmation. It excludes completed, invoiced, paid, cancelled,
on-hold, unsupported and ambiguous jobs. Book work only prefills a job when there
is one eligible linked identity. Completion uses the durable job update, checks
the current record again after confirmation and preserves unrelated newer details.
Failed saves retain the selection; changed job details or stage require choosing
the current record again. If the job saves but its completion note fails, a separate
retry retains the original note and does not repeat or regress the job change.

Review opens an editable message with a validated text/email recipient. Preparing
or opening the message writes no customer records. The user sends it in their own
app, then explicitly chooses Record request as sent. This records the user's
confirmation and original recipient, with delivery explicitly unverified. A
changed contact requires a fresh draft before opening the composer. Once confirmed,
failed saves retain one interaction identity and confirmation time; a partial save
retries only the remaining customer care status, without sending again. Existing
received reviews, newer request dates and unrelated profile details are retained.
Conflicting/failed sync and replaced or ambiguous evidence require review.

These actions require loaded sources, a unique current customer and office
permissions in cloud mode; local mode retains local access. Account or route
changes invalidate old callbacks. Temporary source loading retains open drafts and
pending retries. Leaving the page or changing account loses unsaved work, as the
panels explain. Success confirms a device save and asks the user to check sync;
the separate job/note and interaction/profile writes are not atomic transactions.
Deterministic fixtures cover browsing, persistence failures and stale callbacks;
signed-in physical-phone acceptance remains pending.

## Follow-up Centre

The contact queue starts with eight ranked records and reveals eight more per tap.
Find a follow-up matches every search word across the visible name, work/detail,
reason, phone and email, including phone numbers without spaces or brackets.
Search, reason changes and Clear follow-up filters reset the reveal; Enter dismisses
the phone keyboard. Controls use 48px targets and phone-sized text. Account changes
reset browsing filters.

Overview figures and Who to contact today sit in native disclosures. The overview
describes the whole loaded queue; recommendations follow the active search/reason
filters and open the source record directly, including when it is outside the
first eight cards. Quote/customer paths encode their exact saved IDs. Call, Text
and Email use validated recipient links; unsupported formats remain visible with
review prompts and disabled contact controls. These strings no longer earn the
contactability score boost or count as ready-to-contact recommendations. Valid
future lead follow-up dates suppress all surfaced lead stages until the saved day.

Follow-up rules use durable create/update methods. Editing does not recalculate
the queue until the rules save. Failed saves retain the draft; first-save retries
use the same settings identity. Whole-day windows accept 1–3650; the value threshold
must be finite, non-negative and have at most two decimal places. A changed saved
record requires Use saved values before editing again, and updates preserve other
record fields. Failed/conflicting sync requires review. Missing identities or
multiple settings records pause the queue rather than choosing the first record;
invalid saved numbers can be repaired explicitly in the editor.

Rule changes require loaded settings and office permissions in cloud mode, with
local mode retaining local access. Old callbacks cannot save after an account
change or replace newer edits. Loading retains drafts; leaving the page or changing
account loses unsaved edits. Success confirms the device save and asks the user to
check sync.

Log contact opens a review panel without writing anything. Choose the method actually
used (Call, Text, Email, WhatsApp or Site visit), add an optional outcome and confirm
the displayed schedule. Composer links never log contact or confirm delivery; a site
visit can be recorded without a supported phone/email link. Postpone has its own
review panel with tomorrow, 3-day, 1-week and 2-week choices. Dates use the current
device-local calendar and date-only arithmetic; a draft left overnight requires
fresh review. The queue uses that same local day when it recalculates.

Both actions save the exact source through durable update methods. Contact history
uses durable creates with stable identities and timestamps. Lead-linked quote IDs
do not redirect a lead action to its quote, and customer reminders update only the
selected profile. Lost re-engagement and completed reminders do not claim a new
follow-up date. Updates preserve unrelated metadata. Changed/closed records,
ambiguous identities, replaced or relinked sources/customers, changed rules and
failed/conflicting sync require review before the initial write.

If the source saves but a history write fails, Retry remaining history stays above
the queue even when the item disappears or filters/rules/loading hide the queue.
It writes only missing original history and preserves later source stages/dates.
Different, ambiguous or missing refreshed evidence blocks a retry. Account changes,
revoked permissions and old callbacks cannot write. Keep the page open until all
steps finish: drafts and retry state are held for this page session, not restored
after navigation. Success confirms a device save and asks the user to check sync.
Populated fixture checks cover browsing, storage failures, partial retries, identity
boundaries and local dates; signed-in physical-phone acceptance remains pending.

## Jobs inbox

Jobs opens with labelled search and a stage filter, with eight cards shown first
and eight more per tap. Search combines words across the saved job title, site,
customer or builder and stage, while keeping notes and prices out of search.
Active work excludes Complete, Invoiced, Paid, Cancelled and On hold; Closed jobs
includes the first four recorded stages and does not mean every invoice is paid.
Known legacy stages retain their existing mapping. Missing or unsupported stages
appear under Needs status review, with an unselected quick-status control rather
than an invented Enquiry stage. Field status transitions keep their existing rules.

Search, stage changes and Clear job filters reset the eight-card reveal and retain
an open job draft. Enter dismisses the search keyboard. Controls have 48px targets
and phone-sized text. Office job cards offer Ask JR AI about this job, preserving
the exact saved identity; field roles retain their existing job routes and do not
receive office assistant links. Browsing does not write job records.
Physical-device and populated signed-in acceptance remain pending.

Job creation and the edit form now confirm the existing durable device/queue save
before closing. Storage failures retain the editable draft, and creation retries
reuse the same job identity and creation time. Repeated submissions and callbacks
from an earlier draft cannot create another job. Leaving or closing the form loses
unsaved changes, as the form explains. Finite, nonnegative values, valid optional
dates, a reviewed stage and unique current customer/builder selections are required.
Unsupported saved stages require an explicit choice; their review note does not
invent a previous Enquiry stage.

Edits preserve newer unrelated job metadata and refuse to overwrite changed form
fields, stages or replacement records. Use saved values explicitly reloads the
current job into the form. Missing or ambiguous job identities cannot be edited or
deleted. Creation, edits, note retries and deletion recheck current readiness and
account permissions, including old callbacks after account changes or unmount.
Office editing and owner/admin deletion retain their existing access boundaries.
Quick-status controls also confirm the durable save before displaying the new
stage or reporting a queued field change. A failed write retains the saved stage;
repeated taps do not write again or duplicate history. Changes operate on the
latest record, preserve unrelated details and reject a changed stage, replacement
job, unavailable/duplicate identity or open edit form. Controls explain why a
change is unavailable. Current account, readiness and team-identity checks also
apply to old callbacks after refresh, account changes or page unmount.

Quick status reads the current account's queue before writing, so a failed or
conflicted attempt blocks another change even before a sync event reaches the
screen. That failure replaces any older pending feedback. Field accounts retain
the existing permitted transition graph, ordered offline changes and secure RPC;
their timeline history remains server-authored. Field stage saves do not depend
on office customer, builder or timeline collections. Office quick changes use the
same separate timeline-note retry as the edit form. A device save or an empty
queue never independently claims cloud confirmation.

If the job saves but its creation or edited-stage timeline note fails, a separate
panel identifies the saved job and retries only that original note. Multiple notes
remain separate, keep their IDs and event details, and cannot replace conflicting
or duplicated timeline records. Retries require the same uniquely identified job
and never repeat the job write or change a later stage. Pending notes stay only
while the page is open; the panel explains this. Device-save messages do not claim
cloud confirmation.

Deletion retains its confirmation and removes the card only after the durable
remove succeeds. It rechecks the record and permission after confirmation and
refuses changed records or an open edit draft. Failed deletion keeps the saved job
available to review and retry.

## Quote inbox

Quotes & Estimates now opens with its four overview figures behind a native, 48px Quote overview disclosure. The figures still describe all loaded quotes and explicitly remain independent of inbox filters. Saved documents have labelled search across number, title, customer/builder name and site address, document-type and saved-status filters, plus Clear filters. Needs status review surfaces unsupported historical statuses without changing them or presenting them as Draft. Saved Expired is a recorded status, not a recalculation from the validity date.

Eight cards appear first, with eight more per tap; search and filter changes reset that reveal. Searching, filtering, clearing and expanding the overview preserve an open quote draft. Enter dismisses the search keyboard. Document cards show the site address, stack actions on narrow screens, provide 48px view/edit/delete/status/job-link targets, and encode saved identities in navigation links. Quick fixed-price quote opens the existing mobile builder when no full-builder form is open. These inbox controls are presentation and navigation only; quote calculations, saved status changes, deletion, job conversion and persistence policies retain their existing behavior. Physical-phone and populated signed-in acceptance remain pending.

## Task inbox

The office Tasks & Snagging workspace starts with outstanding work. Open, Due, Snags, Completed and All filters, job selection and a combined task/job/address search narrow the list. Due means today or earlier using the device’s local calendar date; missing or invalid dates are not treated as overdue. Counts apply to the selected job before text search. Eight cards appear first, with Show more for the rest.

JR AI links open the exact task and show its current status, even if it was completed after the answer. A missing or mismatched link shows an unavailable message with a way back to all open tasks. Loading and account changes retain the existing access boundaries. Search, filtering and navigation do not write business records.

Task links now validate the full loaded identity set on every render. Blank, repeated and oversized link parameters fail closed; no unscoped cards flash before the initial link resolves. A missing, moved or duplicated target remains unavailable until that original identity is usable again or the user explicitly changes the inbox scope. Job-only scopes also remain unavailable after removal or duplication. Uniquely identified orphan tasks remain reviewable without guessing a linked job.

Inbox status counts exclude missing or duplicated task identities across all loaded statuses and jobs. A visible warning marks the count incomplete. Ambiguous copies remain visible through ordinary inbox filters for review, with status and delete buttons disabled; filters cannot make another copy authoritative. Job selectors and new-task creation accept only unique loaded jobs. Current source snapshots also reject old status/delete callbacks after ambiguity, loss of readiness or page unmount, and deletion rechecks after confirmation. Timeline retries refuse duplicate task or note identities. Existing valid status transitions, preservation of newer unrelated fields and durable-write behavior remain unchanged. Search dismisses the keyboard on Enter, resets eight-card paging when changed and keeps an unsaved task form intact.

The JR AI question panel includes a job selector for Job briefing and Open tasks/Open snags and accepts a full saved job name or site address in a task question. Ambiguous names show progressively revealed job choices with direct review links. Answers retain the selected record identity across refreshes and do not substitute another job after a record disappears. Job briefing connects ranked checks, recorded job status, unpaid billing, upcoming visits and open work using saved links. Job record and workspace headers include Ask JR AI about this job for permitted accounts. The link opens the briefing for that saved id without choosing the job again; it does not open the phone keyboard. Missing ids stay unavailable and invalid/duplicate link ids require an explicit choice. Cross-job clash evidence is retained and duplicate answer records are suppressed. These controls have 48px touch targets; submitting still dismisses the phone keyboard.

Task and snag creation uses the existing durable creation method before clearing the form. A storage/queue error keeps the editable draft and the same record ID for retry; repeated submission after success cannot create another task. If the task saves but its creation note fails, a separate action retries only that timeline note. It retains the original note ID, recognises an existing matching note and refuses mismatched or missing task links. Multiple pending notes remain separate.

Task status buttons share the existing management transition rules with the save handler. The current stage is marked separately, unavailable changes are dimmed, and customer confirmation is enabled only after completion. Confirmed tasks must reopen before another stage; unknown historical status is flagged for review. Touch targets remain 48px. Field-account permissions and their narrower transition rules are unchanged.

Status changes and deletion also persist through the existing repository before reporting success or removing the card. A failed write retains the saved task state and explains that the change could not be confirmed. Status updates use the latest loaded record, preserving other edited fields, and refuse stale status/job changes. Repeated status taps do not create another update or timeline note. Deletion keeps its confirmation and refuses a record that changed after the card was rendered.

If a status change saves but its timeline note fails, the same note-only retry retains the original transition details and ID; it never changes the task's current status. Retries require the task to remain on the same job and cannot overwrite a conflicting note identity. The shared durable update/deletion methods preserve queue versions, creator metadata, account-scoped storage and read-only capability restrictions; other collection callers retain their current APIs.

The page distinguishes a device save from cloud confirmation. Unsaved timeline retries exist only while the page is open, and the failure notice explains that leaving retains the saved task change but loses the unsaved note. Account changes retain the existing page-remount boundary.

Next visit checks is a JR AI shortcut for accepted or on-site work needing another recorded work visit or a booking review. It uses the job selector and exact-name/address questions, starts with four answers and updates when bookings change. Job briefings include the same check without counting a survey or delivery as the next work visit. It keeps deposit/builder dependencies explicit and opens that saved job's diary scope for review; it does not book a visit.

## Materials and deliveries

Resolved JR AI job answers now offer one-tap Job summary, Job tasks, Job snags, Job materials, Job deliveries and Next work visit follow-ups. A full-name/address question updates the visible Job scope, so the next related question stays on that exact job. “What about materials?” and “And deliveries” work for the selected job; with no selected job, JR AI asks you to choose instead of answering across all jobs. Clear answer or All loaded jobs clears the context. An unresolved new named-job question also drops the previous context. These 48px controls and typed follow-ups are read-only, reset the four-record reveal and retain existing account and unavailable-record boundaries. Diary, money, quote and site-preparation shortcuts keep their normal global scope. A separate Invoice & quote questions for this job disclosure adds unpaid invoices, overdue invoices and quote follow-ups for the selected job. Named questions such as “Show unpaid invoices for Workshop” and follow-ups such as “What about unpaid invoices?” retain that exact identity. Opening the disclosure does not submit or change scope. The finance answers use saved job links and do not pull in other work merely because it shares the customer; global money and quote shortcuts remain explicitly global.

JR AI offers Materials to order and Awaiting deliveries, with the existing job selector and exact-name/address questions. Four purchase-list answers appear first with progressive reveal. Each answer keeps the saved line quantities, supplier and stock code available under Source details. Unknown statuses and invalid quantities are explicitly reviewable; the assistant does not assume an order was placed or a delivery is late.

Job scope and named-job answers now require one unique saved identity across all loaded jobs. Missing or duplicate identities are excluded from phone choices and cannot be resolved by the first matching title or address. A previously selected identity remains unavailable/ambiguous after refresh until that same identity is unique again. Other matching jobs remain explicit choices. This applies to job briefings, tasks, snags, next-visit checks, materials and deliveries.

Material and delivery answers withhold status counts for missing/ambiguous purchase or line identities. Duplicate purchase identities appear as one source review with their saved copies, quantities, statuses, supplier and stock code; job-scoped evidence stays on that job even when the collision occurs elsewhere. Conflicting line copies remain together for review without inflating ordering/delivery counts. Missing or oversized purchase ids offer an explicitly labelled purchase-inbox review instead of claiming an exact list. Empty saved lists, missing descriptions and unavailable/ambiguous linked jobs remain reviewable. Source details and Clear answer now have 48px targets. These checks never rewrite records or choose a loaded copy as authoritative.

Review purchase list opens just the exact saved list, with its current lines and totals. The initial link resolves before list results appear. Empty/duplicate/oversized link ids, missing lists and duplicate saved identities show a clear unavailable/invalid state instead of broader results. Show all purchase lists clears that selection for the mounted page; reloading replays the original link. Collection refreshes retain the saved identity, including when a title is reused. The link does not open the keyboard or perform an action. Quantity, unit-cost and status controls on the purchase page now have 48px touch targets. Existing creation/editing permissions are retained.

Purchase-list creation confirms the device save before clearing the selected pricing document and job, then opens the newly saved list. Failed saves retain those selections and reuse the same list and line identities on retry, using the current source values. Repeated taps and callbacks from an earlier selection cannot create duplicate lists. Invalid material descriptions, quantities or costs and unavailable linked jobs block creation. The success message distinguishes device persistence from cloud sync and does not claim that a supplier order was placed. The retry is retained only while this page stays open; the failure message states that leaving loses the unsaved retry. Creation selectors have 48px touch targets.

Quantity, unit cost and status changes now remain editable line drafts until Save line. Empty partial input does not write a zero quantity. Positive finite quantities, nonnegative finite costs and a known status are required before persistence. Totals, delivery counts and delivery icons use saved values until the durable update succeeds. Each line shows its current saved values alongside the unsaved draft; failed saves keep the editable draft and cannot claim success. Use saved values discards only that line's draft; Discard all line drafts also clears drafts for records no longer visible. Leaving the page loses these unsaved drafts, as the notice explains. The controls use 48px targets and 16px input text.

Line saves operate on the latest loaded list and preserve unrelated lines, notes and list metadata. A changed line, missing/duplicate line identity or changed job/pricing source blocks an older draft until its saved values are reviewed. New draft input and discard actions invalidate older save callbacks; repeated successful submissions do not write again. Unknown saved statuses remain explicitly reviewable and require a valid choice before a line save. Existing field privacy and route access are retained.

List deletion requires an explicit confirmation and a durable remove before the card disappears. Failed writes keep the saved list available; changed or ambiguous records and pending line drafts block deletion. Deleting a list opened through an exact review link leaves that link unavailable instead of substituting another list. Successful saves and deletes distinguish device persistence from cloud confirmation. Status edits record the user's choice and never place a supplier order.

Purchase browsing provides All, Need ordering, Awaiting delivery, Delivered and Review filters. They match whole saved lists, keeping every line of a matched list available for review. Need ordering matches at least one Needed line; Awaiting delivery matches at least one Ordered line without claiming lateness; Delivered requires a nonempty list with every line marked Delivered. Review includes unsupported statuses, invalid quantities/descriptions/identities, empty lists, unavailable job links and, for office roles, invalid cost values. Global results retain unlinked lists and lists on closed jobs. Counts use the selected job before text search.

Find a purchase list searches saved number, title, notes, linked job name/address, material description, supplier, stock code and status. Every word must match; prices are not searchable. Job selection uses only an exact unique saved identity. Removed or ambiguous jobs stay unavailable, including when another job reuses their name. Eight list cards appear first, with eight more at a time; search, job/status changes and Clear purchase filters reset the limit. Controls have 48px targets and 16px text inputs. Filters never write records or discard line drafts. Hidden drafts retain the page-wide notice and discard action.

Exact JR AI purchase links bypass browsing filters and keep their existing unavailable/invalid identity states. The browsing controls appear after Show all purchase lists, which resets them. A newly created list also opens directly, even when the prior browse filters would exclude it. Summary values apply to all matched lists rather than only the revealed cards. Committed spend includes only Ordered/Delivered lines. Invalid, missing, negative or overflowing quantity/cost values are excluded from amounts and marked as a known partial total requiring review; they cannot become a clean zero, NaN or Infinity display.

## Stock-code lookup

Supplier material lookup is separate from saved-stock lookup. Its labelled supplier and code controls, search, cancel and clear actions use 48px targets. The code field has a search keyboard action, no autocapitalization and an 80-character limit; submitting a valid lookup dismisses the keyboard. Pending feedback is announced. Cancel retains the supplier and code, Clear lookup retains only the supplier, and a 20-second client timeout releases a stalled request for retry.

Editing either field clears the previous result and aborts the older request. Late responses, older form callbacks and completions after leaving the page cannot replace a newer search. Results must match the submitted supplier/code and contain audited HTTPS supplier links. A non-exact candidate opens supplier search rather than presenting the first suggested product as an exact match. The result explicitly asks for product, availability and account-price confirmation and never claims an order was placed.

The existing authenticated endpoint, role checks, server supplier allowlist and no-store behavior are unchanged. Responses are suppressed when the captured session ownership changes, including an account switch away and back; existing account-remount boundaries remain. No lookup history, prices or catalogue records are saved. Signed-in live supplier results and physical phone keyboard behavior remain acceptance checks; deterministic tests cover pending, cancelled, timed-out, failed, malformed and out-of-order responses without contacting suppliers.

Find stock by code matches saved stock/material ids and supplier stock codes in full, ignoring surrounding whitespace and case. It retains every matching stock line across locations. One unique saved stock match can be selected for review; multiple matches require a choice. Four result cards appear first, with four more at a time. Each card shows location, quantity with its saved unit, stock code and exact record identity. Missing/duplicate stock identities cannot be selected; duplicate catalogue identities cannot supply an arbitrary code alias, and duplicate location ids cannot supply an arbitrary label. Code lookup and selection write no records and remain available to read-only field cloud accounts.

Editing the code clears the prior stock selection and results while retaining quantity, job and usage notes. Blank/unmatched lookups cannot leave a previous stock line ready for deduction. Enter runs lookup without submitting the stock-use form. Older result buttons and stock-use callbacks are invalidated after new input/lookup. Source refresh retains the exact chosen identity, marks changed/missing/ambiguous selections for review and blocks deduction until reviewed; a reused description cannot substitute another record. Lookup, result choice, progressive reveal and stock-use buttons have 48px targets.

The existing stock-use flow now rejects ambiguous stock/job identities, invalid saved stock quantities/units and nonfinite or nonpositive usage quantities before a write. Repeated callbacks after a completed use cannot deduct twice. Stock, movement and job-usage writes still use their existing separate workflow; this lookup increment does not introduce an atomic multi-record save. Cloud electrician stock/request writes remain locked.

## Low-stock request saves

The phone Materials & Stock workspace uses Review request before a replenishment save. The unsaved review shows the exact linked job, quantities with their saved stock units, supplier, stock code and unit cost. Save request persists through the existing durable purchase collection before reporting a device save. It opens the exact saved request for review and distinguishes device persistence from cloud sync and supplier ordering. Existing cloud electrician sessions remain read-only.

A failed save keeps the review, request id, line ids and creation time for retry while the page stays open. Leaving loses the unsaved review. Repeated successful callbacks, discarded reviews and callbacks from an older review cannot create another request. Discard request changes no saved records. Review current stock rebuilds the unsaved review with the same request identity; changed or missing jobs, stock, material details, open requests and number collisions require this review before saving.

Open material requests and undelivered lines from previous generated stock replenishment lists are excluded, including stock without a linked catalogue material. Delivered lines can be replenished again. Invalid, negative, nonfinite or overflowing quantities/costs, duplicate stock identities, unsupported stock units and missing/ambiguous material links cannot generate a request. Linked material/stock units must agree. These checks do not alter stock, purchase statuses or supplier orders.

## Diary booking saves

New bookings persist each visit through the existing durable creation method before clearing the form. Failed first saves keep editable details and reuse the original record identities on retry. Success says saved on this device and asks the user to check sync status before switching devices.

A recurring series can be partly saved: its confirmed count and remaining dates are shown, the original details are locked, and Retry remaining visits saves only the unsaved tail with its original ids and recurrence group. Repeated callbacks cannot duplicate a completed booking. Keep saved visits only stops the remaining draft without deleting or changing any saved visit. Partial retries exist only while the page is open; the notice explains that leaving retains saved visits but loses the unsaved tail. Review the diary before creating the remaining visits later. Existing queue, conflict, account and access rules remain unchanged.

## Diary dates and touch controls

Find a diary visit searches the recorded title, location, type, phase and status together with the exact linked job/address, customer, workers and vehicle registration. Every search word must match. All visits retains historical and unsupported-status records; Active includes only Planned/Confirmed, with separate Complete and Cancelled filters. Eight matching visit cards appear first, with eight more at a time. Search, status, job, calendar navigation and Clear diary filters reset the card limit. Filter targets are 48px and expose their selected state.

Diary job scope selects a saved identity, never a title or address. JR AI's scheduling checks open `/planner?job=…` with one encoded id. The initial link resolves after the required sources are ready, without showing broader results first, focusing the keyboard or preparing a booking. Empty, duplicate and oversized ids require an explicit choice or clearing the filters. Missing/removed ids remain unavailable even if another job reuses the name; restoring the same id restores the scope. Later user selections and clearing take precedence for the mounted page; reloading replays the original link. Existing create-booking links retain their workflow.

Job scope narrows the calendar, next-visit planning and diary reviews. Cross-job clashes retain the other affected visit as evidence; unrelated signals are excluded. Text/status filters affect only the calendar list, so they cannot hide the selected job's review warnings. Show visit day clears stale list filters and selects the exact loaded linked job where available. These controls are read-only and do not replace a booking form or a partially saved recurring draft. Oversized historical job ids use the source-job review link instead of an unusable diary scope.

Upcoming clash signals now use only planned/confirmed visits with real calendar ranges and explicit valid start/end times. Completed/cancelled history, past visits and unsupported statuses cannot create current clash signals. Missing times are not inferred from estimated duration, and invalid/reversed dates cannot become overlaps. Shared worker signals are deduplicated; real staff, vehicle and job conflicts retain their source identities and labels.

Diary details need review keeps uncertain current/future or unplaceable records visible outside the calendar, even when invalid dates prevent a card from appearing on a day. Four review cards appear first, with progressive reveal, a read-only affected-day action for valid dates and an exact linked-job review when available. It refreshes with the phone's local day. The page separates these reviews from timed clashes and explains that no warning is not proof of availability or site readiness. History and stored records are not rewritten by these checks.

Next visit planning lists active jobs without an ongoing or future planned/confirmed Job visit, together with work bookings whose dates or status need review. Completed, cancelled and past visits cannot hide the need for another visit; surveys, deliveries and other appointments are kept separate from work bookings. Uncertain records remain visible, including alongside a valid booking, and their one-tap booking action stays disabled until reviewed. The list searches job name, address and status, starts with four cards and reveals four more at a time. Review links retain the exact saved job id.

Book next visit prepares an unsaved form using that job. Old, invalid or reversed job dates cannot prefill a booking in the past; valid future dates remain available for review. It cannot replace a partially saved recurring series. The list follows the phone's local date and refreshes each minute and on app focus. These checks describe loaded records and do not confirm availability, assignment, sync or site readiness.

Week views run Monday through Sunday, including month/year boundaries. Previous/next month navigation clamps the displayed day to the last day in a shorter month. Today uses the device’s local date; date-only shifts avoid timezone offsets and daylight-saving drift. Calendar navigation and visit move actions have distinct labels and 48px touch targets.

Monthly repeats stay anchored to the original day, using month end when necessary (31 January → 28 February → 31 March in a non-leap year). The form explains this rule; each occurrence preserves its calendar-day duration. No repeat always creates one booking, even if an earlier repeat count remains in the form. Invalid/reversed dates and ranges outside the supported calendar are rejected before any booking is written. Existing bookings are not rewritten.

Moving a planned/confirmed visit now uses the durable update method before reporting success. Both endpoints move together, and storage/queue failures retain the saved dates. A changed or missing visit is rejected before writing, including repeated callbacks from an older card. Completed/cancelled history cannot be moved with these controls.

Start job applies only to a linked scheduled Job visit and saves the canonical First fix status before confirming the visit. Existing First fix, Second fix, Testing, Snagging and other on-site stages are preserved. Closed, held, unscheduled or missing jobs cannot be started here. Other appointment types and unlinked visits use Confirm visit without changing a job. The cards show visit and job statuses separately, and unallocated jobs exclude closed/held records.

Job and visit writes remain separate. A job-save failure stops visit confirmation; a subsequent visit-save failure explicitly reports the saved job and offers the existing Confirm visit action for retry. That retry keeps the later job stage and does not repeat a saved start. These actions distinguish device persistence from cloud confirmation and retain existing queue/conflict/access rules.

## Install

- **iPhone/iPad:** open the normal JR OS address in Safari, tap **Share → Add to
  Home Screen**, keep **Open as Web App** enabled if shown, then tap **Add**.
- **Android:** open the normal JR OS address in Chrome, open its menu and choose
  **Install app** or **Add to Home screen**, then confirm.

The account page and workspace menu include these instructions. They are hidden
when JR OS is running in standalone or fullscreen display mode. Install the
normal app address; temporary pull-request previews are separate installations.

Sign in with the same account in the installed app. Some platforms isolate its
storage from the browser. Keep the original browser until records are synced or
backed up; installation does not copy device-local records or pending writes.
Cloud authentication and synchronization still require connectivity and an
active Supabase project.

## Implementation

`app/manifest.ts` supplies a stable app ID, root scope, standalone display mode,
and PNG icons for installation. The icons and favicon derive from `app/icon.svg`,
using the existing cyan JR OS lightning mark. The square opaque background and
centred mark support Android icon masks. Apple touch metadata uses the 180px PNG.

`/app` is a neutral launch route. It waits for identity resolution, then replaces
the route with the office dashboard, field workspace, customer portal or sign-in
page. The normal access guard still authorizes the destination. Launching does
not read business collections, persist account identity or accept a redirect URL.

There is no service worker or new response cache. Home-screen installation does
not imply that a cold launch works offline. Existing repository-level caches and
queues retain their current authorization boundaries; private document links,
payment links and authentication responses are not cached by this feature.

## Verification

### Phone invoice review

Invoice links now resolve one exact saved identity before rendering cards. Missing, duplicate or invalid identities do not fall back to a matching invoice number/title or the wider inbox. Show all invoices explicitly clears the link scope. The existing customer quick-create link still prefills only when no invoice review parameter is present. Loading/initial-link resolution prevents a flash of unrelated cards; refreshed sources determine availability without replacing the selected identity.

The inbox has labelled 48px/16px search and saved-status controls, eight cards initially, and 48px Show more/Clear controls. Search includes number, title, status and linked customer/builder names; unknown names do not become the searchable word "undefined". Search, status changes and Clear reset paging without changing records or discarding an unsaved creation form. Exact review hides browsing filters until Show all is chosen. Enter dismisses the search keyboard. Status and payment buttons have 48px targets, and saved invoice balances are explicitly distinguished from the separate payment ledger.

Missing or duplicate invoice identities block status/payment controls even when a filter hides another saved copy. Retained callbacks recheck current readiness, unique identity and the displayed saved version; changed or removed invoices require fresh review, including refresh during the existing payment prompt. Leaving the page clears the update snapshot, including while a prompt is open. Valid manual updates retain the existing calculation and status behavior. This is not a durable/atomic invoice-write upgrade: invoice and timeline saves keep their existing workflow, and no schema, route permissions or account boundary changes are introduced. Browser acceptance is read-only; populated/source-change behavior is tested with executable component fixtures.

JR AI money answers show source reviews before verified balances when invoice or linked-payment identities are missing or ambiguous. An incomplete subtotal cannot read as a zero-debt clearance. Existing four-card progressive reveal, source-detail disclosures and 48px question controls are retained. Refreshed collections replace stale balances with review feedback without persisting questions or editing invoices/payments.

Run `npm test`, `npm run lint`, `npm run build`, `npx tsc --noEmit`, and
`npm audit --audit-level=moderate`. The installation tests check actual icon
dimensions, manifest requirements, role-aware launch, signed-out behavior and
the launch route's exact authorization exception.

On an HTTPS preview, verify `/manifest.webmanifest`, both installation icons,
the Apple touch icon, and the account/menu installation instructions. Before a
production release, check installation and relaunch on iPhone and Android,
including signed-out, office, field and customer accounts. Do not change
Supabase configuration or switch cloud mode merely to test installation.
Also check the Quick actions sheet at narrow portrait and landscape widths,
keyboard focus and dismissal, the JR AI bottom tab, and app-icon shortcuts where
supported. Confirm that the keyboard does not prevent searching or opening an
assistant action, and verify account switching with the sheet open.

Platform references: [native dialog](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog)
and [manifest shortcuts](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/shortcuts).
