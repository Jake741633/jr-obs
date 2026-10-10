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
