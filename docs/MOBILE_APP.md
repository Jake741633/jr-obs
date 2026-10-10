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

The JR AI question panel includes a job selector for Open tasks/Open snags and accepts a full saved job name or site address in a task question. Ambiguous names show progressively revealed job choices with direct review links. Answers retain the selected record identity across refreshes and do not substitute another job after a record disappears. These controls have 48px touch targets; submitting still dismisses the phone keyboard.

Task and snag creation uses the existing durable creation method before clearing the form. A storage/queue error keeps the editable draft and the same record ID for retry; repeated submission after success cannot create another task. If the task saves but its creation note fails, a separate action retries only that timeline note. It retains the original note ID, recognises an existing matching note and refuses mismatched or missing task links. Multiple pending notes remain separate.

Status changes and deletion also persist through the existing repository before reporting success or removing the card. A failed write retains the saved task state and explains that the change could not be confirmed. Status updates use the latest loaded record, preserving other edited fields, and refuse stale status/job changes. Repeated status taps do not create another update or timeline note. Deletion keeps its confirmation and refuses a record that changed after the card was rendered.

If a status change saves but its timeline note fails, the same note-only retry retains the original transition details and ID; it never changes the task's current status. Retries require the task to remain on the same job and cannot overwrite a conflicting note identity. The shared durable update/deletion methods preserve queue versions, creator metadata, account-scoped storage and read-only capability restrictions; other collection callers retain their current APIs.

The page distinguishes a device save from cloud confirmation. Unsaved timeline retries exist only while the page is open, and the failure notice explains that leaving retains the saved task change but loses the unsaved note. Account changes retain the existing page-remount boundary.

## Diary dates and touch controls

Week views run Monday through Sunday, including month/year boundaries. Previous/next month navigation clamps the displayed day to the last day in a shorter month. Today uses the device’s local date; date-only shifts avoid timezone offsets and daylight-saving drift. Calendar navigation and visit move actions have distinct labels and 48px touch targets.

Monthly repeats stay anchored to the original day, using month end when necessary (31 January → 28 February → 31 March in a non-leap year). The form explains this rule; each occurrence preserves its calendar-day duration. No repeat always creates one booking, even if an earlier repeat count remains in the form. Invalid/reversed dates and ranges outside the supported calendar are rejected before any booking is written. Existing bookings are not rewritten.

Moving a planned/confirmed visit now uses the durable update method before reporting success. Both endpoints move together, and storage/queue failures retain the saved dates. A changed or missing visit is rejected before writing, including repeated callbacks from an older card. Completed/cancelled history cannot be moved with these controls.

Start job applies only to a linked scheduled Job visit and saves the canonical First fix status before confirming the visit. Existing First fix, Second fix, Testing, Snagging and other on-site stages are preserved. Closed, held, unscheduled or missing jobs cannot be started here. Other appointment types and unlinked visits use Confirm visit without changing a job. The cards show visit and job statuses separately, and unallocated jobs exclude closed/held records.

Job and visit writes remain separate. A job-save failure stops visit confirmation; a subsequent visit-save failure explicitly reports the saved job and offers the existing Confirm visit action for retry. That retry keeps the later job stage and does not repeat a saved start. These actions distinguish device persistence from cloud confirmation and retain existing queue/conflict/access rules. Creating new diary bookings retains its existing save flow; this increment hardens moves and dispatch.

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
