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

## Task inbox

The office Tasks & Snagging workspace starts with outstanding work. Open, Due, Snags, Completed and All filters, job selection and a combined task/job/address search narrow the list. Due means today or earlier using the device’s local calendar date; missing or invalid dates are not treated as overdue. Counts apply to the selected job before text search. Eight cards appear first, with Show more for the rest.

JR AI links open the exact task and show its current status, even if it was completed after the answer. A missing or mismatched link shows an unavailable message with a way back to all open tasks. Loading and account changes retain the existing access boundaries. Search, filtering and navigation do not write business records.

The JR AI question panel includes a job selector for Job briefing and Open tasks/Open snags and accepts a full saved job name or site address in a task question. Ambiguous names show progressively revealed job choices with direct review links. Answers retain the selected record identity across refreshes and do not substitute another job after a record disappears. Job briefing connects ranked checks, recorded job status, unpaid billing, upcoming visits and open work using saved links. Job record and workspace headers include Ask JR AI about this job for permitted accounts. The link opens the briefing for that saved id without choosing the job again; it does not open the phone keyboard. Missing ids stay unavailable and invalid/duplicate link ids require an explicit choice. Cross-job clash evidence is retained and duplicate answer records are suppressed. These controls have 48px touch targets; submitting still dismisses the phone keyboard.

Task and snag creation uses the existing durable creation method before clearing the form. A storage/queue error keeps the editable draft and the same record ID for retry; repeated submission after success cannot create another task. If the task saves but its creation note fails, a separate action retries only that timeline note. It retains the original note ID, recognises an existing matching note and refuses mismatched or missing task links. Multiple pending notes remain separate.

Task status buttons share the existing management transition rules with the save handler. The current stage is marked separately, unavailable changes are dimmed, and customer confirmation is enabled only after completion. Confirmed tasks must reopen before another stage; unknown historical status is flagged for review. Touch targets remain 48px. Field-account permissions and their narrower transition rules are unchanged.

Status changes and deletion also persist through the existing repository before reporting success or removing the card. A failed write retains the saved task state and explains that the change could not be confirmed. Status updates use the latest loaded record, preserving other edited fields, and refuse stale status/job changes. Repeated status taps do not create another update or timeline note. Deletion keeps its confirmation and refuses a record that changed after the card was rendered.

If a status change saves but its timeline note fails, the same note-only retry retains the original transition details and ID; it never changes the task's current status. Retries require the task to remain on the same job and cannot overwrite a conflicting note identity. The shared durable update/deletion methods preserve queue versions, creator metadata, account-scoped storage and read-only capability restrictions; other collection callers retain their current APIs.

The page distinguishes a device save from cloud confirmation. Unsaved timeline retries exist only while the page is open, and the failure notice explains that leaving retains the saved task change but loses the unsaved note. Account changes retain the existing page-remount boundary.

Next visit checks is a JR AI shortcut for accepted or on-site work needing another recorded work visit or a booking review. It uses the job selector and exact-name/address questions, starts with four answers and updates when bookings change. Job briefings include the same check without counting a survey or delivery as the next work visit. It keeps deposit/builder dependencies explicit and opens that saved job's diary scope for review; it does not book a visit.

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
